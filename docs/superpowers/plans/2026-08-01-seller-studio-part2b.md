# Seller Studio Part 2B — Edit Form, Publish, Distribution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Seller Studio — a schema-driven item edit form, item creation, a publish pane that commits and pushes, plus the distribution and documentation work that makes `pnpm studio` reach downstream sites.

**Architecture:** Part 2A left three gaps. (1) `applyFieldEdits` gates only `path[0]`, so it cannot safely accept the nested paths a form produces (`price.tiers[0].amount`), and it validates no values at all. Part 2B adds `scripts/lib/itemFields.ts` — a **strict**, non-coercing mirror of the editable schema, used both as a path grammar and as a per-value validator. (2) There is no git surface; `scripts/lib/studioGit.ts` adds one, refusing to publish while an image sync holds the mutex. (3) `studio/` is absent from `TEMPLATE_PATHS`, so downstream sites cannot get it.

**Tech Stack:** TypeScript, Node `fs/promises` + `child_process.execFile`, `jsonc-parser`, Zod 3, React 19 + Vite 8, Vitest.

## Global Constraints

These apply to **every** task. They come from `.claude/CLAUDE.md` (Iron Rules) and `docs/superpowers/specs/2026-07-29-seller-studio-design.md`.

- **Iron Rule 4 — `reserved_for` is never rendered, never returned by an API, never written by tooling.** It is absent from `itemJsonSchema`, and every allowlist in this plan is a *pick* list, not an *omit* list, so a private field added later is excluded by default.
- **Iron Rule 1** — studio writes only under `content/`, plus `lib/generated/image-manifest.json`, which `upload-images` already owns.
- **Iron Rule 2 — bilingual docs.** Every English doc edit is mirrored to its `_zh` counterpart *in the same commit*.
- **Iron Rule 7** — mark Phase 18 complete in `docs/IMPLEMENTATION_PLAN.md` **and** `_zh`.
- **Iron Rule 8** — no new `content/config.ts` fields are introduced by this plan (spec §3). Do not add any.
- **Relative imports only** in anything reachable from `studio/vite.config.ts`. That config's bundler inlines every relative import and externalizes only bare specifiers, so a `@/…` import there is silently treated as external and never resolved. See the comment block at the top of `scripts/lib/studioApi.ts`.
- **`item.json` is JSONC.** Never save by parse → stringify. All writes go through `applyFieldEdits`.
- **The dev server binds `127.0.0.1`**, never `0.0.0.0`.
- **The CSRF guard's "application/json only" rule is load-bearing** (`studio/csrfGuard.ts`). Every new non-GET route must be reachable only with `content-type: application/json`; do not add a route that accepts a CORS-simple content type.
- **React components get no unit tests** (spec §10). The testing budget goes to server-side logic that can damage seller data. Frontend tasks are verified by running `pnpm studio` and clicking through.
- Every task ends with `pnpm test`, `pnpm type-check`, and `pnpm lint` green before its commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/itemFields.ts` **(create)** | Strict path grammar + per-value schemas for every editable `item.json` field. The single source of "what may studio write, and what counts as a valid value". |
| `scripts/lib/itemFields.test.ts` **(create)** | Grammar acceptance/rejection, value validation, and the drift guard against `itemJsonSchema`. |
| `scripts/lib/itemEdit.ts` **(modify)** | `isEditableField` delegates to the grammar; `applyFieldEdits` gains value validation; new `readItemForEdit`. |
| `scripts/lib/studioGit.ts` **(create)** | `git status` parsing and the commit+push sequence. No HTTP, no studio types. |
| `scripts/lib/studioGit.test.ts` **(create)** | Driven against real temp repositories, including a bare origin. |
| `scripts/lib/studioApi.ts` **(modify)** | New routes: `GET`/`PATCH` single item, `POST /api/items`, `GET /api/changes`, `POST /api/publish`. |
| `scripts/lib/studioSync.ts` **(modify)** | Reset the loader's manifest cache when a sync settles. |
| `studio/src/fields.ts` **(create)** | Field descriptors driving the form. Browser-side, no Node imports. |
| `studio/src/panes/EditForm.tsx` **(create)** | The Details tab. |
| `studio/src/panes/Drawer.tsx` **(create)** | Tab shell around `ImagePane` and `EditForm`. |
| `studio/src/panes/NewItemDialog.tsx` **(create)** | Create-item form. |
| `studio/src/panes/PublishPane.tsx` **(create)** | Change list + commit and push. |
| `studio/src/api.ts` **(modify)** | Client functions for every new route. |
| `studio/src/App.tsx` **(modify)** | Wires the drawer tabs, the create dialog, and the publish pane. |
| `studio/src/tokens.css` **(modify)** | Styles for the form, dialog, and publish pane. |
| `scripts/update-site.ts` **(modify)** | `TEMPLATE_PATHS` gains `"studio"`. |
| `scripts/studio.ts` **(modify)** | The "studio not installed" message stops promising a future release. |
| `docs/*.md` + `docs/*_zh.md` **(modify)** | Distribution and functionality docs, bilingual. |
| `.claude/CLAUDE.md` **(modify)** | `pnpm studio` in the seller-task table; doc version table. |

---

## Task 1: Strict field grammar

Part 2A's `isEditableField` checks `path[0]` only. `["price", "tiers", 0, "amount"]` passes because `price` is a schema key — but so does `["price", "__proto__"]` and `["dimensions", "anything"]`. And no value is validated at all: `applyFieldEdits` will happily write `"quantity": "banana"`.

This task builds the grammar and the validator together, because they are the same allowlist read two ways.

**Why a second, strict schema rather than reusing `itemJsonSchema`:** the loader's schema is deliberately lenient — it must never fail a site build, so it carries `.catch(...)`, `.preprocess(...)`, and `.default(...)` throughout. `itemJsonSchema.shape.status.safeParse("liquidated")` **succeeds** and returns `"available"`. Reusing it as an input validator would silently accept and rewrite bad input. `scripts/lib/studioApi.ts:154` already documents this trap for the bulk-status enum; this task generalises the same reasoning to all 38 fields. The strict schemas here have no `.catch`, no `.preprocess`, and no `.default`, so `safeParse` failing *is* the check.

The obvious risk of a mirror is drift. Step 9 closes it with a test that fails the moment `itemJsonSchema` gains a field the mirror lacks.

**Files:**
- Create: `scripts/lib/itemFields.ts`
- Create: `scripts/lib/itemFields.test.ts`
- Modify: `scripts/lib/itemEdit.ts`
- Modify: `scripts/lib/itemEdit.test.ts`

**Interfaces:**
- Consumes: `itemJsonSchema` from `../../lib/content/schema` (already imported by `itemEdit.ts`).
- Produces:
  - `resolveFieldSchema(path: (string | number)[]): z.ZodType<unknown> | null`
  - `isEditableField(path: (string | number)[]): boolean` (moves from `itemEdit.ts` to `itemFields.ts`; `itemEdit.ts` re-exports it so existing importers keep working)
  - `assertEditableValue(path: (string | number)[], value: unknown): void` — throws `Error` on a bad path or a bad value
  - `EDITABLE_TOP_LEVEL_FIELDS: readonly string[]`
  - `readItemForEdit(text: string): Record<string, unknown>` (in `itemEdit.ts`)

---

- [ ] **Step 1: Write the failing grammar test**

Create `scripts/lib/itemFields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { itemJsonSchema } from "@/lib/content/schema";
import {
  assertEditableValue,
  EDITABLE_TOP_LEVEL_FIELDS,
  isEditableField,
  resolveFieldSchema,
} from "./itemFields";

describe("isEditableField — path grammar", () => {
  it.each([
    [["name"]],
    [["status"]],
    [["price"]],
    [["price", "currency"]],
    [["price", "negotiable"]],
    [["price", "shipping_payer"]],
    [["price", "tiers"]],
    [["price", "tiers", 0]],
    [["price", "tiers", 2, "amount"]],
    [["price", "tiers", 0, "miles_min"]],
    [["dimensions"]],
    [["dimensions", "length"]],
    [["dimensions", "unit"]],
    [["weight", "value"]],
    [["name_zh"]],
  ])("accepts %j", (path) => {
    expect(isEditableField(path as (string | number)[])).toBe(true);
  });

  it.each([
    [[]],
    [["reserved_for"]],
    [["reserved_for", "name"]],
    [["__proto__"]],
    [["price", "__proto__"]],
    [["price", "constructor"]],
    [["price", "tiers", "0"]], // string index, not a number
    [["price", "tiers", -1]],
    [["price", "tiers", 1.5]],
    [["price", "tiers", 0, "reserved_for"]],
    [["price", "tiers", 0, "amount", "extra"]],
    [["price", "currency", "extra"]],
    [["dimensions", "depth"]],
    [["weight", "kilograms"]],
    [["name", "first"]],
    [["notAField"]],
    [[0]],
  ])("rejects %j", (path) => {
    expect(isEditableField(path as (string | number)[])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/itemFields.test.ts`
Expected: FAIL — `Failed to resolve import "./itemFields"`.

- [ ] **Step 3: Write the grammar**

Create `scripts/lib/itemFields.ts`:

```ts
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
```

- [ ] **Step 4: Run the grammar test to verify it passes**

Run: `pnpm vitest run scripts/lib/itemFields.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing value-validation test**

Append to `scripts/lib/itemFields.test.ts`:

```ts
describe("assertEditableValue — values", () => {
  it.each([
    [["name"], "Desk lamp"],
    [["status"], "sold"],
    [["quantity"], 3],
    [["age_years"], null],
    [["age_years"], 0],
    [["sold_date"], "2026-08-01"],
    [["sold_date"], null],
    [["original_link"], ""],
    [["original_link"], "https://example.com/a"],
    [["tags"], ["a", "b"]],
    [["dimensions"], null],
    [["dimensions"], { length: 1, width: 2, height: 3, unit: "cm" }],
    [["dimensions", "unit"], "in"],
    [["weight"], { value: 1.5, unit: "kg" }],
    [["price", "tiers"], [{ label: "Pickup", miles_max: 5, amount: 0 }]],
    [["price", "tiers", 0, "amount"], 24],
  ])("accepts %j = %j", (path, value) => {
    expect(() => assertEditableValue(path as (string | number)[], value)).not.toThrow();
  });

  it.each([
    // .catch() in the loader's schema would swallow every one of these.
    [["status"], "liquidated"],
    [["condition"], "mint"],
    [["quantity"], 0],
    [["quantity"], 2.5],
    [["quantity"], "3"],
    [["name"], ""],
    [["age_years"], -1],
    [["age_years"], "banana"],
    [["sold_date"], "2026-02-31"],
    [["sold_date"], "01/08/2026"],
    [["tags"], "a,b"],
    [["no_lowball"], "true"],
    [["dimensions"], { length: 1, width: 2, height: 3 }],
    [["dimensions"], { length: 0, width: 2, height: 3, unit: "cm" }],
    [["dimensions"], { length: 1, width: 2, height: 3, unit: "cm", depth: 4 }],
    [["weight", "value"], -2],
    [["price", "tiers"], [{ label: "Pickup", amount: -1 }]],
    [["price", "tiers", 0, "amount"], "24"],
  ])("rejects %j = %j", (path, value) => {
    expect(() => assertEditableValue(path as (string | number)[], value)).toThrow();
  });

  it("rejects a javascript: URL rather than coercing it to an empty string", () => {
    expect(() => assertEditableValue(["original_link"], "javascript:alert(1)")).toThrow(
      /http\/https/,
    );
    // The loader's schema, by contrast, accepts it and yields "" — which is why
    // studio cannot reuse that schema for input validation.
    expect(itemJsonSchema.shape.original_link.safeParse("javascript:alert(1)").success).toBe(
      true,
    );
  });

  it("names the offending path in the error", () => {
    expect(() => assertEditableValue(["price", "tiers", 1, "amount"], "x")).toThrow(
      /price\.tiers\.1\.amount/,
    );
  });
});
```

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm vitest run scripts/lib/itemFields.test.ts`
Expected: PASS. The implementation from Step 3 already covers these; this step proves the strict schemas behave as claimed rather than assuming it. If any case fails, fix the schema in `itemFields.ts` — not the test.

- [ ] **Step 7: Write the failing drift-guard test**

Append to `scripts/lib/itemFields.test.ts`:

```ts
describe("drift guard", () => {
  it("has exactly one editor per itemJsonSchema field", () => {
    // If this fails, lib/content/schema.ts gained or lost a field and
    // itemFields.ts's TOP_LEVEL was not updated to match. Add the editor (with
    // a STRICT schema — no .catch, no .preprocess, no .default) rather than
    // relaxing this assertion.
    expect([...EDITABLE_TOP_LEVEL_FIELDS].sort()).toEqual(
      Object.keys(itemJsonSchema.shape).sort(),
    );
  });

  it("excludes reserved_for, which is absent from the schema by design", () => {
    expect(EDITABLE_TOP_LEVEL_FIELDS).not.toContain("reserved_for");
    expect(resolveFieldSchema(["reserved_for"])).toBeNull();
  });
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm vitest run scripts/lib/itemFields.test.ts`
Expected: PASS (36 fields on both sides — verified against the current `lib/content/schema.ts`).

- [ ] **Step 9: Write the failing test for `applyFieldEdits` value validation and `readItemForEdit`**

Append to `scripts/lib/itemEdit.test.ts`:

```ts
describe("applyFieldEdits — value validation", () => {
  const doc = `{
  // options: "available" | "pending" | "reserved" | "sold" | "draft"
  "status": "available",
  "name": "Desk lamp",
  "quantity": 1,
  "reserved_for": "alice@example.com",
  "price": { "currency": "USD", "tiers": [{ "label": "Pickup", "amount": 20 }] }
}
`;

  it("writes a valid nested path", () => {
    const next = applyFieldEdits(doc, [{ path: ["price", "tiers", 0, "amount"], value: 24 }]);
    expect(next).toContain('"amount": 24');
    expect(next).toContain("// options:");
    expect(next).toContain('"reserved_for": "alice@example.com"');
  });

  it("rejects an invalid value before writing anything", () => {
    expect(() => applyFieldEdits(doc, [{ path: ["quantity"], value: 0 }])).toThrow(
      /Invalid value for "quantity"/,
    );
  });

  it("rejects the whole batch when any later edit is invalid", () => {
    expect(() =>
      applyFieldEdits(doc, [
        { path: ["name"], value: "New name" },
        { path: ["status"], value: "liquidated" },
      ]),
    ).toThrow(/status/);
  });

  it("still refuses reserved_for", () => {
    expect(() =>
      applyFieldEdits(doc, [{ path: ["reserved_for"], value: "bob@example.com" }]),
    ).toThrow(/outside the item.json schema/);
  });

  it("refuses to descend into an object through an undeclared key", () => {
    expect(() => applyFieldEdits(doc, [{ path: ["price", "__proto__"], value: 1 }])).toThrow(
      /outside the item.json schema/,
    );
  });
});

describe("readItemForEdit", () => {
  const doc = `{
  "name": "Desk lamp",
  "status": "available",
  "reserved_for": "alice@example.com",
  "internal_note": "haggled down from 40",
  "quantity": 2
}
`;

  it("returns schema fields present in the file", () => {
    const fields = readItemForEdit(doc);
    expect(fields["name"]).toBe("Desk lamp");
    expect(fields["quantity"]).toBe(2);
  });

  it("never returns reserved_for", () => {
    expect(Object.keys(readItemForEdit(doc))).not.toContain("reserved_for");
  });

  it("never returns any field absent from the schema", () => {
    // A pick list, not an omit list: a private field added to item.json later
    // is excluded automatically, with no change here.
    expect(Object.keys(readItemForEdit(doc))).not.toContain("internal_note");
  });

  it("returns raw on-disk values, not schema-coerced ones", () => {
    // The form must show the seller what is actually in the file so they can
    // fix it. Coercing here would display "available" for a typo'd status and
    // the seller would never know the file was wrong.
    const bad = `{ "name": "x", "status": "liquidated" }`;
    expect(readItemForEdit(bad)["status"]).toBe("liquidated");
  });

  it("omits fields the file does not contain", () => {
    expect(Object.keys(readItemForEdit(`{ "name": "x" }`))).toEqual(["name"]);
  });
});
```

Add `readItemForEdit` to the existing import at the top of `scripts/lib/itemEdit.test.ts`.

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/itemEdit.test.ts`
Expected: FAIL — `readItemForEdit is not exported`, and the value-validation cases fail because `applyFieldEdits` validates nothing.

- [ ] **Step 11: Rewrite `itemEdit.ts` against the grammar**

Replace the allowlist block in `scripts/lib/itemEdit.ts` (delete the local `EDITABLE_TOP_LEVEL_FIELDS` set and the local `isEditableField`) and add the reader:

```ts
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
// Relative, not "@/…": this module is reachable from studio/vite.config.ts's
// config graph (via studioApi.ts), where the "@/" alias does not resolve. See
// the comment at the top of studioApi.ts's imports for the full explanation.
import {
  assertEditableValue,
  EDITABLE_TOP_LEVEL_FIELDS,
  isEditableField,
} from "./itemFields";

export type FieldEdit = { path: (string | number)[]; value: unknown };

// Re-exported so existing importers of isEditableField keep working; the
// allowlist itself now lives in itemFields.ts, where it also carries each
// field's strict value schema.
export { isEditableField };

const FORMATTING_OPTIONS = { tabSize: 2, insertSpaces: true, eol: "\n" };

/**
 * Applies every edit to `text` and returns the new text. Validates every path
 * AND every value up front, so a rejected batch leaves the file untouched
 * rather than half-written.
 */
