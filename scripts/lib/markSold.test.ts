import { describe, it, expect } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { applyMarkSold } from "./markSold";

describe("applyMarkSold", () => {
  it("sets status to sold and sold_date to today, preserving // comments", () => {
    const text = `{
  // condition options: "new" | "like-new" | "good" | "fair" | "for-parts"
  "condition": "good",
  "status": "draft", // options: "available" | "pending" | "reserved" | "sold" | "draft"
  "sold_date": null
}`;

    const next = applyMarkSold(text, "2026-06-14");
    expect(next).not.toBeNull();
    expect(next).toContain("// condition options:");
    expect(next).toContain('// options: "available" | "pending" | "reserved" | "sold" | "draft"');

    const parsed = parseJsonc(next!) as Record<string, unknown>;
    expect(parsed["status"]).toBe("sold");
    expect(parsed["sold_date"]).toBe("2026-06-14");
    expect(parsed["condition"]).toBe("good");
  });

  it("returns null when the item is already marked sold", () => {
    const text = `{ "status": "sold", "sold_date": "2026-01-01" }`;
    expect(applyMarkSold(text, "2026-06-14")).toBeNull();
  });

  it("works on plain JSON with no comments", () => {
    const text = `{"status": "draft", "sold_date": null}`;
    const next = applyMarkSold(text, "2026-06-14");
    const parsed = parseJsonc(next!) as Record<string, unknown>;
    expect(parsed["status"]).toBe("sold");
    expect(parsed["sold_date"]).toBe("2026-06-14");
  });
});
