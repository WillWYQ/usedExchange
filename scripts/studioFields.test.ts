// Drives EditForm's rendering contract without a DOM: these are the exact
// paths the server grammar (scripts/lib/itemFields.ts) accepts, the enum sets
// the strict schemas allow, and the whole-object grouping ledger item 1
// requires. Vitest runs from the repo root (process.cwd()), matching
// scripts/lib/studioApi.test.ts.
//
// fields.ts is transpiled with the TypeScript compiler API rather than
// imported through Vite's module graph: the repo path contains a space,
// which breaks Vite's file-URL resolution here, and everything in fields.ts
// is type-only or plain value code a transpile handles in one pass.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { assertEditableValue, isEditableField, resolveFieldSchema } from "./lib/itemFields";

type FieldDescriptor = {
  path: (string | number)[];
  label: string;
  kind: string;
  options?: readonly string[];
  hint?: string;
};
type FieldGroup = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  fields: FieldDescriptor[];
};

type FieldsModule = {
  FIELD_GROUPS: readonly FieldGroup[];
  WHOLE_OBJECT_GROUPS: Readonly<Record<string, string>>;
  WHOLE_OBJECT_SEEDS: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  pathKey: (p: (string | number)[]) => string;
  readAtPath: (o: Record<string, unknown>, p: (string | number)[]) => unknown;
};

const ROOT = process.cwd();

