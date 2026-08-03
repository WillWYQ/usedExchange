import { useCallback, useEffect, useState } from "react";
import { fetchDefaults, saveDefaults } from "../api";
import { FIELD_GROUPS, pathKey, readAtPath, type FieldGroup } from "../fields";
import { FieldInput, fromInput, toInput } from "./FieldInput";

// name/status/listed_date/sold_date belong to each item, never to a template;
// the server rejects them too (scripts/lib/itemDefaults.ts). This set only
// keeps the panel from offering them.
const NEVER_DEFAULTABLE = new Set(["name", "status", "listed_date", "sold_date"]);

// The groups sellers retype most (price structure and the transaction fields)
// lead; everything else stays collapsed until opened.
const PINNED_GROUPS = new Set(["Price", "Platform"]);

const DEFAULTABLE_GROUPS: FieldGroup[] = FIELD_GROUPS.map((group) => ({
  ...group,
  fields: group.fields.filter((f) => {
    const head = f.path[0];
    return typeof head === "string" && !NEVER_DEFAULTABLE.has(head);
  }),
})).filter((group) => group.fields.length > 0);

const SORTED_GROUPS: FieldGroup[] = [
  ...DEFAULTABLE_GROUPS.filter((g) => PINNED_GROUPS.has(g.title)),
  ...DEFAULTABLE_GROUPS.filter((g) => !PINNED_GROUPS.has(g.title)),
];

type FieldState = { enabled: boolean; raw: string };

// Writes a leaf value into a sparse defaults object, creating the nested
// object for price/dimensions/weight paths on the way down. Defaults stay
// sparse: only enabled fields ever reach this function.
function writeAtPath(
  target: Record<string, unknown>,
  fieldPath: readonly (string | number)[],
  value: unknown,
): void {
  let cursor = target;
  for (let i = 0; i < fieldPath.length - 1; i++) {
    const segment = fieldPath[i];
    if (typeof segment !== "string") return;
    const next = cursor[segment];
    if (typeof next === "object" && next !== null && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      cursor[segment] = created;
      cursor = created;
    }
  }
  const last = fieldPath[fieldPath.length - 1];
  if (typeof last === "string") cursor[last] = value;
}

function formatInherited(value: unknown): string {
  const text = Array.isArray(value)
    ? value.join(", ")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function DefaultsPane({
  categories,
  onClose,
  onSaved,
}: {
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState("site");
  const [siteDefaults, setSiteDefaults] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, FieldState>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextScope: string) => {
    setLoaded(false);
    setError(null);
    setSaved(false);
    const current = await fetchDefaults(nextScope);
    setSiteDefaults(nextScope === "site" ? current : await fetchDefaults("site"));
    const nextDraft: Record<string, FieldState> = {};
    for (const group of SORTED_GROUPS) {
      for (const field of group.fields) {
        const value = readAtPath(current, field.path);
        nextDraft[pathKey(field.path)] = { enabled: value !== undefined, raw: toInput(value, field.kind) };
      }
    }
    setDraft(nextDraft);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load(scope).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [scope, load]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const out: Record<string, unknown> = {};
    const problems: string[] = [];
    for (const group of SORTED_GROUPS) {
      for (const field of group.fields) {
        const state = draft[pathKey(field.path)];
        if (state === undefined || !state.enabled) continue;
        // An enabled select with no choice would send "" and 400 server-side;
        // say so by the field's own name instead.
        if (field.kind === "select" && state.raw === "") {
          problems.push(`${field.label}: pick a value or switch the field off`);
          continue;
        }
        const parsed = fromInput(state.raw, field.kind);
        if ("error" in parsed) {
          problems.push(`${field.label}: ${parsed.error}`);
          continue;
        }
        writeAtPath(out, field.path, parsed.value);
      }
    }
    if (problems.length > 0) {
      setError(problems.join("; "));
      setBusy(false);
      return;
    }
    try {
      await saveDefaults(scope, out);
      setSaved(true);
      onSaved();
      // Re-read from disk after the write, same rule as EditForm.
      await load(scope);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog defaults-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Item defaults"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Item defaults</h2>
        <p className="field-hint">
          New items start with these values. Category defaults override site-wide ones; name,
          status and dates always start fresh.
        </p>
        {error !== null && <p role="alert">{error}</p>}
        {saved && <p className="form-saved">Saved.</p>}

        <div className="defaults-scopes" role="tablist" aria-label="Defaults scope">
          {["site", ...categories].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? "tab tab-active" : "tab"}
              onClick={() => setScope(s)}
            >
              {s === "site" ? "Site-wide" : s}
            </button>
          ))}
        </div>

        {!loaded && error === null && <p>Loading…</p>}
        {loaded && (
          <form
            className="edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {SORTED_GROUPS.map((group) => {
              const fields = group.fields.map((field) => {
                const key = pathKey(field.path);
                const state = draft[key] ?? { enabled: false, raw: "" };
                const inherited =
                  scope !== "site" && !state.enabled ? readAtPath(siteDefaults, field.path) : undefined;
                return (
                  <div key={key} className={state.enabled ? "defaults-row" : "defaults-row defaults-row-off"}>
                    <input
                      type="checkbox"
                      className="defaults-enable"
                      checked={state.enabled}
                      aria-label={`Set a default for ${field.label}`}
                      onChange={(e) => {
                        setDraft((prev) => ({
                          ...prev,
                          [key]: { ...(prev[key] ?? { enabled: false, raw: "" }), enabled: e.target.checked },
                        }));
                        setSaved(false);
                      }}
                    />
                    <FieldInput
                      field={field}
                      value={state.raw}
                      disabled={!state.enabled}
                      onChange={(raw) => {
                        setDraft((prev) => ({
                          ...prev,
                          [key]: { ...(prev[key] ?? { enabled: false, raw: "" }), raw },
                        }));
                        setSaved(false);
                      }}
                    />
                    {inherited !== undefined && (
                      <span className="field-hint defaults-inherited">site: {formatInherited(inherited)}</span>
                    )}
                  </div>
                );
              });
              return PINNED_GROUPS.has(group.title) ? (
                <fieldset key={group.title}>
                  <legend>{group.title}</legend>
                  {fields}
                </fieldset>
              ) : (
                <details key={group.title}>
                  <summary>{group.title}</summary>
                  <fieldset>{fields}</fieldset>
                </details>
              );
            })}
            <div className="dialog-actions">
              <button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save defaults"}
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
