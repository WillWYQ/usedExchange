// Usage: pnpm audit-listings
// Reports items missing "recommended" (schema-optional but valuable) fields.
// See scripts/lib/auditListings.ts's header comment for the exact criteria
// list. Read-only — no file writes.

import { loadAllItemsRaw } from "@/lib/content/loader";
import { auditListings, formatAuditReport } from "./lib/auditListings";

async function main() {
  const items = await loadAllItemsRaw();
  const results = auditListings(items);
  console.log(formatAuditReport(results));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
