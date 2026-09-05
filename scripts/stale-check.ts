// Usage: pnpm stale-check [--days <n>]
// Lists `available` items listed for more than N days (default 60, matching
// pnpm semester-end's threshold — both scripts share the same
// findStaleItems() in scripts/lib/staleItems.ts). Read-only — no file writes.

import { loadAllItemsRaw } from "@/lib/content/loader";
import { findStaleItems, DEFAULT_STALE_DAYS } from "./lib/staleItems";
import { resolvePriceByStrategy } from "@/lib/utils/pricing";
import type { PriceTier } from "@/lib/content/types";

function parseDaysFlag(argv: string[]): number {
  const idx = argv.indexOf("--days");
  if (idx === -1) return DEFAULT_STALE_DAYS;

  const raw = argv[idx + 1];
  const n = raw !== undefined ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    console.error(`Error: --days must be a non-negative number. Got: "${raw ?? ""}"`);
    process.exit(1);
  }
  return n;
}

function priceLabel(tiers: PriceTier[]): string {
  const resolved = resolvePriceByStrategy(tiers, "lowest");
  return resolved !== null ? `$${resolved.amount}` : "—";
}

async function main() {
  const days = parseDaysFlag(process.argv.slice(2));
  const items = await loadAllItemsRaw();
  const stale = findStaleItems(items, days);

  if (stale.length === 0) {
    console.log(`No available items listed for more than ${days} days.`);
    return;
  }

  console.log(`${stale.length} available item(s) listed for more than ${days} days:\n`);
  for (const { item, days: itemDays } of stale) {
    console.log(
      `  ${item.categorySlug}/${item.itemSlug}  (${item.name})  —  ${itemDays} days  —  ${priceLabel(item.price.tiers)}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
