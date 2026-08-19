import type { Condition, Price, Status } from "../../../lib/content/types";
import type { UIStrings } from "../../../lib/config/types";
import { resolvePriceByStrategy, type PriceStrategy } from "../../../lib/utils/pricing";
import { buildItemMailto, type ContactActionSeed } from "./contactLinks";

// One contact platform, already resolved to its embeddable form by generate.ts
// (QR SVG generated, or pre-made image inlined as a data URI) so these template
// builders stay synchronous. See buildContactPdfData in generate.ts.
export type ContactPdfEntry =
  | { kind: "qr"; label: string; target: string; svg: string } // svg is trusted inline output of qrcode
  | { kind: "image"; label: string; dataUri: string } // seller's pre-made qr_image, base64-inlined
  | { kind: "text"; label: string; value: string }; // no scannable form — value shown as text

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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Minimal `{key}` substitution for the handful of UIStrings entries this
// template composes with numbers/dates — not a general i18n mechanism (the
// rest of the site has no such need yet), and deliberately does not attempt
// locale-aware word order or pluralization: every composed PDF chrome
// sentence uses fixed English word order with substituted values, same
// limitation every other composed UIStrings sentence in this codebase has.
function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

function conditionLabel(condition: Condition, t: UIStrings): string {
  const map: Record<Condition, string> = {
    new: t.conditionNew,
    "like-new": t.conditionLikeNew,
    good: t.conditionGood,
    fair: t.conditionFair,
    "for-parts": t.conditionForParts,
  };
  return map[condition];
}

