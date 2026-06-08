import { describe, it, expect } from "vitest";
import { itemJsonSchema, categoryJsonSchema } from "./schema";

// Helper: parse and expect success
function parse(raw: unknown) {
  const r = itemJsonSchema.safeParse(raw);
  expect(r.success).toBe(true);
  if (!r.success) throw new Error(r.error.message);
  return r.data;
}

describe("itemJsonSchema", () => {
  describe("name (required)", () => {
    it("accepts a valid name", () => {
      expect(parse({ name: "Test Item" }).name).toBe("Test Item");
    });

    it("rejects missing name", () => {
      expect(itemJsonSchema.safeParse({}).success).toBe(false);
    });

    it("rejects empty string name", () => {
      expect(itemJsonSchema.safeParse({ name: "" }).success).toBe(false);
    });
  });

  describe("enum defaults", () => {
    it("defaults status to 'available' when absent", () => {
      expect(parse({ name: "x" }).status).toBe("available");
    });

    it("defaults condition to 'good' when absent", () => {
      expect(parse({ name: "x" }).condition).toBe("good");
    });

    it("falls back to 'available' for invalid status", () => {
      expect(parse({ name: "x", status: "unknown-status" }).status).toBe(
        "available",
      );
    });

    it("falls back to 'good' for invalid condition", () => {
      expect(parse({ name: "x", condition: "perfect" }).condition).toBe(
        "good",
      );
    });
  });

  describe("number fields", () => {
    it("returns null when absent", () => {
      expect(parse({ name: "x" }).age_years).toBeNull();
      expect(parse({ name: "x" }).original_price).toBeNull();
    });

    it("returns null for null", () => {
      expect(parse({ name: "x", age_years: null }).age_years).toBeNull();
    });

    it("zero is valid (not converted to null)", () => {
      expect(parse({ name: "x", age_years: 0 }).age_years).toBe(0);
      expect(parse({ name: "x", original_price: 0 }).original_price).toBe(0);
    });

    it("negative numbers become null", () => {
      expect(parse({ name: "x", age_years: -1 }).age_years).toBeNull();
      expect(parse({ name: "x", original_price: -5 }).original_price).toBeNull();
    });

    it("positive numbers pass through", () => {
      expect(parse({ name: "x", age_years: 2 }).age_years).toBe(2);
      expect(parse({ name: "x", original_price: 29.99 }).original_price).toBe(
        29.99,
      );
    });

    it("quantity defaults to 1 when absent", () => {
      expect(parse({ name: "x" }).quantity).toBe(1);
    });

    it("quantity < 1 defaults to 1", () => {
      expect(parse({ name: "x", quantity: 0 }).quantity).toBe(1);
      expect(parse({ name: "x", quantity: -3 }).quantity).toBe(1);
    });
  });

  describe("date fields", () => {
    it("accepts YYYY-MM-DD", () => {
      expect(parse({ name: "x", listed_date: "2026-05-25" }).listed_date).toBe(
        "2026-05-25",
      );
    });

    it("accepts full ISO timestamp, extracts date portion", () => {
      expect(
        parse({ name: "x", listed_date: "2026-05-28T10:00:00Z" }).listed_date,
      ).toBe("2026-05-28");
    });

    it("invalid date string → null", () => {
      expect(parse({ name: "x", listed_date: "not-a-date" }).listed_date).toBeNull();
    });

    it("absent date → null", () => {
      expect(parse({ name: "x" }).listed_date).toBeNull();
      expect(parse({ name: "x" }).sold_date).toBeNull();
    });

    it("invalid month → null", () => {
      expect(
        parse({ name: "x", listed_date: "2026-13-01" }).listed_date,
      ).toBeNull();
    });
  });

  describe("URL fields", () => {
    it("valid URL passes through", () => {
      expect(
        parse({ name: "x", original_link: "https://example.com" }).original_link,
      ).toBe("https://example.com");
    });

    it("invalid URL → empty string", () => {
      expect(
        parse({ name: "x", original_link: "not-a-url" }).original_link,
      ).toBe("");
    });

    it("absent URL → empty string", () => {
      expect(parse({ name: "x" }).original_link).toBe("");
    });
  });

  describe("price.tiers", () => {
    it("defaults to [] when absent", () => {
      expect(parse({ name: "x" }).price.tiers).toEqual([]);
    });

    it("non-array tiers → []", () => {
      expect(
        parse({ name: "x", price: { currency: "USD", tiers: "bad" } }).price
          .tiers,
      ).toEqual([]);
    });

    it("parses valid tiers", () => {
      const raw = {
        name: "x",
        price: {
          tiers: [{ label: "Pickup", amount: 15, miles_max: 5 }],
          negotiable: true,
        },
      };
      const result = parse(raw);
      expect(result.price.tiers).toHaveLength(1);
      expect(result.price.tiers[0]?.amount).toBe(15);
      expect(result.price.tiers[0]?.miles_max).toBe(5);
      expect(result.price.negotiable).toBe(true);
    });

    it("open-ended tier has miles_max undefined", () => {
      const raw = {
        name: "x",
        price: { tiers: [{ label: "Shipping", amount: 35, miles_min: 30 }] },
      };
      const result = parse(raw);
      expect(result.price.tiers[0]?.miles_max).toBeUndefined();
    });
  });

  describe("reserved_for", () => {
    it("is stripped and never present in parsed output", () => {
      const raw = { name: "x", reserved_for: "buyer@example.com" };
      const result = parse(raw);
      expect("reserved_for" in result).toBe(false);
    });
  });

  describe("defaults for optional string/array fields", () => {
    it("tags defaults to []", () => {
      expect(parse({ name: "x" }).tags).toEqual([]);
    });

    it("preferred_payment defaults to []", () => {
      expect(parse({ name: "x" }).preferred_payment).toEqual([]);
    });

    it("brand/model/color default to ''", () => {
      const r = parse({ name: "x" });
      expect(r.brand).toBe("");
      expect(r.model).toBe("");
      expect(r.color).toBe("");
    });
  });
});

describe("categoryJsonSchema", () => {
  it("parses a full category", () => {
    const raw = {
      display_name: "Electronics",
      description: "Gadgets",
      icon: "💻",
      sort_order: 1,
    };
    const r = categoryJsonSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.display_name).toBe("Electronics");
      expect(r.data.sort_order).toBe(1);
    }
  });

  it("defaults all fields when absent", () => {
    const r = categoryJsonSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.display_name).toBe("");
      expect(r.data.sort_order).toBeNull();
    }
  });
});
