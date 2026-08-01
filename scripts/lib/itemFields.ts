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
// it. The schemas below have no .catch, no .preprocess and no .default, so a
// safeParse failure IS the rejection. scripts/lib/studioApi.ts's bulk-status enum
// documents the same trap for one field; this generalises it to all of them.
//
// The mirror can drift from itemJsonSchema. itemFields.test.ts asserts the two
// key sets are identical, so adding a schema field without adding an editor here
// fails the suite.

import { z } from "zod";
// Relative, not "@/…": reachable from studio/vite.config.ts's config graph.
// See the import comment in scripts/lib/studioApi.ts.
import { itemJsonSchema } from "../../lib/content/schema";

// ── Leaf schemas ─────────────────────────────────────────────────────────────

const text = z.string();
const bool = z.boolean();
const stringList = z.array(z.string());

// Matches lib/content/schema.ts's nullableNumber ACCEPTANCE set (>= 0 or null)
// without its coercion: a negative number or a numeric string is a rejection
// here, not a silent null.
const nullableAmount = z.number().nonnegative().nullable();
const positiveNumber = z.number().positive();

// YYYY-MM-DD, and a real calendar date — "2026-02-31" matches the regex but is
// not a day. Date.parse of an ISO date is UTC and exact, so a round-trip through
// toISOString is the cheapest correct check.
const isoDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: "expected YYYY-MM-DD" })
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, {
    message: "not a real calendar date",
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

const dimensionsSchema = z
  .object({
    length: positiveNumber,
    width: positiveNumber,
    height: positiveNumber,
    unit: z.enum(["cm", "in"]),
  })
  .strict()
  .nullable();

const weightSchema = z
  .object({ value: positiveNumber, unit: z.enum(["kg", "lb"]) })
  .strict()
  .nullable();

const priceSchema = z
  .object({
    currency: text,
    tiers: z.array(tierSchema),
    negotiable: bool,
    show_tiers: bool,
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

const PRICE_LEAVES: Record<string, z.ZodType<unknown>> = {
  currency: text,
  tiers: z.array(tierSchema),
  negotiable: bool,
  show_tiers: bool,
  shipping_payer: z.enum(["seller", "buyer"]),
};

const TIER_LEAVES: Record<string, z.ZodType<unknown>> = {
  label: text,
  miles_min: z.number().nonnegative(),
  miles_max: z.number().nonnegative(),
  amount: z.number().nonnegative(),
};

const DIMENSION_LEAVES: Record<string, z.ZodType<unknown>> = {
  length: positiveNumber,
  width: positiveNumber,
  height: positiveNumber,
  unit: z.enum(["cm", "in"]),
};

const WEIGHT_LEAVES: Record<string, z.ZodType<unknown>> = {
  value: positiveNumber,
  unit: z.enum(["kg", "lb"]),
};

export const EDITABLE_TOP_LEVEL_FIELDS: readonly string[] = Object.keys(TOP_LEVEL);

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

// Referenced so the drift guard in itemFields.test.ts has a live import to
// compare against, and so this module fails to compile if the schema module
// stops exporting itemJsonSchema.
export const SCHEMA_FIELD_COUNT = Object.keys(itemJsonSchema.shape).length;
