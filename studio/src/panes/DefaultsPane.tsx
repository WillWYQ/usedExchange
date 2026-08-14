import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDefaults, saveDefaults } from "../api";
import { Button } from "../components/Button";
import { TierEditor, isTierArray, type Tier } from "../components/TierEditor";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { FIELD_GROUPS, pathKey, readAtPath, type FieldGroup, type GroupId } from "../fields";
import { fromInput, toInput } from "../fieldValues";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";
import { FieldInput } from "./FieldInput";

// name/status/listed_date/sold_date belong to each item, never to a template;
// the server rejects them too (scripts/lib/itemDefaults.ts). This set only
// keeps the panel from offering them.
const NEVER_DEFAULTABLE = new Set(["name", "status", "listed_date", "sold_date"]);

// The groups sellers retype most (price structure and the transaction fields)
// lead; everything else stays collapsed until opened.
//
// Deliberately NOT FieldGroup.defaultOpen: the two panels have opposite
// priorities. Payment & pickup is collapsed in the edit form — nobody changes
// how they get paid while editing one item — and pinned here, because
// presetting it once is exactly what defaults are for. Typed as GroupId so
// renaming a group is a compile error rather than a silent "match nothing,
// collapse everything".
const PINNED_GROUPS: ReadonlySet<GroupId> = new Set<GroupId>(["price", "payment"]);

const DEFAULTABLE_GROUPS: FieldGroup[] = FIELD_GROUPS.map((group) => ({
  ...group,
  fields: group.fields.filter((f) => {
    const head = f.path[0];
    return typeof head === "string" && !NEVER_DEFAULTABLE.has(head);
  }),
})).filter((group) => group.fields.length > 0);

const SORTED_GROUPS: FieldGroup[] = [
  ...DEFAULTABLE_GROUPS.filter((g) => PINNED_GROUPS.has(g.id)),
  ...DEFAULTABLE_GROUPS.filter((g) => !PINNED_GROUPS.has(g.id)),
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
  const { t } = useStudioT();
  const [scope, setScope] = useState("site");
  const [siteDefaults, setSiteDefaults] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, FieldState>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tiers are one array, not one leaf per row, so they sit outside the
  // per-field draft: a single checkbox gates the whole block, and the shared
  // TierEditor stages the rows. The collector lives in a ref for the same
  // reason as EditForm's: writing it must not re-render (registration would
  // loop against TierEditor's effect).
  const [tiersEnabled, setTiersEnabled] = useState(false);
  const [tiersInitial, setTiersInitial] = useState<Tier[]>([]);
  const tiersCollector = useRef<() => Tier[] | null>(() => null);
  const registerTiersCollector = useCallback((collect: () => Tier[] | null) => {
    tiersCollector.current = collect;
  }, []);

  const dialogRef = useDialogBehavior(onClose);

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
    const tiersRaw = readAtPath(current, ["price", "tiers"]);
    setTiersEnabled(Array.isArray(tiersRaw));
    setTiersInitial(isTierArray(tiersRaw) ? tiersRaw : []);
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
          problems.push(t("defaults.selectError", { label: t(field.labelKey as StudioKey) }));
          continue;
        }
        const parsed = fromInput(state.raw, field.kind);
        if ("error" in parsed) {
          problems.push(
            t("defaults.fieldError", {
              label: t(field.labelKey as StudioKey),
              error: t(parsed.error as StudioKey),
            }),
          );
          continue;
        }
        writeAtPath(out, field.path, parsed.value);
      }
    }
    if (tiersEnabled) {
      // Unchanged rows come back as null from the collector; fall back to
      // what was loaded so an enabled-but-untouched block still saves.
      const rows = tiersCollector.current() ?? tiersInitial;
      if (rows.length === 0) {
        problems.push("Price tiers: add at least one tier or switch the field off");
      } else {
        writeAtPath(out, ["price", "tiers"], rows);
      }
    }
    if (problems.length > 0) {
      setError(problems.join("; "));
      setBusy(false);
      return;
    }
    try {
      await saveDefaults(scope, out);
      onSaved();
      // Re-read from disk after the write, same rule as EditForm.
      await load(scope);
      // Set after the re-read: load() clears `saved` in its first lines, so
      // setting it earlier would batch with that reset and never paint.
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
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
        {error !== null && <p role="alert" className="alert-error">{error}</p>}
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
              const siteTiers = readAtPath(siteDefaults, ["price", "tiers"]);
              const tiersInherited =
                scope !== "site" && !tiersEnabled && isTierArray(siteTiers)
                  ? siteTiers.length
                  : undefined;
              const tiersBlock = (
                <div
                  key="price.tiers"
                  className={tiersEnabled ? "defaults-row" : "defaults-row defaults-row-off"}
                >
                  <input
                    type="checkbox"
                    className="defaults-enable"
                    checked={tiersEnabled}
                    aria-label="Set a default for price tiers"
                    onChange={(e) => {
                      setTiersEnabled(e.target.checked);
                      setSaved(false);
                    }}
                  />
                  <div className="defaults-tier-block">
                    {tiersEnabled ? (
                      <TierEditor
                        initialTiers={tiersInitial}
                        resetToken={0}
                        registerCollector={registerTiersCollector}
                      />
                    ) : (
                      <span className="field-label">Price tiers</span>
                    )}
                    {tiersInherited !== undefined && (
                      <span className="field-hint defaults-inherited">
                        site: {tiersInherited} tiers
                      </span>
                    )}
                  </div>
                </div>
              );
              const fields = group.fields.flatMap((field) => {
                const key = pathKey(field.path);
                const state = draft[key] ?? { enabled: false, raw: "" };
                const inherited =
                  scope !== "site" && !state.enabled
                    ? readAtPath(siteDefaults, field.path)
                    : undefined;
                const row = (
                  <div
                    key={key}
                    className={state.enabled ? "defaults-row" : "defaults-row defaults-row-off"}
                  >
                    <input
                      type="checkbox"
                      className="defaults-enable"
                      checked={state.enabled}
                      aria-label={t("defaults.fieldLabel", { label: t(field.labelKey as StudioKey) })}
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
                // The tiers block sits next to the currency its amounts are
                // in — same placement rule as the item edit form.
                return key === "price.currency" ? [row, tiersBlock] : [row];
              });
              return PINNED_GROUPS.has(group.id) ? (
                <fieldset key={group.id}>
                  <legend>{t(group.titleKey as StudioKey)}</legend>
                  {fields}
                </fieldset>
              ) : (
                <details key={group.id}>
                  <summary>{t(group.titleKey as StudioKey)}</summary>
                  <fieldset>{fields}</fieldset>
                </details>
              );
            })}
            <div className="dialog-actions">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving…" : "Save defaults"}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
