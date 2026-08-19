// Pure formatting/narrowing logic for the single-item flyer PDF (see
// docs/superpowers/specs/2026-08-16-item-flyer-pdf-design.md). No jsPDF or
// DOM/network access here — that lives in generateItemFlyer.ts, which is the
// only file lazily imported by the browser. Keeping this file pure makes it
// unit-testable without a real jsPDF instance.
//
// This is a separate, new public-site feature — it must never import from or
// be imported by scripts/lib/pdfCatalog/** (the existing Seller Studio
// catalog PDF export), which is out of scope for this feature.

import type { Condition, Dimensions, Item, Price, PriceTier, Status, Weight } from "@/lib/content/types";
import type { MeasurementUnit } from "@/lib/utils/units";
import { formatDimensions, formatWeight } from "@/lib/utils/units";

// Narrowed item shape with no reserved_for field — structural guarantee,
// mirrors scripts/lib/pdfCatalog/template.ts's ItemPdfView pattern (that file
// is not imported here; this is an independent, parallel definition for a
// different feature with a different audience).
export type FlyerItemView = {
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
  dimensions: Dimensions | null;
  weight: Weight | null;
  color: string;
  images: string[];
  coverImage: string | null;
};

export function toFlyerItemView(item: Item): FlyerItemView {
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
    images: item.images,
    coverImage: item.coverImage,
  };
}

// jsPDF's built-in fonts are WinAnsi(Latin-1)-encoded — characters outside
// that range are either dropped or mis-rendered (verified in code review:
// em dash and curly quotes vanish silently). Item names/descriptions are
// free-text sellers may paste from word processors, which commonly use
// these "smart" typographic characters, so normalize the common ones to
// ASCII before anything reaches jsPDF. This does not add full Unicode/CJK
// support (that would need embedding a Unicode font — out of scope for this
// feature); it only prevents silent corruption of ordinary Latin-script text.
const PDF_UNSAFE_CHAR_MAP: Record<string, string> = {
  "—": "-", // em dash
  "–": "-", // en dash
  "‘": "'", // left single quote
  "’": "'", // right single quote
  "“": '"', // left double quote
  "”": '"', // right double quote
  "•": "-", // bullet
  "…": "...", // ellipsis
  "≤": "<=", // less-than-or-equal
  "≥": ">=", // greater-than-or-equal — scripts/lib/itemTemplate.ts's
  // default distance tiers use "≤" by default (e.g. "Pickup / ≤ 5 mi")
  " ": " ", // non-breaking space
  " ": " ", // narrow no-break space
};

const PDF_UNSAFE_CHAR_PATTERN = /[—–‘’“”•…  ≤≥]/g;

export function normalizeForPdf(value: string): string {
  return value.replace(PDF_UNSAFE_CHAR_PATTERN, (ch) => PDF_UNSAFE_CHAR_MAP[ch] ?? ch);
}

const CONDITION_LABEL_KEYS: Record<Condition, keyof FlyerLabels> = {
  new: "conditionNew",
  "like-new": "conditionLikeNew",
  good: "conditionGood",
  fair: "conditionFair",
  "for-parts": "conditionForParts",
};

// English defaults for the flyer's own body text. Most of these mirror
// existing UIStrings values (see components/item/FlyerButton.tsx, which
// builds a FlyerLabels from useT() so the generated PDF matches the active
// locale for everything that already has a UIStrings key). "conditionLabel"
// and "viewLiveListing" have no existing UIStrings key — they're specific to
// this flyer's layout, not the on-page UI — so they stay English-only for
// now rather than growing the UIStrings surface further for a print-only label.
export type FlyerLabels = {
  contactForPrice: string;
  obo: string;
  brand: string;
  model: string;
  color: string;
  age: string;
  dimensions: string;
  weight: string;
  conditionLabel: string;
  conditionNew: string;
  conditionLikeNew: string;
  conditionGood: string;
  conditionFair: string;
  conditionForParts: string;
  viewLiveListing: string;
};

export const DEFAULT_FLYER_LABELS: FlyerLabels = {
  contactForPrice: "Contact for price",
  obo: "OBO",
  brand: "Brand",
  model: "Model",
  color: "Color",
  age: "Age",
  dimensions: "Dimensions",
  weight: "Weight",
  conditionLabel: "Condition",
  conditionNew: "New",
  conditionLikeNew: "Like New",
  conditionGood: "Good",
  conditionFair: "Fair",
  conditionForParts: "For Parts",
  viewLiveListing: "View Live Listing",
};

function formatAmount(currency: string, amount: number): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  // Pinned to "en-US" rather than the visitor's locale: toLocaleString()
  // without a locale arg can emit locale-specific separators (e.g. a French
  // grouping space, U+202F) that jsPDF's WinAnsi fonts cannot render.
  return `${symbol}${amount.toLocaleString("en-US")}`;
}

export type FlyerTierRow = { label: string; amount: string; isDefault: boolean };
export type FlyerPriceLines = {
  headline: string;
  obo: boolean;
  tierRows: FlyerTierRow[];
};

// Mirrors PricingSection's display rules but returns structured data for
// jsPDF to draw, not HTML.
export function buildFlyerPriceLines(
  price: Price,
  resolvedTier: PriceTier | null,
  labels: FlyerLabels = DEFAULT_FLYER_LABELS,
): FlyerPriceLines {
  if (price.tiers.length === 0) {
    return { headline: labels.contactForPrice, obo: false, tierRows: [] };
  }

  const obo = price.negotiable;

  if (!price.show_tiers || price.tiers.length === 1) {
    const headline = resolvedTier
      ? formatAmount(price.currency, resolvedTier.amount)
      : labels.contactForPrice;
    return { headline, obo, tierRows: [] };
  }

  const tierRows: FlyerTierRow[] = price.tiers.map((t) => ({
    label: normalizeForPdf(t.label),
    amount: formatAmount(price.currency, t.amount),
    isDefault: resolvedTier !== null && t.label === resolvedTier.label && t.amount === resolvedTier.amount,
  }));

  const headline = resolvedTier ? formatAmount(price.currency, resolvedTier.amount) : labels.contactForPrice;
  return { headline, obo, tierRows };
}

export function buildFlyerSpecs(
  item: FlyerItemView,
  unitSystem: MeasurementUnit,
  labels: FlyerLabels = DEFAULT_FLYER_LABELS,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (item.brand) rows.push([labels.brand, normalizeForPdf(item.brand)]);
  if (item.model) rows.push([labels.model, normalizeForPdf(item.model)]);
  if (item.color) rows.push([labels.color, normalizeForPdf(item.color)]);
  if (item.ageYears !== null) rows.push([labels.age, `~${item.ageYears} year${item.ageYears === 1 ? "" : "s"}`]);
  if (item.dimensions) rows.push([labels.dimensions, formatDimensions(item.dimensions, unitSystem)]);
  if (item.weight) rows.push([labels.weight, formatWeight(item.weight, unitSystem)]);
  rows.push([labels.conditionLabel, labels[CONDITION_LABEL_KEYS[item.condition]]]);
  return rows;
}

export function buildLiveListingUrl(baseUrl: string, item: FlyerItemView): string {
  return `${baseUrl}/${item.categorySlug}/${item.itemSlug}`;
}

export function buildFlyerFilename(item: FlyerItemView): string {
  return `${item.itemSlug}-flyer.pdf`;
}
