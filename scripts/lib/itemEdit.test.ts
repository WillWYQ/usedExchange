import { describe, expect, it } from "vitest";
import { applyFieldEdits, isEditableField, readItemField } from "./itemEdit";

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
