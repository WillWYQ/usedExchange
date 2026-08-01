import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { assertEditableValue } from "./itemFields";
import { applyFieldEdits, isEditableField, readItemField, readItemForEdit } from "./itemEdit";
import { buildItemTemplate } from "./itemTemplate";

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

  // Iron Rule 4 ("never returned by an API") applies at every depth, not just
  // the top level. readItemForEdit used to pick top-level keys and then hand
  // the nested value through verbatim, so reserved_for smuggled inside price,
  // dimensions, or a price.tiers entry survived the pick untouched. These
  // three cover the nesting shapes the grammar actually declares.
  it("never returns reserved_for nested inside price", () => {
    const doc = `{ "name": "x", "price": { "currency": "USD", "reserved_for": "a@b" } }`;
    const price = readItemForEdit(doc)["price"] as Record<string, unknown>;
    expect(Object.keys(price)).not.toContain("reserved_for");
    expect(price["currency"]).toBe("USD");
  });

  it("never returns reserved_for nested inside dimensions", () => {
    const doc = `{
      "name": "x",
      "dimensions": { "length": 1, "width": 2, "height": 3, "unit": "cm", "reserved_for": "a@b" }
    }`;
    const dimensions = readItemForEdit(doc)["dimensions"] as Record<string, unknown>;
    expect(Object.keys(dimensions)).not.toContain("reserved_for");
    expect(dimensions["length"]).toBe(1);
  });

  it("never returns reserved_for nested inside a price.tiers entry", () => {
    const doc = `{
      "name": "x",
      "price": { "tiers": [{ "label": "Pickup", "amount": 10, "reserved_for": "a@b" }] }
    }`;
    const price = readItemForEdit(doc)["price"] as Record<string, unknown>;
    const tiers = price["tiers"] as Record<string, unknown>[];
    const tier = tiers[0];
    if (tier === undefined) throw new Error("expected a tier at index 0");
    expect(Object.keys(tier)).not.toContain("reserved_for");
    expect(tier["amount"]).toBe(10);
  });
});

describe("round-trip against this repo's real item.json files", () => {
  // The regression test for CRITICAL 1/2 as a class (task-1-findings.md): every
  // field readItemForEdit shows a seller must itself satisfy
  // assertEditableValue, or "studio can edit this project's own data" is a
  // hope, not a test. Walks every item.json actually checked into
  // content/items/ plus a freshly built `pnpm create-item` template (whose
  // dimensions/weight placeholder is the null-leaves shape Critical 1 covers).
  function findItemJsonFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...findItemJsonFiles(full));
      } else if (entry.isFile() && entry.name === "item.json") {
        out.push(full);
      }
    }
    return out;
  }

  const contentRoot = path.join(process.cwd(), "content", "items");
  const realFiles = findItemJsonFiles(contentRoot).map(
    (file) => [path.relative(contentRoot, file), readFileSync(file, "utf8")] as const,
  );
  const templateText = JSON.stringify(buildItemTemplate("Test item", "2026-08-01"));

  it("found at least one real item.json to check", () => {
    // A guard against this test silently checking nothing if content/items/
    // ever moves or the fixture data is deleted.
    expect(realFiles.length).toBeGreaterThan(0);
  });

  it.each([...realFiles, ["buildItemTemplate placeholder", templateText] as const])(
    "every field readItemForEdit returns for %s round-trips through assertEditableValue",
    (_label, text) => {
      const fields = readItemForEdit(text);
      for (const [fieldPath, value] of Object.entries(fields)) {
        expect(() => assertEditableValue([fieldPath], value)).not.toThrow();
      }
    },
  );
});
