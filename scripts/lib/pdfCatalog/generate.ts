import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
// Type-only: erased at compile time, so this does NOT make the `playwright`
// package a runtime dependency of this module — see the "Dynamic import"
// comment on launchChromiumOrError below for why that matters.
import type { Page, Browser } from "playwright";
import { loadAllItemsRaw, loadCategories } from "../../../lib/content/loader";
import type { Category, Item, Status } from "../../../lib/content/types";
import { siteConfig } from "../../../content/config";
import { getLocalizedField } from "../../../lib/utils/i18n";
import { getTranslationsForLocale } from "../../../lib/i18n/getTranslations";
import type { PriceStrategy } from "../../../lib/utils/pricing";
import { buildFlyerHtml, buildFullCatalogHtml, escapeHtml, type CategoryGroup, type ContactPdfEntry, type ItemPdfView } from "./template";
import { resolveAnchorPageNumbers } from "./resolvePageNumbers";
import type { Platform } from "../../../lib/config/types";
import { resolveContactActionSeed, resolvePlatform, type ContactActionSeed } from "./contactLinks";
import { renderQrSvg } from "./qr";

export type PdfExportOptions = {
  locale: string;
  priceStrategy: PriceStrategy;
  /** Category slugs to include. */
  categories: string[];
  /** Statuses to include. */
  statuses: Status[];
};

// generateFlyerPdf has no language selector in the UI (unlike the catalog
// export dialog's PdfExportOptions.locale), so a single item's "is this
// exportable at all" check stays independent of any locale/category/status
// filter set — the same three statuses that were always eligible before
// PdfExportOptions existed.
const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

// page.pdf() has no `timeout` option of its own (unlike setContent(), which
// does) — Playwright's Page.pdf() type simply does not expose one in this
// version. This race is the manual equivalent, so both render steps still
// share the same generous ceiling instead of pdf() alone being able to hang
// indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type PrefetchResult = { html: string; tempDir: string };

const PREFETCH_TIMEOUT_MS = 30_000;
const PER_IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext === ".jpg") return ".jpg";
    if (ext === ".jpeg") return ".jpg";
    if (ext === ".png") return ".png";
    if (ext === ".webp") return ".webp";
    if (ext === ".gif") return ".gif";
  } catch {
    // fall through
  }
  return ".bin";
}

function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
}

// Returns the downloaded image's filename (relative to tempDir), not a full
// path or URL: the HTML document is rendered from that same tempDir (see
// renderHtmlToPdfBytes below), so a bare filename is all a rewritten <img
// src> needs — and it is what lets that document be loaded via a real
// file:// URL, which a bare setContent() document cannot do for local
// subresources at all (see the "page.goto vs page.setContent" comment on
// renderHtmlToPdfBytes).
async function downloadOneImage(
  url: string,
  tempDir: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const chunks: Buffer[] = [];
    let total = 0;
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) return null;
        chunks.push(Buffer.from(chunk));
      }
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;

    const filename = `usedexchange-pdf-${hashUrl(url)}${extensionFromUrl(url)}`;
    await fs.writeFile(path.join(tempDir, filename), bytes);
    return filename;
  } catch {
    return null;
  }
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  function onAbort() {
    controller.abort();
  }
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

