// scripts/migrate-config.ts
//
// Scans content/config.ts for missing config fields and injects them with
// sensible defaults. Called automatically by update-site after checking out
// new template code, or manually via `pnpm migrate-config`.
//
// Only adds fields — never removes or modifies existing values.

import fs from "fs";
import path from "path";
import { CONFIG_DEFAULTS } from "./lib/configDefaults";

const CONFIG_PATH = path.join(process.cwd(), "content", "config.ts");

export function migrateConfig(): { applied: string[]; skipped: string[] } {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("[migrate-config] content/config.ts not found.");
    return { applied: [], skipped: [] };
  }

  let source = fs.readFileSync(CONFIG_PATH, "utf-8");
  const lines = source.split("\n");
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const entry of CONFIG_DEFAULTS) {
    if (source.includes(entry.key)) {
      skipped.push(entry.key);
      continue;
    }

    // Find the anchor line (afterKey)
    const anchorIndex = lines.findIndex((line) => line.includes(entry.afterKey));
    if (anchorIndex === -1) {
      console.warn(
        `[migrate-config] Could not find anchor "${entry.afterKey}" for "${entry.key}" — skipping.`,
      );
      skipped.push(entry.key);
      continue;
    }

    // Insert the new lines right after the anchor
    lines.splice(anchorIndex + 1, 0, ...entry.lines);
    applied.push(entry.key);

    // Re-join so subsequent entries can search the updated text
    source = lines.join("\n");
  }

  if (applied.length > 0) {
    fs.writeFileSync(CONFIG_PATH, lines.join("\n"), "utf-8");
  }

  return { applied, skipped };
}

// Direct invocation: `pnpm migrate-config` / `tsx scripts/migrate-config.ts`
if (
  process.argv[1]?.endsWith("migrate-config.ts") ||
  process.argv[1]?.endsWith("migrate-config")
) {
  const { applied } = migrateConfig();
  if (applied.length > 0) {
    console.log(
      `[migrate-config] Added ${applied.length} missing field(s): ${applied.join(", ")}`,
    );
  } else {
    console.log("[migrate-config] No missing fields — config is up to date.");
  }
}
