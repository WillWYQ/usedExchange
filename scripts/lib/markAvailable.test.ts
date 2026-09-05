import { describe, it, expect } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { applyMarkAvailable } from "./markAvailable";

describe("applyMarkAvailable", () => {
  it("sets status to available and clears sold_date, preserving // comments", () => {
    const text = `{
  // condition options: "new" | "like-new" | "good" | "fair" | "for-parts"
  "condition": "good",
  "status": "sold", // options: "available" | "pending" | "reserved" | "sold" | "draft"
  "sold_date": "2026-01-01"
}`;

    const next = applyMarkAvailable(text);
    expect(next).not.toBeNull();
    expect(next).toContain("// condition options:");
    expect(next).toContain('// options: "available" | "pending" | "reserved" | "sold" | "draft"');

    const parsed = parseJsonc(next!) as Record<string, unknown>;
    expect(parsed["status"]).toBe("available");
    expect(parsed["sold_date"]).toBeNull();
    expect(parsed["condition"]).toBe("good");
  });

  it("returns null when the item is already available", () => {
    const text = `{ "status": "available", "sold_date": null }`;
    expect(applyMarkAvailable(text)).toBeNull();
  });

  it("resets a draft item to available (not only sold items)", () => {
    const text = `{"status": "draft", "sold_date": null}`;
    const next = applyMarkAvailable(text);
    const parsed = parseJsonc(next!) as Record<string, unknown>;
    expect(parsed["status"]).toBe("available");
    expect(parsed["sold_date"]).toBeNull();
  });

  it("resets a pending item to available and clears any stray sold_date", () => {
    const text = `{"status": "pending", "sold_date": "2026-02-02"}`;
    const next = applyMarkAvailable(text);
    const parsed = parseJsonc(next!) as Record<string, unknown>;
    expect(parsed["status"]).toBe("available");
    expect(parsed["sold_date"]).toBeNull();
  });
});