export function applyFieldEdits(text: string, edits: FieldEdit[]): string {
  for (const edit of edits) {
    assertEditableValue(edit.path, edit.value);
  }

  let next = text;
  for (const edit of edits) {
    next = applyEdits(
      next,
      modify(next, edit.path, edit.value, { formattingOptions: FORMATTING_OPTIONS }),
    );
  }
  return next;
}

/** Reads one top-level field out of JSONC text without mutating it. */
export function readItemField(text: string, field: string): unknown {
  const raw = parseJsonc(text) as Record<string, unknown> | undefined;
  return raw?.[field];
}

/**
 * The editable fields present in `text`, for the studio form.
 *
 * A PICK list, not an omit list (Iron Rule 4). reserved_for is excluded because
 * it is not in itemJsonSchema, and so is any other private field added to
 * item.json later — without anyone remembering to update a deny list here.
 *
 * Values are returned exactly as they appear on disk, NOT run through Zod: the
 * form's job is to show the seller what the file actually says so they can
 * correct it. A coerced view would render a typo'd status as "available" and
 * the seller would never see the problem.
 */
export function readItemForEdit(text: string): Record<string, unknown> {
  const raw = parseJsonc(text) as Record<string, unknown> | undefined;
  if (raw === undefined || raw === null || typeof raw !== "object") return {};

  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_TOP_LEVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      out[field] = raw[field];
    }
  }
  return out;
}
```

- [ ] **Step 12: Run the full suite**

Run: `pnpm test`
Expected: PASS. Pay attention to `scripts/lib/markSold.test.ts` and `scripts/lib/studioApi.test.ts` — both write through `applyFieldEdits`, and both now pass through value validation for the first time. `{ status: "sold" }` and `{ sold_date: null | "YYYY-MM-DD" }` all satisfy the strict schemas, so they should pass unchanged. If one fails, the strict schema is wrong; fix `itemFields.ts`.

- [ ] **Step 13: Type-check, lint, and commit**

```bash
pnpm type-check && pnpm lint
git add scripts/lib/itemFields.ts scripts/lib/itemFields.test.ts scripts/lib/itemEdit.ts scripts/lib/itemEdit.test.ts
git commit -m "feat: strict field grammar and value validation for item.json edits"
```

---

## Task 2: Read and patch a single item

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `readItemForEdit`, `applyFieldEdits` (Task 1); `resolveItemDir`, `StudioError`, `parseJsonBody` (existing, private).
- Produces two routes on `handleStudioRequest`:
  - `GET /api/items/:cat/:name` → `200 { fields: Record<string, unknown> }`
  - `PATCH /api/items/:cat/:name` → `200 { fields: Record<string, unknown> }` (the re-read file, so the client never guesses)

The existing `IMAGE_ROUTE_RE` matches `/api/items/:cat/:name/images…` only, so a second route regex is needed for the bare item path. It must be tested **after** `IMAGE_ROUTE_RE` is tried, or `/images` would fall into it — but since the new pattern anchors on `$` right after the two segments, order is not load-bearing. Test it anyway (Step 1 covers it).

---

- [ ] **Step 1: Write the failing route test**

Append to `scripts/lib/studioApi.test.ts`. Reuse the temp-project helper already in that file if one exists; otherwise add this one next to the existing fixtures:

```ts
async function makeTempProject(itemJson: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-patch-"));
  const dir = path.join(root, "content", "items", "electronics", "desk-lamp");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), itemJson, "utf-8");
  return root;
}

