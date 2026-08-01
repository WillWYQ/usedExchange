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
