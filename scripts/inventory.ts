// Usage: pnpm inventory
// Prints a Markdown table of every item (all statuses) to stdout: name,
// category, status, lowest resolved price, and days listed. Read-only — no
// file writes. See scripts/lib/inventory.ts for the table-building logic.

import { loadAllItemsRaw } from "@/lib/content/loader";
import { buildInventoryTable } from "./lib/inventory";

async function main() {
  // loadAllItemsRaw (not loadAllItems) so this report includes drafts, sold,
  // pending, and reserved items too — not just "available" capped at the
  // home page's recentlyListedCount. See docs/ARCHITECTURE.md's loader table.
  const items = await loadAllItemsRaw();
  console.log(buildInventoryTable(items));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
