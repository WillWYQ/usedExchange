// Surgical field edits for item.json, which is JSONC: it carries `// options: ...`
// comments written by `pnpm create-item`, and may carry `reserved_for` (private
// buyer info — Iron Rule 4). A parse/stringify round trip would delete both, and
// lib/content/schema.ts strips reserved_for by design, so a Zod round trip is
// especially destructive here. modify/applyEdits touch only the target range.

import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
import { itemJsonSchema } from "@/lib/content/schema";

export type FieldEdit = { path: (string | number)[]; value: unknown };

// The allowlist is derived from the schema itself, so it stays in sync with
// docs/DESIGN.md §5 automatically. reserved_for is absent from the schema, which
// is exactly why it lands on the wrong side of this check.
const EDITABLE_TOP_LEVEL_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(itemJsonSchema.shape),
);

const FORMATTING_OPTIONS = { tabSize: 2, insertSpaces: true, eol: "\n" };

export function isEditableField(path: (string | number)[]): boolean {
  const head = path[0];
  return typeof head === "string" && EDITABLE_TOP_LEVEL_FIELDS.has(head);
}

/**
 * Applies every edit to `text` and returns the new text. Throws before writing
 * anything if any edit targets a field outside the schema allowlist, so a
 * partially-applied batch is impossible.
 */
export function applyFieldEdits(text: string, edits: FieldEdit[]): string {
  for (const edit of edits) {
    if (!isEditableField(edit.path)) {
      throw new Error(
        `Refusing to write field outside the item.json schema: "${edit.path.join(".")}"`,
      );
    }
  }

  let next = text;
  for (const edit of edits) {
    next = applyEdits(
      next,
      modify(next, edit.path, edit.value, { formattingOptions: FORMATTING_OPTIONS }),
    );
  }
  return next;
}

/** Reads one top-level field out of JSONC text without mutating it. */
export function readItemField(text: string, field: string): unknown {
  const raw = parseJsonc(text) as Record<string, unknown> | undefined;
  return raw?.[field];
}
