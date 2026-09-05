// Pure "reduce this item's lowest price tier" logic for pnpm semester-end's
// interactive "reduce price" action. Operates on item.json TEXT (JSONC), same
// pattern as scripts/lib/markSold.ts: surgical edit via applyFieldEdits, so
// `// options: ...` comments and the private reserved_for field survive.
import { parse as parseJsonc } from "jsonc-parser";
import type { PriceTier } from "@/lib/content/types";
import { applyFieldEdits } from "./itemEdit";

/** Index of the tier with the smallest `amount`, or -1 if `tiers` is empty. */
export function findLowestTierIndex(tiers: PriceTier[]): number {
  let bestIdx = -1;
  let bestAmount = Infinity;
  tiers.forEach((tier, i) => {
    if (tier.amount < bestAmount) {
      bestAmount = tier.amount;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/**
 * Sets the lowest-amount price tier's `amount` to `newAmount`. Returns null
 * when the item has no price tiers at all (nothing to reduce — the CLI
 * should warn and skip rather than write anything).
 */
export function applyReducePrice(text: string, newAmount: number): string | null {
  const raw = parseJsonc(text) as { price?: { tiers?: unknown } } | undefined;
  const tiers = raw?.price?.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return null;

  const idx = findLowestTierIndex(tiers as PriceTier[]);
  if (idx === -1) return null;

  return applyFieldEdits(text, [{ path: ["price", "tiers", idx, "amount"], value: newAmount }]);
}
