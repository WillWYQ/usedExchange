// The two conversions between an on-disk JSON value and the string an <input>
// holds. They live outside FieldInput.tsx because editForm.ts — a pure module
// with no React in it — needs them too, and a pure module must not import a
// component to reach two string functions.

import type { FieldDescriptor } from "./fields";

/** The on-disk value rendered as the string an input holds. */
export function toInput(value: unknown, kind: FieldDescriptor["kind"]): string {
  if (value === undefined || value === null) return "";
  if (kind === "stringList") return Array.isArray(value) ? value.join("\n") : String(value);
  if (kind === "boolean") return value === true ? "true" : "false";
  return String(value);
}

/**
 * The input string turned back into the JSON value the API will receive.
 * Returns { error } rather than throwing so one bad field reports itself
 * without discarding the seller's other edits.
 */
export function fromInput(
  raw: string,
  kind: FieldDescriptor["kind"],
): { value: unknown } | { error: string } {
  const trimmed = raw.trim();
  switch (kind) {
    case "boolean":
      return { value: raw === "true" };
    case "stringList":
      return { value: raw.split("\n").map((l) => l.trim()).filter((l) => l !== "") };
    case "number":
    case "integer": {
      // Empty means "not set", which item.json spells as null.
      if (trimmed === "") return { value: null };
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { error: "must be a number" };
      if (kind === "integer" && !Number.isInteger(n)) return { error: "must be a whole number" };
      return { value: n };
    }
    case "date":
      return { value: trimmed === "" ? null : trimmed };
    default:
      return { value: raw };
  }
}
