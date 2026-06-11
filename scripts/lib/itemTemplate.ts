// Single source of truth for the item.json scaffold, used by:
//   - scripts/create-item.ts     (pnpm create-item <category>/<name>)
//   - scripts/create-template.ts (pnpm create-template [category])
//
// Field set mirrors docs/DESIGN.md §5 (38 fields). `reserved_for` is
// intentionally excluded — see .claude/CLAUDE.md Iron Rule 4 (private
// buyer info, never rendered, never written by tooling).

export function buildItemTemplate(name: string, listedDate: string) {
  return {
    name,
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
    description: "",
    condition: "good",
    brand: "",
    model: "",
    age_years: null,
    // Placeholder shape — if left with `null` leaves, lib/content/schema.ts
    // coerces the whole `dimensions`/`weight` object to null on build.
    dimensions: { length: null, width: null, height: null, unit: "cm" },
    weight: { value: null, unit: "kg" },
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
