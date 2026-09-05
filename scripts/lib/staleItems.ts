// Shared "which items are stale" logic for pnpm stale-check and pnpm
// semester-end — extracted so semester-end's interactive flow can never
// disagree with stale-check's read-only report about which items qualify.
import type { Item } from "@/lib/content/types";
import { daysListed } from "./itemAge";

// Matches the number the roadmap's §1.12 "Semester-End Batch Actions" spec
// hard-codes; stale-check's --days flag can override it for a one-off query.
export const DEFAULT_STALE_DAYS = 60;

export type StaleItem = { item: Item; days: number };

/**
 * `available` items listed for MORE than `thresholdDays` days, sorted with
 * the longest-listed item first. Only `available` items are considered:
 * pending/reserved/sold/draft items aren't "stale listings" in the sense
 * this check cares about (a pending sale isn't sitting unsold; a draft was
 * never published for buyers to see it).
 */
export function findStaleItems(
  items: Item[],
  thresholdDays: number = DEFAULT_STALE_DAYS,
  now: Date = new Date(),
): StaleItem[] {
  return items
    .filter((item) => item.status === "available")
    .map((item) => ({ item, days: daysListed(item.listedDate, now) }))
    .filter((entry) => entry.days > thresholdDays)
    .sort((a, b) => b.days - a.days);
}
