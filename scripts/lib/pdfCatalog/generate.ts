import fs from "fs/promises";
import os from "os";
import path from "path";
import { loadAllItemsRaw, loadCategories } from "../../../lib/content/loader";
import type { Category, Item, Status } from "../../../lib/content/types";
import { siteConfig } from "../../../content/config";
import { getLocalizedField } from "../../../lib/utils/i18n";
import { getTranslationsForLocale } from "../../../lib/i18n/getTranslations";
import type { PriceStrategy } from "../../../lib/utils/pricing";
import { buildFullCatalogHtml, escapeHtml, type CategoryGroup, type ItemPdfView } from "./template";

export type PdfExportOptions = {
  locale: string;
  priceStrategy: PriceStrategy;
  /** Category slugs to include. */
  categories: string[];
  /** Statuses to include. */
  statuses: Status[];
};

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
  const html = buildFullCatalogHtml(
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
    groups,
    new Date().toISOString().slice(0, 10),
    t,
    options.priceStrategy,
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

  try {
    const page = await browser.newPage();
    let pdfBytes: Buffer;
    try {
      await page.setContent(html, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
      pdfBytes = await withTimeout(
        page.pdf({
          format: "Letter",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: "<div></div>",
          footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · ${escapeHtml(t.pdfFooterPage)} <span class="pageNumber"></span> ${escapeHtml(t.pdfFooterOf)} <span class="totalPages"></span></div>`,
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
    }

    const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
    await fs.writeFile(file, pdfBytes);
    return { file };
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
