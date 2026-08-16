import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
// Type-only: erased at compile time, so this does NOT make the `playwright`
// package a runtime dependency of this module — see the "Dynamic import"
// comment on renderHtmlToPdf below for why that matters.
import type { Page } from "playwright";
import { loadAllItemsRaw, loadCategories } from "../../../lib/content/loader";
import type { Category, Item } from "../../../lib/content/types";
import { siteConfig } from "../../../content/config";
import { buildFlyerHtml, buildFullCatalogHtml, escapeHtml, type CategoryGroup, type ItemPdfView } from "./template";

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
// renderHtmlToPdf below), so a bare filename is all a rewritten <img src>
// needs — and it is what lets that document be loaded via a real file://
// URL, which a bare setContent() document cannot do for local subresources
// at all (see the "page.goto vs page.setContent" comment on renderHtmlToPdf).
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
// via page.goto() on a real file:// URL by renderHtmlToPdf, and a document
// with a file:// origin can load same-directory relative resources; a
// document with no origin (page.setContent()) cannot load file:// resources
// at all, however they are addressed, which is why the src is rewritten to a
// relative path rather than an absolute file:// one — see renderHtmlToPdf's
// own comment for why that distinction matters.
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

function toItemPdfView(item: Item): ItemPdfView {
  return {
    categorySlug: item.categorySlug,
    itemSlug: item.itemSlug,
    name: item.name,
    description: item.description,
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
export function groupEligibleItems(items: Item[], categories: Category[]): CategoryGroup[] {
  const eligible = items.filter((i) => EXPORTABLE_STATUSES.has(i.status));

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
        items: catItems.map(toItemPdfView),
      };
    });
}

// Generous timeout, well above Playwright's 30s default: a catalog with many
// items (up to 4 CDN photos each) waiting for `networkidle`, followed by
// full-document PDF layout, can plausibly exceed the default. Shared by both
// callers of renderHtmlToPdf below.
const RENDER_TIMEOUT_MS = 60_000;

/**
 * Shared browser-lifecycle/render/cleanup pipeline behind both
 * generateCatalogPdf and generateFlyerPdf: launch Chromium, prefetch images,
 * render `html` to a PDF file with the given `pdfOptions`, and clean up the
 * page/prefetch tempDir/browser — all in the same order and with the same
 * failure handling for every caller, so a future fix to any of that (timeout
 * behaviour, cleanup ordering, the Playwright API surface) only has to be
 * made once. Callers own everything specific to *what* is being exported:
 * item lookup/validation, HTML assembly, the PDF's own page options, the
 * output filename, and the render-failure message shown to the seller.
 */
async function renderHtmlToPdf(
  html: string,
  opts: {
    filenamePrefix: string;
    pdfOptions: Parameters<Page["pdf"]>[0];
    renderErrorMessage: string;
  },
): Promise<{ file: string } | { error: string }> {
  // Dynamic import, not a static one: studioApi.ts imports this module at
  // module scope, so every Studio boot would otherwise load the `playwright`
  // package eagerly — including on a downstream site that ran
  // `pnpm update-site --skip-verify` (which explicitly skips `pnpm install`)
  // and never got the package installed at all. A missing *package* throws at
  // import time, before this try/catch exists to catch it, crashing the whole
  // Studio dev server with a raw "Cannot find module" error. Deferring the
  // import to here means "playwright missing" and "Chromium binary missing"
  // both land in the same catch and produce the same friendly typed error.
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }

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
    const file = path.join(os.tmpdir(), `${opts.filenamePrefix}-${Date.now()}.pdf`);
    try {
      const page = await browser.newPage();
      let pdfBytes: Buffer;
      try {
        if (prefetchResult !== undefined) {
          // Chromium refuses to load a file:// subresource (an <img
          // src="file://...">) from a document that has no origin of its
          // own — which is exactly what page.setContent() produces — and
          // fails with "Not allowed to load local resource", silently
          // dropping the photo via the template's onerror="this.remove()".
          // A document navigated to its own file:// URL DOES have an
          // origin and can load same-directory files without issue, so the
          // (possibly prefetch-rewritten) HTML is written into the same
          // tempDir the downloaded images already live in, and loaded via a
          // real file:// URL instead. pathToFileURL handles the
          // platform-specific escaping (spaces, backslashes on Windows,
          // etc.) that hand-building `"file://" + path` would get wrong.
          const htmlFilePath = path.join(prefetchResult.tempDir, "page.html");
          await fs.writeFile(htmlFilePath, prefetchResult.html, "utf-8");
          await page.goto(pathToFileURL(htmlFilePath).href, {
            waitUntil: "networkidle",
            timeout: RENDER_TIMEOUT_MS,
          });
        } else {
          // Prefetch failed entirely, so there is no tempDir and nothing
          // local for the HTML to reference — the original HTML (with its
          // original remote <img src> URLs) is safe to render straight from
          // memory via setContent(), exactly as before this feature existed.
          await page.setContent(html, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
        }
        pdfBytes = await withTimeout(
          page.pdf(opts.pdfOptions),
          RENDER_TIMEOUT_MS,
          `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
        );
      } catch {
        // A raw Playwright error (e.g. "Timeout 60000ms exceeded") is not
        // actionable for a seller. Surface a typed error with real guidance
        // instead of letting this reject and fall through to
        // handleStudioRequest's generic catch-all, which would otherwise turn
        // it into an opaque 500.
        return { error: opts.renderErrorMessage };
      } finally {
        try {
          await page.close();
        } catch {
          // A page.close() failure must not mask an earlier error (or a
          // successful render) — swallow it.
        }
      }

      await fs.writeFile(file, pdfBytes);
      return { file };
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } finally {
    try {
      await browser.close();
    } catch {
      // A close failure here must not mask whatever error caused this
      // `finally` to run in the first place (or override a successful result
      // already computed above) — swallow it.
    }
  }
}

// Takes no parameters — unlike the design spec's original
// `generateCatalogPdf(projectRoot: string)` sketch — because
// loadAllItemsRaw()/loadCategories() always resolve content/ from
// process.cwd(), and Studio's server process cwd and req.projectRoot
// coincide (see the "Note:" comment on listStudioItems in studioApi.ts for
// the established precedent of documenting this same fact).
export async function generateCatalogPdf(): Promise<{ file: string } | { error: string }> {
  const [items, categories] = await Promise.all([loadAllItemsRaw(), loadCategories()]);
  const groups = groupEligibleItems(items, categories);
  if (groups.length === 0) {
    return { error: "No public-visible items to export." };
  }

  // Logo is a public/ path (e.g. "/logo.svg") the live site serves at its own
  // origin — page.setContent() has no origin of its own, so it must be made
  // absolute here or the <img> in the cover page would 404 silently.
  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  const html = buildFullCatalogHtml(
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
    groups,
    new Date().toISOString().slice(0, 10),
  );

  return renderHtmlToPdf(html, {
    filenamePrefix: "usedexchange-catalog",
    pdfOptions: {
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
    },
    renderErrorMessage:
      "PDF rendering timed out or failed — the catalog may be too large (many items or photos). Try again, or retry after trimming a few item photos.",
  });
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
  const html = buildFlyerHtml(toItemPdfView(item), {
    name: siteConfig.name,
    tagline: siteConfig.tagline,
    logo,
    baseUrl: siteConfig.baseUrl,
  });

  return renderHtmlToPdf(html, {
    filenamePrefix: `usedexchange-flyer-${itemId.replace(/\//g, "-")}`,
    pdfOptions: {
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
    },
    renderErrorMessage: "PDF rendering timed out or failed. Try again, or retry after trimming a few item photos.",
  });
}
