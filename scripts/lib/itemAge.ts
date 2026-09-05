// Whole-day age math shared by pnpm inventory, pnpm stale-check, and
// pnpm semester-end, so "how many days has this been listed" is computed
// identically everywhere a script needs that number.
//
// Uses the same UTC-midnight Date.parse technique as
// lib/content/loader.ts's isSoldItemVisible (rather than `new Date(str)`,
// whose result depends on the runner's local timezone) so day counts don't
// drift by one depending on where the script happens to run.

/**
 * Whole days between `listedDate` (YYYY-MM-DD) and `now`. An unparseable
 * date returns 0 (treated as "just listed" rather than throwing — a
 * malformed listed_date should not crash a read-only reporting script). A
 * future-dated listing also returns 0 rather than a negative number.
 */
export function daysListed(listedDate: string, now: Date = new Date()): number {
  // Extract just the YYYY-MM-DD portion first (same tolerance as
  // lib/content/schema.ts's nullableDateString) so a full ISO timestamp
  // isn't fed back into itself as "<timestamp>T00:00:00Z".
  const match = listedDate.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match?.[1]) return 0;
  const listedMs = Date.parse(`${match[1]}T00:00:00Z`);
  if (isNaN(listedMs)) return 0;

  const todayIso = now.toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);

  const diffDays = Math.floor((todayMs - listedMs) / 86_400_000);
  return diffDays < 0 ? 0 : diffDays;
}