const ITEM_JSON = `{
  "name": "Desk lamp",
  "status": "draft", // options: "available" | "pending" | "reserved" | "sold" | "draft"
  "quantity": 1,
  "reserved_for": "alice@example.com",
  "price": { "currency": "USD", "tiers": [{ "label": "Pickup", "amount": 20 }] }
}
`;

describe("GET /api/items/:cat/:name", () => {
  it("returns the editable fields", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/electronics/desk-lamp",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(200);
    const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
    expect(fields["name"]).toBe("Desk lamp");
    expect(fields["status"]).toBe("draft");
  });

  it("never returns reserved_for", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/electronics/desk-lamp",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    const body = JSON.stringify(asJson(res).body);
    expect(body).not.toContain("reserved_for");
    expect(body).not.toContain("alice@example.com");
  });

  it("404s for an item that does not exist", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/electronics/nope",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(404);
  });

  it("400s on a traversal payload", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/..%2F..%2Fetc/passwd",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/items/:cat/:name", () => {
  function patch(root: string, edits: unknown, url = "/api/items/electronics/desk-lamp") {
    return handleStudioRequest({
      method: "PATCH",
      url,
      body: Buffer.from(JSON.stringify({ edits })),
      projectRoot: root,
    });
  }

  it("writes a changed field and preserves comments and reserved_for", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await patch(root, [{ path: ["name"], value: "Reading lamp" }]);
    expect(res.status).toBe(200);

    const onDisk = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(onDisk).toContain('"name": "Reading lamp"');
    expect(onDisk).toContain("// options:");
    expect(onDisk).toContain('"reserved_for": "alice@example.com"');
  });

  it("returns the re-read fields, not the request echo", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await patch(root, [{ path: ["price", "tiers", 0, "amount"], value: 24 }]);
    const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
    expect((fields["price"] as { tiers: { amount: number }[] }).tiers[0]?.amount).toBe(24);
  });

  it("rejects an edit to reserved_for and leaves the file untouched", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const before = await fs.readFile(jsonPath, "utf-8");

    const res = await patch(root, [{ path: ["reserved_for"], value: "bob@example.com" }]);
    expect(res.status).toBe(400);
    expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
  });

  it("rejects an invalid value and leaves the file untouched", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const before = await fs.readFile(jsonPath, "utf-8");

    const res = await patch(root, [
      { path: ["name"], value: "Fine" },
      { path: ["status"], value: "liquidated" },
    ]);
    expect(res.status).toBe(400);
    // Not partially applied: the valid first edit must not land either.
    expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
  });

  it("rejects a malformed edits array", async () => {
    const root = await makeTempProject(ITEM_JSON);
    expect((await patch(root, "nope")).status).toBe(400);
    expect((await patch(root, [])).status).toBe(400);
    expect((await patch(root, [{ path: [], value: 1 }])).status).toBe(400);
  });

  it("405s on PUT", async () => {
    const root = await makeTempProject(ITEM_JSON);
    const res = await handleStudioRequest({
      method: "PUT",
      url: "/api/items/electronics/desk-lamp",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: FAIL — every new case gets `404 no route for /api/items/electronics/desk-lamp`.

- [ ] **Step 3: Implement the routes**

In `scripts/lib/studioApi.ts`, extend the `itemEdit` import to `applyFieldEdits, readItemField, readItemForEdit`, then add above `handleStudioRequest`:

```ts
// /api/items/<category>/<item> — the bare item, no trailing segment. Anchored
// on $ so it can never swallow the /images routes above it.
const ITEM_ROUTE_RE = /^\/api\/items\/([^/]+)\/([^/]+)$/;

async function readItemJson(req: StudioRequest, category: string, item: string): Promise<{
  jsonPath: string;
  text: string;
}> {
  const dir = resolveItemDir(req.projectRoot, category, item);
  const jsonPath = path.join(dir, "item.json");
  try {
    return { jsonPath, text: await fsPromises.readFile(jsonPath, "utf-8") };
  } catch {
    throw new StudioError(404, `no such item: ${category}/${item}`);
  }
}

async function handleItemGet(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { text } = await readItemJson(req, category, item);
  return { status: 200, body: { fields: readItemForEdit(text) } };
}

// `value: z.unknown()` rather than a concrete type: itemFields.ts owns value
// validation, and it validates against the schema for THAT path. Duplicating a
// weaker check here would only produce a second, disagreeing answer.
const patchBodySchema = z.object({
  edits: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])).min(1),
        value: z.unknown(),
      }),
    )
    .min(1),
});

async function handleItemPatch(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { edits } = parseJsonBody(req.body, patchBodySchema);
  const { jsonPath, text } = await readItemJson(req, category, item);

  // applyFieldEdits validates every path and value before touching the string,
  // so a rejected batch never reaches writeFile and the file on disk is
  // unchanged — including the valid edits that shared the batch.
  let next: string;
  try {
    next = applyFieldEdits(text, edits);
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }

  await fsPromises.writeFile(jsonPath, next, "utf-8");

  // Re-read rather than returning `next`: the response is the file, and if
  // anything about the write differed from what we computed the seller sees the
  // truth. Same single-source-of-truth rule the item table follows.
  return {
    status: 200,
    body: { fields: readItemForEdit(await fsPromises.readFile(jsonPath, "utf-8")) },
  };
}
```

Then inside `handleStudioRequest`, immediately **after** the `imageMatch` block and before the `/api/sync-images` block:

```ts
    const itemMatch = ITEM_ROUTE_RE.exec(pathname);
    if (itemMatch !== null) {
      const [, categoryRaw, itemRaw] = itemMatch;
      if (categoryRaw === undefined || itemRaw === undefined) {
        return { status: 400, body: { error: "malformed item route" } };
      }

      // Decoded per segment after the route match, never before — the same
      // ordering the image routes use, and for the same reason: the allowlist
      // must inspect exactly the string the filesystem will receive.
      let category: string;
      let item: string;
      try {
        category = decodeURIComponent(categoryRaw);
        item = decodeURIComponent(itemRaw);
      } catch {
        return { status: 400, body: { error: "malformed URL encoding" } };
      }

      if (req.method === "GET") return await handleItemGet(req, category, item);
      if (req.method === "PATCH") return await handleItemPatch(req, category, item);
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the CSRF guard covers PATCH**

Read `studio/csrfGuard.ts`. It returns `null` for `GET`/`HEAD` and otherwise requires `application/json` plus a matching origin — so `PATCH` is covered by the existing fail-closed-by-method branch with no change. Add one test to `studio/csrfGuard.test.ts` proving it:

```ts
it("rejects a cross-origin PATCH with a CORS-simple content type", () => {
  const rejection = checkStudioCsrf("PATCH", {
    origin: "https://evil.example",
    host: "127.0.0.1:5174",
    "content-type": "text/plain",
  });
  expect(rejection).not.toBeNull();
  expect(rejection?.status).toBe(415);
});
```

Run: `pnpm vitest run studio/csrfGuard.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite, type-check, lint, commit**

```bash
pnpm test && pnpm type-check && pnpm lint
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts studio/csrfGuard.test.ts
git commit -m "feat: read and patch a single item over the studio API"
```

---

## Task 3: Create an item

`pnpm create-item` requires the category folder to already exist. Studio must not inherit that: a seller whose site has no categories yet would find the create button a dead end, and creating a folder is the one thing they cannot do from this UI. So `POST /api/items` creates the category directory when it is missing, and writes no `_category.json` — `lib/content/loader.ts`'s `buildCategoriesFromItems` already derives a display name from the slug when that file is absent.

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `buildItemTemplate`, `renderItemTemplateJsonc` from `./itemTemplate`; `siteConfig` from `../../content/config` (relative — see Global Constraints).
- Produces: `POST /api/items` → `201 { id: string }`.

---

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/studioApi.test.ts`:

```ts
describe("POST /api/items", () => {
  function create(root: string, body: unknown) {
    return handleStudioRequest({
      method: "POST",
      url: "/api/items",
      body: Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-create-"));
    await fs.mkdir(path.join(root, "content", "items"), { recursive: true });
    return root;
  }

  it("creates item.json from the template", async () => {
    const root = await emptyProject();
    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(201);
    expect((asJson(res).body as { id: string }).id).toBe("electronics/desk-lamp");

    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"status": "draft"');
    expect(text).toContain("// options:");
    // Iron Rule 4 — the scaffold never writes it.
    expect(text).not.toContain("reserved_for");
  });

  it("derives a display name from the slug", async () => {
    const root = await emptyProject();
    await create(root, { category: "electronics", name: "usb-c-hub" });
    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "usb-c-hub", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"name": "Usb C Hub"');
  });

  it("creates the category folder when it does not exist", async () => {
    const root = await emptyProject();
    expect((await create(root, { category: "garden", name: "hose" })).status).toBe(201);
    await expect(
      fs.stat(path.join(root, "content", "items", "garden")),
    ).resolves.toBeDefined();
  });

  it("409s rather than overwriting an existing item", async () => {
    const root = await emptyProject();
    await create(root, { category: "electronics", name: "desk-lamp" });
    const jsonPath = path.join(
      root, "content", "items", "electronics", "desk-lamp", "item.json",
    );
    await fs.writeFile(jsonPath, `{ "name": "Edited by hand" }`, "utf-8");

    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(409);
    expect(await fs.readFile(jsonPath, "utf-8")).toContain("Edited by hand");
  });

  it("400s on a non-slug category or name", async () => {
    const root = await emptyProject();
    expect((await create(root, { category: "Electronics", name: "x" })).status).toBe(400);
    expect((await create(root, { category: "e", name: "desk lamp" })).status).toBe(400);
    expect((await create(root, { category: "..", name: "x" })).status).toBe(400);
  });

  it("405s on DELETE /api/items", async () => {
    const root = await emptyProject();
    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "POST /api/items"`
Expected: FAIL — the `/api/items` branch currently answers `405 GET only`.

- [ ] **Step 3: Implement the route**

Add to `scripts/lib/studioApi.ts`'s imports:

```ts
import { siteConfig } from "../../content/config";
import { buildItemTemplate, renderItemTemplateJsonc } from "./itemTemplate";
```

Add above `handleStudioRequest`:

```ts
const createItemBodySchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
});

async function handleItemCreate(req: StudioRequest): Promise<StudioResponse> {
  const { category, name } = parseJsonBody(req.body, createItemBodySchema);

  // resolveItemDir runs the slug allowlist AND the containment assertion, so
  // this is the same two-layer check every other write path uses.
  const dir = resolveItemDir(req.projectRoot, category, name);
  const jsonPath = path.join(dir, "item.json");

  try {
    await fsPromises.access(jsonPath);
    throw new StudioError(409, `${category}/${name} already exists`);
  } catch (err: unknown) {
    // access() rejects when the file is absent — that is the good path here.
    // A StudioError thrown in the try block above must not be swallowed by it.
    if (err instanceof StudioError) throw err;
  }

  // recursive: true also creates the category folder. `pnpm create-item`
  // requires an existing category, but studio must not: a seller with no
  // categories yet cannot create one anywhere else in this UI, which would make
  // the create button a dead end on a fresh site. No _category.json is written
  // — lib/content/loader.ts derives a display name from the slug when it is
  // absent, so the category is complete without one.
  await fsPromises.mkdir(dir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const displayName = name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const template = buildItemTemplate(
    displayName,
    today,
    siteConfig.measurementUnit,
    siteConfig.defaultPriceTiers,
  );

  // "wx" rather than a plain write: two create requests for the same slug can
  // interleave between the access() check above and here, and the loser must
  // not silently flatten the winner's file.
  try {
    await fsPromises.writeFile(jsonPath, renderItemTemplateJsonc(template), { flag: "wx" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new StudioError(409, `${category}/${name} already exists`);
    }
    throw err;
  }

  return { status: 201, body: { id: `${category}/${name}` } };
}
```

Replace the `/api/items` branch in `handleStudioRequest`:

```ts
    if (pathname === "/api/items") {
      if (req.method === "GET") {
        return { status: 200, body: { items: await listStudioItems(req.projectRoot) } };
      }
      if (req.method === "POST") {
        return await handleItemCreate(req);
      }
      return { status: 405, body: { error: "GET or POST only" } };
    }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, type-check, lint, commit**

```bash
pnpm test && pnpm type-check && pnpm lint
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: create an item from the studio API"
```

---

## Task 4: The git layer

Spec §8: git operations are atomic, so failure is total and per-item semantics do not apply. Publish must re-read the change list immediately before committing, so the diff the seller approved is the diff that ships.

Two rules beyond the spec, both from Part 2A's carried debt:

- **Publish is refused while an image sync is running.** A sync writes `lib/generated/image-manifest.json`; committing mid-write ships a manifest that omits photos that were in fact uploaded. `isSyncRunning()` already exists; a 409 is cheaper and clearer than a shared lock.
- **`git add` names paths explicitly** — `content` and `lib/generated/image-manifest.json`, matching the existing `pnpm push` script. Never `-A`: the seller's `.env.local` holds R2 credentials, and one bad `.gitignore` away, `-A` publishes them.

**Files:**
- Create: `scripts/lib/studioGit.ts`
- Create: `scripts/lib/studioGit.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type ChangedFile = { code: string; path: string }`
  - `readChanges(projectRoot: string): Promise<{ branch: string; files: ChangedFile[] }>`
  - `publishChanges(projectRoot: string, message: string): Promise<{ commit: string; files: ChangedFile[] }>`
  - `class GitError extends Error { readonly status: number }`

---

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/studioGit.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { GitError, publishChanges, readChanges } from "./studioGit";

const run = promisify(execFile);
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function git(cwd: string, args: string[]): Promise<void> {
  await run("git", args, { cwd });
}

/** A repo with one committed item and a bare `origin` it can push to. */
async function makeRepo(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "studio-git-"));
  created.push(base);

  const origin = path.join(base, "origin.git");
  await run("git", ["init", "--bare", "--initial-branch=main", origin]);

  const repo = path.join(base, "site");
  await fs.mkdir(repo);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["config", "user.email", "seller@example.com"]);
  await git(repo, ["config", "user.name", "Seller"]);
  await git(repo, ["config", "commit.gpgsign", "false"]);

  const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
  await fs.mkdir(itemDir, { recursive: true });
  await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Desk lamp" }\n`);
  await fs.mkdir(path.join(repo, "lib", "generated"), { recursive: true });
  await fs.writeFile(path.join(repo, "lib", "generated", "image-manifest.json"), "{}\n");
  await fs.writeFile(path.join(repo, ".env.local"), "CF_R2_SECRET=hunter2\n");

  await git(repo, ["add", "content", "lib"]);
  await git(repo, ["commit", "-m", "initial"]);
  await git(repo, ["remote", "add", "origin", origin]);
  await git(repo, ["push", "-u", "origin", "main"]);

  return repo;
}

describe("readChanges", () => {
  it("reports nothing on a clean tree", async () => {
    const repo = await makeRepo();
    const { branch, files } = await readChanges(repo);
    expect(branch).toBe("main");
    expect(files).toEqual([]);
  });

  it("reports a modified item and a new photo", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Reading lamp" }\n`);
    await fs.writeFile(path.join(itemDir, "01-lamp.jpg"), "not really a jpeg");

    const { files } = await readChanges(repo);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual([
      "content/items/electronics/desk-lamp/01-lamp.jpg",
      "content/items/electronics/desk-lamp/item.json",
    ]);
    expect(files.find((f) => f.path.endsWith("item.json"))?.code).toBe("M");
    expect(files.find((f) => f.path.endsWith("01-lamp.jpg"))?.code).toBe("?");
  });

  it("ignores changes outside content/ and the manifest", async () => {
    const repo = await makeRepo();
    // .env.local holds the seller's R2 credentials. It must never appear in the
    // publish list, whether or not .gitignore happens to cover it.
    await fs.writeFile(path.join(repo, ".env.local"), "CF_R2_SECRET=changed\n");
    await fs.writeFile(path.join(repo, "README.md"), "# edited\n");
    expect((await readChanges(repo)).files).toEqual([]);
  });

  it("handles a filename with a space and a non-ASCII filename", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "my photo.jpg"), "x");
    await fs.writeFile(path.join(itemDir, "照片.jpg"), "x");

    const paths = (await readChanges(repo)).files.map((f) => f.path).sort();
    expect(paths).toContain("content/items/electronics/desk-lamp/my photo.jpg");
    expect(paths).toContain("content/items/electronics/desk-lamp/照片.jpg");
  });

  it("throws a GitError outside a git repository", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-nogit-"));
    created.push(dir);
    await expect(readChanges(dir)).rejects.toBeInstanceOf(GitError);
  });
});

describe("publishChanges", () => {
  it("commits, pushes, and reports what shipped", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Reading lamp" }\n`);

    const result = await publishChanges(repo, "chore: rename the lamp");
    expect(result.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(result.files.map((f) => f.path)).toEqual([
      "content/items/electronics/desk-lamp/item.json",
    ]);

    // The tree is clean afterwards, and origin has the commit.
    expect((await readChanges(repo)).files).toEqual([]);
    const { stdout } = await run("git", ["log", "-1", "--pretty=%s", "origin/main"], {
      cwd: repo,
    });
    expect(stdout.trim()).toBe("chore: rename the lamp");
  });

  it("never stages files outside content/ and the manifest", async () => {
    const repo = await makeRepo();
    await fs.writeFile(path.join(repo, "README.md"), "# edited\n");
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "Reading lamp" }\n`);

    await publishChanges(repo, "chore: update listings");

    const { stdout } = await run("git", ["show", "--name-only", "--pretty=", "HEAD"], {
      cwd: repo,
    });
    expect(stdout).not.toContain("README.md");
    expect(stdout).not.toContain(".env.local");
  });

  it("refuses when there is nothing to publish", async () => {
    const repo = await makeRepo();
    await expect(publishChanges(repo, "chore: nothing")).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an empty or whitespace-only message", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "x" }\n`);
    await expect(publishChanges(repo, "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("treats a message starting with a dash as text, not a flag", async () => {
    const repo = await makeRepo();
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "x" }\n`);

    await publishChanges(repo, "--amend is not a flag here");
    const { stdout } = await run("git", ["log", "--oneline"], { cwd: repo });
    // Two commits, not one amended commit.
    expect(stdout.trim().split("\n")).toHaveLength(2);
  });

  it("surfaces a push failure with git's own message and leaves the commit in place", async () => {
    const repo = await makeRepo();
    await git(repo, ["remote", "set-url", "origin", path.join(repo, "does-not-exist.git")]);
    const itemDir = path.join(repo, "content", "items", "electronics", "desk-lamp");
    await fs.writeFile(path.join(itemDir, "item.json"), `{ "name": "x" }\n`);

    await expect(publishChanges(repo, "chore: update listings")).rejects.toBeInstanceOf(
      GitError,
    );
    // The commit already happened; the seller must be told the push is what
    // failed, not that nothing was saved.
    const { stdout } = await run("git", ["log", "--oneline"], { cwd: repo });
    expect(stdout.trim().split("\n")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioGit.test.ts`
Expected: FAIL — `Failed to resolve import "./studioGit"`.

- [ ] **Step 3: Implement the git layer**

Create `scripts/lib/studioGit.ts`:

```ts
// The publish half of Seller Studio: what has changed, and commit + push it.
//
// Two rules that are not stylistic:
//
//   1. `git add` names its paths. Never `-A`. The seller's .env.local holds R2
//      credentials, and one bad .gitignore away, -A publishes them to a public
//      repo. The path list matches package.json's `pnpm push` script exactly,
//      so the CLI and studio ship the same thing.
//   2. Every git invocation goes through execFile with an argument array — no
//      shell, ever. The commit message is seller input.
//
// Note git is invoked with `-c core.quotepath=false` and `-z` where output is
// parsed: without them a filename with a space or a CJK character comes back
// quoted and octal-escaped, and the seller's photo silently drops out of the
// change list.

import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

/** Paths studio is allowed to publish. Mirrors package.json's `push` script. */
const PUBLISHABLE_PATHS = ["content", "lib/generated/image-manifest.json"] as const;

const MAX_MESSAGE_LENGTH = 500;

export type ChangedFile = {
  /** Porcelain status letter: M, A, D, R, or "?" for untracked. */
  code: string;
  /** Repo-relative, forward-slashed, unquoted. */
  path: string;
};

export class GitError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

type ExecFailure = { stderr?: string; stdout?: string; message?: string };

function gitMessage(err: unknown): string {
  const e = err as ExecFailure;
  const text = (e.stderr ?? "").trim() || (e.stdout ?? "").trim() || (e.message ?? "");
  return text || String(err);
}

async function git(cwd: string, args: string[], stdin?: string): Promise<string> {
  const child = run("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (stdin !== undefined) {
    child.child.stdin?.end(stdin);
  }
  const { stdout } = await child;
  return stdout;
}

async function assertRepo(projectRoot: string): Promise<void> {
  try {
    await git(projectRoot, ["rev-parse", "--git-dir"]);
  } catch (err: unknown) {
    throw new GitError(
      400,
      `${projectRoot} is not a git repository, so there is nothing to publish. ` +
        `Run \`git init\` and add a remote first — see docs/setup_instruction.md.`,
    );
  }
}

/**
 * Splits `git status -z` output. Entries are NUL-terminated; a rename entry is
 * followed by a SECOND NUL-terminated field holding the original path, which
 * must be consumed or it is misread as a file of its own.
 *
 * Verified against git on this machine — with NUL rendered as `|`:
 *
 *   " M content/…/item.json|?? content/…/my photo.jpg|?? content/…/照片.jpg|"
 *   "RM content/…/item2.json|content/…/item.json|"      <- rename: two fields
 *
 * Note the space-padded status column (" M", not "M"), and that a filename
 * containing a space needs no special handling because -z never quotes.
 */
function parseStatusZ(raw: string): ChangedFile[] {
  const parts = raw.split("\0").filter((p) => p !== "");
  const files: ChangedFile[] = [];

  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry === undefined || entry.length < 4) continue;

    // "XY <path>" — two status columns, a space, then the path.
    const x = entry[0] ?? " ";
    const y = entry[1] ?? " ";
    const filePath = entry.slice(3);

    // Prefer the staged column when it says something, else the worktree one.
    const code = x !== " " && x !== "?" ? x : y === "?" || x === "?" ? "?" : y;
    files.push({ code, path: filePath });

    // A rename's original path is the next NUL-separated field. Skip it.
    if (x === "R" || y === "R") i++;
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** The current branch plus every publishable path that differs from HEAD. */
export async function readChanges(
  projectRoot: string,
): Promise<{ branch: string; files: ChangedFile[] }> {
  await assertRepo(projectRoot);

  // --porcelain=v1 pins the format: v2 has a different, longer line shape, and
  // a future git defaulting to it would silently break this parser.
  const [statusRaw, branchRaw] = await Promise.all([
    git(projectRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ...PUBLISHABLE_PATHS,
    ]),
    git(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);

  return { branch: branchRaw.trim(), files: parseStatusZ(statusRaw) };
}

/**
 * Stages the publishable paths, commits with `message`, and pushes.
 *
 * The change list is re-read here rather than taken from the caller: the seller
 * approved a diff, and between their click and this call a photo can land or a
 * file can change. Re-reading means the returned list is what actually shipped.
 */
export async function publishChanges(
  projectRoot: string,
  message: string,
): Promise<{ commit: string; files: ChangedFile[] }> {
  const trimmed = message.trim();
  if (trimmed === "") {
    throw new GitError(400, "a commit message is required");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new GitError(400, `commit message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }
  if (trimmed.includes("\0")) {
    throw new GitError(400, "commit message must not contain NUL bytes");
  }

  const { files } = await readChanges(projectRoot);
  if (files.length === 0) {
    throw new GitError(409, "nothing to publish — content/ matches the last commit");
  }

  try {
    await git(projectRoot, ["add", "--", ...PUBLISHABLE_PATHS]);
  } catch (err: unknown) {
    throw new GitError(500, `git add failed: ${gitMessage(err)}`);
  }

  // Staging can still come out empty — e.g. every change was to a .gitignored
  // path that `git status` reported as untracked-but-ignored. Committing then
  // would fail with git's own confusing "nothing added" text.
  const staged = await git(projectRoot, ["diff", "--cached", "--name-only", "-z"]);
  if (staged.split("\0").filter((p) => p !== "").length === 0) {
    throw new GitError(409, "nothing to publish — no changes could be staged");
  }

  try {
    // -F - reads the message from stdin. Not `-m`: a message beginning with a
    // dash is a plausible thing for a seller to type, and stdin removes any
    // question of it being read as an option.
    await git(projectRoot, ["commit", "-F", "-"], trimmed);
  } catch (err: unknown) {
    throw new GitError(500, `git commit failed: ${gitMessage(err)}`);
  }

  const commit = (await git(projectRoot, ["rev-parse", "--short", "HEAD"])).trim();

  try {
    await git(projectRoot, ["push"]);
  } catch (err: unknown) {
    // The commit already landed. Say so — "publish failed" alone would send the
    // seller looking for lost work that is safely on disk.
    throw new GitError(
      502,
      `Changes were committed locally as ${commit}, but the push failed:\n${gitMessage(err)}\n` +
        `Your work is saved. Fix the problem and run \`git push\` from a terminal, or try again.`,
    );
  }

  return { commit, files };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run scripts/lib/studioGit.test.ts`
Expected: PASS. If the CI/dev machine has no `user.email` configured globally, the fixture sets it per-repo already; do not add a global git config.

- [ ] **Step 5: Write the failing route test**

Append to `scripts/lib/studioApi.test.ts`:

```ts
describe("publish routes", () => {
  afterEach(() => {
    resetSyncStateForTests();
  });

  it("GET /api/changes returns branch and files", async () => {
    const root = await makeTempProject(ITEM_JSON); // not a git repo
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/changes",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toMatch(/not a git repository/);
  });

  it("POST /api/publish is refused while an image sync is running", async () => {
    const root = await makeTempProject(ITEM_JSON);

    // Hold the mutex with a runner that never settles, then confirm publish
    // refuses. A commit taken mid-sync would ship a half-written
    // lib/generated/image-manifest.json.
    setSyncRunner(() => new Promise(() => {}));
    const stream = streamImageSync(getSyncRunner()!);
    await stream.next(); // starts the run, flips `running`

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/publish",
      body: Buffer.from(JSON.stringify({ message: "chore: update listings" })),
      projectRoot: root,
    });
    expect(res.status).toBe(409);
    expect((asJson(res).body as { error: string }).error).toMatch(/sync/i);

    await stream.return(undefined);
  });

  it("405s on the wrong methods", async () => {
    const root = await makeTempProject(ITEM_JSON);
    expect(
      (
        await handleStudioRequest({
          method: "POST", url: "/api/changes", body: Buffer.from("{}"), projectRoot: root,
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await handleStudioRequest({
          method: "GET", url: "/api/publish", body: Buffer.alloc(0), projectRoot: root,
        })
      ).status,
    ).toBe(405);
  });
});
```

Extend that file's `./studioSync` import to `{ getSyncRunner, resetSyncStateForTests, setSyncRunner, streamImageSync }`.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "publish routes"`
Expected: FAIL — 404 for both routes.

- [ ] **Step 7: Wire the routes**

Add to `scripts/lib/studioApi.ts`:

```ts
import { GitError, publishChanges, readChanges } from "./studioGit";
```

```ts
const publishBodySchema = z.object({
  message: z.string().min(1).max(500),
});

function asStudioError(err: unknown): never {
  if (err instanceof GitError) throw new StudioError(err.status, err.message);
  throw err;
}

async function handleChanges(req: StudioRequest): Promise<StudioResponse> {
  try {
    return { status: 200, body: await readChanges(req.projectRoot) };
  } catch (err: unknown) {
    asStudioError(err);
  }
}

async function handlePublish(req: StudioRequest): Promise<StudioResponse> {
  // An image sync writes lib/generated/image-manifest.json. Committing while
  // that is in flight ships a manifest that omits photos which were in fact
  // uploaded — broken images on the live site, with a green publish in studio.
  // A 409 is enough: the sync finishes in seconds to minutes and the seller can
  // simply publish after.
  if (isSyncRunning()) {
    throw new StudioError(
      409,
      "an image sync is still running — wait for it to finish, then publish",
    );
  }

  const { message } = parseJsonBody(req.body, publishBodySchema);
  try {
    return { status: 200, body: await publishChanges(req.projectRoot, message) };
  } catch (err: unknown) {
    asStudioError(err);
  }
}
```

And in `handleStudioRequest`, before the final 404:

```ts
    if (pathname === "/api/changes") {
      if (req.method !== "GET") {
        return { status: 405, body: { error: "GET only" } };
      }
      return await handleChanges(req);
    }

    if (pathname === "/api/publish") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handlePublish(req);
    }
```

- [ ] **Step 8: Full suite, type-check, lint, commit**

```bash
pnpm test && pnpm type-check && pnpm lint
git add scripts/lib/studioGit.ts scripts/lib/studioGit.test.ts scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: publish content changes from studio, refused during an image sync"
```

---

## Task 5: Carried debt from Part 2A

Two defects recorded during Part 2A's review, both cheap and both user-visible.

**5a — the loader's manifest cache is stale after a sync.** `lib/content/loader.ts` memoizes `manifestPromise` for the process lifetime. `pnpm studio` is a long-lived process, so after `POST /api/sync-images` writes a new `image-manifest.json`, every later `GET /api/items` still reads the old one. Today that only affects nothing visible; the moment anything surfaces a CDN URL it becomes a wrong URL.

The reset must be called from the **Vite-bundled** copy of the loader, not from `scripts/studio.ts`. `studio/vite.config.ts` inlines every relative import, so `studioApi.ts` → `loader.ts` and `studioApi.ts` → `studioSync.ts` land in one bundle sharing one loader instance, while `scripts/studio.ts` resolves a *second*, independent copy through tsx. Calling `resetManifestCache()` from `studio.ts` would clear the copy nobody reads — the same trap that put the sync mutex on `globalThis`. `studioSync.ts` is inside the bundle, so the reset goes there.

**5b — bulk-status reports a skipped no-op as `ok`.** `applyStatus` returns early when an already-sold item is marked sold again. The count says "5 updated" when 2 items were untouched, which reads as a successful re-stamp of a sale date that in fact (correctly) did not move.

**Files:**
- Modify: `scripts/lib/studioSync.ts`, `scripts/lib/studioSync.test.ts`
- Modify: `scripts/lib/studioApi.ts`, `scripts/lib/studioApi.test.ts`
- Modify: `studio/src/App.tsx`

**Interfaces:**
- Produces: `BulkStatusResult` gains `skipped: number`.

---

- [ ] **Step 1: Write the failing manifest-cache test**

Append to `scripts/lib/studioSync.test.ts`:

```ts
import * as loaderModule from "@/lib/content/loader";

it("resets the loader's manifest cache when a sync settles", async () => {
  const spy = vi.spyOn(loaderModule, "resetManifestCache");
  setSyncRunner(async () => ({ total: 0, uploaded: 0, skipped: 0, failures: [] }));

  const events = [];
  for await (const evt of streamImageSync(getSyncRunner()!)) events.push(evt);

  expect(events.at(-1)?.event).toBe("done");
  // lib/content/loader.ts memoizes the manifest for the process lifetime, and
  // `pnpm studio` is long-lived — without this every later GET /api/items would
  // read the manifest from before the upload.
  expect(spy).toHaveBeenCalled();
});

it("resets the cache even when the sync fails", async () => {
  const spy = vi.spyOn(loaderModule, "resetManifestCache");
  setSyncRunner(async () => {
    throw new Error("R2 credentials missing");
  });

  const events = [];
  for await (const evt of streamImageSync(getSyncRunner()!)) events.push(evt);

  expect(events.at(-1)?.event).toBe("error");
  // A failed run can still have uploaded some files before throwing, so the
  // cached manifest is untrustworthy either way.
  expect(spy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioSync.test.ts`
Expected: FAIL — `resetManifestCache` is never called.

- [ ] **Step 3: Implement the reset**

In `scripts/lib/studioSync.ts`, add the import (relative — see Global Constraints):

```ts
import { resetManifestCache } from "../../lib/content/loader";
```

and extend the existing `.finally()` on `inFlight`:

```ts
    .finally(() => {
      syncState().running = false;
      // The manifest on disk has just changed. lib/content/loader.ts memoizes
      // it for the process lifetime, and `pnpm studio` runs for hours — without
      // this, every later GET /api/items reads the pre-upload manifest and any
      // CDN URL studio surfaces is the old one.
      //
      // This call has to happen from THIS module, not from scripts/studio.ts.
      // studio/vite.config.ts inlines every relative import, so studioApi.ts,
      // this file, and loader.ts all end up in one bundle sharing one loader
      // instance — while scripts/studio.ts resolves a second, independent copy
      // through tsx. A reset called there would clear the copy nothing reads.
      // Same module-instance split that put the mutex on globalThis above.
      resetManifestCache();
    });
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run scripts/lib/studioSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing skipped-count test**

Append to `scripts/lib/studioApi.test.ts`:

```ts
describe("bulk-status counts a no-op as skipped, not ok", () => {
  it("separates already-sold items from ones it actually wrote", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-bulk-"));
    const mk = async (slug: string, status: string, soldDate: string | null) => {
      const dir = path.join(root, "content", "items", "electronics", slug);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "item.json"),
        JSON.stringify({ name: slug, status, sold_date: soldDate }, null, 2) + "\n",
      );
    };
    await mk("already-sold", "sold", "2026-01-15");
    await mk("still-listed", "available", null);

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/bulk-status",
      body: Buffer.from(
        JSON.stringify({
          ids: ["electronics/already-sold", "electronics/still-listed"],
          status: "sold",
        }),
      ),
      projectRoot: root,
    });

    const body = asJson(res).body as { ok: number; skipped: number; failed: unknown[] };
    expect(body.ok).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toEqual([]);

    // The original sale date is intact — that is what "skipped" is protecting.
    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "already-sold", "item.json"),
      "utf-8",
    );
    expect(text).toContain("2026-01-15");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "skipped"`
Expected: FAIL — `body.skipped` is `undefined` and `ok` is 2.

- [ ] **Step 7: Implement the count**

In `scripts/lib/studioApi.ts`:

```ts
export type BulkStatusResult = {
  ok: number;
  /** Items already in the target state — nothing was written for them. */
  skipped: number;
  failed: Array<{ id: string; error: string }>;
};
```

Change `applyStatus`'s signature to `Promise<"written" | "skipped">`, return `"skipped"` from the already-sold early return and `"written"` at the end, and in `handleBulkStatus`:

```ts
  const result: BulkStatusResult = { ok: 0, skipped: 0, failed: [] };

  for (const id of ids) {
    try {
      // "skipped" is not a lesser "ok": reporting an untouched already-sold
      // item as updated tells the seller their sale date was re-stamped when
      // the whole point of the guard is that it was not.
      const outcome = await applyStatus(req.projectRoot, id, status, today);
      if (outcome === "skipped") result.skipped++;
      else result.ok++;
    } catch (err: unknown) {
      result.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }
```

In `studio/src/App.tsx`'s `apply`, surface it — after the existing failure message block:

```ts
      if (result.failed.length === 0 && result.skipped > 0) {
        setError(
          `${result.ok} updated, ${result.skipped} already ${status} (left unchanged so the ` +
            `original date is preserved).`,
        );
      }
```

- [ ] **Step 8: Full suite, type-check, lint, commit**

```bash
pnpm test && pnpm type-check && pnpm lint
git add scripts/lib/studioSync.ts scripts/lib/studioSync.test.ts scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts studio/src/App.tsx
git commit -m "fix: refresh the manifest cache after a sync and report skipped bulk updates"
```

---

## Task 6: The edit form

Spec §7: fields grouped as Basic / Price / Specs / Platform / Student / i18n; saving sends **only changed fields**.

36 hand-written inputs would be unreviewable and would drift from the schema. The form is driven by a descriptor list instead, so adding a field is one line.

Verified by clicking through (spec §10 — no React unit tests).

**Files:**
- Create: `studio/src/fields.ts`, `studio/src/panes/EditForm.tsx`, `studio/src/panes/Drawer.tsx`, `studio/src/panes/NewItemDialog.tsx`
- Modify: `studio/src/api.ts`, `studio/src/App.tsx`, `studio/src/tokens.css`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/items/:cat/:name` (Task 2), `POST /api/items` (Task 3).
- Produces: `FieldDescriptor`, `FIELD_GROUPS`; the `Drawer` component replacing App's direct `ImagePane` render.

---

- [ ] **Step 1: Add the client functions**

In `studio/src/api.ts`:

```ts
export type ItemFields = Record<string, unknown>;
export type FieldEdit = { path: (string | number)[]; value: unknown };

export async function fetchItemFields(id: string): Promise<ItemFields> {
  const res = await fetch(`/api/items/${id}`);
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `loading ${id} failed with ${res.status} ${res.statusText}`));
  }
  if (body === null || typeof body.fields !== "object" || body.fields === null) {
    throw new Error(`GET /api/items/${id} returned an unreadable response`);
  }
  return body.fields as ItemFields;
}

export async function patchItem(id: string, edits: FieldEdit[]): Promise<ItemFields> {
  const res = await fetch(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edits }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `saving ${id} failed with ${res.status} ${res.statusText}`));
  }
  return (body?.fields as ItemFields | undefined) ?? {};
}

export async function createItem(category: string, name: string): Promise<string> {
  const res = await fetch("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category, name }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `create failed with ${res.status} ${res.statusText}`));
  }
  return (body?.id as string | undefined) ?? `${category}/${name}`;
}
```

- [ ] **Step 2: Write the field descriptors**

Create `studio/src/fields.ts`:

```ts
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
```

- [ ] **Step 3: Write the form**

Create `studio/src/panes/EditForm.tsx`. It holds a draft keyed by `pathKey`, and on save sends only the entries whose serialised value differs from what was loaded.

```tsx
import { useCallback, useEffect, useState } from "react";
import { fetchItemFields, patchItem, type FieldEdit, type ItemFields } from "../api";
import { FIELD_GROUPS, pathKey, readAtPath, type FieldDescriptor } from "../fields";

/** The on-disk value rendered as the string an input holds. */
function toInput(value: unknown, kind: FieldDescriptor["kind"]): string {
  if (value === undefined || value === null) return "";
  if (kind === "stringList") return Array.isArray(value) ? value.join("\n") : String(value);
  if (kind === "boolean") return value === true ? "true" : "false";
  return String(value);
}

/**
 * The input string turned back into the JSON value the API will receive.
 * Returns { error } rather than throwing so one bad field reports itself
 * without discarding the seller's other edits.
 */
function fromInput(
  raw: string,
  kind: FieldDescriptor["kind"],
): { value: unknown } | { error: string } {
  const trimmed = raw.trim();
  switch (kind) {
    case "boolean":
      return { value: raw === "true" };
    case "stringList":
      return { value: raw.split("\n").map((l) => l.trim()).filter((l) => l !== "") };
    case "number":
    case "integer": {
      // Empty means "not set", which item.json spells as null.
      if (trimmed === "") return { value: null };
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { error: "must be a number" };
      if (kind === "integer" && !Number.isInteger(n)) return { error: "must be a whole number" };
      return { value: n };
    }
    case "date":
      return { value: trimmed === "" ? null : trimmed };
    default:
      return { value: raw };
  }
}

export function EditForm({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [loaded, setLoaded] = useState<ItemFields | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const fields = await fetchItemFields(id);
    setLoaded(fields);
    const next: Record<string, string> = {};
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        next[pathKey(field.path)] = toInput(readAtPath(fields, field.path), field.kind);
      }
    }
    setDraft(next);
  }, [id]);

  useEffect(() => {
    setSaved(false);
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  async function save() {
    if (loaded === null) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const edits: FieldEdit[] = [];
    const problems: string[] = [];

    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const key = pathKey(field.path);
        const current = toInput(readAtPath(loaded, field.path), field.kind);
        const next = draft[key] ?? "";
        // Only changed fields are sent (spec §7) — an untouched field must not
        // be rewritten, or every save would rewrite the whole file and bury the
        // real change in the seller's git diff.
        if (next === current) continue;

        const parsed = fromInput(next, field.kind);
        if ("error" in parsed) {
          problems.push(`${field.label}: ${parsed.error}`);
          continue;
        }
        edits.push({ path: field.path, value: parsed.value });
      }
    }

    if (problems.length > 0) {
      setError(problems.join("; "));
      setBusy(false);
      return;
    }
    if (edits.length === 0) {
      setError("Nothing changed.");
      setBusy(false);
      return;
    }

    try {
      // The response is the re-read file, so the form reloads from disk rather
      // than trusting its own draft.
      const fields = await patchItem(id, edits);
      setLoaded(fields);
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      // The server rejects the whole batch, so nothing was written — but a
      // reload guarantees the form shows disk, not a draft the seller might
      // now believe was saved.
      load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (loaded === null) {
    return error !== null ? <p role="alert">{error}</p> : <p>Loading…</p>;
  }

  return (
    <form
      className="edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error !== null && <p role="alert">{error}</p>}
      {saved && <p className="form-saved">Saved.</p>}

      {FIELD_GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend>{group.title}</legend>
          {group.fields.map((field) => {
            const key = pathKey(field.path);
            const value = draft[key] ?? "";
            const set = (next: string) => setDraft((prev) => ({ ...prev, [key]: next }));
            return (
              <label key={key} className="field">
                <span className="field-label">{field.label}</span>
                {field.kind === "textarea" ? (
                  <textarea rows={3} value={value} onChange={(e) => set(e.target.value)} />
                ) : field.kind === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={value === "true"}
                    onChange={(e) => set(e.target.checked ? "true" : "false")}
                  />
                ) : field.kind === "select" ? (
                  <select value={value} onChange={(e) => set(e.target.value)}>
                    <option value="">—</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.kind === "stringList" ? (
                  <textarea rows={2} value={value} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input
                    type={field.kind === "date" ? "date" : "text"}
                    inputMode={
                      field.kind === "number" || field.kind === "integer" ? "decimal" : undefined
                    }
                    value={value}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
                {field.hint !== undefined && <span className="field-hint">{field.hint}</span>}
              </label>
            );
          })}
        </fieldset>
      ))}

      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
```

**Note on the price tiers:** they are deliberately not in `FIELD_GROUPS` — an array of objects does not fit the descriptor shape. Add a `TierEditor` inside `EditForm` that renders `loaded.price.tiers` as rows (label / miles_min / miles_max / amount) with add and remove buttons, and sends the whole array as one edit at `["price", "tiers"]`. `scripts/lib/itemFields.ts` validates that path against `z.array(tierSchema)`, so a malformed row is rejected with a message naming the tier index.

- [ ] **Step 4: Write the drawer shell**

Create `studio/src/panes/Drawer.tsx`:

```tsx
import { useState } from "react";
import type { StudioItem } from "../api";
import { EditForm } from "./EditForm";
import { ImagePane } from "./ImagePane";

export function Drawer({
  item,
  onClose,
  onChanged,
}: {
  item: StudioItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"photos" | "details">("photos");

  return (
    <aside className="drawer" aria-label={`${item.name} — item editor`}>
      <header className="drawer-head">
        <h2>{item.name}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="drawer-tabs" role="tablist">
        {(["photos", "details"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "tab tab-active" : "tab"}
            onClick={() => setTab(name)}
          >
            {name === "photos" ? "Photos" : "Details"}
          </button>
        ))}
      </div>

      {tab === "photos" ? (
        <ImagePane item={item} onChanged={onChanged} />
      ) : (
        <EditForm id={item.id} onSaved={onChanged} />
      )}
    </aside>
  );
}
```

Then edit `studio/src/panes/ImagePane.tsx`: drop the `onClose` prop and the `<aside className="drawer">` / `<header className="drawer-head">` wrapper (the Drawer owns both now); return a `<div className="pane">` containing the dropzone, empty-state, and thumbnail grid unchanged.

- [ ] **Step 5: Write the create dialog**

Create `studio/src/panes/NewItemDialog.tsx` — two slug inputs plus a `<datalist>` of existing categories built from the item list, client-side slug validation against `/^[a-z0-9][a-z0-9-]*$/` (mirroring `lib/utils/slug.ts`, with the server as the real gate), and a Create button that calls `createItem` then `onCreated(id)`.

- [ ] **Step 6: Wire App**

In `studio/src/App.tsx`: replace the `ImagePane` render with `Drawer`; add a "New item" button in the header that opens `NewItemDialog`; on create, `refresh()` then `setOpenItemId(id)` so the seller lands straight in the new item's form.

- [ ] **Step 7: Style it**

Add to `studio/src/tokens.css`: `.drawer-tabs`, `.tab` / `.tab-active` (underline the active tab in `--ink`, no pill or radius), `.edit-form fieldset` / `legend` (legend in `--font-head`, uppercase, `--ink-soft`), `.field` (label above input, `--carbon-rule` underline, no box), `.field-hint` (`--ink-soft`, 0.7rem), `.form-saved` (`--ink-soft`), and the tier-editor rows in `--font-data`.

Keep spec §14.5: the SOLD stamp stays the only bold element. No new accent colours; validation errors reuse `--error`.

- [ ] **Step 8: Click through**

```bash
pnpm studio
```

Verify, in order:
1. Open an item → Photos tab still uploads, reorders, deletes.
2. Details tab loads every group and shows the on-disk values.
3. Change one field, Save → the terminal-side file shows **only that field** changed (`git diff`), comments intact, `reserved_for` intact if present.
4. Type `liquidated` into a status the select cannot produce (edit the file by hand and reload) → the form shows the bad value rather than "available".
5. Enter `-1` into Age → 400 naming `age_years`, file unchanged.
6. Enter `javascript:alert(1)` into the Original listing URL → 400, file unchanged.
7. Add and remove a price tier → saved as one edit.
8. New item → created as a draft and opened; a second create with the same slug reports 409.
9. Narrow the window to phone width → the drawer is full-width and the form stays readable.
10. Tab through the form → focus is visible on every control.

- [ ] **Step 9: Type-check, lint, commit**

```bash
pnpm test && pnpm type-check && pnpm lint
git add studio/src
git commit -m "feat: schema-driven item edit form and item creation in studio"
```

---

## Task 7: The publish pane

**Files:**
- Create: `studio/src/panes/PublishPane.tsx`
- Modify: `studio/src/api.ts`, `studio/src/App.tsx`, `studio/src/tokens.css`

**Interfaces:**
- Consumes: `GET /api/changes`, `POST /api/publish` (Task 4).

---

- [ ] **Step 1: Add the client functions**

In `studio/src/api.ts`:

```ts
export type ChangedFile = { code: string; path: string };
export type Changes = { branch: string; files: ChangedFile[] };

export async function fetchChanges(): Promise<Changes> {
  const res = await fetch("/api/changes");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `reading changes failed with ${res.status} ${res.statusText}`));
  }
  return { branch: String(body?.branch ?? ""), files: (body?.files as ChangedFile[]) ?? [] };
}

export async function publish(message: string): Promise<{ commit: string; files: ChangedFile[] }> {
  const res = await fetch("/api/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `publish failed with ${res.status} ${res.statusText}`));
  }
  return {
    commit: String(body?.commit ?? ""),
    files: (body?.files as ChangedFile[]) ?? [],
  };
}
```

- [ ] **Step 2: Write the pane**

Create `studio/src/panes/PublishPane.tsx`. Requirements:

- Loads `fetchChanges()` on mount, and again after every item write and every sync (App passes a `refreshToken` that changes on those events).
- Renders the file list with its status letter in `--font-data`; `?` is labelled "new".
- A commit-message input defaulting to `chore: update listings` — matching `package.json`'s `push` script, so a seller's history reads the same whichever path they used.
- A Publish button, disabled while empty, while busy, and when `files.length === 0`.
- On success: show the short commit hash and how many files shipped, then re-fetch (the list should be empty).
- On failure: render `error` with `white-space: pre-line` — `publishChanges`' push-failure message is multi-line and its second line ("Your work is saved") is the part that matters.
- A git-less project is not an error state to shout about: when `fetchChanges` fails with "not a git repository", render the message as plain help text, not `role="alert"`.

- [ ] **Step 3: Surface the count in the header**

Spec §14.4: the header surfaces the uncommitted-change count most prominently, since editing without pushing is this tool's one true failure mode. In `App.tsx`, render `content/ · {items.length} items · {changeCount} uncommitted` and hide the last segment when the count is 0 or the project is not a git repo.

- [ ] **Step 4: Style it**

Add `.publish-pane`, `.change-list` (`--font-data`, one line per file, `--ink-soft` for the status letter), `.publish-error` (reuse the `.sync-error` rules: `white-space: pre-line`, `--error`). No new colours.

- [ ] **Step 5: Click through**

```bash
pnpm studio
```

1. Edit an item → the header count increments and the file appears in the list.
2. Upload a photo → it appears as `new`.
3. Publish with the default message → the list empties, the count clears, `git log` on the terminal shows the commit, and `git show --name-only HEAD` contains **no** files outside `content/` and the manifest.
4. Start a CDN sync and click Publish while it runs → 409, message names the sync.
5. Point `origin` at a bad URL and publish → the error says the commit was saved locally and names the push as the failure.
6. Clear the message box → Publish is disabled.

- [ ] **Step 6: Type-check, lint, commit**

```bash
pnpm test && pnpm type-check && pnpm lint
git add studio/src
git commit -m "feat: publish pane with the uncommitted-change count in the header"
```

---

## Task 8: Distribution and documentation

Spec §11 and §12. `studio/` is currently absent from `TEMPLATE_PATHS`, so `pnpm update-site` does not deliver it and `scripts/studio.ts` still tells sellers to wait for a future release — this task is that release.

**Files:**
- Modify: `scripts/update-site.ts`, `scripts/studio.ts`
- Modify (bilingual pairs): `docs/UPDATE_GUIDE.md` / `_zh`, `docs/CURRENT_FUNCTIONALITY.md` / `_zh`, `docs/FEATURES_ROADMAP.md` / `_zh`, `docs/IMPLEMENTATION_PLAN.md` / `_zh`
- Modify: `.claude/CLAUDE.md`

---

- [ ] **Step 1: Add `studio` to `TEMPLATE_PATHS`**

In `scripts/update-site.ts`, insert `"studio",` into the array — keep it in the existing rough ordering, after `"scripts"` and before `"docs"`:

```ts
  "scripts",
  "studio",
  "docs",
```

`scripts` is already listed, so `scripts/lib/*.ts` and `scripts/studio.ts` ship automatically.

- [ ] **Step 2: Update the "not installed" message**

In `scripts/studio.ts`, `assertStudioConfigPresent` promises a later release. Replace with:

```ts
    console.error(
      "Error: Seller Studio is not installed in this site.\n" +
        "  studio/vite.config.ts was not found. Run `pnpm update-site` to pull it from the\n" +
        "  template, then `pnpm install`, then `pnpm studio` again.",
    );
```

- [ ] **Step 3: Update `docs/UPDATE_GUIDE.md` Step 2 — and `_zh` in the same edit**

Both files carry the same `git checkout` command block. Add `studio` to the path list in each, matching `TEMPLATE_PATHS`:

```bash
  app components components.json hooks lib public scripts studio docs \
```

The English file's Step 2 is at `docs/UPDATE_GUIDE.md:81`; the Chinese one's command line is at `docs/UPDATE_GUIDE_zh.md:86`. **Iron Rule 2 — do not close this step with only one of the two edited.**

- [ ] **Step 4: Verify the two lists cannot drift**

Add to `scripts/lib/studioApi.test.ts` (or a new `scripts/update-site.test.ts` if one is cleaner):

```ts
/**
 * The `git checkout <tag> -- …` path list out of an UPDATE_GUIDE, as a set.
 * The command spans several backslash-continued lines inside a ```bash fence.
 */
function guidePaths(markdown: string): Set<string> {
  const start = markdown.indexOf("git checkout v1.2.0 -- \\");
  if (start === -1) throw new Error("the `git checkout` block is missing from the guide");
  const block = markdown.slice(start).split("```")[0] ?? "";
  return new Set(
    block
      .replace("git checkout v1.2.0 -- ", "")
      .split(/[\s\\]+/)
      .map((token) => token.trim())
      .filter((token) => token !== ""),
  );
}

/** TEMPLATE_PATHS out of scripts/update-site.ts, as a set. */
function templatePaths(source: string): Set<string> {
  const start = source.indexOf("const TEMPLATE_PATHS = [");
  if (start === -1) throw new Error("TEMPLATE_PATHS is missing from scripts/update-site.ts");
  const block = source.slice(start, source.indexOf("];", start));
  return new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string));
}

