// Pure text-processing layer for Studio's "import from URL" feature: given
// HTML a separate SSRF-safe fetch module already retrieved, and the URL it
// was fetched from (post-redirects), guess an item name and a ranked list of
// candidate photo URLs. No network, no filesystem, no dependency on Studio's
// item/category/image-writing code — a standalone, testable text step.
//
// The HTML here is an arbitrary seller-supplied site: possibly huge,
// malformed, or adversarial. Every extraction degrades to fewer/no results
// rather than throwing — this file intentionally uses regex/string scanning,
// not a DOM parser (see the PR description for why), so "parse" below always
// means "best-effort scan", never "fail closed".

export type ImportCandidate = {
  /** Best-guess item name, trimmed and whitespace-collapsed, or null if nothing usable was found. Never empty string — empty means null. */
  name: string | null;
  /** Deduped, absolute (http/https only) image URLs, most-likely-relevant first, capped at MAX_IMPORT_IMAGE_CANDIDATES. */
  images: string[];
};

export const MAX_IMPORT_IMAGE_CANDIDATES = 40;

// ── Small shared string helpers ─────────────────────────────────────────────

// Only the entities that actually show up in real titles/attributes, plus
// numeric refs. Not a full HTML5 entity table — a heuristic layer doesn't
// need one, and an unrecognised "&foo;" is left exactly as written rather
// than guessed at.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent.startsWith("#")) {
      const isHex = ent[1] === "x" || ent[1] === "X";
      const code = parseInt(isHex ? ent.slice(2) : ent.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

// "Something | Cool Marketplace" style trailing site-branding: a title split
// on a whitespace-padded |/-/–/— separator almost always has the real item
// name first and the site name last. Only a run with clear whitespace on
// both sides counts as a separator, so a hyphenated product name ("Anker
// PowerCore-20000") never gets chopped mid-word.
function stripTitleBoilerplate(title: string): string {
  const parts = title.split(/\s[|\-–—]\s/);
  return (parts[0] ?? title).trim();
}

// ── Generic tag/attribute scanning ──────────────────────────────────────────
// Deliberately not a DOM parser: this repo's convention for this module is a
// lightweight, order-independent attribute scan over a handful of known tag
// shapes (meta/img/link/title/h1/script), robust to malformed markup by
// simply matching less rather than throwing.

function findTags(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1] ?? "");
  }
  return out;
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(tagSrc: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Fresh RegExp per call: ATTR_RE is global/stateful and this can run
  // interleaved with other exec loops over the same shared pattern.
  const re = new RegExp(ATTR_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagSrc)) !== null) {
    const name = m[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}

function attr(attrs: Record<string, string>, key: string): string {
  return attrs[key] ?? "";
}

// ── Name detection ───────────────────────────────────────────────────────────

function metaContent(html: string, matches: (attrs: Record<string, string>) => boolean): string | null {
  for (const raw of findTags(html, "meta")) {
    const attrs = parseAttrs(raw);
    if (!matches(attrs)) continue;
    const val = collapseWhitespace(decodeEntities(attr(attrs, "content")));
    if (val) return val;
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const val = collapseWhitespace(decodeEntities(stripTags(m[1] ?? "")));
  return val || null;
}

function extractH1(html: string): string | null {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m) return null;
  const val = collapseWhitespace(decodeEntities(stripTags(m[1] ?? "")));
  return val || null;
}

function extractName(html: string, jsonLdProducts: Record<string, unknown>[]): string | null {
  for (const entry of jsonLdProducts) {
    const raw = entry["name"];
    if (typeof raw !== "string") continue;
    const val = collapseWhitespace(raw);
    if (val) return val;
  }

  const og = metaContent(html, (a) => attr(a, "property").toLowerCase() === "og:title");
  if (og) return og;

  const tw = metaContent(html, (a) => attr(a, "name").toLowerCase() === "twitter:title");
  if (tw) return tw;

  const title = extractTitleTag(html);
  if (title) return stripTitleBoilerplate(title);

  const h1 = extractH1(html);
  if (h1) return h1;

  return null;
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

function isProductType(t: unknown): boolean {
  if (typeof t === "string") return t.toLowerCase() === "product";
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && x.toLowerCase() === "product");
  return false;
}

// Breadth-first walk over a parsed JSON-LD value, unwrapping bare arrays and
// {"@graph": [...]} containers to the entity objects inside. VISIT_CAP is a
// safety valve against an adversarial page's pathologically large/deeply
// nested JSON-LD blob — this is a heuristic scan, not a guarantee every
// entity in a huge document is found.
function flattenJsonLd(root: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const queue: unknown[] = [root];
  const VISIT_CAP = 5000;
  let i = 0;
  while (i < queue.length && i < VISIT_CAP) {
    const node = queue[i++];
    if (Array.isArray(node)) {
      for (const child of node) {
        if (queue.length >= VISIT_CAP) break;
        queue.push(child);
      }
      continue;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const graph = obj["@graph"];
      if (Array.isArray(graph)) {
        for (const child of graph) {
          if (queue.length >= VISIT_CAP) break;
          queue.push(child);
        }
        continue;
      }
      out.push(obj);
    }
  }
  return out;
}

function collectJsonLdProducts(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const scriptRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // malformed JSON-LD is common in the wild — skip, don't throw
    }
    for (const entry of flattenJsonLd(parsed)) {
      if (isProductType(entry["@type"])) out.push(entry);
    }
  }
  return out;
}

