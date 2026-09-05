"use client";

import { useState, useRef, useMemo } from "react";
import type { Item, Condition, PriceTier } from "@/lib/content/types";
import { resolveItemPrice } from "@/lib/utils/pricing";
import {
  computePriceBounds,
  computePriceBuckets,
} from "@/lib/utils/priceFilterStrategies";
import type {
  PriceFilterConfig,
  PriceBucket,
} from "@/lib/utils/priceFilterStrategies";
import type { SortKey } from "./SortSelect";

const CONDITION_ORDER: Record<Condition, number> = {
  new: 0,
  "like-new": 1,
  good: 2,
  fair: 3,
  "for-parts": 4,
};

const DEFAULT_CONFIG: PriceFilterConfig = { strategy: "none" };

export type UseFiltersResult = {
  // Condition chips
  availableConditions: Condition[];
  activeConditions: Set<Condition>;
  toggleCondition: (c: Condition) => void;

  // Course filter (textbooks) — availableCourses is empty when no item in
  // the set has a non-empty `course` field. Single-select: null = show all.
  availableCourses: string[];
  activeCourse: string | null;
  setActiveCourse: (course: string | null) => void;

  // Tag chips — availableTags is empty when no item in the set has any
  // `tags` entries. Multi-select (unlike course): an item can usefully carry
  // several tags at once, so activeTags is a Set and a visible item must
  // match ALL of them (AND) rather than any one (OR) — this is the more
  // useful default for narrowing a large catalogue, matching how
  // activeConditions/course narrow rather than broaden results.
  availableTags: string[];
  activeTags: Set<string>;
  toggleTag: (tag: string) => void;

  // Price slider — null when no item in the set has price tiers
  priceBounds: [number, number] | null;
  rawPriceBounds: [number, number] | null;
  priceRange: [number, number] | null;
  setPriceRange: (range: [number, number]) => void;

  // Preset buckets — non-null only when strategy is "preset-buckets"
  priceBuckets: PriceBucket[] | null;

  // Status toggle
  showSold: boolean;
  toggleShowSold: () => void;

  // Sort
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;

  // Derived output — use this array for rendering
  filteredItems: Item[];

  // Per-item resolved price at the current distance, keyed by "categorySlug/itemSlug".
  resolvedPrices: Map<string, PriceTier | null>;
};

// Manages filter + sort state for ItemGrid / category pages.
// resolvedDistanceMi: pass Infinity when ResolvedDistance.source === "fallback".
// The price slider resets automatically whenever resolvedDistanceMi changes.
export function useFilters(
  items: Item[],
  resolvedDistanceMi: number,
  priceFilterConfig: PriceFilterConfig = DEFAULT_CONFIG,
): UseFiltersResult {
  const [activeConditions, setActiveConditions] = useState<Set<Condition>>(new Set());
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
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

  // Collect all non-null price amounts for bounds/bucket computation.
  const priceAmounts = useMemo(
    () =>
      [...resolvedPrices.values()]
        .filter((t): t is PriceTier => t !== null)
        .map((t) => t.amount),
    [resolvedPrices],
  );

  // Compute bounds using the configured strategy.
  const boundsResult = useMemo(
    () => computePriceBounds(priceAmounts, priceFilterConfig),
    [priceAmounts, priceFilterConfig],
  );

  const priceBounds = boundsResult?.sliderBounds ?? null;
  const rawPriceBounds = boundsResult?.rawBounds ?? null;

  // Preset buckets (only for "preset-buckets" strategy).
  const priceBuckets = useMemo(() => {
    if (priceFilterConfig.strategy !== "preset-buckets") return null;
    if (priceAmounts.length === 0) return null;
    return computePriceBuckets(
      priceAmounts,
      "USD",
      priceFilterConfig.customBuckets,
    );
  }, [priceAmounts, priceFilterConfig]);

  // Reset slider to full range whenever the distance (and therefore prices) change.
  const prevDistanceRef = useRef<number | null>(null);
  if (
    !Number.isNaN(resolvedDistanceMi) &&
    prevDistanceRef.current !== resolvedDistanceMi
  ) {
    prevDistanceRef.current = resolvedDistanceMi;
    setPriceRange(priceBounds);
  }

  // Conditions present in the item set, in quality order (best → worst).
  const availableConditions = useMemo<Condition[]>(() => {
    const seen = new Set<Condition>();
    for (const item of items) seen.add(item.condition);
    return [...seen].sort((a, b) => CONDITION_ORDER[a] - CONDITION_ORDER[b]);
  }, [items]);

  // Distinct non-empty `course` values present in the item set (textbooks),
  // alphabetically sorted. Empty when no item in the set has a course.
  const availableCourses = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const item of items) if (item.course) seen.add(item.course);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Distinct non-empty `tags` values present in the item set, alphabetically
  // sorted. Empty when no item in the set has any tags.
  const availableTags = useMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const item of items) for (const tag of item.tags) if (tag) seen.add(tag);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo<Item[]>(() => {
    const getAmount = (item: Item, fallback: number): number => {
      const tier = resolvedPrices.get(`${item.categorySlug}/${item.itemSlug}`) ?? null;
      return tier?.amount ?? fallback;
    };

    const visible = items.filter((item) => {
      if (!showSold && item.status === "sold") return false;

      if (activeConditions.size > 0 && !activeConditions.has(item.condition)) return false;

      if (activeCourse !== null && item.course !== activeCourse) return false;

      // AND matching: the item must carry every active tag, not just one.
      if (activeTags.size > 0) {
        for (const tag of activeTags) {
          if (!item.tags.includes(tag)) return false;
        }
      }

      if (priceRange !== null && priceBounds !== null) {
        const tier = resolvedPrices.get(`${item.categorySlug}/${item.itemSlug}`) ?? null;
        if (tier !== null) {
          // Edge-inclusion: when slider is pegged to its min/max edge,
          // include all items beyond that edge (outliers stay reachable).
          const atMinEdge = priceRange[0] === priceBounds[0];
          const atMaxEdge = priceRange[1] === priceBounds[1];
          if (tier.amount < priceRange[0] && !atMinEdge) return false;
          if (tier.amount > priceRange[1] && !atMaxEdge) return false;
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
  }, [
    items,
    showSold,
    activeConditions,
    activeCourse,
    activeTags,
    priceRange,
    priceBounds,
    sortKey,
    resolvedPrices,
  ]);

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
    availableCourses,
    activeCourse,
    setActiveCourse,
    availableTags,
    activeTags,
    toggleTag: (tag) =>
      setActiveTags((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        return next;
      }),
    priceBounds,
    rawPriceBounds,
    priceRange,
    setPriceRange,
    priceBuckets,
    showSold,
    toggleShowSold: () => setShowSold((v) => !v),
    sortKey,
    setSortKey,
    filteredItems,
    resolvedPrices,
  };
}
