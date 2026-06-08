"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_BATCH_SIZE = 24;

export type UseIncrementalRevealResult<T> = {
  // First N items of the source array — render these instead of the full set.
  visibleItems: T[];
  // True while more items remain beyond `visibleItems`; render the sentinel only then.
  hasMore: boolean;
  // Attach to a sentinel element placed after the rendered list — once it scrolls
  // into view, the next batch is revealed.
  sentinelRef: (node: HTMLDivElement | null) => void;
};

// Caps the number of cards mounted at once for large catalogues, revealing more
// in batches as the user scrolls. Operates on an already filtered/sorted array,
// so cross-catalogue filtering (useFilters) keeps working over the full set —
// this only limits how much of that set gets rendered to the DOM at a time.
export function useIncrementalReveal<T>(
  items: T[],
  batchSize: number = DEFAULT_BATCH_SIZE,
): UseIncrementalRevealResult<T> {
  const [visibleCount, setVisibleCount] = useState(batchSize);

  // Reset to the first batch whenever the source set changes — e.g. a filter or
  // sort change produces a new `items` array. Without this, switching filters
  // could leave a stale count (too few items shown for the new set).
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [items, batchSize]);

  const observerRef = useRef<IntersectionObserver | null>(null);

  // Callback ref (rather than useRef + effect) so the observer re-attaches
  // whenever the sentinel mounts — it disappears once everything is revealed,
  // then reappears if a filter change grows the set again.
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      if (!node) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisibleCount((count) => count + batchSize);
          }
        },
        { rootMargin: "600px" },
      );
      observerRef.current.observe(node);
    },
    [batchSize],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const visibleItems = items.slice(0, visibleCount);
  return { visibleItems, hasMore: visibleItems.length < items.length, sentinelRef };
}
