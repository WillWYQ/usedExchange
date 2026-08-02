import { useCallback, useEffect, useState } from "react";
import { fetchItemFields, patchItem, type FieldEdit, type ItemFields } from "../api";
import {
  FIELD_GROUPS,
  pathKey,
  readAtPath,
  WHOLE_OBJECT_GROUPS,
  WHOLE_OBJECT_SEEDS,
  type FieldDescriptor,
} from "../fields";

/** The on-disk value rendered as the string an input holds. */
function toInput(value: unknown, kind: FieldDescriptor["kind"]): string {
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
function fromInput(
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

type Tier = {
  label: string;
  miles_min?: number;
  miles_max?: number;
  amount: number;
};

function isTier(value: unknown): value is Tier {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { label?: unknown }).label === "string"
  );
}

function isTierArray(value: unknown): value is Tier[] {
  return Array.isArray(value) && value.every(isTier);
}

/**
 * The blank "—" option means "no change" for the enums whose strict schemas
 * accept no empty value (status, condition, both units, shipping_payer): the
 * seller has no empty state to express for those fields, and silently sending
 * "" or null would 400 a batch of otherwise-valid edits. Blank is therefore
 * only ever shown, never sent — the one deliberate exception to "the form
 * shows the raw file" is that "clear the shipping_payer" is only possible by
 * editing the file by hand.
 */
function buildEdits(
  loaded: ItemFields,
  draft: Record<string, string>,
): { edits: FieldEdit[]; problems: string[] } {
  const edits: FieldEdit[] = [];
  const problems: string[] = [];
  // Changes inside these objects are sent as ONE whole-object edit per
  // object, not as leaf edits: a leaf edit for an item with no dimensions/
  // weight object would create a partial object on disk that the site schema
  // .catch()es to null, silently discarding the seller's edit.
  const changedGroups = new Map<string, Record<string, unknown>>();

  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      const key = pathKey(field.path);
      const current = toInput(readAtPath(loaded, field.path), field.kind);
      const next = draft[key] ?? "";
      // Only changed fields are sent (spec §7) — an untouched field must not
      // be rewritten, or every save would rewrite the whole file and bury the
      // real change in the seller's git diff.
      if (next === current) continue;

      if (next === "" && field.kind === "select") continue;

      const parsed = fromInput(next, field.kind);
      if ("error" in parsed) {
        problems.push(`${field.label}: ${parsed.error}`);
        continue;
      }

      const head = field.path[0];
      if (field.path.length > 1 && typeof head === "string" && head in WHOLE_OBJECT_GROUPS) {
        const leaf = field.path[1];
        if (typeof leaf !== "string") continue;
        // Merge into the whole object OTHER descriptors in this group may
        // already have built up this save, falling back to the loaded object.
        // When the file has no such object at all (true of every item.json in
        // this repo) — or holds a non-object where one belongs — the base is
        // the template's null-leaf seed, so a single-leaf edit still produces
        // a complete object the strict schema accepts.
        const base = changedGroups.get(head) ?? readAtPath(loaded, [head]);
        const merged: Record<string, unknown> =
          typeof base === "object" && base !== null && !Array.isArray(base)
            ? { ...(base as Record<string, unknown>) }
            : { ...WHOLE_OBJECT_SEEDS[head] };
        merged[leaf] = parsed.value;
        changedGroups.set(head, merged);
        continue;
      }

      edits.push({ path: field.path, value: parsed.value });
    }
  }

  for (const [head, value] of changedGroups) {
    // The seed has no `unit` (there is no null unit), so creating the object
    // from scratch needs the seller to pick one. Saying so here, by the
    // field's own name, beats the server's terser "unit: Required".
    if (head in WHOLE_OBJECT_SEEDS && typeof value["unit"] !== "string") {
      problems.push(
        head === "dimensions"
          ? "Size unit: pick a unit to set dimensions"
          : "Weight unit: pick a unit to set a weight",
      );
      continue;
    }
    edits.push({ path: [head], value });
  }

  return { edits, problems };
}

