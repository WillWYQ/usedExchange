import type { Price, PriceTier, ResolvedDistance } from "@/lib/content/types";

// Returns the best matching PriceTier for the given distance, or null when
// price.tiers is empty (caller renders "Contact for price").
//
// No "use client" — importable by both server and client components.
export function resolveItemPrice(
  price: Price,
  resolved: ResolvedDistance,
): PriceTier | null {
  const { tiers } = price;
  if (tiers.length === 0) return null;

  // Fallback path: denied / unavailable / idle / pending
  if (resolved.source === "fallback") {
    return openEndedOrHighest(tiers);
  }

  const D = resolved.miles;

  // Find the first tier whose range contains D
  const match = tiers.find((t) => {
    const min = t.miles_min ?? 0;
    const max = t.miles_max ?? Infinity;
    return D >= min && D <= max;
  });
  if (match) return match;

  // Gap between tiers: use the tier whose miles_max is closest to D from below
  const tiersWithMax = tiers.filter((t) => t.miles_max !== undefined);
  if (tiersWithMax.length > 0) {
    // Sort ascending by miles_max, then take the last one that is ≤ D
    const sorted = [...tiersWithMax].sort((a, b) => a.miles_max! - b.miles_max!);
    const below = sorted.filter((t) => t.miles_max! <= D);
    if (below.length > 0) return below[below.length - 1] ?? tiers[0] ?? null;
  }

  // D is below every tier's lower bound. Return the tier with the smallest
  // lower bound (the "nearest" tier) rather than tiers[0], so the result does
  // not depend on the order the seller happened to author the tiers in.
  const byMinAsc = [...tiers].sort(
    (a, b) => (a.miles_min ?? 0) - (b.miles_min ?? 0),
  );
  return byMinAsc[0] ?? null;
}

// Open-ended tier (miles_max absent) first; on tie/missing, highest amount (first in array order).
function openEndedOrHighest(tiers: PriceTier[]): PriceTier | null {
  const openEnded = tiers.find((t) => t.miles_max === undefined);
  if (openEnded) return openEnded;

  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (!best || t.amount > best.amount) best = t;
  }
  return best;
}
