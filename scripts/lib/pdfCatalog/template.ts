import type { Condition, Price, Status } from "../../../lib/content/types";
import { resolveItemPrice } from "../../../lib/utils/pricing";

export type ItemPdfView = {
  categorySlug: string;
  itemSlug: string;
  name: string;
  description: string;
  condition: Condition;
  status: Status;
  price: Price;
  brand: string;
  model: string;
  ageYears: number | null;
  dimensions: { length: number; width: number; height: number; unit: "cm" | "in" } | null;
  weight: { value: number; unit: "kg" | "lb" } | null;
  color: string;
  tags: string[];
  images: string[];
  coverImage: string | null;
};

export type CategoryGroup = {
  slug: string;
  displayName: string;
  description: string;
  items: ItemPdfView[];
};

export type SiteBranding = {
  name: string;
  tagline: string;
  /** Already an absolute URL (or "" for none) — callers resolve it against baseUrl before passing it in. */
  logo: string;
  baseUrl: string;
};

const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  "like-new": "Like New",
  good: "Good",
  fair: "Fair",
  "for-parts": "For Parts",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Mirrors components/contact/PlatformButton.tsx's formatPrice and
// studio/src/itemDisplay.ts's formatPrice: currency is seller-authored
// (item.json's price.currency, free-form and not ISO-validated), so
// Intl.NumberFormat can throw a RangeError on it — caught and replaced with a
// plain "$" fallback that never re-embeds the raw currency string, so this
// stays safe to interpolate into the page HTML without an explicit
// escapeHtml call.
function formatAmount(currency: string, amount: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString()}`;
  }
}

export function buildPriceHtml(price: Price): string {
  if (price.tiers.length === 0) {
    return `<p class="price price-contact">Contact for price</p>`;
  }
  const resolved = resolveItemPrice(price, { source: "fallback" });
  const negotiable = price.negotiable ? `<span class="price-obo">OBO</span>` : "";

  if (!price.show_tiers || price.tiers.length === 1) {
    if (resolved === null) {
      return `<p class="price price-contact">Contact for price</p>`;
    }
    const label = resolved.label
      ? `<span class="price-label">(${escapeHtml(resolved.label)})</span>`
      : "";
    return `<p class="price"><span class="price-amount">${formatAmount(price.currency, resolved.amount)}</span>${negotiable}${label}</p>`;
  }

  const rows = price.tiers
    .map((t) => {
      const isResolved = resolved !== null && t.label === resolved.label && t.amount === resolved.amount;
      const range =
        t.miles_max === undefined ? `${t.miles_min ?? 0}+ mi` : `${t.miles_min ?? 0}–${t.miles_max} mi`;
      return `<tr class="${isResolved ? "tier-default" : ""}"><td>${escapeHtml(t.label)}</td><td>${range}</td><td>${formatAmount(price.currency, t.amount)}</td></tr>`;
    })
    .join("");
  return `<div class="price">${negotiable}<table class="tier-table"><thead><tr><th>Option</th><th>Distance</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildSpecsHtml(item: ItemPdfView): string {
  const rows: Array<[string, string]> = [];
  if (item.brand) rows.push(["Brand", item.brand]);
  if (item.model) rows.push(["Model", item.model]);
  if (item.color) rows.push(["Color", item.color]);
  if (item.ageYears !== null) rows.push(["Age", `${item.ageYears} yr${item.ageYears === 1 ? "" : "s"}`]);
  if (item.dimensions) {
    const d = item.dimensions;
    rows.push(["Dimensions", `${d.length} × ${d.width} × ${d.height} ${d.unit}`]);
  }
  if (item.weight) {
    rows.push(["Weight", `${item.weight.value} ${item.weight.unit}`]);
  }
  rows.push(["Condition", CONDITION_LABELS[item.condition]]);
  const trs = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<table class="specs">${trs}</table>`;
}

export function buildCoverHtml(
  branding: SiteBranding,
  itemCount: number,
  categoryCount: number,
  generatedAt: string,
): string {
  const logoHtml = branding.logo
    ? `<img class="cover-logo" src="${escapeHtml(branding.logo)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <section class="cover">
      ${logoHtml}
      <h1>${escapeHtml(branding.name)}</h1>
      <p class="cover-tagline">${escapeHtml(branding.tagline)}</p>
      <p class="cover-heading">Full Listing Catalog</p>
      <p class="cover-meta">${itemCount} items across ${categoryCount} categories</p>
      <p class="cover-meta">Generated ${escapeHtml(generatedAt)}</p>
    </section>`;
}

export function buildTocHtml(groups: CategoryGroup[]): string {
  const sections = groups
    .map((group) => {
      const items = group.items
        .map(
          (item) =>
            `<li><a href="#item-${escapeHtml(item.categorySlug)}-${escapeHtml(item.itemSlug)}">${escapeHtml(item.name)}</a></li>`,
        )
        .join("");
      return `<div class="toc-group"><h3>${escapeHtml(group.displayName)}</h3><ul>${items}</ul></div>`;
    })
    .join("");
  return `<section class="toc"><h1>Table of Contents</h1>${sections}</section>`;
}

export function buildCategorySectionHtml(group: CategoryGroup): string {
  const description = group.description
    ? `<p class="category-description">${escapeHtml(group.description)}</p>`
    : "";
  return `
    <section class="category-divider">
      <h1>${escapeHtml(group.displayName)}</h1>
      ${description}
    </section>`;
}

export function buildItemHtml(item: ItemPdfView, baseUrl: string): string {
  const anchor = `item-${item.categorySlug}-${item.itemSlug}`;
  const liveUrl = `${baseUrl}/${item.categorySlug}/${item.itemSlug}`;
  const images = [item.coverImage, ...item.images.filter((src) => src !== item.coverImage)]
    .filter((src): src is string => src !== null)
    .slice(0, 4);
  const imageGrid =
    images.length === 0
      ? ""
      : `<div class="item-images">${images
          .map((src) => `<img src="${escapeHtml(src)}" alt="" onerror="this.remove()" />`)
          .join("")}</div>`;
  const statusBadge =
    item.status === "available" ? "" : `<span class="status-badge status-${item.status}">${item.status}</span>`;
  const tagsHtml =
    item.tags.length === 0
      ? ""
      : `<p class="item-tags">${item.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</p>`;

  return `
    <section class="item-page" id="${escapeHtml(anchor)}">
      <h2 class="item-title">${escapeHtml(item.name)} ${statusBadge}</h2>
      ${imageGrid}
      ${buildPriceHtml(item.price)}
      <p class="item-description">${escapeHtml(item.description)}</p>
      ${buildSpecsHtml(item)}
      ${tagsHtml}
      <p class="item-link">
        <a class="live-link" href="${escapeHtml(liveUrl)}">View Live Listing ↗</a>
        <br /><span class="live-url-text">${escapeHtml(liveUrl)}</span>
      </p>
    </section>`;
}

const CATALOG_CSS = `
:root { --ink: #2b2621; --paper: #faf6ef; --accent: #b5651d; --muted: #8a7f6f; --line: #ddd3c2; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: var(--ink); background: var(--paper); }
h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; margin: 0 0 0.3em; }
.cover { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
.cover-logo { max-height: 64px; margin-bottom: 16px; }
.cover h1 { font-size: 42px; }
.cover-tagline { color: var(--muted); font-size: 16px; }
.cover-heading { font-size: 22px; margin-top: 40px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.cover-meta { color: var(--muted); font-size: 13px; }
.toc { page-break-after: always; padding: 24px 8px; }
.toc h1 { font-size: 26px; border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
.toc-group h3 { color: var(--accent); margin-top: 20px; font-size: 16px; }
.toc-group ul { list-style: none; margin: 4px 0; padding: 0; }
.toc-group li { padding: 2px 0; }
.toc-group a { color: var(--ink); text-decoration: none; }
.category-divider { page-break-before: always; padding: 60px 8px 24px; border-bottom: 1px solid var(--line); }
.category-divider h1 { font-size: 30px; color: var(--accent); }
.category-description { color: var(--muted); }
.item-page { page-break-before: always; padding: 24px 8px; }
.item-title { font-size: 24px; display: flex; align-items: center; gap: 10px; }
.status-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 10px; background: var(--line); color: var(--ink); }
.item-images { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
.item-images img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); }
.price { margin: 12px 0; }
.price-amount { font-size: 26px; font-weight: bold; }
.price-obo, .price-label { font-size: 13px; color: var(--muted); margin-left: 6px; }
.price-contact { color: var(--muted); font-style: italic; }
.tier-table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }
.tier-table th, .tier-table td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
.tier-table tr.tier-default { background: #f1e6d3; font-weight: bold; }
.item-description { line-height: 1.5; white-space: pre-wrap; }
.specs { border-collapse: collapse; margin: 12px 0; font-size: 13px; }
.specs th { text-align: left; color: var(--muted); padding: 3px 12px 3px 0; font-weight: normal; }
.specs td { padding: 3px 0; }
.item-tags { margin: 8px 0; }
.tag { display: inline-block; background: var(--line); border-radius: 10px; padding: 2px 10px; font-size: 11px; margin: 0 4px 4px 0; }
.item-link { margin-top: 16px; }
.live-link { color: var(--accent); font-weight: bold; text-decoration: none; }
.live-url-text { color: var(--muted); font-size: 11px; }
`;

export function buildFullCatalogHtml(branding: SiteBranding, groups: CategoryGroup[], generatedAt: string): string {
  const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  const body = [
    buildCoverHtml(branding, itemCount, groups.length, generatedAt),
    buildTocHtml(groups),
    ...groups.flatMap((group) => [
      buildCategorySectionHtml(group),
      ...group.items.map((item) => buildItemHtml(item, branding.baseUrl)),
    ]),
  ].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${CATALOG_CSS}</style></head><body>${body}</body></html>`;
}
