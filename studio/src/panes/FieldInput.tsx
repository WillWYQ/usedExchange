import type { FieldDescriptor } from "../fields";

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

// Shared by EditForm and DefaultsPane: one field's label + input, rendered by
// kind. `disabled` dims and locks the inputs — DefaultsPane uses it for
// fields whose enable switch is off.
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDescriptor;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{field.label}</span>
      {field.kind === "textarea" ? (
        <textarea rows={3} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === "boolean" ? (
        <input
          type="checkbox"
          checked={value === "true"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        />
      ) : field.kind === "select" ? (
        <select
          value={value}
          disabled={disabled}
          className={
            value !== "" && field.options !== undefined && !field.options.includes(value)
              ? "field-offlist"
              : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {value !== "" && field.options !== undefined && !field.options.includes(value) && (
            <option value={value}>{value}</option>
          )}
        </select>
      ) : field.kind === "stringList" ? (
        <textarea rows={2} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type={field.kind === "date" ? "date" : "text"}
          inputMode={field.kind === "number" || field.kind === "integer" ? "decimal" : undefined}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint !== undefined && <span className="field-hint">{field.hint}</span>}
    </label>
  );
}