// Downloads every remote <img src> referenced by the catalog HTML into a
// per-run temp dir and rewrites those srcs to bare filenames (e.g.
// "usedexchange-pdf-<hash>.jpg") relative to that same tempDir — not
// file:// URLs. The HTML document itself is written into tempDir and loaded
// via page.goto() on a real file:// URL by renderHtmlToPdfBytes, and a
// document with a file:// origin can load same-directory relative resources;
// a document with no origin (page.setContent()) cannot load file:// resources
// at all, however they are addressed, which is why the src is rewritten to a
// relative path rather than an absolute file:// one — see
// renderHtmlToPdfBytes's own comment for why that distinction matters.
//
// Two failure modes are tolerated:
//   - per-image failure (network, timeout, 4xx/5xx, too large): the src
//     attribute is left exactly as it was, i.e. the original remote URL, so
//     Chromium fetches it live exactly as it would have before this feature
//     existed. It must NOT be stripped — an <img> with no src at all is a
//     silently vanished photo, which is strictly worse than a live CDN
//     fetch.
//   - a wholesale prefetch failure (e.g. mkdtemp throws): callers catch and
//     fall back to rendering the original HTML with remote URLs via
//     page.setContent(), which never touches tempDir at all.
// The tempDir is returned to the caller, which is responsible for rm -rf-ing
// it after the PDF has been rendered.
export async function prefetchImages(html: string): Promise<PrefetchResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "usedexchange-pdf-images-"));
  const controller = new AbortController();
  const globalTimer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);

  try {
    const srcRe = /<img[^>]+src="([^"]+)"/g;
    const urls = [...html.matchAll(srcRe)]
      .map((m) => m[1])
      .filter((url): url is string => typeof url === "string" && url.startsWith("http"));
    const uniqueUrls = [...new Set(urls)];

    const downloads = await Promise.all(
      uniqueUrls.map(async (url) => {
        const perImageController = new AbortController();
        const perImageTimer = setTimeout(() => perImageController.abort(), PER_IMAGE_TIMEOUT_MS);
        try {
          const filename = await downloadOneImage(
            url,
            tempDir,
            combineSignals(controller.signal, perImageController.signal),
          );
          return { url, filename };
        } finally {
          clearTimeout(perImageTimer);
        }
      }),
    );

    let rewritten = html;
    for (const { url, filename } of downloads) {
      // Any download that failed (network error, timeout, 4xx/5xx, over the
      // size cap, or a global-timeout abort) is simply not in this map, so
      // its src is left untouched below — see the doc comment above.
      if (filename !== null) {
        rewritten = rewritten.split(url).join(filename);
      }
    }

    return { html: rewritten, tempDir };
  } finally {
    clearTimeout(globalTimer);
  }
}

function toItemPdfView(item: Item, locale: string): ItemPdfView {
  return {
    categorySlug: item.categorySlug,
    itemSlug: item.itemSlug,
    name: getLocalizedField(item, "name", locale),
    description: getLocalizedField(item, "description", locale),
    condition: item.condition,
    status: item.status,
    price: item.price,
    brand: item.brand,
    model: item.model,
    ageYears: item.ageYears,
    dimensions: item.dimensions,
    weight: item.weight,
    color: item.color,
    tags: item.tags,
    images: item.images,
    coverImage: item.coverImage,
  };
}

// Exported for unit testing without touching Playwright/Chromium at all.
export function groupEligibleItems(
  items: Item[],
  categories: Category[],
  statuses: Status[],
  includedCategorySlugs: string[],
  locale: string,
): CategoryGroup[] {
  const statusSet = new Set(statuses);
  const categorySet = new Set(includedCategorySlugs);
  const eligible = items.filter((i) => statusSet.has(i.status) && categorySet.has(i.categorySlug));

  const byCategory = new Map<string, Item[]>();
  for (const item of eligible) {
    const list = byCategory.get(item.categorySlug) ?? [];
    list.push(item);
    byCategory.set(item.categorySlug, list);
  }

  // categories is already in display order (sort_order asc, then alpha —
  // see lib/content/loader.ts); .filter() below preserves that order.
  return categories
    .filter((c) => byCategory.has(c.slug))
    .map((c) => {
      const catItems = [...(byCategory.get(c.slug) ?? [])].sort((a, b) => {
        if (a.listedDate !== b.listedDate) return b.listedDate.localeCompare(a.listedDate);
        return a.name.localeCompare(b.name);
      });
      return {
        slug: c.slug,
        displayName: c.displayName,
        description: c.description,
        items: catItems.map((item) => toItemPdfView(item, locale)),
      };
    });
}

// Generous timeout, well above Playwright's 30s default: a catalog with many
// items (up to 4 CDN photos each) waiting for `networkidle`, followed by
// full-document PDF layout, can plausibly exceed the default. Consumed by
// renderHtmlToPdfBytes (and transitively by renderHtmlToPdf) — every render
// call gets its own full budget, not a shared/divided one. The catalog
// export's two-pass render (pass 1 to discover TOC pagination, pass 2 for the
// real download) means that path now spends up to two of these timeouts
// before a seller sees a friendly error, roughly doubling the worst-case wait
// versus before this feature.
const RENDER_TIMEOUT_MS = 60_000;

