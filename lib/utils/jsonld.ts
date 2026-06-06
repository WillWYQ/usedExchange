import type { Item } from "@/lib/content/types";

const ITEM_CONDITION: Record<string, string> = {
  new: "https://schema.org/NewCondition",
  "like-new": "https://schema.org/LikeNewCondition",
  good: "https://schema.org/UsedCondition",
  fair: "https://schema.org/UsedCondition",
  "for-parts": "https://schema.org/DamagedCondition",
};

const ITEM_AVAILABILITY: Record<string, string> = {
  available: "https://schema.org/InStock",
  pending: "https://schema.org/LimitedAvailability",
  reserved: "https://schema.org/LimitedAvailability",
  sold: "https://schema.org/SoldOut",
  draft: "https://schema.org/OutOfStock",
};

export type Crumb = { name: string; href: string };

export function buildProductJsonLd(
  item: Item,
  baseUrl: string,
): Record<string, unknown> {
  const firstTier = item.price.tiers[0];
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: item.metaDescription || item.description,
    image: item.images,
    url: `${baseUrl}/${item.categorySlug}/${item.itemSlug}`,
    ...(item.brand ? { brand: { "@type": "Brand", name: item.brand } } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: item.price.currency,
      ...(firstTier !== undefined ? { price: firstTier.amount } : {}),
      availability:
        ITEM_AVAILABILITY[item.status] ?? "https://schema.org/OutOfStock",
      itemCondition:
        ITEM_CONDITION[item.condition] ?? "https://schema.org/UsedCondition",
    },
  };
}

export function buildBreadcrumbJsonLd(
  crumbs: Crumb[],
  baseUrl: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${baseUrl}${crumb.href}`,
    })),
  };
}
