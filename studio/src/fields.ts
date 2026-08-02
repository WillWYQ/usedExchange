// Drives EditForm. One line per field beats 37 hand-written inputs that would
// drift from lib/content/schema.ts the first time a field is added.
//
// `path` must be a path scripts/lib/itemFields.ts accepts — that module is the
// authority, and a typo here surfaces as a 400 naming the exact path.

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "integer"
  | "boolean"
  | "select"
  | "date"
  | "stringList";

export type FieldDescriptor = {
  path: (string | number)[];
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  /** Shown under the input; keep it to one short line. */
  hint?: string;
};

export type FieldGroup = { title: string; fields: FieldDescriptor[] };

export const FIELD_GROUPS: readonly FieldGroup[] = [
  {
    title: "Basic",
    fields: [
      { path: ["name"], label: "Name", kind: "text" },
      { path: ["description"], label: "Description", kind: "textarea" },
      {
        path: ["condition"],
        label: "Condition",
        kind: "select",
        options: ["new", "like-new", "good", "fair", "for-parts"],
      },
      {
        path: ["status"],
        label: "Status",
        kind: "select",
        options: ["available", "pending", "reserved", "sold", "draft"],
        hint: "Draft items never appear on the site.",
      },
      { path: ["quantity"], label: "Quantity", kind: "integer" },
      { path: ["tags"], label: "Tags", kind: "stringList", hint: "One per line." },
      { path: ["listed_date"], label: "Listed date", kind: "date" },
      { path: ["sold_date"], label: "Sold date", kind: "date" },
    ],
  },
  {
    title: "Price",
    fields: [
      { path: ["price", "currency"], label: "Currency", kind: "text", hint: "e.g. USD" },
      { path: ["price", "negotiable"], label: "Negotiable", kind: "boolean" },
      { path: ["price", "show_tiers"], label: "Show all tiers to buyers", kind: "boolean" },
      {
        path: ["price", "shipping_payer"],
        label: "Shipping paid by",
        kind: "select",
        options: ["seller", "buyer"],
        hint: "Leave blank to use the site default.",
      },
      { path: ["no_lowball"], label: "No lowball offers", kind: "boolean" },
      { path: ["price_reduced"], label: "Price reduced", kind: "boolean" },
      { path: ["previous_lowest_price"], label: "Previous lowest price", kind: "number" },
      { path: ["min_acceptable_offer"], label: "Minimum acceptable offer", kind: "number" },
    ],
  },
  {
    title: "Specs",
    fields: [
      { path: ["brand"], label: "Brand", kind: "text" },
      { path: ["model"], label: "Model", kind: "text" },
      { path: ["color"], label: "Colour", kind: "text" },
      { path: ["age_years"], label: "Age (years)", kind: "number" },
      { path: ["dimensions", "length"], label: "Length", kind: "number" },
      { path: ["dimensions", "width"], label: "Width", kind: "number" },
      { path: ["dimensions", "height"], label: "Height", kind: "number" },
      { path: ["dimensions", "unit"], label: "Size unit", kind: "select", options: ["cm", "in"] },
      { path: ["weight", "value"], label: "Weight", kind: "number" },
      { path: ["weight", "unit"], label: "Weight unit", kind: "select", options: ["kg", "lb"] },
      { path: ["original_source"], label: "Bought from", kind: "text" },
      { path: ["original_link"], label: "Original listing URL", kind: "text" },
      { path: ["original_price"], label: "Original price", kind: "number" },
    ],
  },
  {
    title: "Platform",
    fields: [
      { path: ["preferred_payment"], label: "Preferred payment", kind: "stringList" },
      { path: ["contact_note"], label: "Contact note", kind: "textarea" },
      { path: ["stripe_payment_link"], label: "Stripe payment link", kind: "text" },
      { path: ["venmo_payment_request"], label: "Venmo request link", kind: "text" },
      { path: ["pickup_windows"], label: "Pickup windows", kind: "stringList" },
      { path: ["youtube_link"], label: "YouTube link", kind: "text" },
      { path: ["category_override"], label: "Category override", kind: "text" },
      { path: ["meta_description"], label: "Meta description", kind: "textarea" },
    ],
  },
  {
    title: "Student",
    fields: [
      { path: ["isbn"], label: "ISBN", kind: "text" },
      { path: ["course"], label: "Course", kind: "text" },
      { path: ["edition"], label: "Edition", kind: "text" },
      { path: ["semester_listed"], label: "Semester listed", kind: "text" },
    ],
  },
  {
    title: "Translations",
    fields: [
      { path: ["name_zh"], label: "Name (中文)", kind: "text" },
      { path: ["description_zh"], label: "Description (中文)", kind: "textarea" },
    ],
  },
];

// The top-level object a leaf write inside must be sent as ONE whole-object
// edit instead. A leaf write for an item with no `dimensions`/`weight` object
// would create a partial object on disk ({"length": 5}), which the site
// schema .catch()es to null — the seller's edit silently doing nothing on the
// live site. Whole-object writes pass the strict whole-object schema in
// scripts/lib/itemFields.ts, so the site sees exactly what the form shows.
export const WHOLE_OBJECT_GROUPS: Readonly<Record<string, string>> = {
  dimensions: "dimensions",
  weight: "weight",
};

export function pathKey(path: (string | number)[]): string {
  return path.join(".");
}

/** Reads `path` out of the fields object, tolerating missing intermediates. */
export function readAtPath(fields: Record<string, unknown>, path: (string | number)[]): unknown {
  let cursor: unknown = fields;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string | number, unknown>)[segment];
  }
  return cursor;
}
