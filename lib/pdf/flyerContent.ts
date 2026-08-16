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

const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  "like-new": "Like New",
  good: "Good",
  fair: "Fair",
  "for-parts": "For Parts",
};

function formatAmount(currency: string, amount: number): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

export type FlyerTierRow = { label: string; amount: string; isDefault: boolean };
export type FlyerPriceLines = {
  headline: string;
  obo: boolean;
  tierRows: FlyerTierRow[];
};

// Mirrors PricingSection's display rules but returns structured data for
// jsPDF to draw, not HTML.
export function buildFlyerPriceLines(price: Price, resolvedTier: PriceTier | null): FlyerPriceLines {
  if (price.tiers.length === 0) {
    return { headline: "Contact for price", obo: false, tierRows: [] };
  }

  const obo = price.negotiable;

  if (!price.show_tiers || price.tiers.length === 1) {
    const headline = resolvedTier
      ? formatAmount(price.currency, resolvedTier.amount)
      : "Contact for price";
    return { headline, obo, tierRows: [] };
  }

  const tierRows: FlyerTierRow[] = price.tiers.map((t) => ({
    label: t.label,
    amount: formatAmount(price.currency, t.amount),
    isDefault: resolvedTier !== null && t.label === resolvedTier.label && t.amount === resolvedTier.amount,
  }));

  const headline = resolvedTier ? formatAmount(price.currency, resolvedTier.amount) : "Contact for price";
  return { headline, obo, tierRows };
}

export function buildFlyerSpecs(item: FlyerItemView, unitSystem: MeasurementUnit): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (item.brand) rows.push(["Brand", item.brand]);
  if (item.model) rows.push(["Model", item.model]);
  if (item.color) rows.push(["Color", item.color]);
  if (item.ageYears !== null) rows.push(["Age", `~${item.ageYears} year${item.ageYears === 1 ? "" : "s"}`]);
  if (item.dimensions) rows.push(["Dimensions", formatDimensions(item.dimensions, unitSystem)]);
  if (item.weight) rows.push(["Weight", formatWeight(item.weight, unitSystem)]);
  rows.push(["Condition", CONDITION_LABELS[item.condition]]);
  return rows;
}

export function buildLiveListingUrl(baseUrl: string, item: FlyerItemView): string {
  return `${baseUrl}/${item.categorySlug}/${item.itemSlug}`;
}

export function buildFlyerFilename(item: FlyerItemView): string {
  return `${item.itemSlug}-flyer.pdf`;
}
