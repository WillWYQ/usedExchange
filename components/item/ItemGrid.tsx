"use client";

import type { Item } from "@/lib/content/types";
import { siteConfig } from "@/content/config";
import { useGeolocation } from "@/components/pricing/useGeolocation";
import { useDistancePricing } from "@/components/pricing/useDistancePricing";
import { useFilters } from "@/components/filters/useFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { LocationPriceBar } from "@/components/pricing/LocationPriceBar";
import { ItemGridAdapter } from "@/components/ui-adapters/ItemGridAdapter";

type ItemGridProps = {
  items: Item[];
  // When true, each ItemCard shows an "Items in: {category}" chip linking to the category page.
  // Used by the Browse All page so buyers always know which category an item belongs to.
  browseAll?: boolean;
};

// Owns the geo + distance + filter state for a browsable item grid.
// Receives items from a server component; all client-side filtering happens here.
export function ItemGrid({ items, browseAll = false }: ItemGridProps) {
  const geoState = useGeolocation();
  const { resolved, setManualMiles } = useDistancePricing(
    siteConfig.location,
    geoState,
  );

  // Infinity when source === "fallback" — FilterBar and useFilters use this as the
  // price-range basis, showing the highest (open-ended) tier for every item.
  const resolvedDistanceMi =
    resolved.source === "fallback" ? Infinity : resolved.miles;

  const {
    availableConditions,
    activeConditions,
    toggleCondition,
    priceBounds,
    priceRange,
    setPriceRange,
    showSold,
    toggleShowSold,
    sortKey,
    setSortKey,
    filteredItems,
    resolvedPrices,
  } = useFilters(items, resolvedDistanceMi);

  return (
    <div className="space-y-4">
      {/* Distance indicator + manual override input */}
      <LocationPriceBar
        geoState={geoState}
        resolved={resolved}
        onManualMiles={setManualMiles}
      />

      {/* Condition chips · price slider · status toggle · sort select */}
      <FilterBar
        availableConditions={availableConditions}
        activeConditions={activeConditions}
        onToggleCondition={toggleCondition}
        priceBounds={priceBounds}
        priceRange={priceRange}
        onPriceRangeChange={setPriceRange}
        showSold={showSold}
        onToggleShowSold={toggleShowSold}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
      />

      {/* Item grid — delegated to ItemGridAdapter (wires siteConfig.ui.itemGrid).
          resolvedPrices computed once in useFilters; passed through to avoid
          re-running resolveItemPrice per render. */}
      {filteredItems.length > 0 ? (
        <ItemGridAdapter
          items={filteredItems}
          resolvedPrices={resolvedPrices}
          browseAll={browseAll}
        />
      ) : (
        <p className="py-16 text-center text-white/40">
          No items match the current filters.
        </p>
      )}
    </div>
  );
}