it("keeps TEMPLATE_PATHS and both UPDATE_GUIDE path lists in sync", async () => {
  // The comment above TEMPLATE_PATHS says "keep in sync with Step 2 of
  // docs/UPDATE_GUIDE.md / docs/UPDATE_GUIDE_zh.md". This is that instruction,
  // enforced — including Iron Rule 2's requirement that the Chinese guide is
  // never left behind.
  const expected = templatePaths(await fs.readFile("scripts/update-site.ts", "utf-8"));
  const en = guidePaths(await fs.readFile("docs/UPDATE_GUIDE.md", "utf-8"));
  const zh = guidePaths(await fs.readFile("docs/UPDATE_GUIDE_zh.md", "utf-8"));

  expect(expected.has("studio")).toBe(true);
  expect([...en].sort()).toEqual([...expected].sort());
  expect([...zh].sort()).toEqual([...expected].sort());
});
```

Run: `pnpm test`
Expected: PASS. **If the two lists already disagree before this task's edit** (a pre-existing drift this test is the first to notice), fix the guides to match `TEMPLATE_PATHS` — that is the direction of truth, since `update-site.ts` is what actually runs — and say so in the report.

- [ ] **Step 5: Document Studio in `docs/CURRENT_FUNCTIONALITY.md` and `_zh`**

Add a "Seller Studio" section to both, covering: `pnpm studio` and `--port`; that it is local-only and never deployed; the four operations (photos, bulk status, edit form, publish); that it writes only `content/` plus the image manifest; and that it never reads or writes `reserved_for`.

- [ ] **Step 6: Mark the roadmap item done in `docs/FEATURES_ROADMAP.md` and `_zh`**

Mark "Seller dashboard (local-only GUI)" ✅ in both.

- [ ] **Step 7: Add and complete Phase 18 in `docs/IMPLEMENTATION_PLAN.md` and `_zh`**

Iron Rule 7. Add Phase 18 — Seller Studio, with every task `[x]` and ✅ after the phase title, in **both** files. Bump the version header in both to v1.7 and the date to the implementation date.

- [ ] **Step 8: Update `.claude/CLAUDE.md`**

Two edits:
1. Common Seller Tasks table — add `| Manage listings in a browser | `pnpm studio` (local only; see docs/CURRENT_FUNCTIONALITY.md) |`.
2. Current Doc Versions table — update the `IMPLEMENTATION_PLAN` row to v1.7 and refresh the dates of every file this task touched.

- [ ] **Step 9: Verify the studio never reaches the build output**

The whole design rests on `studio/` being unreachable from `next build` (spec §4). Prove it after adding it to `TEMPLATE_PATHS`:

```bash
pnpm build
for marker in "Seller Studio" "studio-api" "handleStudioRequest" "StudioError" \
              "carbon-pale" "bulk-status" "ImagePane" "EditForm" "PublishPane" \
              "stamp-press" "fontsource" "publishChanges"; do
  if grep -rq "$marker" out/; then echo "LEAKED: $marker"; else echo "ok: $marker"; fi