function TierEditor({
  loadedTiers,
  onDirty,
  registerEdits,
}: {
  loadedTiers: Tier[];
  onDirty: (dirty: boolean) => void;
  /** Save calls this to collect the whole-array edit, or null when unchanged. */
  registerEdits: (collect: () => FieldEdit | null) => void;
}) {
  const blank = (): Tier => ({ label: "", amount: 0 });
  const [rows, setRows] = useState<Tier[]>(loadedTiers);
  const [baseline, setBaseline] = useState<Tier[]>(loadedTiers);

  // The form reloads from disk after a save, which replaces loadedTiers; a
  // hand edit made while the drawer was open lands the same way. Resync —
  // this editor's local rows are only ever a staging copy of that prop.
  useEffect(() => {
    setRows(loadedTiers);
    setBaseline(loadedTiers);
  }, [loadedTiers]);

  useEffect(() => {
    onDirty(JSON.stringify(rows) !== JSON.stringify(baseline));
    registerEdits(() =>
      JSON.stringify(rows) === JSON.stringify(baseline)
        ? null
        : { path: ["price", "tiers"], value: rows },
    );
  }, [rows, baseline, onDirty, registerEdits]);

  const setRow = (index: number, next: Tier) =>
    setRows((prev) => prev.map((row, i) => (i === index ? next : row)));

  return (
    <fieldset>
      <legend>Price tiers</legend>
      {rows.length === 0 && (
        <p className="field-hint">No tiers. The listing needs at least one price tier.</p>
      )}
      <ol className="tier-list">
        {rows.map((tier, index) => (
          <li key={index} className="tier-row">
            <label className="tier-cell">
              <span className="field-label">Label</span>
              <input
                type="text"
                value={tier.label}
                onChange={(e) => setRow(index, { ...tier, label: e.target.value })}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">From (mi)</span>
              <input
                type="text"
                inputMode="decimal"
                value={tier.miles_min ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const next = { ...tier };
                  if (raw === "") delete next.miles_min;
                  else {
                    const n = Number(raw);
                    if (Number.isFinite(n)) next.miles_min = n;
                  }
                  setRow(index, next);
                }}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">To (mi)</span>
              <input
                type="text"
                inputMode="decimal"
                value={tier.miles_max ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const next = { ...tier };
                  if (raw === "") delete next.miles_max;
                  else {
                    const n = Number(raw);
                    if (Number.isFinite(n)) next.miles_max = n;
                  }
                  setRow(index, next);
                }}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(tier.amount)}
                onChange={(e) => {
                  const n = Number(e.target.value.trim());
                  if (Number.isFinite(n)) setRow(index, { ...tier, amount: n });
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => setRows((prev) => [...prev, blank()])}>
        Add tier
      </button>
    </fieldset>
  );
}

export function EditForm({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [loaded, setLoaded] = useState<ItemFields | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tiersDirty, setTiersDirty] = useState(false);
  const [tierCollector, setTierCollector] = useState<() => FieldEdit | null>(() => () => null);

  const load = useCallback(async () => {
    const fields = await fetchItemFields(id);
    setLoaded(fields);
    const next: Record<string, string> = {};
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        next[pathKey(field.path)] = toInput(readAtPath(fields, field.path), field.kind);
      }
    }
    setDraft(next);
  }, [id]);

  useEffect(() => {
    setSaved(false);
    setLoaded(null);
    setError(null);
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  async function save() {
    if (loaded === null) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    const { edits, problems } = buildEdits(loaded, draft);

    const tiersEdit = tierCollector();
    if (tiersEdit !== null) edits.push(tiersEdit);

    if (problems.length > 0) {
      setError(problems.join("; "));
      setBusy(false);
      return;
    }
    if (edits.length === 0) {
      setError("Nothing changed.");
      setBusy(false);
      return;
    }

    try {
      // The response is the re-read file, so the form reloads from disk rather
      // than trusting its own draft.
      const fields = await patchItem(id, edits);
      setLoaded(fields);
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      // The server rejects the whole batch, so nothing was written — but a
      // reload guarantees the form shows disk, not a draft the seller might
      // now believe was saved.
      load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (loaded === null) {
    return error !== null ? <p role="alert">{error}</p> : <p>Loading…</p>;
  }

  const tiersRaw = readAtPath(loaded, ["price", "tiers"]);
  const tiers: Tier[] = isTierArray(tiersRaw) ? tiersRaw : [];

  return (
    <form
      className="edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error !== null && <p role="alert">{error}</p>}
      {saved && <p className="form-saved">Saved.</p>}

      {FIELD_GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend>{group.title}</legend>
          {group.fields.map((field) => {
            const key = pathKey(field.path);
            const value = draft[key] ?? "";
            const set = (next: string) => setDraft((prev) => ({ ...prev, [key]: next }));
            return (
              <label key={key} className="field">
                <span className="field-label">{field.label}</span>
                {field.kind === "textarea" ? (
                  <textarea rows={3} value={value} onChange={(e) => set(e.target.value)} />
                ) : field.kind === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={value === "true"}
                    onChange={(e) => set(e.target.checked ? "true" : "false")}
                  />
                ) : field.kind === "select" ? (
                  <select
                    value={value}
                    className={
                      value !== "" && field.options !== undefined && !field.options.includes(value)
                        ? "field-offlist"
                        : undefined
                    }
                    onChange={(e) => set(e.target.value)}
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
                  <textarea rows={2} value={value} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input
                    type={field.kind === "date" ? "date" : "text"}
                    inputMode={
                      field.kind === "number" || field.kind === "integer" ? "decimal" : undefined
                    }
                    value={value}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
                {field.hint !== undefined && <span className="field-hint">{field.hint}</span>}
              </label>
            );
          })}
        </fieldset>
      ))}

      <TierEditor
        loadedTiers={tiers}
        onDirty={setTiersDirty}
        registerEdits={(collect) => setTierCollector(() => collect)}
      />

      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      {tiersDirty && <span className="field-hint"> Unsaved tier changes.</span>}
    </form>
  );
}
