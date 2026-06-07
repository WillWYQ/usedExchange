"use client";

import type { Item } from "@/lib/content/types";
import { siteConfig } from "@/content/config";
import { useGeolocation } from "@/components/pricing/useGeolocation";
import { useDistancePricing } from "@/components/pricing/useDistancePricing";
import { resolveItemPrice } from "@/lib/utils/pricing";
import { ItemCardAdapter } from "@/components/ui-adapters/ItemCardAdapter";

type RecentlyListedSectionProps = {
  items: Item[];
};

// Owns the geolocation + distance state for the home page item strip.
// Prices update silently as geo resolves — no LocationPriceBar on the home page
// (DESIGN.md §17 "Home page LocationPriceBar decision").
export function RecentlyListedSection({ items }: RecentlyListedSectionProps) {
  const geoState = useGeolocation();
  const { resolved } = useDistancePricing(siteConfig.location, geoState);

  if (items.length === 0) return null;

  const heading = siteConfig.i18n.strings.recentlyListed || "Recently Listed";

  return (
    <section aria-labelledby="recently-listed-heading">
      <h2
        id="recently-listed-heading"
        className="mb-4 text-xl font-semibold text-white"
      >
        {heading}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <ItemCardAdapter
            key={`${item.categorySlug}/${item.itemSlug}`}
            item={item}
            resolvedPrice={resolveItemPrice(item.price, resolved)}
          />
        ))}
      </div>
    </section>
  );
}
