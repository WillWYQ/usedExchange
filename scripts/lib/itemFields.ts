// Studio's strict view of item.json. Two jobs, one allowlist:
//
//   1. Which paths may a browser write?  (resolveFieldSchema returns non-null)
//   2. Is this value acceptable for that path?  (the returned schema)
//
// Deliberately NOT reusing lib/content/schema.ts's field schemas. That schema's
// job is to never fail a site build, so nearly every field carries .catch(),
// .preprocess(), or .default(). itemJsonSchema.shape.status.safeParse("liquidated")
// SUCCEEDS and yields "available"; nullableNumber.safeParse("banana") SUCCEEDS and
// yields null. Using it to validate input would silently accept junk and rewrite
// it. The schemas below carry no such wrapper, so a safeParse failure IS the
// rejection. scripts/lib/studioApi.ts's bulk-status enum documents the same trap
// for one field; this generalises it to all of them. itemFields.test.ts asserts
// this file's own source contains none of those three method calls, outside
// comments, so the premise cannot silently regress.
//
// "Strict" means strict about VALIDITY, not about presence: where
// lib/content/schema.ts marks a nested field optional (e.g. price.show_tiers,
// price.shipping_payer, a tier's miles_min/miles_max), the schemas below match
// that optionality exactly — this project's own on-disk item.json files omit
// those keys routinely, and a stricter-than-canonical schema would make every
// shipped item unsaveable. Optional means "may be absent"; it never means "may
// be junk when present".
//
// The mirror can drift from itemJsonSchema, at the top level and at every
// nested level (price, a price tier, dimensions, weight). itemFields.test.ts
// asserts all of those key sets are identical, so adding a schema field
// without adding an editor here fails the suite.

import { z } from "zod";
// No import of lib/content/schema.ts here: nothing in this file needs
// itemJsonSchema at runtime any more (the drift guards that compare against
// it live in itemFields.test.ts, which imports it directly), and this module
// having zero dependency on the loader schema is itself evidence the two are
// independent implementations, not a lazy fork of one.

// ── Leaf schemas ─────────────────────────────────────────────────────────────

const text = z.string();
const bool = z.boolean();
const stringList = z.array(z.string());

// Matches lib/content/schema.ts's nullableNumber ACCEPTANCE set (>= 0 or null)
// without its coercion: a negative number or a numeric string is a rejection
// here, not a silent null.
const nullableAmount = z.number().nonnegative().nullable();

// A positive number, but null is also valid as "not set": `pnpm create-item`
// (scripts/lib/itemTemplate.ts) writes dimensions/weight as
// { length: null, width: null, height: null, unit } / { value: null, unit }
// as their intentional placeholder shape, and a seller must be able to clear
// a dimension back to that state. Zero is still rejected — it isn't "unset",
// it's an invalid measurement.
const nullablePositiveNumber = z.number().positive().nullable();

// YYYY-MM-DD, and a real calendar date — "2026-02-31" matches the regex but is
// not a day. Date.parse of an ISO date is UTC and exact, so a round-trip through
// toISOString is the cheapest correct check.
//
// This is one .superRefine rather than two .refine()s: Zod 3 marks a failed
// .refine() as merely "dirty", not "aborted", so a SECOND .refine() still runs
// on a value the first one already rejected. new Date("<garbage>").toISOString()
// throws a RangeError (not a Zod issue) on an Invalid Date, so a malformed
// string — "banana", "2026-13-45", a year outside Date's representable range —
// used to crash safeParse itself instead of failing it, which surfaced as an
// uncaught 500 rather than a 400 naming the field. The explicit `return` below
// after the format issue is what stops that second check from ever running on
// a string the first one already flagged.
const isoDate = z
  .string()
  .superRefine((v, ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "expected YYYY-MM-DD" });
      return;
    }
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a real calendar date" });
    }
  })
  .nullable();

