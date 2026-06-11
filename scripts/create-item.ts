// Usage: pnpm create-item <category>/<name>
// Creates content/items/<category>/<name>/item.json with a draft template.
// Opens in $EDITOR if set.

import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { isValidSlug } from "@/lib/utils/slug";
import { buildItemTemplate } from "./lib/itemTemplate";

// FIX Sec 3: only allow lowercase kebab-case slugs (letters, digits, hyphens).
// This prevents path-traversal payloads such as "../../etc/cron.d" from being
// accepted as category or item names. It also keeps every folder name a
// URL-safe static-export route — see lib/utils/slug.ts for why this same
// pattern is enforced again at generateStaticParams time.
// The check runs before any filesystem access so the error surfaces immediately.
function assertSafeSlug(value: string, label: string): void {
  if (!isValidSlug(value)) {
    console.error(
      `Error: ${label} must be kebab-case (lowercase letters, digits, and hyphens only).\n` +
        `  Got: "${value}"`,
    );
    process.exit(1);
  }
}

async function main() {
  const arg = process.argv[2];

  if (!arg || !arg.includes("/")) {
    console.error("Usage: pnpm create-item <category>/<name>");
    console.error("Example: pnpm create-item electronics/airpods-pro");
    process.exit(1);
  }

  const slashIdx = arg.indexOf("/");
  const category = arg.slice(0, slashIdx);
  const itemName = arg.slice(slashIdx + 1);

  if (!category || !itemName) {
    console.error("Error: both <category> and <name> must be non-empty.");
    process.exit(1);
  }

  // FIX Sec 3: validate slugs before constructing any filesystem paths.
  assertSafeSlug(category, "category");
  assertSafeSlug(itemName, "item name");

  const catDir = path.join(process.cwd(), "content", "items", category);

  try {
    const stat = await fs.stat(catDir);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(
      `Error: category '${category}' not found at ${catDir}\nCreate the category folder first or use an existing category.`,
    );
    process.exit(1);
  }

  const itemDir = path.join(catDir, itemName);

  try {
    await fs.access(itemDir);
    console.error(`Error: item '${itemName}' already exists at ${itemDir}`);
    process.exit(1);
  } catch {
    // Good — folder doesn't exist yet
  }

  await fs.mkdir(itemDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const displayName = itemName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const template = buildItemTemplate(displayName, today);

  const jsonPath = path.join(itemDir, "item.json");
  await fs.writeFile(jsonPath, JSON.stringify(template, null, 2) + "\n");

  console.log(`✓ Created ${jsonPath}`);
  console.log(
    `  The file includes every fillable field (see docs/DESIGN.md §5 for details).\n` +
      `  Fields left as "", null, or [] use safe defaults if you don't fill them in —\n` +
      `  e.g. an unfilled "dimensions"/"weight" placeholder is treated as not set.\n\n` +
      `  Next steps:\n  1. Edit ${jsonPath} (add price, description, photos)\n  2. Drop photos into ${itemDir}/\n  3. Set status to "available" when ready`,
  );

  // FIX Sec 2: use spawnSync with an args array instead of execSync with a
  // shell-interpolated string.  The previous form embedded `jsonPath` inside a
  // shell command string, which could be abused if itemName contained shell
  // metacharacters (`;`, `"`, `\`).  spawnSync bypasses the shell entirely —
  // the editor binary is invoked directly with jsonPath as a literal argument.
  if (process.env["EDITOR"]) {
    try {
      spawnSync(process.env["EDITOR"], [jsonPath], { stdio: "inherit" });
    } catch {
      // Editor launch failure is non-fatal
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
