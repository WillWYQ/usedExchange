"use client";

import { useState, useEffect, useMemo } from "react";
import type { Item, Condition } from "@/lib/content/types";
import { resolveItemPrice } from "@/lib/utils/pricing";
import type { SortKey } from "./SortSelect";

const CONDITION_ORDER: Record<Condition, number> = {
  new: 0,
  "like-new": 1,
  good: 2,
  fair: 3,
  "for-parts": 4,
};

export type UseFiltersResult = {
  // Condition chips
  availableConditions: Condition[];
  activeConditions: Set<Condition>;
  toggleCondition: (c: Condition) => void;

  // Price slider — null when no item in the set has price tiers
  priceBounds: [number, number] | null;
  priceRange: [number, number] | null;
  setPriceRange: (range: [number, number]) => void;

  // Status toggle
  showSold: boolean;
  toggleShowSold: () => void;

  // Sort
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;

  // Derived output — use this array for rendering
  filteredItems: Item[];
};

// Manages filter + sort state for ItemGrid / category pages.
// resolvedDistanceMi: pass Infinity when ResolvedDistance.source === "fallback".
// The price slider resets automatically whenever resolvedDistanceMi changes.
export function useFilters(
  items: Item[],
  resolvedDistanceMi: number,
): UseFiltersResult {
  const [activeConditions, setActiveConditions] = useState<Set<Condition>>(new Set());
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [showSold, setShowSold] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");

  // Resolve each item's price at the current distance once, reuse in both
  // priceBounds computation and sort/filter.
  const resolvedPrices = useMemo(() => {
    const resolved =
      resolvedDistanceMi === Infinity
        ? ({ source: "fallback" } as const)
        : ({ source: "detected", miles: resolvedDistanceMi } as const);
    return new Map(
      items.map((item) => [
        `${item.categorySlug}/${item.itemSlug}`,
        resolveItemPrice(item.price, resolved),
      ]),
    );
  }, [items, resolvedDistanceMi]);

  // Bounds across all items that have at least one tier.
  const priceBounds = useMemo<[number, number] | null>(() => {
    const amounts = [...resolvedPrices.values()]
      .filter((t) => t !== null)
      .map((t) => t!.amount);
    if (amounts.length === 0) return null;
    return [Math.min(...amounts), Math.max(...amounts)];
  }, [resolvedPrices]);

  // Reset slider to full range whenever the distance (and therefore prices) change.
  useEffect(() => {
    setPriceRange(priceBounds);
  }, [resolvedDistanceMi, priceBounds]);

  // Conditions present in the item set, in quality order (best → worst).
  const availableConditions = useMemo<Condition[]>(() => {
    const seen = new Set<Condition>();
    for (const item of items) seen.add(item.condition);
    return [...seen].sort((a, b) => CONDITION_ORDER[a] - CONDITION_ORDER[b]);
  }, [items]);

  const filteredItems = useMemo<Item[]>(() => {
    // Helper: resolved amount for an item, with a numeric fallback for sorting.
    const getAmount = (item: Item, fallback: number): number => {
      const tier = resolvedPrices.get(`${item.categorySlug}/${item.itemSlug}`) ?? null;
      return tier?.amount ?? fallback;
    };

    const visible = items.filter((item) => {
      if (!showSold && item.status === "sold") return false;

      if (activeConditions.size > 0 && !activeConditions.has(item.condition)) return false;

      if (priceRange !== null) {
        const tier = resolvedPrices.get(`${item.categorySlug}/${item.itemSlug}`) ?? null;
        // tier === null → "Contact for price" → always include regardless of slider
        if (tier !== null) {
          if (tier.amount < priceRange[0] || tier.amount > priceRange[1]) return false;
        }
      }

      return true;
    });

    return [...visible].sort((a, b) => {
      switch (sortKey) {
        case "price-asc":
          return getAmount(a, Infinity) - getAmount(b, Infinity);
        case "price-desc":
          return getAmount(b, -Infinity) - getAmount(a, -Infinity);
        case "condition-asc":
          return CONDITION_ORDER[a.condition] - CONDITION_ORDER[b.condition];
        case "date-desc":
        default:
          return b.listedDate.localeCompare(a.listedDate);
      }
    });
  }, [items, showSold, activeConditions, priceRange, sortKey, resolvedPrices]);

  return {
    availableConditions,
    activeConditions,
    toggleCondition: (c) =>
      setActiveConditions((prev) => {
        const next = new Set(prev);
        if (next.has(c)) next.delete(c);
        else next.add(c);
        return next;
      }),
    priceBounds,
    priceRange,
    setPriceRange,
    showSold,
    toggleShowSold: () => setShowSold((v) => !v),
    sortKey,
    setSortKey,
    filteredItems,
  };
}
