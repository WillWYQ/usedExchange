// Surgical field edits for item.json, which is JSONC: it carries `// options: ...`
// comments written by `pnpm create-item`, and may carry `reserved_for` (private
// buyer info — Iron Rule 4). A parse/stringify round trip would delete both, and
// lib/content/schema.ts strips reserved_for by design, so a Zod round trip is
// especially destructive here. modify/applyEdits touch only the target range.

import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
// Relative, not "@/…": this module is reachable from studio/vite.config.ts's
// config graph (via studioApi.ts), where the "@/" alias does not resolve. See
// the comment at the top of studioApi.ts's imports for the full explanation.
import {
  assertEditableValue,
  EDITABLE_TOP_LEVEL_FIELDS,
  isEditableField,
} from "./itemFields";

export type FieldEdit = { path: (string | number)[]; value: unknown };

// Re-exported so existing importers of isEditableField keep working; the
// allowlist itself now lives in itemFields.ts, where it also carries each
// field's strict value schema.
export { isEditableField };

const FORMATTING_OPTIONS = { tabSize: 2, insertSpaces: true, eol: "\n" };

/**
 * Applies every edit to `text` and returns the new text. Validates every path
 * AND every value up front, so a rejected batch leaves the file untouched
 * rather than half-written.
 */
export function applyFieldEdits(text: string, edits: FieldEdit[]): string {
  for (const edit of edits) {
    assertEditableValue(edit.path, edit.value);
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

/**
 * The editable fields present in `text`, for the studio form.
 *
 * A PICK list, not an omit list (Iron Rule 4). reserved_for is excluded because
 * it is not in itemJsonSchema, and so is any other private field added to
 * item.json later — without anyone remembering to update a deny list here.
 *
 * Values are returned exactly as they appear on disk, NOT run through Zod: the
 * form's job is to show the seller what the file actually says so they can
 * correct it. A coerced view would render a typo'd status as "available" and
 * the seller would never see the problem.
 */
export function readItemForEdit(text: string): Record<string, unknown> {
  const raw = parseJsonc(text) as Record<string, unknown> | undefined;
  if (raw === undefined || raw === null || typeof raw !== "object") return {};

  const out: Record<string, unknown> = {};
  for (const field of EDITABLE_TOP_LEVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      out[field] = raw[field];
    }
  }
  return out;
}
