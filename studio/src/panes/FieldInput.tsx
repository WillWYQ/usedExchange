import type { FieldDescriptor } from "../fields";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

// Shared by EditForm and DefaultsPane: one field's label + input, rendered by
// kind. `disabled` dims and locks the inputs — DefaultsPane uses it for
// fields whose enable switch is off.
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
  dirty,
}: {
  field: FieldDescriptor;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Marks the label when this field differs from what is on disk. */
  dirty?: boolean;
}) {
  const { t } = useStudioT();
  return (
    <label className="field">
      <span className="field-label">
        {t(field.labelKey as StudioKey)}
        {dirty === true && (
          <>
            {/* Colour alone must not carry the meaning: a glyph for sighted
                users, real text for a screen reader. */}
            <span className="field-dot" aria-hidden="true">
              ●
            </span>
            <span className="visually-hidden"> (unsaved)</span>
          </>
        )}
      </span>
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
      {field.hintKey !== undefined && <span className="field-hint">{t(field.hintKey as StudioKey)}</span>}
    </label>
  );
}