function loadFields(): FieldsModule {
  const source = readFileSync(path.join(ROOT, "studio/src/fields.ts"), "utf-8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  // `mod`, not `module`: @next/next/no-assign-module-variable rejects writing
  // to a binding named `module` even in a script.
  const mod = { exports: {} as Record<string, unknown> };
  const run = new Function("module", "exports", outputText) as (
    m: typeof mod,
    e: Record<string, unknown>,
  ) => void;
  run(mod, mod.exports);
  return mod.exports as unknown as FieldsModule;
}

describe("studio field descriptors (Task 6)", () => {
  it("every descriptor path resolves in the strict grammar", () => {
    const { FIELD_GROUPS } = loadFields();
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        // A leaf inside a whole-object group is never SENT as a leaf edit,
        // but it must still be a path the grammar knows — a typo here would
        // build a whole object carrying a key the strict object schema
        // rejects, surfacing as a 400 naming the parent path.
        assert.equal(
          isEditableField(field.path),
          true,
          `${group.title} / ${field.label} (${field.path.join(".")}) is not an editable path`,
        );
      }
    }
  });

  it("select options match the strict enums exactly", () => {
    const { FIELD_GROUPS } = loadFields();
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        if (field.kind !== "select") continue;
        const schema = resolveFieldSchema(field.path);
        expect(schema).not.toBeNull();
        for (const opt of field.options ?? []) {
          const parsed = schema?.safeParse(opt);
          expect(
            parsed?.success,
            `${field.path.join(".")} option "${opt}" fails the strict schema`,
          ).toBe(true);
        }
      }
    }
  });

  it("group ids, order and titles match the spec's grouping", () => {
    const { FIELD_GROUPS } = loadFields();
    expect(FIELD_GROUPS.map((g) => g.id)).toEqual([
      "listing",
      "price",
      "translations",
      "specs",
      "payment",
      "books",
      "extras",
      "dates",
    ]);
    expect(FIELD_GROUPS.map((g) => g.title)).toEqual([
      "Listing",
      "Price",
      "Translations",
      "Specs",
      "Payment & pickup",
      "Books & courses",
      "Extras",
      "Dates",
    ]);
    // Only the two groups a seller touches on an ordinary edit start open;
    // the rest render as <details> the seller opens on demand.
    expect(FIELD_GROUPS.filter((g) => g.defaultOpen === true).map((g) => g.id)).toEqual([
      "listing",
      "price",
    ]);
  });

  // The 2026-08-05 regrouping moved descriptors between groups and reordered
  // them. It must not have created or dropped one on the way: a lost
  // descriptor is a field the seller can no longer edit from Studio at all.
  it("re-grouping neither added nor dropped a descriptor", () => {
    const { FIELD_GROUPS } = loadFields();
    const paths = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.path.join(".")));
    // 43 leaf descriptors covering the schema's 36 editable fields — the
    // nested price/dimensions/weight objects contribute one descriptor per
    // leaf.
    expect(paths.length).toBe(43);
    expect(new Set(paths).size).toBe(43);
  });

  it("whole-object groups are exactly dimensions and weight", () => {
    const { WHOLE_OBJECT_GROUPS } = loadFields();
    expect(Object.keys(WHOLE_OBJECT_GROUPS).sort()).toEqual(["dimensions", "weight"]);
  });

  it("every whole-object leaf descriptor belongs to a whole-object group", () => {
    const { FIELD_GROUPS, WHOLE_OBJECT_GROUPS } = loadFields();
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const head = field.path[0];
        if ((head === "dimensions" || head === "weight") && field.path.length > 1) {
          expect(head in WHOLE_OBJECT_GROUPS, `${field.path.join(".")} bypasses whole-object sending`).toBe(true);
        }
      }
    }
  });

  it("pathKey / readAtPath round-trip nested values", () => {
    const { pathKey, readAtPath } = loadFields();
    expect(pathKey(["price", "tiers"])).toBe("price.tiers");
    expect(readAtPath({ price: { currency: "USD" } }, ["price", "currency"])).toBe("USD");
    expect(readAtPath({ price: null }, ["price", "currency"])).toBeUndefined();
    expect(readAtPath({}, ["dimensions", "length"])).toBeUndefined();
  });

  it("EditForm sends tiers as one whole-array edit", () => {
    const source = readFileSync(path.join(ROOT, "studio/src/panes/EditForm.tsx"), "utf-8");
    expect(source).toContain('{ path: ["price", "tiers"], value: tierRows }');
    // "a blank select is never sent" used to be asserted here as a source
    // string. buildEdits now lives in studio/src/editForm.ts and
    // studio/src/editForm.test.ts asserts the behaviour itself, which is the
    // same guarantee verified properly.
    //
    // Off-list on-disk values are rendered raw, not snapped to a legal
    // option. The per-field rendering moved from EditForm into FieldInput
    // when the two were split for the defaults feature.
    const fieldInput = readFileSync(path.join(ROOT, "studio/src/panes/FieldInput.tsx"), "utf-8");
    expect(fieldInput).toContain("field-offlist");
  });

  // Final review, Important 2: every item.json in this repo lacks a
  // dimensions object, so the whole-object merge started from {} and a
  // single-leaf edit produced {length:5} — rejected by the strict schema with
  // three anonymous "Required"s. The merge base for an absent (or corrupt)
  // object must be the template's null-leaf shape, leaving only `unit` for
  // the seller to choose.
  it("whole-object seeds cover every group and satisfy the grammar once a unit is chosen", () => {
    const { WHOLE_OBJECT_GROUPS, WHOLE_OBJECT_SEEDS } = loadFields();
    expect(Object.keys(WHOLE_OBJECT_SEEDS).sort()).toEqual(Object.keys(WHOLE_OBJECT_GROUPS).sort());

    const unitFor: Record<string, string> = { dimensions: "cm", weight: "kg" };
    for (const [head, seed] of Object.entries(WHOLE_OBJECT_SEEDS)) {
      for (const key of Object.keys(seed)) {
        assert.equal(isEditableField([head, key]), true, `${head}.${key} is not a grammar leaf`);
      }
      // The seed itself deliberately omits `unit` (the seller must pick one);
      // with any legal unit added, the whole object must pass the strict
      // schema exactly as EditForm will send it.
      expect(() =>
        assertEditableValue([head], { ...seed, unit: unitFor[head] }),
      ).not.toThrow();
    }
  });

  it("editForm seeds a missing object from WHOLE_OBJECT_SEEDS and asks for a unit", () => {
    const source = readFileSync(path.join(ROOT, "studio/src/editForm.ts"), "utf-8");
    expect(source).toContain("WHOLE_OBJECT_SEEDS[head]");
    expect(source).toContain("pick a unit");
  });
});
