// Usage: pnpm create-template [category]
// Creates a fully-commented _template.json in:
//   content/items/<category>/_template.json  (when category is given)
//   content/items/_template.json             (when no argument)

import fs from "fs/promises";
import path from "path";

async function main() {
  const category = process.argv[2];
  const itemsRoot = path.join(process.cwd(), "content", "items");

  let targetPath: string;

  if (category) {
    const catDir = path.join(itemsRoot, category);
    try {
      const stat = await fs.stat(catDir);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      console.error(`Error: category '${category}' not found at ${catDir}`);
      process.exit(1);
    }
    targetPath = path.join(catDir, "_template.json");
  } else {
    targetPath = path.join(itemsRoot, "_template.json");
  }

  const today = new Date().toISOString().slice(0, 10);

  const template = {
    name: "Item Name Here",
    price: {
      currency: "USD",
      tiers: [
        { label: "Pickup / ≤ 5 mi", miles_max: 5, amount: 0 },
        { label: "6 – 15 mi", miles_min: 5, miles_max: 15, amount: 0 },
        { label: "Shipping", miles_min: 15, amount: 0 },
      ],
      negotiable: false,
      show_tiers: false,
    },
    description: "Item description (GitHub-flavoured Markdown supported).",
    condition: "good",
    brand: "",
    model: "",
    color: "",
    quantity: 1,
    age_years: null,
    original_source: "",
    original_link: "",
    original_price: null,
    status: "draft",
    listed_date: today,
    sold_date: null,
    preferred_payment: [],
    contact_note: "",
    no_lowball: false,
    price_reduced: false,
    previous_lowest_price: null,
    min_acceptable_offer: null,
    stripe_payment_link: "",
    venmo_payment_request: "",
    pickup_windows: [],
    youtube_link: "",
    tags: [],
    category_override: "",
    meta_description: "",
    isbn: "",
    course: "",
    edition: "",
    semester_listed: "",
    name_zh: "",
    description_zh: "",
  };

  await fs.writeFile(targetPath, JSON.stringify(template, null, 2) + "\n");

  console.log(`✓ Template created at ${targetPath}`);
  console.log(
    "  Copy this file into your item folder, rename it to item.json, and fill in the fields.",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
