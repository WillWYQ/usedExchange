import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { itemJsonSchema } from "@/lib/content/schema";
import {
  assertEditableValue,
  EDITABLE_NESTED_FIELDS,
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

    // CRITICAL 1 (task-1-findings.md): `pnpm create-item` (itemTemplate.ts)
    // writes dimensions/weight with null leaves as their intentional
    // "unset" placeholder — a seller must also be able to write that shape
    // back, and to clear a single leaf to null.
    [["dimensions"], { length: null, width: null, height: null, unit: "cm" }],
    [["dimensions", "length"], null],
    [["dimensions", "width"], null],
    [["dimensions", "height"], null],
    [["weight"], { value: null, unit: "kg" }],
    [["weight", "value"], null],

    // CRITICAL 2: every field of `price` is optional in lib/content/schema.ts,
    // and no shipped item.json in this repo carries a `show_tiers` key —
    // requiring it would make every existing item unsaveable.
    [["price"], {}],
    [["price"], { currency: "USD", tiers: [], negotiable: true }],
    [
      ["price"],
      {
        currency: "USD",
        tiers: [{ label: "Pickup", miles_max: 5, amount: 45 }],
        negotiable: true,
      },
    ],

    // IMPORTANT 3: jsonc-parser's modify() only clears a key when given
    // `undefined`, so an optional leaf's schema must accept `undefined` or
    // that field can never be unset once written. shipping_payer and a
    // tier's miles_min/miles_max are all optional in their object schemas.
    [["price", "shipping_payer"], undefined],
    [["price", "tiers", 0, "miles_min"], undefined],
    [["price", "tiers", 0, "miles_max"], undefined],
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
    // IMPORTANT 4: these all used to throw an uncaught RangeError out of
    // Date#toISOString() on an Invalid Date instead of failing safeParse — see
    // the isoDate comment in itemFields.ts. "banana" and "2026-13-45" pass
    // isoDate's shape checks far enough to reach the second refinement;
    // "0000-00-00" and a year outside Date's representable range do too.
    [["sold_date"], "banana"],
    [["sold_date"], "2026-13-45"],
    [["sold_date"], "0000-00-00"],
    [["sold_date"], "275760-09-14"],
    [["tags"], "a,b"],
    [["no_lowball"], "true"],
    [["dimensions"], { length: 1, width: 2, height: 3 }],
    [["dimensions"], { length: 0, width: 2, height: 3, unit: "cm" }],
    [["dimensions"], { length: 1, width: 2, height: 3, unit: "cm", depth: 4 }],
    [["weight", "value"], -2],
    [["price", "tiers"], [{ label: "Pickup", amount: -1 }]],
    [["price", "tiers", 0, "amount"], "24"],
    // .strict() must still reject an unknown key even though every declared
    // field of price is now optional (CRITICAL 2) — optional is not lax.
    [["price"], { currency: "USD", seller_cost_basis: 5 }],
  ])("rejects %j = %j", (path, value) => {
    // A bare `.toThrow()` is satisfied by ANY thrown error, including the
    // uncaught RangeError that IMPORTANT 4 found isoDate could throw — that
    // gap is exactly why this asserts the specific "Invalid value" message
    // assertEditableValue is documented to produce, naming this case's own
    // path, rather than just "it threw something".
    const label = (path as (string | number)[]).join(".");
    expect(() => assertEditableValue(path as (string | number)[], value)).toThrow(
      `Invalid value for "${label}"`,
    );
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

// MINOR 6 (task-1-findings.md): the top-level drift guard above only proved
// TOP_LEVEL matches itemJsonSchema.shape's keys. Proven by mutation: adding a
// field to lib/content/schema.ts's nested priceSchema left every test green,
// because nothing compared PRICE_LEAVES/TIER_LEAVES/DIMENSION_LEAVES/
// WEIGHT_LEAVES against the loader schema's own nested shapes — which is
// exactly how CRITICAL 2 and IMPORTANT 3 happened. These extend the guard one
// level down.
describe("drift guard — nested fields", () => {
  // Peels every wrapper the loader's lenient schema stacks on a field
  // (.optional/.nullable/.default/.catch/.preprocess) down to the bare
  // ZodObject, so its nested key set can be compared directly against
  // itemFields.ts's leaf maps. Uses only public Zod API (instanceof narrowing
  // plus .unwrap()/.removeDefault()/.removeCatch()/.innerType()) — no reach
  // into `_def` internals.
  function unwrapToObject(schema: z.ZodTypeAny): z.AnyZodObject {
    let current: z.ZodTypeAny = schema;
    for (;;) {
      if (current instanceof z.ZodDefault) {
        current = current.removeDefault();
      } else if (current instanceof z.ZodCatch) {
        current = current.removeCatch();
      } else if (current instanceof z.ZodOptional) {
        current = current.unwrap();
      } else if (current instanceof z.ZodNullable) {
        current = current.unwrap();
      } else if (current instanceof z.ZodEffects) {
        current = current.innerType();
      } else if (current instanceof z.ZodArray) {
        current = current.element;
      } else {
        break;
      }
    }
    if (!(current instanceof z.ZodObject)) {
      throw new Error("expected schema to unwrap to a ZodObject");
    }
    return current;
  }

  it("has exactly one editor per nested price field", () => {
    const schemaShape = unwrapToObject(itemJsonSchema.shape.price).shape;
    expect([...EDITABLE_NESTED_FIELDS.price].sort()).toEqual(Object.keys(schemaShape).sort());
  });

  it("has exactly one editor per nested price.tiers entry field", () => {
    const priceShape = unwrapToObject(itemJsonSchema.shape.price).shape;
    const tierShape = unwrapToObject(priceShape["tiers"]).shape;
    expect([...EDITABLE_NESTED_FIELDS.priceTier].sort()).toEqual(Object.keys(tierShape).sort());
  });

  it("has exactly one editor per nested dimensions field", () => {
    const schemaShape = unwrapToObject(itemJsonSchema.shape.dimensions).shape;
    expect([...EDITABLE_NESTED_FIELDS.dimensions].sort()).toEqual(
      Object.keys(schemaShape).sort(),
    );
  });

  it("has exactly one editor per nested weight field", () => {
    const schemaShape = unwrapToObject(itemJsonSchema.shape.weight).shape;
    expect([...EDITABLE_NESTED_FIELDS.weight].sort()).toEqual(Object.keys(schemaShape).sort());
  });
});

// MINOR 6, second half: nothing enforced the task's stated premise — that
// itemFields.ts's schemas carry no .catch, .preprocess, or .default — except
// prose in a comment. This reads the file's own source and fails if any of
// those three calls appear outside a `//` comment.
describe("source guard", () => {
  it("itemFields.ts carries no .catch(, .preprocess(, or .default( outside comments", () => {
    const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "itemFields.ts");
    const source = readFileSync(sourcePath, "utf8");
    const withoutComments = source
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(withoutComments).not.toMatch(/\.catch\(/);
    expect(withoutComments).not.toMatch(/\.preprocess\(/);
    expect(withoutComments).not.toMatch(/\.default\(/);
  });
});
