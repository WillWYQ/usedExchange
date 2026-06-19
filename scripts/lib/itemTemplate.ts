// Single source of truth for the item.json scaffold, used by:
//   - scripts/create-item.ts     (pnpm create-item <category>/<name>)
//   - scripts/create-template.ts (pnpm create-template [category])
//
// Field set mirrors docs/DESIGN.md §5 (38 fields). `reserved_for` is
// intentionally excluded — see .claude/CLAUDE.md Iron Rule 4 (private
// buyer info, never rendered, never written by tooling).

export type MeasurementUnit = "metric" | "imperial";

export type PriceTierTemplate = {
  label: string;
  miles_min?: number;
  miles_max?: number;
  amount: number;
};

const DEFAULT_PRICE_TIERS: PriceTierTemplate[] = [
  { label: "Pickup / ≤ 5 mi", miles_max: 5, amount: 0 },
  { label: "6 – 15 mi", miles_min: 5, miles_max: 15, amount: 0 },
  { label: "Shipping", miles_min: 15, amount: 0 },
];

export function buildItemTemplate(
  name: string,
  listedDate: string,
  measurementUnit: MeasurementUnit = "metric",
  priceTiers?: PriceTierTemplate[],
) {
  const dimensionsUnit = measurementUnit === "imperial" ? "in" : "cm";
  const weightUnit = measurementUnit === "imperial" ? "lb" : "kg";
  const tiers = priceTiers && priceTiers.length > 0 ? priceTiers : DEFAULT_PRICE_TIERS;

  return {
    name,
    price: {
      currency: "USD",
      tiers,
      negotiable: false,
      show_tiers: false,
    },
    description: "",
    condition: "good",
    brand: "",
    model: "",
    age_years: null,
    // Placeholder shape — if left with `null` leaves, lib/content/schema.ts
    // coerces the whole `dimensions`/`weight` object to null on build.
    dimensions: { length: null, width: null, height: null, unit: dimensionsUnit },
    weight: { value: null, unit: weightUnit },
    color: "",
    quantity: 1,
    original_source: "",
    original_link: "",
    original_price: null,
    status: "draft",
    listed_date: listedDate,
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
}

// ── JSONC rendering ──────────────────────────────────────────────────────────

// Appends a trailing `// ...` comment to the (unique) first occurrence of
// `marker` in `json`. Each marker below is guaranteed unique in the output of
// JSON.stringify(buildItemTemplate(...)), so a plain indexOf/slice insert is
// sufficient — no JSON AST manipulation needed.
function withTrailingComment(json: string, marker: string, comment: string): string {
  const idx = json.indexOf(marker);
  if (idx === -1) return json;
  const insertAt = idx + marker.length;
  return `${json.slice(0, insertAt)} // ${comment}${json.slice(insertAt)}`;
}

const CONDITION_OPTIONS = `options: "new" | "like-new" | "good" | "fair" | "for-parts"`;
const STATUS_OPTIONS = `options: "available" | "pending" | "reserved" | "sold" | "draft" — keep "draft" until ready to publish`;
const DIMENSIONS_UNIT_OPTIONS = `options: "cm" | "in"`;
const WEIGHT_UNIT_OPTIONS = `options: "kg" | "lb"`;

// Renders an item.json template as JSONC: valid JSON plus `// options: ...`
// hints next to every field with a fixed set of valid values, so a seller
// editing the file can see all the choices without consulting DESIGN.md §5.
// item.json is JSONC-tolerant (see lib/content/loader.ts), so this is fully
// backward compatible with strict-JSON item.json files.
export function renderItemTemplateJsonc(
  template: ReturnType<typeof buildItemTemplate>,
): string {
  let json = JSON.stringify(template, null, 2);
  json = withTrailingComment(json, `"condition": "${template.condition}",`, CONDITION_OPTIONS);
  json = withTrailingComment(json, `"status": "${template.status}",`, STATUS_OPTIONS);
  json = withTrailingComment(json, `"unit": "${template.dimensions.unit}"`, DIMENSIONS_UNIT_OPTIONS);
  json = withTrailingComment(json, `"unit": "${template.weight.unit}"`, WEIGHT_UNIT_OPTIONS);
  return json + "\n";
}
