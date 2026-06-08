"use client";

import type { Item } from "@/lib/content/types";
import { siteConfig } from "@/content/config";
import { useGeolocation } from "@/components/pricing/useGeolocation";
import { useDistancePricing } from "@/components/pricing/useDistancePricing";
import { useFilters } from "@/components/filters/useFilters";
import { useIncrementalReveal } from "@/components/common/useIncrementalReveal";
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

  // Caps how many cards mount at once — large catalogues would otherwise mean
  // hundreds of images/cards in the DOM on first paint. Filtering/sorting still
  // runs over the full filteredItems set; this only limits what gets rendered.
  const { visibleItems, hasMore, sentinelRef } = useIncrementalReveal(filteredItems);

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
          re-running resolveItemPrice per render. Rendered in incremental batches
          (visibleItems) so large catalogues don't mount hundreds of cards at once —
          filtering/sorting itself still runs over the full filteredItems set. */}
      {filteredItems.length > 0 ? (
        <>
          <ItemGridAdapter
            items={visibleItems}
            resolvedPrices={resolvedPrices}
            browseAll={browseAll}
          />
          {hasMore && (
            <div
              ref={sentinelRef}
              aria-hidden="true"
              className="flex justify-center py-8"
            >
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
            </div>
          )}
        </>
      ) : (
        <p className="py-16 text-center text-foreground/40">
          No items match the current filters.
        </p>
      )}
    </div>
  );
}