function statusLabel(status: Status, t: UIStrings): string {
  const map: Record<Status, string> = {
    available: t.statusAvailable,
    pending: t.statusPending,
    reserved: t.statusReserved,
    sold: t.statusSold,
    draft: t.statusDraft,
  };
  return map[status];
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

export function buildPriceHtml(price: Price, strategy: PriceStrategy, t: UIStrings): string {
  if (price.tiers.length === 0) {
    return `<p class="price price-contact">${escapeHtml(t.contactForPrice)}</p>`;
  }
  const resolved = resolvePriceByStrategy(price.tiers, strategy);
  const negotiable = price.negotiable ? `<span class="price-obo">${escapeHtml(t.obo)}</span>` : "";

  if (!price.show_tiers || price.tiers.length === 1) {
    if (resolved === null) {
      return `<p class="price price-contact">${escapeHtml(t.contactForPrice)}</p>`;
    }
    const label = resolved.tier?.label
      ? `<span class="price-label">(${escapeHtml(resolved.tier.label)})</span>`
      : "";
    return `<p class="price"><span class="price-amount">${formatAmount(price.currency, resolved.amount)}</span>${negotiable}${label}</p>`;
  }

  // "average" resolves to no real tier — no row can be marked default, so a
  // banner line carries the computed price instead. Every other strategy
  // resolves to a real tier and needs no banner; the row highlight alone
  // communicates the default, exactly as v1 did.
  const highlightBanner =
    resolved !== null && resolved.tier === null
      ? `<p class="price-highlight">${escapeHtml(fmt(t.pdfAveragePriceLabel, { amount: formatAmount(price.currency, resolved.amount) }))}</p>`
      : "";

  const rows = price.tiers
    .map((tier) => {
      const isResolved =
        resolved !== null &&
        resolved.tier !== null &&
        tier.label === resolved.tier.label &&
        tier.amount === resolved.tier.amount;
      const range =
        tier.miles_max === undefined
          ? `${tier.miles_min ?? 0}+ ${escapeHtml(t.distanceUnit)}`
          : `${tier.miles_min ?? 0}–${tier.miles_max} ${escapeHtml(t.distanceUnit)}`;
      return `<tr class="${isResolved ? "tier-default" : ""}"><td>${escapeHtml(tier.label)}</td><td>${range}</td><td>${formatAmount(price.currency, tier.amount)}</td></tr>`;
    })
    .join("");
  return `<div class="price">${negotiable}${highlightBanner}<table class="tier-table"><thead><tr><th>${escapeHtml(t.pricingLabelHeader)}</th><th>${escapeHtml(t.pricingDistanceHeader)}</th><th>${escapeHtml(t.pricingPriceHeader)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildSpecsHtml(item: ItemPdfView, t: UIStrings): string {
  const rows: Array<[string, string]> = [];
  if (item.brand) rows.push([t.brand, item.brand]);
  if (item.model) rows.push([t.model, item.model]);
  if (item.color) rows.push([t.color, item.color]);
  if (item.ageYears !== null) rows.push([t.age, `${item.ageYears} yr${item.ageYears === 1 ? "" : "s"}`]);
  if (item.dimensions) {
    const d = item.dimensions;
    rows.push([t.dimensions, `${d.length} × ${d.width} × ${d.height} ${d.unit}`]);
  }
  if (item.weight) {
    rows.push([t.weight, `${item.weight.value} ${item.weight.unit}`]);
  }
  rows.push([t.condition, conditionLabel(item.condition, t)]);
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
  t: UIStrings,
): string {
  const logoHtml = branding.logo
    ? `<img class="cover-logo" src="${escapeHtml(branding.logo)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <section class="cover">
      ${logoHtml}
      <h1>${escapeHtml(branding.name)}</h1>
      <p class="cover-tagline">${escapeHtml(branding.tagline)}</p>
      <p class="cover-heading">${escapeHtml(t.pdfCoverHeading)}</p>
      <p class="cover-meta">${escapeHtml(fmt(t.pdfCoverMeta, { itemCount, categoryCount }))}</p>
      <p class="cover-meta">${escapeHtml(fmt(t.pdfGeneratedOn, { date: generatedAt }))}</p>
    </section>`;
}

function tocPageNumHtml(pageNumbers: Map<string, number> | null, anchorId: string): string {
  const value = pageNumbers?.get(anchorId);
  return `<span class="toc-page-num">${value !== undefined ? value : ""}</span>`;
}

export function buildTocHtml(groups: CategoryGroup[], t: UIStrings, pageNumbers: Map<string, number> | null): string {
  const sections = groups
    .map((group) => {
      const catAnchor = `cat-${group.slug}`;
      const items = group.items
        .map((item) => {
          const itemAnchor = `item-${item.categorySlug}-${item.itemSlug}`;
          return `<li><a href="#${escapeHtml(itemAnchor)}">${escapeHtml(item.name)}</a>${tocPageNumHtml(pageNumbers, itemAnchor)}</li>`;
        })
        .join("");
      return `<div class="toc-group"><h3><a href="#${escapeHtml(catAnchor)}">${escapeHtml(group.displayName)}</a>${tocPageNumHtml(pageNumbers, catAnchor)}</h3><ul>${items}</ul></div>`;
    })
    .join("");
  return `<section class="toc" id="toc"><h1>${escapeHtml(t.pdfTocHeading)}</h1>${sections}</section>`;
}

export function buildCategorySectionHtml(group: CategoryGroup, t: UIStrings): string {
  const description = group.description
    ? `<p class="category-description">${escapeHtml(group.description)}</p>`
    : "";
  const anchor = `cat-${group.slug}`;
  return `
    <section class="category-divider" id="${escapeHtml(anchor)}">
      <a class="back-to-toc" href="#toc">← ${escapeHtml(t.pdfTocHeading)}</a>
      <h1>${escapeHtml(group.displayName)}</h1>
      ${description}
      <p class="category-divider-count">${escapeHtml(fmt(t.pdfCategoryItemCount, { count: group.items.length }))}</p>
    </section>`;
}

// Per-item quick-contact actions: a mailto pre-filled with this item's name and
// live URL, and/or a Discord quick-link — both clickable link annotations in the
// printed PDF. Rendered only when a seed with at least one channel is supplied,
// so existing catalogs/flyers with no contact config are byte-for-byte unchanged.
function buildItemContactHtml(
  seed: ContactActionSeed | undefined,
  itemName: string,
  liveUrl: string,
  t: UIStrings,
): string {
  if (!seed || (!seed.email && !seed.discordUrl)) return "";
  const actions: string[] = [];
  if (seed.email) {
    const href = buildItemMailto(seed.email, itemName, liveUrl);
    actions.push(`<a class="item-contact-link" href="${escapeHtml(href)}">${escapeHtml(t.pdfEmailAboutItem)} ↗</a>`);
  }
  if (seed.discordUrl) {
    actions.push(`<a class="item-contact-link" href="${escapeHtml(seed.discordUrl)}">${escapeHtml(t.pdfMessageOnDiscord)} ↗</a>`);
  }
  return `<p class="item-contact"><span class="item-contact-label">${escapeHtml(t.pdfItemContactHeading)}:</span> ${actions.join(" ")}</p>`;
}

export function buildItemHtml(
  item: ItemPdfView,
  baseUrl: string,
  strategy: PriceStrategy,
  t: UIStrings,
  showBackToToc: boolean,
  contact?: ContactActionSeed,
): string {
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
    item.status === "available"
      ? ""
      : `<span class="status-badge status-${item.status}">${escapeHtml(statusLabel(item.status, t))}</span>`;
  const tagsHtml =
    item.tags.length === 0
      ? ""
      : `<p class="item-tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</p>`;
  const backToToc = showBackToToc ? `<a class="back-to-toc" href="#toc">← ${escapeHtml(t.pdfTocHeading)}</a>` : "";

  return `
    <section class="item-page" id="${escapeHtml(anchor)}">
      ${backToToc}
      <h2 class="item-title">${escapeHtml(item.name)} ${statusBadge}</h2>
      ${imageGrid}
      ${buildPriceHtml(item.price, strategy, t)}
      <p class="item-description">${escapeHtml(item.description)}</p>
      ${buildSpecsHtml(item, t)}
      ${tagsHtml}
      <p class="item-link">
        <a class="live-link" href="${escapeHtml(liveUrl)}">${escapeHtml(t.pdfViewLiveListing)} ↗</a>
        <br /><span class="live-url-text">${escapeHtml(liveUrl)}</span>
      </p>
      ${buildItemContactHtml(contact, item.name, liveUrl, t)}
    </section>`;
}

// One contact card — shared by the dedicated catalog contact page and the
// flyer's compact strip. The QR `svg` is qrcode's own trusted output (the
// encoded text becomes vector modules, never markup), so it is embedded inline
// rather than escaped; every seller-derived string (label, target, value, the
// image data URI) is escaped.
function buildContactCardHtml(entry: ContactPdfEntry, t: UIStrings): string {
  if (entry.kind === "qr") {
    return `<div class="contact-card">
      <div class="contact-qr">${entry.svg}</div>
      <p class="contact-label">${escapeHtml(entry.label)}</p>
      <p class="contact-target">${escapeHtml(entry.target)}</p>
      <p class="contact-hint">${escapeHtml(t.pdfContactScanHint)}</p>
    </div>`;
  }
  if (entry.kind === "image") {
    return `<div class="contact-card">
      <div class="contact-qr"><img src="${escapeHtml(entry.dataUri)}" alt="" /></div>
      <p class="contact-label">${escapeHtml(entry.label)}</p>
      <p class="contact-hint">${escapeHtml(t.pdfContactScanHint)}</p>
    </div>`;
  }
  return `<div class="contact-card contact-card-text">
      <p class="contact-label">${escapeHtml(entry.label)}</p>
      <p class="contact-target">${escapeHtml(entry.value)}</p>
    </div>`;
}

// Dedicated "Contact the Seller" page (catalog). Placed right after the cover
// (see buildFullCatalogHtml) so it is page 2 — the most discoverable spot for a
// print-first artifact — and given its own page break. Returns "" when the
// seller has no reachable platforms, so the page is simply absent.
export function buildContactPageHtml(entries: ContactPdfEntry[], t: UIStrings): string {
  if (entries.length === 0) return "";
  const cards = entries.map((entry) => buildContactCardHtml(entry, t)).join("");
  return `
    <section class="contact-page">
      <h1>${escapeHtml(t.pdfContactHeading)}</h1>
      <p class="contact-intro">${escapeHtml(t.pdfContactIntro)}</p>
      <div class="contact-grid">${cards}</div>
    </section>`;
}

// Compact contact strip for the single-item flyer's footer — makes the flyer a
// self-sufficient one-sheet a buyer can act on without the catalog around it.
export function buildFlyerContactStripHtml(entries: ContactPdfEntry[], t: UIStrings): string {
  if (entries.length === 0) return "";
  const cards = entries.map((entry) => buildContactCardHtml(entry, t)).join("");
  return `
    <section class="flyer-contact">
      <h3>${escapeHtml(t.pdfContactHeading)}</h3>
      <div class="contact-grid contact-grid-compact">${cards}</div>
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
.toc-group h3 { color: var(--accent); margin-top: 20px; font-size: 16px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.toc-group ul { list-style: none; margin: 4px 0; padding: 0; }
.toc-group li { padding: 2px 0; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.toc-group a { color: var(--ink); text-decoration: none; }
.toc-group h3 a { color: var(--accent); }
.toc-page-num { display: inline-block; min-width: 2.4em; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; flex-shrink: 0; }
.category-divider { page-break-before: always; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 40px; position: relative; }
.category-divider h1 { font-size: 42px; color: var(--accent); }
.category-description { color: var(--muted); font-size: 16px; max-width: 32em; margin-top: 16px; }
.category-divider-count { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 16px; }
.item-page { page-break-before: always; padding: 24px 8px; position: relative; }
.back-to-toc { position: absolute; top: 8px; left: 8px; font-size: 11px; color: var(--accent); text-decoration: none; }
.item-title { font-size: 24px; display: flex; align-items: center; gap: 10px; }
.status-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 10px; background: var(--line); color: var(--ink); }
.item-images { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
.item-images img { width: 100%; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); }
.price { margin: 12px 0; }
.price-amount { font-size: 26px; font-weight: bold; }
.price-obo, .price-label { font-size: 13px; color: var(--muted); margin-left: 6px; }
.price-contact { color: var(--muted); font-style: italic; }
.price-highlight { margin: 6px 0 10px; font-size: 13px; font-weight: bold; color: var(--accent); }
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
.item-contact { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line); font-size: 13px; }
.item-contact-label { color: var(--muted); margin-right: 6px; }
.item-contact-link { color: var(--accent); font-weight: bold; text-decoration: none; margin-right: 14px; white-space: nowrap; }
.contact-page { page-break-before: always; page-break-after: always; padding: 40px 8px 24px; }
.contact-page h1 { font-size: 26px; color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
.contact-intro { color: var(--muted); margin: 8px 0 24px; }
.contact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.contact-grid-compact { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 12px; }
.contact-card { border: 1px solid var(--line); border-radius: 6px; padding: 14px 10px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.contact-card-text { display: flex; flex-direction: column; justify-content: center; }
.contact-qr { width: 132px; height: 132px; margin: 0 auto 10px; }
.contact-qr svg, .contact-qr img { display: block; width: 100%; height: 100%; }
.contact-grid-compact .contact-qr { width: 88px; height: 88px; margin-bottom: 6px; }
.contact-label { font-weight: bold; font-size: 13px; margin: 4px 0 2px; }
.contact-target { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 11px; color: var(--muted); word-break: break-all; margin: 0; }
.contact-hint { font-size: 10px; color: var(--muted); margin: 4px 0 0; }
.flyer-contact { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 14px; }
.flyer-contact h3 { font-size: 14px; color: var(--accent); text-align: center; margin-bottom: 10px; }
`;

// No language/price-strategy selector for a single-item flyer (unlike the
// catalog, which threads the seller's PdfExportOptions choices through) —
// callers pass whatever strategy/translations they've settled on as a
// sensible default (see generateFlyerPdf in generate.ts).
export function buildFlyerHtml(
  item: ItemPdfView,
  branding: SiteBranding,
  strategy: PriceStrategy,
  t: UIStrings,
  contact?: ContactActionSeed,
  contactEntries: ContactPdfEntry[] = [],
): string {
  const logoHtml = branding.logo
    ? `<img class="flyer-logo" src="${escapeHtml(branding.logo)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>${CATALOG_CSS}
          .flyer-header { text-align: center; padding: 24px 8px 12px; border-bottom: 2px solid var(--accent); margin-bottom: 8px; }
          .flyer-logo { max-height: 48px; margin-bottom: 8px; }
          .flyer-header h1 { font-size: 20px; margin: 0; }
          .flyer-tagline { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
        </style>
      </head>
      <body>
        <div class="flyer-header">
          ${logoHtml}
          <h1>${escapeHtml(branding.name)}</h1>
          <p class="flyer-tagline">${escapeHtml(branding.tagline)}</p>
        </div>
        ${buildItemHtml(item, branding.baseUrl, strategy, t, false, contact)}
        ${buildFlyerContactStripHtml(contactEntries, t)}
      </body>
    </html>`;
}

export function buildFullCatalogHtml(
  branding: SiteBranding,
  groups: CategoryGroup[],
  generatedAt: string,
  t: UIStrings,
  strategy: PriceStrategy,
  pageNumbers: Map<string, number> | null,
  contact?: ContactActionSeed,
  contactEntries: ContactPdfEntry[] = [],
): string {
  const itemCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  const body = [
    buildCoverHtml(branding, itemCount, groups.length, generatedAt, t),
    // Contact page as front-matter: right after the cover, before the TOC.
    buildContactPageHtml(contactEntries, t),
    buildTocHtml(groups, t, pageNumbers),
    ...groups.flatMap((group) => [
      buildCategorySectionHtml(group, t),
      ...group.items.map((item) => buildItemHtml(item, branding.baseUrl, strategy, t, true, contact)),
    ]),
  ].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${CATALOG_CSS}</style></head><body>${body}</body></html>`;
}
