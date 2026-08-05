import { describe, expect, it } from "vitest";
import type { ItemFields } from "./api";
import {
  buildEdits,
  computeDirtyKeys,
  dirtyCountByGroup,
  draftFromFields,
  fieldIsDirty,
  filledCountByGroup,
  problemGroupIds,
} from "./editForm";
import { FIELD_GROUPS, pathKey, type FieldDescriptor } from "./fields";

function descriptor(path: (string | number)[]): FieldDescriptor {
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (pathKey(field.path) === pathKey(path)) return field;
    }
  }
  throw new Error(`no descriptor for ${pathKey(path)}`);
}

/** A loaded item plus the untouched draft the form would show for it. */
function form(fields: ItemFields): { loaded: ItemFields; draft: Record<string, string> } {
  return { loaded: fields, draft: draftFromFields(fields) };
}

const BASE: ItemFields = {
  name: "Desk lamp",
  status: "available",
  condition: "good",
  quantity: 1,
  description: "Works fine.",
  tags: ["lamp", "desk"],
  price: { currency: "USD", negotiable: true, tiers: [{ label: "Flat", amount: 20 }] },
  brand: "IKEA",
};

describe("draftFromFields", () => {
  it("produces one string per descriptor", () => {
    const draft = draftFromFields(BASE);
    const paths = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => pathKey(f.path)));
    expect(Object.keys(draft).sort()).toEqual([...paths].sort());
    for (const value of Object.values(draft)) expect(typeof value).toBe("string");
  });

  it("renders absent values as empty, booleans as true/false, lists newline-joined", () => {
    const draft = draftFromFields(BASE);
    expect(draft["model"]).toBe("");
    expect(draft["sold_date"]).toBe("");
    expect(draft["price.negotiable"]).toBe("true");
    // An absent boolean is "" (not "false"): the checkbox reads unchecked
    // either way, but "" keeps "the key is not in the file" distinct from
    // "the key is in the file, set to false", so an untouched absent flag is
    // never written out as an explicit false.
    expect(draft["price.show_tiers"]).toBe("");
    expect(draftFromFields({ price: { show_tiers: false } })["price.show_tiers"]).toBe("false");
    expect(draft["tags"]).toBe("lamp\ndesk");
  });
});

describe("fieldIsDirty", () => {
  it("is false for an untouched field", () => {
    const { loaded, draft } = form(BASE);
    expect(fieldIsDirty(descriptor(["name"]), loaded, draft)).toBe(false);
  });

  it("is true once the text differs from disk", () => {
    const { loaded, draft } = form(BASE);
    expect(fieldIsDirty(descriptor(["name"]), loaded, { ...draft, name: "Floor lamp" })).toBe(true);
  });

  it("treats a blank select as no change, not as a clear", () => {
    // The strict enums accept no empty value, so "—" is only ever shown.
    const { loaded, draft } = form(BASE);
    expect(fieldIsDirty(descriptor(["status"]), loaded, { ...draft, status: "" })).toBe(false);
    expect(fieldIsDirty(descriptor(["condition"]), loaded, { ...draft, condition: "" })).toBe(false);
  });

  it("counts a retyped number with surrounding spaces as changed", () => {
    // Known and harmless: the string differs, so it re-sends the same 1.
    // Documented here rather than special-cased, because the whole point of
    // this predicate is that it is the same one buildEdits uses.
    const { loaded, draft } = form(BASE);
    expect(fieldIsDirty(descriptor(["quantity"]), loaded, { ...draft, quantity: " 1 " })).toBe(true);
    expect(buildEdits(loaded, { ...draft, quantity: " 1 " }).edits).toEqual([
      { path: ["quantity"], value: 1 },
    ]);
  });
});

describe("computeDirtyKeys", () => {
  it("returns exactly the changed keys", () => {
    const { loaded, draft } = form(BASE);
    const keys = computeDirtyKeys(loaded, {
      ...draft,
      name: "Floor lamp",
      "price.currency": "EUR",
      status: "",
    });
    expect([...keys].sort()).toEqual(["name", "price.currency"]);
  });

  it("is empty for an untouched form", () => {
    const { loaded, draft } = form(BASE);
    expect(computeDirtyKeys(loaded, draft).size).toBe(0);
  });
});

