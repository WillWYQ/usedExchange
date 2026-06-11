import { z } from "zod";

// ── Protocol allowlist ────────────────────────────────────────────────────────
// FIX Sec 1: restrict URL fields to http/https only.
// new URL("javascript:alert(1)") is valid per the WHATWG spec, so a structural
// check alone is insufficient.  Only http: and https: are meaningful for item
// links, payment pages, and YouTube URLs.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// ── Reusable preprocessors ────────────────────────────────────────────────────

/**
 * Numbers: absent/null/NaN/negative → null; zero and positive valid.
 */
const nullableNumber = z.preprocess((val): number | null => {
  if (val === undefined || val === null) return null;
  const n = typeof val === "number" ? val : Number(val);
  if (isNaN(n) || n < 0) return null;
  return n;
}, z.number().nullable()) as z.ZodType<number | null>;

/**
 * Date strings: YYYY-MM-DD or ISO timestamp → YYYY-MM-DD portion; else null.
 */
const nullableDateString = z.preprocess((val): string | null => {
  if (!val || typeof val !== "string") return null;
  const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match?.[1]) return null;
  const d = new Date(match[1] + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : match[1];
}, z.string().nullable()) as z.ZodType<string | null>;

/**
 * URL strings: invalid URL or disallowed protocol → empty string.
 * FIX Sec 1: javascript:, vbscript:, data: and other non-http/s schemes are
 * rejected and coerced to "".
 */
const urlString = z.preprocess((val): string => {
  if (!val || typeof val !== "string") return "";
  try {
    const u = new URL(val);
    return ALLOWED_PROTOCOLS.has(u.protocol) ? val : "";
  } catch {
    return "";
  }
}, z.string()) as z.ZodType<string>;

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const priceTierSchema = z.object({
  label: z.string().optional().default(""),
  miles_min: z.number().nonnegative().optional(),
  miles_max: z.number().nonnegative().optional(),
  // Coerce invalid amounts to 0 rather than rejecting the whole tier
  amount: z.preprocess((val): number => {
    const n = typeof val === "number" ? val : Number(val);
    return isNaN(n) || n < 0 ? 0 : n;
  }, z.number().nonnegative()),
});

// FIX Bug 2: added `.positive()` on each dimension field so negative values
// are rejected at the field level instead of being passed through.
// Added outer `.catch(null)` so that a structurally invalid or partially-filled
// dimensions object coerces the whole sub-object to null rather than failing
// the entire item parse and triggering the lossy schema-recovery path.
const dimensionsSchema = z
  .object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(["cm", "in"]).catch("cm").default("cm"),
  })
  .nullable()
  .optional()
  .catch(null)
  .default(null);

// FIX Bug 2 (same): positive value only; `.catch(null)` for partial objects.
const weightSchema = z
  .object({
    value: z.number().positive(),
    unit: z.enum(["kg", "lb"]).catch("kg").default("kg"),
  })
  .nullable()
  .optional()
  .catch(null)
  .default(null);

const priceSchema = z
  .object({
    currency: z.string().optional().default(""),
    // If tiers is not an array (or array has bad entries), coerce/default safely
    tiers: z
      .preprocess(
        (val) => (Array.isArray(val) ? val : []),
        z.array(priceTierSchema),
      )
      .catch([])
      .optional()
      .default([]),
    negotiable: z.boolean().catch(false).optional().default(false),
    // Buyer-facing "View all pricing tiers" toggle is opt-in: sellers may not
    // want buyers to see e.g. how much cheaper local pickup is than shipping.
    show_tiers: z.boolean().catch(false).optional().default(false),
    // Overrides siteConfig.shipping.defaultPayer for this item. Absent =
    // use the site-wide default. See DESIGN.md §21.
    shipping_payer: z.enum(["seller", "buyer"]).optional().catch(undefined),
  })
  .optional()
  .default({ currency: "", tiers: [], negotiable: false, show_tiers: false });

// ── Main item schema ──────────────────────────────────────────────────────────

export const itemJsonSchema = z.object({
  // Required — loader skips item when empty/missing
  name: z.string().min(1),

  description: z.string().optional().default(""),

  condition: z
    .enum(["new", "like-new", "good", "fair", "for-parts"])
    .catch("good")
    .optional()
    .default("good"),

  status: z
    .enum(["available", "pending", "reserved", "sold", "draft"])
    .catch("available")
    .optional()
    .default("available"),

  price: priceSchema,

  brand: z.string().optional().default(""),
  model: z.string().optional().default(""),
  age_years: nullableNumber,

  dimensions: dimensionsSchema,
  weight: weightSchema,

  color: z.string().optional().default(""),

  quantity: z.preprocess((val): number => {
    if (val === undefined || val === null) return 1;
    const n = typeof val === "number" ? val : Number(val);
    if (isNaN(n) || n < 1) return 1;
    return Math.floor(n);
  }, z.number().int().min(1)),

  original_source: z.string().optional().default(""),
  original_link: urlString,
  original_price: nullableNumber,

  listed_date: nullableDateString,
  sold_date: nullableDateString,

  preferred_payment: z.array(z.string()).optional().default([]),
  contact_note: z.string().optional().default(""),

  stripe_payment_link: urlString,
  venmo_payment_request: urlString,

  pickup_windows: z.array(z.string()).optional().default([]),
  youtube_link: urlString,

  tags: z.array(z.string()).optional().default([]),
  category_override: z.string().optional().default(""),
  meta_description: z.string().optional().default(""),

  no_lowball: z.boolean().catch(false).optional().default(false),
  price_reduced: z.boolean().catch(false).optional().default(false),
  previous_lowest_price: nullableNumber,
  min_acceptable_offer: nullableNumber,

  isbn: z.string().optional().default(""),
  course: z.string().optional().default(""),
  edition: z.string().optional().default(""),
  semester_listed: z.string().optional().default(""),

  name_zh: z.string().optional().default(""),
  description_zh: z.string().optional().default(""),

  // reserved_for intentionally excluded — stripped by Zod's default "strip" behaviour
});

export type ParsedItemJson = z.infer<typeof itemJsonSchema>;

// ── Category schema ───────────────────────────────────────────────────────────

export const categoryJsonSchema = z.object({
  display_name: z.string().optional().default(""),
  description: z.string().optional().default(""),
  icon: z.string().optional().default(""),
  sort_order: nullableNumber.pipe(
    z.number().int().nullable().catch(null),
  ) as z.ZodType<number | null>,
});

export type ParsedCategoryJson = z.infer<typeof categoryJsonSchema>;
