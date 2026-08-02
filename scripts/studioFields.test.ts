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
import { isEditableField, resolveFieldSchema } from "./lib/itemFields";

type FieldDescriptor = {
  path: (string | number)[];
  label: string;
  kind: string;
  options?: readonly string[];
  hint?: string;
};
type FieldGroup = { title: string; fields: FieldDescriptor[] };

type FieldsModule = {
  FIELD_GROUPS: readonly FieldGroup[];
  WHOLE_OBJECT_GROUPS: Readonly<Record<string, string>>;
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

  it("group order and titles match the spec's grouping", () => {
    const { FIELD_GROUPS } = loadFields();
    expect(FIELD_GROUPS.map((g) => g.title)).toEqual([
      "Basic",
      "Price",
      "Specs",
      "Platform",
      "Student",
      "Translations",
    ]);
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

  it("EditForm sends tiers as one whole-array edit and never sends blank selects", () => {
    const source = readFileSync(path.join(ROOT, "studio/src/panes/EditForm.tsx"), "utf-8");
    expect(source).toContain('{ path: ["price", "tiers"], value: rows }');
    // Blank select means "no change" — never sent (strict enums reject "").
    expect(source).toContain('if (next === "" && field.kind === "select") continue;');
    // Off-list on-disk values are rendered raw, not snapped to a legal option.
    expect(source).toContain("field-offlist");
  });
});