// Empty string means "unset" throughout item.json. Anything else must be an
// absolute http/https URL — the same protocol allowlist lib/content/schema.ts
// enforces (FIX Sec 1), except that here a javascript: URL is REJECTED rather
// than quietly coerced to "".
const httpUrl = z.string().refine(
  (v) => {
    if (v === "") return true;
    try {
      return new URL(v).protocol === "http:" || new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "expected an empty string or an http/https URL" },
);

const tierSchema = z
  .object({
    label: text,
    miles_min: z.number().nonnegative().optional(),
    miles_max: z.number().nonnegative().optional(),
    amount: z.number().nonnegative(),
  })
  .strict();

const dimensionsObjectSchema = z
  .object({
    length: nullablePositiveNumber,
    width: nullablePositiveNumber,
    height: nullablePositiveNumber,
    unit: z.enum(["cm", "in"]),
  })
  .strict();
const dimensionsSchema = dimensionsObjectSchema.nullable();

const weightObjectSchema = z
  .object({ value: nullablePositiveNumber, unit: z.enum(["kg", "lb"]) })
  .strict();
const weightSchema = weightObjectSchema.nullable();

// currency/tiers/negotiable/show_tiers/shipping_payer are all optional here,
// matching lib/content/schema.ts's priceSchema exactly (every one of them is
// .optional().default(...) there). No shipped item.json in this repo carries a
// show_tiers key — `grep -L show_tiers content/items/*/*/item.json` matches
// every file — so requiring it would make every existing item unsaveable.
// .strict() is kept: unknown keys must still be rejected. Optional is not lax;
// a currency/tiers/etc value that IS present is still fully validated below.
const priceSchema = z
  .object({
    currency: text.optional(),
    tiers: z.array(tierSchema).optional(),
    negotiable: bool.optional(),
    show_tiers: bool.optional(),
    shipping_payer: z.enum(["seller", "buyer"]).optional(),
  })
  .strict();

// ── The grammar ──────────────────────────────────────────────────────────────

const TOP_LEVEL: Record<string, z.ZodType<unknown>> = {
  name: z.string().min(1),
  description: text,
  condition: z.enum(["new", "like-new", "good", "fair", "for-parts"]),
  status: z.enum(["available", "pending", "reserved", "sold", "draft"]),
  price: priceSchema,
  brand: text,
  model: text,
  age_years: nullableAmount,
  dimensions: dimensionsSchema,
  weight: weightSchema,
  color: text,
  quantity: z.number().int().min(1),
  original_source: text,
  original_link: httpUrl,
  original_price: nullableAmount,
  listed_date: isoDate,
  sold_date: isoDate,
  preferred_payment: stringList,
  contact_note: text,
  stripe_payment_link: httpUrl,
  venmo_payment_request: httpUrl,
  pickup_windows: stringList,
  youtube_link: httpUrl,
  tags: stringList,
  category_override: text,
  meta_description: text,
  no_lowball: bool,
  price_reduced: bool,
  previous_lowest_price: nullableAmount,
  min_acceptable_offer: nullableAmount,
  isbn: text,
  course: text,
  edition: text,
  semester_listed: text,
  name_zh: text,
  description_zh: text,
};

// Leaf maps are DERIVED from each object schema's own `.shape` rather than
// hand-copied. Hand-copying is exactly how these drifted before: PRICE_LEAVES
// once required currency/tiers/negotiable/show_tiers that priceSchema itself
// made optional (rejecting every real item.json in this repo), and
// PRICE_LEAVES.shipping_payer / TIER_LEAVES.miles_min / TIER_LEAVES.miles_max
// once dropped the `.optional()` their object siblings carried — making
// "unset" unreachable for a leaf-level write, even though jsonc-parser's
// modify() only clears a key when given `undefined`. Deriving the maps makes
// that class of divergence structurally impossible: there is exactly one place
// each nested field's schema is written.
const PRICE_LEAVES: Record<string, z.ZodType<unknown>> = priceSchema.shape;
const TIER_LEAVES: Record<string, z.ZodType<unknown>> = tierSchema.shape;
const DIMENSION_LEAVES: Record<string, z.ZodType<unknown>> = dimensionsObjectSchema.shape;
const WEIGHT_LEAVES: Record<string, z.ZodType<unknown>> = weightObjectSchema.shape;

export const EDITABLE_TOP_LEVEL_FIELDS: readonly string[] = Object.keys(TOP_LEVEL);

// Nested-field key sets, exported only so itemFields.test.ts's drift guard can
// compare them against itemJsonSchema's own nested shapes (mirrors
// EDITABLE_TOP_LEVEL_FIELDS one level down). Not meant as a second allowlist —
// resolveFieldSchema below is still the only place path-editability is decided.
export const EDITABLE_NESTED_FIELDS = {
  price: Object.keys(PRICE_LEAVES),
  priceTier: Object.keys(TIER_LEAVES),
  dimensions: Object.keys(DIMENSION_LEAVES),
  weight: Object.keys(WEIGHT_LEAVES),
} as const;

// Plain objects inherit "__proto__", "constructor" and "toString" from
// Object.prototype, so `PRICE_LEAVES["__proto__"]` is truthy even though
// "__proto__" was never declared as a leaf. Every lookup below goes through
// this helper, which asks about OWN keys only.
function own(map: Record<string, z.ZodType<unknown>>, key: string): z.ZodType<unknown> | null {
  return Object.prototype.hasOwnProperty.call(map, key) ? (map[key] ?? null) : null;
}

function isArrayIndex(segment: string | number | undefined): segment is number {
  return typeof segment === "number" && Number.isInteger(segment) && segment >= 0;
}

/**
 * The schema a value written at `path` must satisfy, or null when `path` is not
 * something studio is allowed to write at all. Non-null is the whole of
 * "is this path editable" — there is no second allowlist anywhere.
 */
export function resolveFieldSchema(path: (string | number)[]): z.ZodType<unknown> | null {
  const head = path[0];
  if (typeof head !== "string") return null;

  const top = own(TOP_LEVEL, head);
  if (top === null) return null;
  if (path.length === 1) return top;

  if (head === "price") {
    const second = path[1];
    if (typeof second !== "string") return null;
    const leaf = own(PRICE_LEAVES, second);
    if (leaf === null) return null;
    if (path.length === 2) return leaf;

    if (second !== "tiers") return null;
    if (!isArrayIndex(path[2])) return null;
    if (path.length === 3) return tierSchema;

    const fourth = path[3];
    if (path.length === 4 && typeof fourth === "string") return own(TIER_LEAVES, fourth);
    return null;
  }

  if (head === "dimensions" || head === "weight") {
    const second = path[1];
    if (path.length !== 2 || typeof second !== "string") return null;
    return own(head === "dimensions" ? DIMENSION_LEAVES : WEIGHT_LEAVES, second);
  }

  // Every other top-level field is a scalar, a string array, or an opaque
  // value — no path may descend into one.
  return null;
}

export function isEditableField(path: (string | number)[]): boolean {
  return resolveFieldSchema(path) !== null;
}

/**
 * Throws unless `path` is writable AND `value` is valid for it. Called before
 * anything reaches disk.
 */
export function assertEditableValue(path: (string | number)[], value: unknown): void {
  const label = path.join(".");
  const schema = resolveFieldSchema(path);
  if (schema === null) {
    throw new Error(`Refusing to write field outside the item.json schema: "${label}"`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid value for "${label}": ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
}

// ── Reading (studio's read side of Iron Rule 4) ─────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keeps only `map`'s own keys from `value`, or null when `value` isn't an object at all. */
function pickOwnKeys(
  map: Record<string, z.ZodType<unknown>>,
  value: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(map)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      out[key] = value[key];
    }
  }
  return out;
}

/**
 * Deep-picks one top-level field's on-disk value down to only the keys this
 * grammar declares for it. A private key stashed inside `price`, `dimensions`,
 * `weight`, or a `price.tiers[]` entry — reserved_for or anything else absent
 * from itemJsonSchema — is dropped here, not merely at the top level. Every
 * other top-level field is a scalar or a string array in this grammar (see
 * resolveFieldSchema's "no path may descend into one"), so there is no nested
 * object for a private key to hide inside.
 *
 * Values that survive the pick are returned exactly as they appear on disk,
 * not schema-coerced — same reasoning as pickEditableFields below: the form
 * must show the seller what the file actually says.
 */
function pickEditableValue(field: string, rawValue: unknown): unknown {
  if (field === "price") {
    const picked = pickOwnKeys(PRICE_LEAVES, rawValue);
    if (picked === null) return rawValue;
    if (Array.isArray(picked["tiers"])) {
      picked["tiers"] = (picked["tiers"] as unknown[]).map(
        (tier) => pickOwnKeys(TIER_LEAVES, tier) ?? tier,
      );
    }
    return picked;
  }
  if (field === "dimensions") {
    return rawValue === null ? null : (pickOwnKeys(DIMENSION_LEAVES, rawValue) ?? rawValue);
  }
  if (field === "weight") {
    return rawValue === null ? null : (pickOwnKeys(WEIGHT_LEAVES, rawValue) ?? rawValue);
  }
  return rawValue;
}

/**
 * The editable fields present in `raw`, deep-picked to this grammar so no
 * private key at ANY depth (Iron Rule 4: "never returned by an API") can leak
 * into what studio serves to the browser. A pick list, not an omit list: a
 * private field added to item.json later — at the top level or nested inside
 * price/dimensions/weight/a tier — is excluded automatically, with no change
 * here.
 */
export function pickEditableFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_TOP_LEVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      out[field] = pickEditableValue(field, raw[field]);
    }
  }
  return out;
}
