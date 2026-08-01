import { describe, expect, it } from "vitest";
import { applyFieldEdits, isEditableField, readItemField, readItemForEdit } from "./itemEdit";

// A realistic item.json: JSONC comments from `pnpm create-item`, plus the
// private reserved_for field that Iron Rule 4 protects.
const SAMPLE = `{
  "name": "Desk lamp",
  // options: new | like-new | good | fair | for-parts
  "condition": "good",
  "status": "available",
  "sold_date": null,
  "reserved_for": "alice@example.com",
  "price": {
    "currency": "USD",
    "negotiable": false
  }
}
`;

describe("applyFieldEdits", () => {
  it("preserves JSONC comments", () => {
    const next = applyFieldEdits(SAMPLE, [{ path: ["status"], value: "sold" }]);
    expect(next).toContain("// options: new | like-new | good | fair | for-parts");
  });

  it("preserves reserved_for", () => {
    const next = applyFieldEdits(SAMPLE, [{ path: ["status"], value: "sold" }]);
    expect(readItemField(next, "reserved_for")).toBe("alice@example.com");
  });

  it("applies every edit in one pass", () => {
    const next = applyFieldEdits(SAMPLE, [
      { path: ["status"], value: "sold" },
      { path: ["sold_date"], value: "2026-07-30" },
    ]);
    expect(readItemField(next, "status")).toBe("sold");
    expect(readItemField(next, "sold_date")).toBe("2026-07-30");
  });

  it("edits nested paths", () => {
    const next = applyFieldEdits(SAMPLE, [{ path: ["price", "negotiable"], value: true }]);
    const price = readItemField(next, "price") as Record<string, unknown>;
    expect(price["negotiable"]).toBe(true);
  });

  it("refuses to write reserved_for", () => {
    expect(() => applyFieldEdits(SAMPLE, [{ path: ["reserved_for"], value: "bob" }])).toThrow(
      /reserved_for/,
    );
  });

  it("refuses unknown fields", () => {
    expect(() => applyFieldEdits(SAMPLE, [{ path: ["evil"], value: 1 }])).toThrow(/evil/);
  });

  it("rejects the whole batch when any edit is disallowed", () => {
    expect(() =>
      applyFieldEdits(SAMPLE, [
        { path: ["status"], value: "sold" },
        { path: ["reserved_for"], value: "bob" },
      ]),
    ).toThrow();
    // Nothing was written: the caller still holds the original text.
    expect(readItemField(SAMPLE, "status")).toBe("available");
  });
});

describe("isEditableField", () => {
  it("accepts a known schema field", () => {
    expect(isEditableField(["condition"])).toBe(true);
  });

  it("rejects a numeric-only path", () => {
    expect(isEditableField([0])).toBe(false);
  });
});

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
