// Usage: pnpm create-item <category>/<name>
// Creates content/items/<category>/<name>/item.json with a draft template.
// Opens in $EDITOR if set.

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

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

  const template = {
    name: displayName,
    status: "draft",
    condition: "good",
    listed_date: today,
    description: "",
    tags: [],
  };

  const jsonPath = path.join(itemDir, "item.json");
  await fs.writeFile(jsonPath, JSON.stringify(template, null, 2) + "\n");

  console.log(`✓ Created ${jsonPath}`);
  console.log(
    `  Next steps:\n  1. Edit ${jsonPath} (add price, description, photos)\n  2. Drop photos into ${itemDir}/\n  3. Set status to "available" when ready`,
  );

  if (process.env["EDITOR"]) {
    try {
      execSync(`${process.env["EDITOR"]} "${jsonPath}"`, { stdio: "inherit" });
    } catch {
      // Editor launch failure is non-fatal
    }
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
