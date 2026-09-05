// Usage: pnpm export-csv
// Exports every item (all statuses) as a flat CSV for the seller's own
// record-keeping — NOT the Facebook Marketplace format (that's `pnpm
// fb-export` / scripts/export-facebook.ts, a different tool/output). Prompts
// before overwriting an existing file at the target path.

import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { loadAllItemsRaw } from "@/lib/content/loader";
import { buildExportCsvRows, EXPORT_CSV_HEADERS } from "./lib/exportCsv";
import { toCsvString } from "./lib/csv";
import { createPrompt } from "./lib/cliPrompt";

const EXPORTS_DIR = path.join(process.cwd(), "exports");
const OUTPUT_PATH = path.join(EXPORTS_DIR, "listings.csv");

async function main() {
  const items = await loadAllItemsRaw();

  if (items.length === 0) {
    console.log("No items found under content/items — nothing to export.");
    return;
  }

  if (existsSync(OUTPUT_PATH)) {
    const { ask, closeInput } = createPrompt();
    const answer = (await ask(`${OUTPUT_PATH} already exists. Overwrite? [y/N]: `))
      .trim()
      .toLowerCase();
    closeInput();
    if (answer !== "y" && answer !== "yes") {
      console.log("Aborted — no changes made.");
      return;
    }
  }

  // Sort for stable, readable output — matches pnpm inventory's ordering.
  const sorted = [...items].sort((a, b) => {
    const catCmp = a.categorySlug.localeCompare(b.categorySlug);
    return catCmp !== 0 ? catCmp : a.name.localeCompare(b.name);
  });

  const rows = buildExportCsvRows(sorted);
  const csv = toCsvString([...EXPORT_CSV_HEADERS], rows);

  mkdirSync(EXPORTS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, csv, "utf-8");

  console.log(`✓ Exported ${rows.length} item(s) → ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