done
```

Expected: `ok:` for all twelve. Any `LEAKED:` line blocks this task.

- [ ] **Step 10: Full verification and commit**

```bash
pnpm test && pnpm type-check && pnpm lint && pnpm build
git add scripts/update-site.ts scripts/studio.ts docs .claude/CLAUDE.md scripts/lib/studioApi.test.ts
git commit -m "docs: ship studio to downstream sites and mark Phase 18 complete"
```

---

## Self-Review

**Spec coverage.**

| Spec section | Task |
|---|---|
| §6 `POST /api/items` | 3 |
| §6 `PATCH /api/items/:cat/:name` | 2 |
| §6 `POST /api/publish` | 4 |
| §7 Edit form, grouped, changed fields only | 6 |
| §7 Publish pane | 7 |
| §8 Publish re-reads the change list before committing | 4 |
| §9 Field writes validated against the schema; `reserved_for` denied | 1, 2 |
| §10 `itemEdit.test.ts` / `studioApi.test.ts` coverage; no React tests | 1–5, 6–7 |
| §11 `TEMPLATE_PATHS`, `UPDATE_GUIDE` bilingual, vite preflight | 8 (preflight already exists) |
| §12 All five doc pairs plus `.claude/CLAUDE.md` | 8 |
| §14.4 Uncommitted count most prominent in the header | 7 |
| Carried debt: `resetManifestCache`, bulk-status `skipped` | 5 |

Spec §6's `GET /api/items` "plus each item's image files" and the image routes shipped in Part 2A. Spec §13's Iron Rule table is covered by Global Constraints.

**Two spec items deliberately not implemented, and why:**

- **The hung-sync mutex still has no cancel.** Part 2A recorded this; Part 2B does not add one. A sync that never settles holds `running` forever and now also blocks publish. The mitigation is that publish returns a 409 with an actionable message rather than hanging, and restarting `pnpm studio` clears the state. A real cancel needs `syncImagesToCdn` to accept an `AbortSignal`, which is a change to the shared CLI path and belongs in its own piece of work.
- **No `_category.json` editor.** Creating an item can create a category folder (Task 3), but display name, icon, and sort order still require editing the file by hand. Out of scope for §7's four panes.

**Placeholder scan.** No TBD, no "add appropriate error handling", no "similar to Task N". Task 6 Steps 5 and 7 and Task 7 Step 2 describe components in prose rather than full source — they are the two purely presentational pieces, they have no tests by spec §10, and every value they depend on (routes, prop shapes, CSS token names, exact acceptance criteria) is spelled out. Everything that can damage seller data is written out in full.

**Type consistency.**

- `resolveFieldSchema` / `isEditableField` / `assertEditableValue` — same names in Tasks 1 and 2.
- `BulkStatusResult` gains `skipped: number` in Task 5; `studio/src/App.tsx` reads it in the same task.
- `ChangedFile { code, path }` — identical in `studioGit.ts` (Task 4) and `studio/src/api.ts` (Task 7).
- `publishChanges` returns `{ commit, files }`; the route passes it through unchanged; `publish()` in the client reads exactly those two keys.
- `ImagePane`'s props change in Task 6 Step 4 (`onClose` removed) and its only caller moves to `Drawer` in the same step.
- `FieldEdit { path, value }` is the same shape in `scripts/lib/itemEdit.ts` and `studio/src/api.ts`; the `PATCH` body schema in Task 2 accepts exactly it.
