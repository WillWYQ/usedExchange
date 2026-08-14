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
  /**
   * Key into the Studio i18n dictionary, resolved with t() at render time.
   * Kept as a plain string so this module stays React-free; the renderers
   * (FieldInput, EditForm, DefaultsPane) look it up.
   */
  labelKey: string;
  kind: FieldKind;
  options?: readonly string[];
  /** Key for the hint shown under the input; keep it to one short line. */
  hintKey?: string;
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
  /** Key into the Studio i18n dictionary, resolved with t() at render time. */
  titleKey: string;
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
    titleKey: "fieldGroup.listing",
    defaultOpen: true,
    fields: [
      { path: ["name"], labelKey: "field.name", kind: "text" },
      {
        path: ["status"],
        labelKey: "field.status",
        kind: "select",
        options: ["available", "pending", "reserved", "sold", "draft"],
        hintKey: "field.status.hint",
      },
      {
        path: ["condition"],
        labelKey: "field.condition",
        kind: "select",
        options: ["new", "like-new", "good", "fair", "for-parts"],
      },
      { path: ["quantity"], labelKey: "field.quantity", kind: "integer" },
      { path: ["description"], labelKey: "field.description", kind: "textarea" },
      { path: ["tags"], labelKey: "field.tags", kind: "stringList", hintKey: "field.tags.hint" },
    ],
  },
  {
    id: "price",
    titleKey: "fieldGroup.price",
    defaultOpen: true,
    // EditForm renders the tier editor inside this group, right after
    // Currency: the amounts belong next to the currency they are in, not at
    // the far end of the form behind every other group.
    fields: [
      { path: ["price", "currency"], labelKey: "field.currency", kind: "text", hintKey: "field.currency.hint" },
      { path: ["price", "negotiable"], labelKey: "field.negotiable", kind: "boolean" },
      { path: ["price", "show_tiers"], labelKey: "field.showTiers", kind: "boolean" },
      { path: ["min_acceptable_offer"], labelKey: "field.minAcceptableOffer", kind: "number" },
      { path: ["no_lowball"], labelKey: "field.noLowball", kind: "boolean" },
      { path: ["price_reduced"], labelKey: "field.priceReduced", kind: "boolean" },
      { path: ["previous_lowest_price"], labelKey: "field.previousLowestPrice", kind: "number" },
      {
        path: ["price", "shipping_payer"],
        labelKey: "field.shippingPayer",
        kind: "select",
        options: ["seller", "buyer"],
        hintKey: "field.shippingPayer.hint",
      },
    ],
  },
  {
    id: "translations",
    titleKey: "fieldGroup.translations",
    fields: [
      { path: ["name_zh"], labelKey: "field.nameZh", kind: "text" },
      { path: ["description_zh"], labelKey: "field.descriptionZh", kind: "textarea" },
    ],
  },
  {
    id: "specs",
    titleKey: "fieldGroup.specs",
    fields: [
      { path: ["brand"], labelKey: "field.brand", kind: "text" },
      { path: ["model"], labelKey: "field.model", kind: "text" },
      { path: ["color"], labelKey: "field.color", kind: "text" },
      { path: ["age_years"], labelKey: "field.age", kind: "number" },
      { path: ["dimensions", "length"], labelKey: "field.length", kind: "number" },
      { path: ["dimensions", "width"], labelKey: "field.width", kind: "number" },
      { path: ["dimensions", "height"], labelKey: "field.height", kind: "number" },
      { path: ["dimensions", "unit"], labelKey: "field.sizeUnit", kind: "select", options: ["cm", "in"] },
      { path: ["weight", "value"], labelKey: "field.weight", kind: "number" },
      { path: ["weight", "unit"], labelKey: "field.weightUnit", kind: "select", options: ["kg", "lb"] },
      { path: ["original_source"], labelKey: "field.boughtFrom", kind: "text" },
      { path: ["original_link"], labelKey: "field.originalUrl", kind: "text" },
      { path: ["original_price"], labelKey: "field.originalPrice", kind: "number" },
    ],
  },
  {
    // Was "Platform", which named the payment links but not the pickup
    // windows or the contact note sitting beside them. The question this
    // group answers is how the money and the goods change hands.
    id: "payment",
    titleKey: "fieldGroup.payment",
    fields: [
      {
        path: ["preferred_payment"],
        labelKey: "field.preferredPayment",
        kind: "stringList",
        hintKey: "field.preferredPayment.hint",
      },
      { path: ["pickup_windows"], labelKey: "field.pickupWindows", kind: "stringList", hintKey: "field.pickupWindows.hint" },
      { path: ["contact_note"], labelKey: "field.contactNote", kind: "textarea" },
      { path: ["stripe_payment_link"], labelKey: "field.stripeLink", kind: "text" },
      { path: ["venmo_payment_request"], labelKey: "field.venmoLink", kind: "text" },
    ],
  },
  {
    // Was "Student" — which described who the seller is rather than what the
    // fields are. Nobody selling a bike fills these in.
    id: "books",
    titleKey: "fieldGroup.books",
    fields: [
      { path: ["isbn"], labelKey: "field.isbn", kind: "text" },
      { path: ["course"], labelKey: "field.course", kind: "text" },
      { path: ["edition"], labelKey: "field.edition", kind: "text" },
      { path: ["semester_listed"], labelKey: "field.semester", kind: "text" },
    ],
  },
  {
    id: "extras",
    titleKey: "fieldGroup.extras",
    fields: [
      { path: ["meta_description"], labelKey: "field.metaDescription", kind: "textarea" },
      { path: ["category_override"], labelKey: "field.categoryOverride", kind: "text" },
      { path: ["youtube_link"], labelKey: "field.youtubeLink", kind: "text" },
    ],
  },
  {
    // `pnpm mark-sold` and the bulk status action maintain these two. A hand
    // edit is how sold_date ends up disagreeing with status, so they are
    // reachable but out of the way — not sitting in the first screen next to
    // Name inviting a change.
    id: "dates",
    titleKey: "fieldGroup.dates",
    fields: [
      { path: ["listed_date"], labelKey: "field.listedDate", kind: "date" },
      { path: ["sold_date"], labelKey: "field.soldDate", kind: "date" },
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