function isTinyDimensions(w: unknown, h: unknown): boolean {
  return typeof w === "number" && typeof h === "number" && w <= 32 && h <= 32;
}

function jsonLdImageUrls(entry: Record<string, unknown>): string[] {
  const out: string[] = [];
  const collectOne = (v: unknown) => {
    if (typeof v === "string") {
      out.push(v);
      return;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const url = obj["url"];
      if (typeof url === "string" && !isTinyDimensions(obj["width"], obj["height"])) {
        out.push(url);
      }
    }
  };
  const image = entry["image"];
  if (Array.isArray(image)) {
    for (const v of image) collectOne(v);
  } else {
    collectOne(image);
  }
  return out;
}

// ── Image URL resolution & filtering ────────────────────────────────────────

function resolveHttpUrl(raw: string, pageUrl: string): string | null {
  const trimmed = decodeEntities(raw).trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed, pageUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Matched against the resolved URL's path only — narrow substrings chosen so
// a legitimate photo filename is unlikely to collide (e.g. "icon-" rather
// than bare "icon", which would also nuke "iconic-lamp.jpg").
const JUNK_PATH_SUBSTRINGS = [
  "logo",
  "favicon",
  "sprite",
  "spinner",
  "loading",
  "placeholder",
  "avatar",
  "icon-",
  "/icons/",
  "pixel.gif",
  "1x1",
  "blank.gif",
  "tracking",
];

// Tracking-beacon hosts some sites embed as <img> pixels — matched against
// the full URL since these are domain, not path, signals.
const TRACKER_URL_SUBSTRINGS = ["doubleclick", "googletagmanager", "google-analytics", "facebook.com/tr"];

function isJunkImageUrl(absoluteUrl: string): boolean {
  const full = absoluteUrl.toLowerCase();
  if (TRACKER_URL_SUBSTRINGS.some((s) => full.includes(s))) return true;
  let path: string;
  try {
    path = new URL(absoluteUrl).pathname.toLowerCase();
  } catch {
    return true;
  }
  return JUNK_PATH_SUBSTRINGS.some((s) => path.includes(s));
}

function isTinyDimensionAttr(attrs: Record<string, string>): boolean {
  const w = attrs["width"];
  const h = attrs["height"];
  if (w === undefined || h === undefined || w.trim() === "" || h.trim() === "") return false;
  const wn = Number(w);
  const hn = Number(h);
  if (!Number.isFinite(wn) || !Number.isFinite(hn)) return false;
  return wn <= 32 && hn <= 32;
}

// One srcset entry, unresolved — resolution happens centrally so every
// candidate source is filtered/deduped the same way.
function parseSrcsetRaw(value: string): { url: string; size: number }[] {
  const out: { url: string; size: number }[] = [];
  for (const part of value.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const spaceIdx = piece.search(/\s/);
    const url = spaceIdx === -1 ? piece : piece.slice(0, spaceIdx);
    const descriptor = spaceIdx === -1 ? "" : piece.slice(spaceIdx + 1).trim();
    if (!url) continue;
    let size = 0;
    const wMatch = /^(\d+)w$/.exec(descriptor);
    const xMatch = /^([\d.]+)x$/.exec(descriptor);
    if (wMatch?.[1]) size = Number(wMatch[1]);
    else if (xMatch?.[1]) size = Number(xMatch[1]) * 1000; // density descriptor: rough tiebreak only, not a real pixel width
    out.push({ url, size });
  }
  return out;
}

// <img> tags: src (falling back through common lazy-load attrs) plus every
// srcset URL, largest-first within each tag's own srcset, srcset ahead of
// src. Order across different <img> tags is document order.
function extractImgCandidates(html: string): string[] {
  const out: string[] = [];
  for (const raw of findTags(html, "img")) {
    const attrs = parseAttrs(raw);
    if (isTinyDimensionAttr(attrs)) continue;

    const srcsetEntries = [
      ...parseSrcsetRaw(attr(attrs, "srcset")),
      ...parseSrcsetRaw(attr(attrs, "data-srcset")),
    ].sort((a, b) => b.size - a.size);
    for (const entry of srcsetEntries) out.push(entry.url);

    const primarySrc = attr(attrs, "src") || attr(attrs, "data-src") || attr(attrs, "data-lazy-src") || attr(attrs, "data-original");
    if (primarySrc) out.push(primarySrc);
  }
  return out;
}

function extractLinkPreloadImages(html: string): string[] {
  const out: string[] = [];
  for (const raw of findTags(html, "link")) {
    const attrs = parseAttrs(raw);
    if (attr(attrs, "rel").toLowerCase() !== "preload" || attr(attrs, "as").toLowerCase() !== "image") continue;
    const href = attr(attrs, "href");
    if (href) out.push(href);
  }
  return out;
}

function extractMetaOgImages(html: string): string[] {
  const out: string[] = [];
  for (const raw of findTags(html, "meta")) {
    const attrs = parseAttrs(raw);
    const prop = attr(attrs, "property").toLowerCase();
    if (prop !== "og:image" && prop !== "og:image:secure_url") continue;
    const content = attr(attrs, "content");
    if (content) out.push(content);
  }
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function extractImportCandidates(html: string, pageUrl: string): ImportCandidate {
  // Belt-and-braces: every sub-extraction already degrades gracefully on its
  // own malformed input, but this guarantees the documented "never throw"
  // contract even against something none of them anticipated.
  try {
    const jsonLdProducts = collectJsonLdProducts(html);
    const name = extractName(html, jsonLdProducts);

    const rawCandidates: string[] = [
      ...jsonLdProducts.flatMap(jsonLdImageUrls),
      ...extractMetaOgImages(html),
      ...extractImgCandidates(html),
      ...extractLinkPreloadImages(html),
    ];

    const images: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawCandidates) {
      if (images.length >= MAX_IMPORT_IMAGE_CANDIDATES) break;
      const resolved = resolveHttpUrl(raw, pageUrl);
      if (!resolved || seen.has(resolved) || isJunkImageUrl(resolved)) continue;
      seen.add(resolved);
      images.push(resolved);
    }

    return { name, images };
  } catch {
    return { name: null, images: [] };
  }
}
