import { describe, it, expect } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { applyDuplicateEdits } from "./duplicateItem";

describe("applyDuplicateEdits", () => {
  it("resets lifecycle fields on a sold item, preserving // comments", () => {
    const text = `{
  // condition options: "new" | "like-new" | "good" | "fair" | "for-parts"
  "condition": "good",
  "name": "IKEA Lamp",
  "status": "sold", // options: "available" | "pending" | "reserved" | "sold" | "draft"
  "listed_date": "2026-01-01",
  "sold_date": "2026-02-01",
  "price_reduced": true,
  "previous_lowest_price": 15,
  "min_acceptable_offer": 10
}`;

    const next = applyDuplicateEdits(text, "2026-06-14");
    expect(next).toContain("// condition options:");
    expect(next).toContain('// options: "available" | "pending" | "reserved" | "sold" | "draft"');

    const parsed = parseJsonc(next) as Record<string, unknown>;
    expect(parsed["name"]).toBe("IKEA Lamp");
    expect(parsed["status"]).toBe("draft");
    expect(parsed["listed_date"]).toBe("2026-06-14");
    expect(parsed["sold_date"]).toBeNull();
    expect(parsed["price_reduced"]).toBe(false);
    expect(parsed["previous_lowest_price"]).toBeNull();
    expect(parsed["min_acceptable_offer"]).toBeNull();
  });

  it("strips a private reserved_for field rather than copying it forward", () => {
    const text = `{"name": "Desk", "status": "sold", "reserved_for": "jane@example.com"}`;
    const next = applyDuplicateEdits(text, "2026-06-14");
    const parsed = parseJsonc(next) as Record<string, unknown>;
    expect(parsed["reserved_for"]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, "reserved_for")).toBe(false);
  });

  it("is a no-op on reserved_for when the field is absent", () => {
    const text = `{"name": "Chair", "status": "available"}`;
    const next = applyDuplicateEdits(text, "2026-06-14");
    const parsed = parseJsonc(next) as Record<string, unknown>;
    expect(parsed["status"]).toBe("draft");
    expect(parsed["name"]).toBe("Chair");
  });

  it("works on plain JSON with no comments and already-draft status", () => {
    const text = `{"status": "draft", "listed_date": "2026-01-01", "sold_date": null}`;
    const next = applyDuplicateEdits(text, "2026-06-14");
    const parsed = parseJsonc(next) as Record<string, unknown>;
    expect(parsed["status"]).toBe("draft");
    expect(parsed["listed_date"]).toBe("2026-06-14");
    expect(parsed["sold_date"]).toBeNull();
  });
});
