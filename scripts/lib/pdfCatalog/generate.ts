import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, bytes);
    return filePath;
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
// per-run temp dir and rewrites those srcs to file:// URLs so Chromium does
// not have to hit the CDN during render. Two failure modes are tolerated:
//   - per-image failure (network, 4xx/5xx, too large): the src attribute is
//     stripped from that <img> so Chromium skips it (the template's
//     onerror="this.remove()" cannot fire for a file:// miss).
//   - a wholesale prefetch failure (e.g. mkdtemp throws): callers catch and
//     fall back to rendering the original HTML with remote URLs.
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
          const file = await downloadOneImage(
            url,
            tempDir,
            combineSignals(controller.signal, perImageController.signal),
          );
          return { url, file };
        } finally {
          clearTimeout(perImageTimer);
        }
      }),
    );

    const urlToFile = new Map<string, string>();
    const failedUrls: string[] = [];
    for (const { url, file } of downloads) {
      if (file) {
        urlToFile.set(url, file);
      } else {
        failedUrls.push(url);
      }
    }

    let rewritten = html;
    for (const [url, file] of urlToFile) {
      rewritten = rewritten.split(url).join(`file://${file}`);
    }
    // Strip the src attribute from any <img> whose download failed, so
    // Chromium neither refetches the remote URL nor renders a broken-image
    // icon. The tag itself is preserved (alt text / layout hooks survive).
    for (const url of failedUrls) {
      rewritten = rewritten.replace(new RegExp(`\\ssrc="${escapeRegExp(url)}"`, "g"), "");
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

  // Generous timeout, well above Playwright's 30s default: a catalog with many
  // items (up to 4 CDN photos each) waiting for `networkidle`, followed by
  // full-document PDF layout, can plausibly exceed the default. Both calls
  // below share this value.
  const RENDER_TIMEOUT_MS = 60_000;

  // Pull every remote image to a local temp dir before Chromium sees the
  // HTML. Live CDN fetches from headless Chromium are slow and flaky —
  // pre-fetching turns render-time network stalls into local file reads.
  // On total prefetch failure, fall back to rendering the original HTML.
  let tempDir: string | undefined;
  let prefetchResult: Awaited<ReturnType<typeof prefetchImages>> | undefined;
  try {
    prefetchResult = await prefetchImages(html);
    tempDir = prefetchResult.tempDir;
  } catch {
    // Prefetch failed entirely — fall back to remote URLs.
  }
  const htmlToRender = prefetchResult?.html ?? html;

  try {
    const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
    try {
      const page = await browser.newPage();
      let pdfBytes: Buffer;
      try {
        await page.setContent(htmlToRender, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
        pdfBytes = await withTimeout(
          page.pdf({
            format: "Letter",
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<div></div>",
            footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
            margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
          }),
          RENDER_TIMEOUT_MS,
          `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
        );
      } catch {
        // A raw Playwright error (e.g. "Timeout 60000ms exceeded") is not
        // actionable for a seller. Surface a typed error with real guidance
        // instead of letting this reject and fall through to
        // handleStudioRequest's generic catch-all, which would otherwise turn
        // it into an opaque 500.
        return {
          error:
            "PDF rendering timed out or failed — the catalog may be too large (many items or photos). Try again, or retry after trimming a few item photos.",
        };
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

// Renders a single item's page as a standalone "flyer" PDF: same item-page
// markup and styling buildItemHtml/CATALOG_CSS already produce for the
// catalog (via buildFlyerHtml), just with its own compact header instead of
// the catalog's cover/TOC/page-number footer. Structure deliberately mirrors
// generateCatalogPdf above (dynamic Playwright import, prefetchImages with a
// fallback to remote URLs, shared RENDER_TIMEOUT_MS, cleanup in `finally`)
// so the two exports fail and recover the same way; only loadCategories() is
// dropped, since a single item's flyer never needs category grouping.
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

  // Dynamic import for the same reason as generateCatalogPdf: studioApi.ts
  // imports this module at load time, and a static `import "playwright"`
  // here would make every Studio boot load the package eagerly.
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }

  const RENDER_TIMEOUT_MS = 60_000;

  let tempDir: string | undefined;
  let prefetchResult: Awaited<ReturnType<typeof prefetchImages>> | undefined;
  try {
    prefetchResult = await prefetchImages(html);
    tempDir = prefetchResult.tempDir;
  } catch {
    // Prefetch failed entirely — fall back to remote URLs.
  }
  const htmlToRender = prefetchResult?.html ?? html;

  try {
    const file = path.join(
      os.tmpdir(),
      `usedexchange-flyer-${itemId.replace(/\//g, "-")}-${Date.now()}.pdf`,
    );
    try {
      const page = await browser.newPage();
      let pdfBytes: Buffer;
      try {
        await page.setContent(htmlToRender, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
        pdfBytes = await withTimeout(
          page.pdf({
            format: "Letter",
            printBackground: true,
            displayHeaderFooter: false,
            margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
          }),
          RENDER_TIMEOUT_MS,
          `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
        );
      } catch {
        // Same rationale as generateCatalogPdf's own catch: a raw Playwright
        // error is not actionable for a seller, so it is replaced with a
        // typed, guidance-bearing error instead of falling through to
        // handleStudioRequest's generic 500.
        return {
          error:
            "PDF rendering timed out or failed. Try again, or retry after trimming a few item photos.",
        };
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