describe("dirtyCountByGroup / filledCountByGroup", () => {
  it("buckets unsaved changes by group id", () => {
    const { loaded, draft } = form(BASE);
    const keys = computeDirtyKeys(loaded, { ...draft, name: "X", isbn: "978", course: "CS61A" });
    const counts = dirtyCountByGroup(keys);
    expect(counts["listing"]).toBe(1);
    expect(counts["books"]).toBe(2);
    expect(counts["specs"]).toBe(0);
  });

  it("counts fields that already hold something on disk", () => {
    const counts = filledCountByGroup(BASE);
    // name, status, condition, quantity, description, tags — all six set.
    expect(counts["listing"]).toBe(6);
    // brand only; empty strings, nulls and empty arrays do not count.
    expect(counts["specs"]).toBe(1);
    expect(counts["books"]).toBe(0);
    expect(filledCountByGroup({ tags: [], model: "" })["specs"]).toBe(0);
  });
});

describe("buildEdits", () => {
  it("sends only the changed leaves", () => {
    const { loaded, draft } = form(BASE);
    const { edits, problems } = buildEdits(loaded, {
      ...draft,
      name: "Floor lamp",
      "price.currency": "EUR",
    });
    expect(problems).toEqual([]);
    expect(edits).toEqual([
      { path: ["name"], value: "Floor lamp" },
      { path: ["price", "currency"], value: "EUR" },
    ]);
  });

  it("never sends a blank select", () => {
    const { loaded, draft } = form(BASE);
    const { edits, problems } = buildEdits(loaded, { ...draft, status: "", condition: "" });
    expect(edits).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("reports a bad number by name and still sends the other edits", () => {
    const { loaded, draft } = form(BASE);
    const { edits, problems } = buildEdits(loaded, {
      ...draft,
      age_years: "quite old",
      name: "Floor lamp",
    });
    expect(edits).toEqual([{ path: ["name"], value: "Floor lamp" }]);
    expect(problems).toEqual([
      { label: "Age (years)", message: "must be a number", groupId: "specs" },
    ]);
    expect([...problemGroupIds(problems)]).toEqual(["specs"]);
  });

  it("rejects a fractional quantity as a whole-number field", () => {
    const { loaded, draft } = form(BASE);
    const { edits, problems } = buildEdits(loaded, { ...draft, quantity: "1.5" });
    expect(edits).toEqual([]);
    expect(problems).toEqual([
      { label: "Quantity", message: "must be a whole number", groupId: "listing" },
    ]);
  });

  it("asks for a unit when a dimension is set on an item with no dimensions object", () => {
    const { loaded, draft } = form(BASE);
    const { edits, problems } = buildEdits(loaded, { ...draft, "dimensions.length": "40" });
    expect(edits).toEqual([]);
    expect(problems).toEqual([
      { label: "Size unit", message: "pick a unit to set dimensions", groupId: "specs" },
    ]);
  });

  it("merges the seed into one whole-object edit once a unit is chosen", () => {
    const { loaded, draft } = form(BASE);
    const { edits, problems } = buildEdits(loaded, {
      ...draft,
      "dimensions.length": "40",
      "dimensions.unit": "cm",
    });
    expect(problems).toEqual([]);
    // One edit at the object head, never a partial leaf write: a
    // {"length": 40} on disk is .catch()ed to null by the site schema.
    expect(edits).toEqual([
      { path: ["dimensions"], value: { length: 40, width: null, height: null, unit: "cm" } },
    ]);
  });

  it("merges into an existing object rather than replacing it", () => {
    const fields: ItemFields = {
      ...BASE,
      dimensions: { length: 10, width: 20, height: 30, unit: "cm" },
    };
    const { loaded, draft } = form(fields);
    const { edits } = buildEdits(loaded, { ...draft, "dimensions.width": "25" });
    expect(edits).toEqual([
      { path: ["dimensions"], value: { length: 10, width: 25, height: 30, unit: "cm" } },
    ]);
  });

  it("asks for a weight unit the same way", () => {
    const { loaded, draft } = form(BASE);
    const { problems } = buildEdits(loaded, { ...draft, "weight.value": "3" });
    expect(problems).toEqual([
      { label: "Weight unit", message: "pick a unit to set a weight", groupId: "specs" },
    ]);
  });

  it("sends nothing for an untouched form", () => {
    const { loaded, draft } = form(BASE);
    expect(buildEdits(loaded, draft)).toEqual({ edits: [], problems: [] });
  });
});
