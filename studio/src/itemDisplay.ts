import type { StudioItem } from "./api";

export function displayName(item: StudioItem, locale: string): string {
  return item.localizedNames[locale] ?? item.name;
}

export function coverImageUrl(item: StudioItem): string | null {
  if (item.coverImage === null) return null;
  return `/api/items/${encodeURIComponent(item.categorySlug)}/${encodeURIComponent(
    item.itemSlug,
  )}/images/${encodeURIComponent(item.coverImage)}`;
}

export function formatPrice(item: StudioItem): string {
  if (item.lowestTierAmount === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: item.currency,
    }).format(item.lowestTierAmount);
  } catch {
    // item.currency is seller-authored (content/) and may be empty or not a
    // valid ISO 4217 code — Intl.NumberFormat throws a RangeError on those.
    // Fall back to the bare amount rather than crashing the row.
    return item.lowestTierAmount.toFixed(2);
  }
}
