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

/**
 * Stable identity for a group. Titles are prose and get reworded; ids are
 * what code refers to. `DefaultsPane` pins groups against this union, so
 * renaming or dropping a group fails the build there instead of silently
 * matching nothing.
 */
export type GroupId =
  | "listing"
  | "price"
  | "translations"
  | "specs"
  | "payment"
  | "books"
  | "extras"
  | "dates";

export type FieldGroup = {
  id: GroupId;
  title: string;
  /**
   * Expanded on load in the EditForm; every other group renders as a
   * collapsed <details>. This describes the EDIT FORM only — DefaultsPane
   * deliberately keeps its own pinned set, because the groups a seller
   * presets once and the groups they edit daily are not the same groups.
   */
  defaultOpen?: boolean;
  fields: FieldDescriptor[];
};

// Ordered by how often a seller touches the group on an ordinary edit, not by
// how the schema is shaped. Listing and Price are the whole of a routine edit,
// so they are the whole of the first screen; the rest is one click away.
export const FIELD_GROUPS: readonly FieldGroup[] = [
  {
    id: "listing",
    title: "Listing",
    defaultOpen: true,
    fields: [
      { path: ["name"], label: "Name", kind: "text" },
      {
        path: ["status"],
        label: "Status",
        kind: "select",
        options: ["available", "pending", "reserved", "sold", "draft"],
        hint: "Draft items never appear on the site.",
      },
      {
        path: ["condition"],
        label: "Condition",
        kind: "select",
        options: ["new", "like-new", "good", "fair", "for-parts"],
      },
      { path: ["quantity"], label: "Quantity", kind: "integer" },
      { path: ["description"], label: "Description", kind: "textarea" },
      { path: ["tags"], label: "Tags", kind: "stringList", hint: "One per line." },
    ],
  },
  {
    id: "price",
    title: "Price",
    defaultOpen: true,
    // EditForm renders the tier editor inside this group, right after
    // Currency: the amounts belong next to the currency they are in, not at
    // the far end of the form behind every other group.
    fields: [
      { path: ["price", "currency"], label: "Currency", kind: "text", hint: "e.g. USD" },
      { path: ["price", "negotiable"], label: "Negotiable", kind: "boolean" },
      { path: ["price", "show_tiers"], label: "Show all tiers to buyers", kind: "boolean" },
      { path: ["min_acceptable_offer"], label: "Minimum acceptable offer", kind: "number" },
      { path: ["no_lowball"], label: "No lowball offers", kind: "boolean" },
      { path: ["price_reduced"], label: "Price reduced", kind: "boolean" },
      { path: ["previous_lowest_price"], label: "Previous lowest price", kind: "number" },
      {
        path: ["price", "shipping_payer"],
        label: "Shipping paid by",
        kind: "select",
        options: ["seller", "buyer"],
        hint: "Leave blank to use the site default.",
      },
    ],
  },
  {
    id: "translations",
    title: "Translations",
    fields: [
      { path: ["name_zh"], label: "Name (中文)", kind: "text" },
      { path: ["description_zh"], label: "Description (中文)", kind: "textarea" },
    ],
  },
  {
    id: "specs",
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
    // Was "Platform", which named the payment links but not the pickup
    // windows or the contact note sitting beside them. The question this
    // group answers is how the money and the goods change hands.
    id: "payment",
    title: "Payment & pickup",
    fields: [
      {
        path: ["preferred_payment"],
        label: "Preferred payment",
        kind: "stringList",
        hint: "One per line.",
      },
      { path: ["pickup_windows"], label: "Pickup windows", kind: "stringList", hint: "One per line." },
      { path: ["contact_note"], label: "Contact note", kind: "textarea" },
      { path: ["stripe_payment_link"], label: "Stripe payment link", kind: "text" },
      { path: ["venmo_payment_request"], label: "Venmo request link", kind: "text" },
    ],
  },
  {
    // Was "Student" — which described who the seller is rather than what the
    // fields are. Nobody selling a bike fills these in.
    id: "books",
    title: "Books & courses",
    fields: [
      { path: ["isbn"], label: "ISBN", kind: "text" },
      { path: ["course"], label: "Course", kind: "text" },
      { path: ["edition"], label: "Edition", kind: "text" },
      { path: ["semester_listed"], label: "Semester listed", kind: "text" },
    ],
  },
  {
    id: "extras",
    title: "Extras",
    fields: [
      { path: ["meta_description"], label: "Meta description", kind: "textarea" },
      { path: ["category_override"], label: "Category override", kind: "text" },
      { path: ["youtube_link"], label: "YouTube link", kind: "text" },
    ],
  },
  {
    // `pnpm mark-sold` and the bulk status action maintain these two. A hand
    // edit is how sold_date ends up disagreeing with status, so they are
    // reachable but out of the way — not sitting in the first screen next to
    // Name inviting a change.
    id: "dates",
    title: "Dates",
    fields: [
      { path: ["listed_date"], label: "Listed date", kind: "date" },
      { path: ["sold_date"], label: "Sold date", kind: "date" },
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

// The merge base when the on-disk object is absent (or not an object at all):
// the same null-leaf placeholder shape `pnpm create-item` writes. Without it
// the merge started from {} and a single-leaf edit sent {"length": 5}, which
// the strict whole-object schema rejects — and since none of this repo's own
// item.json files carry a dimensions object, that was the DEFAULT experience
// of typing a first dimension. `unit` is deliberately omitted: it has no null
// state, so the seller must pick one, and buildEdits says so by name instead
// of letting the server answer with a bare "unit: Required".
export const WHOLE_OBJECT_SEEDS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  dimensions: { length: null, width: null, height: null },
  weight: { value: null },
};

export function pathKey(path: (string | number)[]): string {
  return path.join(".");
}

/**
 * The group that owns a path. A save problem naming a field inside a
 * collapsed group points at something the seller cannot see, so EditForm uses
 * this to open the group before showing the message.
 *
 * Falls back to matching on the head segment: a whole-object edit is sent at
 * `["dimensions"]`, which is not itself a descriptor, but every leaf under
 * that head lives in one group.
 */
export function groupIdForPath(path: (string | number)[]): GroupId | null {
  const key = pathKey(path);
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (pathKey(field.path) === key) return group.id;
    }
  }
  const head = String(path[0]);
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (String(field.path[0]) === head) return group.id;
    }
  }
  return null;
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
