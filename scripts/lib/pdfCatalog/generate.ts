import fs from "fs/promises";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import { loadAllItemsRaw, loadCategories } from "../../../lib/content/loader";
import type { Category, Item } from "../../../lib/content/types";
import { siteConfig } from "../../../content/config";
import { buildFullCatalogHtml, escapeHtml, type CategoryGroup, type ItemPdfView } from "./template";

const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);

function toItemPdfView(item: Item): ItemPdfView {
  return {
    categorySlug: item.categorySlug,
    itemSlug: item.itemSlug,
    name: item.name,
    nameZh: item.nameZh,
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

  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
    await fs.writeFile(file, pdfBytes);
    return { file };
  } finally {
    await browser.close();
  }
}