// Dynamic import, not a static one — see the module-level comment further up
// this file (generate.ts is imported at Studio module-load time; a static
// import of a devDependency would crash Studio boot on a site that skipped
// `pnpm install`). Missing *package* and missing Chromium *binary* both land
// in this same catch and produce the same friendly typed error. Exported so
// a caller that needs to render multiple documents (e.g. the two-pass
// catalog render in generateCatalogPdf) can launch once and reuse the
// browser, instead of every render call launching (and closing) its own.
export async function launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }> {
  try {
    const { chromium } = await import("playwright");
    return { browser: await chromium.launch() };
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }
}

/**
 * Renders `html` to PDF bytes on an already-launched `browser` — prefetch,
 * render, and page cleanup, but no file write and no browser lifecycle (the
 * caller owns both). Exported for the same multi-render-sharing reason as
 * launchChromiumOrError, and so generate.test.ts can exercise it directly
 * for the pass-1/pass-2 page-count parity check (see generateCatalogPdf's
 * tests).
 */
export async function renderHtmlToPdfBytes(
  browser: Browser,
  html: string,
  opts: { pdfOptions: Parameters<Page["pdf"]>[0]; renderErrorMessage: string },
): Promise<{ bytes: Buffer } | { error: string }> {
  // Pull every remote image to a local temp dir before Chromium sees the
  // HTML. Live CDN fetches from headless Chromium are slow and flaky —
  // pre-fetching turns render-time network stalls into local file reads.
  // On total prefetch failure (e.g. mkdtemp throws), fall back to rendering
  // the original HTML with its original remote URLs.
  let tempDir: string | undefined;
  let prefetchResult: Awaited<ReturnType<typeof prefetchImages>> | undefined;
  try {
    prefetchResult = await prefetchImages(html);
    tempDir = prefetchResult.tempDir;
  } catch {
    // Prefetch failed entirely — fall back to remote URLs.
  }

  try {
    const page = await browser.newPage();
    try {
      if (prefetchResult !== undefined) {
        // Chromium refuses to load a file:// subresource from a document
        // that has no origin of its own — see the original comment history
        // on this file for the full explanation. The (possibly
        // prefetch-rewritten) HTML is written into the same tempDir the
        // downloaded images already live in, and loaded via a real file://
        // URL instead.
        const htmlFilePath = path.join(prefetchResult.tempDir, "page.html");
        await fs.writeFile(htmlFilePath, prefetchResult.html, "utf-8");
        await page.goto(pathToFileURL(htmlFilePath).href, {
          waitUntil: "networkidle",
          timeout: RENDER_TIMEOUT_MS,
        });
      } else {
        await page.setContent(html, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
      }
      const pdfBytes = await withTimeout(
        page.pdf(opts.pdfOptions),
        RENDER_TIMEOUT_MS,
        `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
      );
      return { bytes: pdfBytes };
    } catch {
      // A raw Playwright error (e.g. "Timeout 60000ms exceeded") is not
      // actionable for a seller. Surface a typed error with real guidance
      // instead.
      return { error: opts.renderErrorMessage };
    } finally {
      try {
        await page.close();
      } catch {
        // A page.close() failure must not mask an earlier error (or a
        // successful render) — swallow it.
      }
    }
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Thin file-writing wrapper around renderHtmlToPdfBytes — the shape every
 * existing caller (generateFlyerPdf, and the catalog's final pass-2 render)
 * actually wants: a file on disk under os.tmpdir(), ready to hand back as a
 * FileResponse.
 */
async function renderHtmlToPdf(
  browser: Browser,
  html: string,
  opts: {
    filenamePrefix: string;
    pdfOptions: Parameters<Page["pdf"]>[0];
    renderErrorMessage: string;
  },
): Promise<{ file: string } | { error: string }> {
  const result = await renderHtmlToPdfBytes(browser, html, opts);
  if ("error" in result) return result;
  const file = path.join(os.tmpdir(), `${opts.filenamePrefix}-${Date.now()}.pdf`);
  await fs.writeFile(file, result.bytes);
  return { file };
}

const CONTACT_IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Reads a seller's pre-made qr_image (e.g. "/contact/wechat-qr.png") from
// content/contact/ and returns it as a base64 data URI — fully offline, so the
// PDF never has to fetch the seller's own site. path.basename() strips any
// directory component from the seller-authored config value before the read, so
// a stray "../" cannot escape content/contact/. Returns null (→ text fallback)
// when the file is absent or unreadable, matching the graceful-degradation
// posture the rest of this module takes toward missing images.
async function readContactImageDataUri(qrImagePath: string, contactImageDir: string): Promise<string | null> {
  try {
    const base = path.basename(qrImagePath);
    if (base === "" || base === "." || base === "..") return null;
    const bytes = await fs.readFile(path.join(contactImageDir, base));
    if (bytes.length === 0) return null;
    const mime = CONTACT_IMAGE_MIME[path.extname(base).toLowerCase()] ?? "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// Assembles everything the contact-accessibility features need, entirely
// offline: the per-item quick-contact seed (first email + first discord), and
// one embeddable ContactPdfEntry per configured platform — a generated QR SVG
// for URL/handle platforms, the seller's inlined pre-made image for qr_image
// platforms (wechat), or a plain-text entry for anything with no scannable form
// (e.g. a zelle handle). Platform order is preserved. Parameterized on the
// platform list and image directory so it is unit-testable without a real
// content/config.ts or filesystem layout.
export async function buildContactPdfData(
  platforms: Platform[] = siteConfig.contact.platforms,
  contactImageDir: string = path.join(process.cwd(), "content", "contact"),
): Promise<{ seed: ContactActionSeed; entries: ContactPdfEntry[] }> {
  const seed = resolveContactActionSeed(platforms);

  const entries = await Promise.all(
    platforms.map(async (platform): Promise<ContactPdfEntry> => {
      // One bad platform must never take down the whole export. Both steps
      // below can throw on a pathological seller-authored value:
      // encodeURIComponent() raises URIError on a lone surrogate, and
      // QRCode.toString() throws when the encoded text exceeds QR capacity
      // (~2953 bytes). Without this guard the rejection escapes Promise.all,
      // rejects generateCatalogPdf/generateFlyerPdf, and surfaces as an opaque
      // 500 — so a QR failure degrades to a text entry here, matching the
      // graceful fallback the missing-image branch and prefetchImages already
      // use. `label` is derived from the platform type, not the bad value, so
      // it is safe to compute in the catch.
      const label = platform.label ?? platform.type;
      try {
        const resolved = resolvePlatform(platform);
        if (resolved.target.kind === "url") {
          const svg = await renderQrSvg(resolved.target.url);
          return { kind: "qr", label: resolved.label, target: resolved.displayValue || resolved.target.url, svg };
        }
        if (resolved.target.kind === "image") {
          const dataUri = await readContactImageDataUri(resolved.target.qrImagePath, contactImageDir);
          if (dataUri !== null) {
            return { kind: "image", label: resolved.label, dataUri };
          }
          // Pre-made image missing/unreadable — degrade to a labeled text entry.
          return { kind: "text", label: resolved.label, value: resolved.displayValue || resolved.label };
        }
        return { kind: "text", label: resolved.label, value: resolved.displayValue };
      } catch {
        return { kind: "text", label, value: "" };
      }
    }),
  );

  return { seed, entries };
}

// Takes only `options` — unlike the design spec's original
// `generateCatalogPdf(projectRoot: string)` sketch — because
// loadAllItemsRaw()/loadCategories() always resolve content/ from
// process.cwd(), and Studio's server process cwd and req.projectRoot
// coincide (see the "Note:" comment on listStudioItems in studioApi.ts for
// the established precedent of documenting this same fact).
export async function generateCatalogPdf(
  options: PdfExportOptions,
): Promise<{ file: string } | { error: string }> {
  const [items, categories] = await Promise.all([loadAllItemsRaw(), loadCategories()]);
  const groups = groupEligibleItems(items, categories, options.statuses, options.categories, options.locale);
  if (groups.length === 0) {
    return { error: "No items match the selected filters." };
  }

  const t = getTranslationsForLocale(options.locale);

  // Logo is a public/ path (e.g. "/logo.svg") the live site serves at its own
  // origin — page.setContent() has no origin of its own, so it must be made
  // absolute here or the <img> in the cover page would 404 silently.
  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  const branding = { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl };
  const generatedAt = new Date().toISOString().slice(0, 10);
  const { seed: contactSeed, entries: contactEntries } = await buildContactPdfData();

  // Shared between both passes — the width-reservation technique
  // buildTocHtml uses to keep pass-1/pass-2 pagination identical (see
  // resolvePageNumbers.ts and the design spec, §4) depends on the page box
  // being laid out identically in both renders, so this object must not
  // differ between them.
  const pdfOptions = {
    format: "Letter" as const,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · ${escapeHtml(t.pdfFooterPage)} <span class="pageNumber"></span> ${escapeHtml(t.pdfFooterOf)} <span class="totalPages"></span></div>`,
    margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
  };
  const renderErrorMessage =
    "PDF rendering timed out or failed — the catalog may be too large (many items or photos). Try again, or retry after trimming a few item photos.";

  const launch = await launchChromiumOrError();
  if ("error" in launch) return launch;
  const { browser } = launch;
  try {
    // Pass 1: TOC renders empty (but width-reserved) page-number slots — this
    // PDF exists only to discover real pagination, and is discarded.
    const pass1Html = buildFullCatalogHtml(
      branding,
      groups,
      generatedAt,
      t,
      options.priceStrategy,
      null,
      contactSeed,
      contactEntries,
    );
    const pass1 = await renderHtmlToPdfBytes(browser, pass1Html, { pdfOptions, renderErrorMessage });
    if ("error" in pass1) return pass1;

    const anchorIds = groups.flatMap((group) => [
      `cat-${group.slug}`,
      ...group.items.map((item) => `item-${item.categorySlug}-${item.itemSlug}`),
    ]);
    // Page-number resolution failure (e.g. PDFDocument.load() throwing on a
    // malformed PDF, or an unexpected /Dests structural variant) must not
    // crash the whole export — a catalog without real TOC numbers is
    // strictly better than no catalog at all (design spec §3, §5.2). Falling
    // back to null reproduces pass-1's own blank-slot appearance in the final
    // pass-2 TOC instead of surfacing an opaque error.
    let pageNumbers: Map<string, number> | null = null;
    try {
      pageNumbers = await resolveAnchorPageNumbers(pass1.bytes, anchorIds);
    } catch {
      // Unresolvable pagination degrades to pass-1's blank slots — a catalog
      // without TOC numbers still beats no catalog at all.
    }

    // Pass 2: the real download, with resolved numbers baked into the TOC.
    const pass2Html = buildFullCatalogHtml(
      branding,
      groups,
      generatedAt,
      t,
      options.priceStrategy,
      pageNumbers,
      contactSeed,
      contactEntries,
    );
    return await renderHtmlToPdf(browser, pass2Html, {
      filenamePrefix: "usedexchange-catalog",
      pdfOptions,
      renderErrorMessage,
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

// Renders a single item's page as a standalone "flyer" PDF: same item-page
// markup and styling buildItemHtml/CATALOG_CSS already produce for the
// catalog (via buildFlyerHtml), just with its own compact header instead of
// the catalog's cover/TOC/page-number footer. Shares renderHtmlToPdf with
// generateCatalogPdf above, so the two exports fail and recover exactly the
// same way; only loadCategories() is skipped here, since a single item's
// flyer never needs category grouping.
export async function generateFlyerPdf(itemId: string): Promise<{ file: string } | { error: string }> {
  const items = await loadAllItemsRaw();
  const item = items.find((i) => `${i.categorySlug}/${i.itemSlug}` === itemId);
  if (item === undefined) {
    return { error: `Item "${itemId}" not found.` };
  }
  if (!EXPORTABLE_STATUSES.has(item.status)) {
    return { error: `Item "${itemId}" is not available, pending, or reserved.` };
  }

  // Logo is a public/ path (e.g. "/logo.svg") the live site serves at its own
  // origin — page.setContent() has no origin of its own, so it must be made
  // absolute here, exactly as generateCatalogPdf does above.
  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  // No language or price-strategy selector for a single-item flyer (unlike
  // the catalog export dialog's PdfExportOptions) — render it in the site's
  // own default locale and "lowest" price, same as the live storefront's
  // default rendering.
  const locale = siteConfig.i18n.defaultLocale;
  const { seed: contactSeed, entries: contactEntries } = await buildContactPdfData();
  const html = buildFlyerHtml(
    toItemPdfView(item, locale),
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
    "lowest",
    getTranslationsForLocale(locale),
    contactSeed,
    contactEntries,
  );

  const launch = await launchChromiumOrError();
  if ("error" in launch) return launch;
  const { browser } = launch;
  try {
    return await renderHtmlToPdf(browser, html, {
      filenamePrefix: `usedexchange-flyer-${itemId.replace(/\//g, "-")}`,
      pdfOptions: {
        format: "Letter",
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
      },
      renderErrorMessage: "PDF rendering timed out or failed. Try again, or retry after trimming a few item photos.",
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
