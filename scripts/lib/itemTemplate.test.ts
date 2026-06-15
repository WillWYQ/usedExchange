import { describe, it, expect } from "vitest";
import { parse as parseJsonc } from "jsonc-parser";
import { buildItemTemplate, renderItemTemplateJsonc } from "./itemTemplate";

describe("buildItemTemplate", () => {
  it("defaults to metric units (cm/kg)", () => {
    const template = buildItemTemplate("Item", "2026-06-01");
    expect(template.dimensions.unit).toBe("cm");
    expect(template.weight.unit).toBe("kg");
  });

  it("uses imperial units (in/lb) when requested", () => {
    const template = buildItemTemplate("Item", "2026-06-01", "imperial");
    expect(template.dimensions.unit).toBe("in");
    expect(template.weight.unit).toBe("lb");
  });
});

describe("renderItemTemplateJsonc", () => {
  it("re-parses (via jsonc-parser) to the same object buildItemTemplate returns", () => {
    const template = buildItemTemplate("Item", "2026-06-01");
    const rendered = renderItemTemplateJsonc(template);
    const errors: import("jsonc-parser").ParseError[] = [];
    const parsed = parseJsonc(rendered, errors, { allowTrailingComma: true });
    expect(errors).toEqual([]);
    expect(parsed).toEqual(template);
  });

  it("includes an // options: ... hint for condition, status, and both unit fields", () => {
    const template = buildItemTemplate("Item", "2026-06-01");
    const rendered = renderItemTemplateJsonc(template);

    expect(rendered).toMatch(
      /"condition": "good", \/\/ options: "new" \| "like-new" \| "good" \| "fair" \| "for-parts"/,
    );
    expect(rendered).toMatch(
      /"status": "draft", \/\/ options: "available" \| "pending" \| "reserved" \| "sold" \| "draft"/,
    );
    expect(rendered).toMatch(/"unit": "cm" \/\/ options: "cm" \| "in"/);
    expect(rendered).toMatch(/"unit": "kg" \/\/ options: "kg" \| "lb"/);
  });

  it("shows the imperial unit options/defaults when measurementUnit is imperial", () => {
    const template = buildItemTemplate("Item", "2026-06-01", "imperial");
    const rendered = renderItemTemplateJsonc(template);

    expect(rendered).toMatch(/"unit": "in" \/\/ options: "cm" \| "in"/);
    expect(rendered).toMatch(/"unit": "lb" \/\/ options: "kg" \| "lb"/);
  });
});
