import { useCallback, useEffect, useState } from "react";
import { fetchConfig, saveConfigValue, type ConfigField } from "../api";
import { Button } from "../components/Button";
import { useDialogBehavior } from "../components/useDialogBehavior";

// Getting these wrong doesn't just look wrong — it breaks the build or takes
// every image offline. The pane says so next to the input rather than letting
// the seller find out at deploy time.
const DANGER_FIELDS: Readonly<Record<string, string>> = {
  deploymentMode: "Wrong value here and the site builds for the wrong host — check your deploy target before changing.",
  baseUrl: "Used for canonical URLs, sitemap and social previews. A wrong value ships broken links.",
  "imageStorage.provider": "Switching providers makes every existing image URL point somewhere new — photos go missing until you re-sync.",
};

// The file's own translations block is 87 of its ~118 editable values. Flat,
// it would bury every real setting, so it collapses into one group.
const COLLAPSED_SECTIONS = new Set(["UI translations"]);

/** The field's label: the last path segment, spaced and capitalised. */
function labelFor(path: string): string {
  const last = path.split(".").pop() ?? path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Groups fields by section, preserving the order the file declares them in. */
function groupBySection(fields: ConfigField[]): Array<{ section: string; fields: ConfigField[] }> {
  const groups: Array<{ section: string; fields: ConfigField[] }> = [];
  for (const field of fields) {
    const section = field.section === "" ? "Other" : field.section;
    const existing = groups.find((g) => g.section === section);
    if (existing === undefined) groups.push({ section, fields: [field] });
    else existing.fields.push(field);
  }
  return groups;
}

/** The editing string for a field's current value. */
function toInput(field: ConfigField): string {
  if (field.value === null) return "";
  return String(field.value);
}

/**
 * Turns the input string back into the typed value the API expects.
 * Returns { error } rather than throwing so one bad field reports itself
 * without disturbing the rest of the pane.
 */
function fromInput(field: ConfigField, raw: string): { value: string | number | boolean } | { error: string } {
  if (field.kind === "number") {
    const trimmed = raw.trim();
    if (trimmed === "") return { error: "must be a number" };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { error: "must be a number" };
    return { value: n };
  }
  if (field.kind === "boolean") return { value: raw === "true" };
  return { value: raw };
}

function FieldRow({
  field,
  onSaved,
}: {
  field: ConfigField;
  onSaved: (fields: ConfigField[]) => void;
}) {
  const [raw, setRaw] = useState(() => toInput(field));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The pane reloads the whole list after every save, which replaces this
  // field's props; resync so the input shows disk, not a stale draft.
  useEffect(() => {
    setRaw(toInput(field));
    setError(null);
  }, [field]);

  const readOnly = field.kind === "unsupported";
  const dirty = !readOnly && raw !== toInput(field);
  const danger = DANGER_FIELDS[field.path];

  async function save() {
    const parsed = fromInput(field, raw);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await saveConfigValue(field.path, parsed.value));
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="config-row">
      <label className="field">
        <span className="field-label">
          {labelFor(field.path)}
          {dirty && (
            <>
              <span className="field-dot" aria-hidden="true">
                ●
              </span>
              <span className="visually-hidden"> (unsaved)</span>
            </>
          )}
        </span>

        {readOnly ? (
          <input type="text" value="(edit this field in content/config.ts)" disabled readOnly />
        ) : field.kind === "enum" ? (
          <select value={raw} disabled={busy} onChange={(e) => setRaw(e.target.value)}>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.kind === "boolean" ? (
          <input
            type="checkbox"
            checked={raw === "true"}
            disabled={busy}
            onChange={(e) => setRaw(e.target.checked ? "true" : "false")}
          />
        ) : (
          <input
            type="text"
            inputMode={field.kind === "number" ? "decimal" : undefined}
            value={raw}
            disabled={busy}
            onChange={(e) => setRaw(e.target.value)}
          />
        )}

        <span className="field-hint">
          <code className="config-path">{field.path}</code>
          {field.doc !== undefined && ` — ${field.doc}`}
        </span>
      </label>

      {!readOnly && (
        <div className="config-row-actions">
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
          {saved && !dirty && <span className="config-saved">Saved.</span>}
        </div>
      )}

      {danger !== undefined && !readOnly && (
        <p className="config-danger">
          <strong>Careful:</strong> {danger}
        </p>
      )}
      {readOnly && (
        <p className="field-hint">
          Arrays and structured values are read-only here — edit them directly in{" "}
          <code>content/config.ts</code>.
        </p>
      )}
      {error !== null && (
        <p role="alert" className="alert-error config-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConfigPane({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogBehavior(onClose);
  const [fields, setFields] = useState<ConfigField[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setFields(await fetchConfig());
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const groups = fields === null ? [] : groupBySection(fields);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog config-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Site config"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Site config</h2>
        <p className="field-hint">
          Edits go straight into <code>content/config.ts</code>. Your comments in that file are
          preserved, and a change that would break the build is rejected before it lands.
        </p>

        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}

        {fields === null && error === null && (
          <div aria-busy="true" aria-label="Loading site config">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {fields !== null &&
          groups.map((group) =>
            COLLAPSED_SECTIONS.has(group.section) ? (
              <details key={group.section}>
                <summary>
                  {group.section} ({group.fields.length})
                </summary>
                <fieldset>
                  {group.fields.map((f) => (
                    <FieldRow key={f.path} field={f} onSaved={setFields} />
                  ))}
                </fieldset>
              </details>
            ) : (
              <fieldset key={group.section}>
                <legend>{group.section}</legend>
                {group.fields.map((f) => (
                  <FieldRow key={f.path} field={f} onSaved={setFields} />
                ))}
              </fieldset>
            ),
          )}

        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
