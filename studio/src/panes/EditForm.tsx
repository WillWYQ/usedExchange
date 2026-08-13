import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchItemFields, patchItem, type ItemFields } from "../api";
import { Button } from "../components/Button";
import { TierEditor, isTierArray, type Tier } from "../components/TierEditor";
import {
  buildEdits,
  computeDirtyKeys,
  dirtyCountByGroup,
  draftFromFields,
  filledCountByGroup,
  problemGroupIds,
} from "../editForm";
import { FIELD_GROUPS, pathKey, readAtPath, type GroupId } from "../fields";
import { FieldInput } from "./FieldInput";

export function EditForm({
  id,
  onSaved,
  onDirtyChange,
}: {
  id: string;
  onSaved: () => void;
  /** Lets the drawer mark its Details tab while the pane is hidden. */
  onDirtyChange?: (count: number) => void;
}) {
  const [loaded, setLoaded] = useState<ItemFields | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tiersDirty, setTiersDirty] = useState(false);
  const [tierResetToken, setTierResetToken] = useState(0);
  // A ref, not state: writing it must not re-render, or registering the
  // collector loops against TierEditor's effect (see the note there).
  const tierCollector = useRef<() => Tier[] | null>(() => null);
  const registerTierCollector = useCallback((collect: () => Tier[] | null) => {
    tierCollector.current = collect;
  }, []);
  // Groups a failed save named. Collapsed groups open for these — an error
  // pointing at a field the seller cannot see is not an error message.
  const [forcedOpen, setForcedOpen] = useState<ReadonlySet<GroupId>>(new Set());

  const load = useCallback(async () => {
    const fields = await fetchItemFields(id);
    setLoaded(fields);
    setDraft(draftFromFields(fields));
  }, [id]);

  useEffect(() => {
    setSaved(false);
    setNotice(null);
    setLoaded(null);
    setError(null);
    setForcedOpen(new Set());
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const dirtyKeys = useMemo(
    () => (loaded === null ? new Set<string>() : computeDirtyKeys(loaded, draft)),
    [loaded, draft],
  );
  const dirtyByGroup = useMemo(() => dirtyCountByGroup(dirtyKeys), [dirtyKeys]);
  const filledByGroup = useMemo(
    () => (loaded === null ? {} : filledCountByGroup(loaded)),
    [loaded],
  );
  // The tier editor is one array, not one field per row, so it counts as a
  // single unsaved change however many rows moved.
  const totalDirty = dirtyKeys.size + (tiersDirty ? 1 : 0);

  useEffect(() => {
    onDirtyChange?.(totalDirty);
  }, [totalDirty, onDirtyChange]);

  // Editing again means the green "Saved." refers to a state the form is no
  // longer in; the same keystroke clears any leftover notice.
  const setField = useCallback((key: string, next: string) => {
    setDraft((prev) => ({ ...prev, [key]: next }));
    setSaved(false);
    setNotice(null);
  }, []);

  function discard() {
    if (loaded === null) return;
    setDraft(draftFromFields(loaded));
    setTierResetToken((t) => t + 1);
    setError(null);
    setNotice(null);
    setSaved(false);
    setForcedOpen(new Set());
  }

  async function save() {
    if (loaded === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSaved(false);

    const { edits, problems } = buildEdits(loaded, draft);

    const tierRows = tierCollector.current();
    if (tierRows !== null) edits.push({ path: ["price", "tiers"], value: tierRows });

    if (problems.length > 0) {
      setForcedOpen(problemGroupIds(problems));
      setError(problems.map((p) => `${p.label}: ${p.message}`).join("; "));
      setBusy(false);
      return;
    }
    if (edits.length === 0) {
      // Not an error — the Save button is disabled with nothing dirty, so
      // this is the defensive branch, and it says so in a neutral voice.
      setNotice("Nothing changed.");
      setBusy(false);
      return;
    }

    try {
      // The response is the re-read file, so the form reloads from disk rather
      // than trusting its own draft. The draft is rebuilt from it too:
      // otherwise a value the server normalised (" 5 " -> 5) leaves its field
      // permanently dirty and re-sent on every later save.
      const fields = await patchItem(id, edits);
      setLoaded(fields);
      setDraft(draftFromFields(fields));
      setForcedOpen(new Set());
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
    if (error !== null) return <p role="alert" className="alert-error">{error}</p>;
    return (
      <div aria-busy="true" aria-label="Loading item fields">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  const tiersRaw = readAtPath(loaded, ["price", "tiers"]);
  const tiers: Tier[] = isTierArray(tiersRaw) ? tiersRaw : [];

  const tierEditor = (
    <TierEditor
      initialTiers={tiers}
      resetToken={tierResetToken}
      onDirtyChange={setTiersDirty}
      registerCollector={registerTierCollector}
    />
  );

  function renderFields(group: (typeof FIELD_GROUPS)[number]) {
    return group.fields.map((field) => {
      const key = pathKey(field.path);
      const input = (
        <FieldInput
          key={key}
          field={field}
          value={draft[key] ?? ""}
          dirty={dirtyKeys.has(key)}
          onChange={(next) => setField(key, next)}
        />
      );
      // The amounts belong beside the currency they are in, not at the far
      // end of the form: the tier editor is spliced in right after Currency.
      return key === "price.currency" ? (
        <Fragment key={key}>
          {input}
          {tierEditor}
        </Fragment>
      ) : (
        input
      );
    });
  }

  return (
    <form
      className="edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error !== null && <p role="alert" className="alert-error">{error}</p>}
      {notice !== null && <p role="status" className="form-notice">{notice}</p>}
      {saved && <p className="form-saved">Saved.</p>}

      {FIELD_GROUPS.map((group) => {
        const dirtyCount = dirtyByGroup[group.id] ?? 0;
        const filled = filledByGroup[group.id] ?? 0;
        const badge =
          dirtyCount > 0 ? (
            <span className="group-badge group-badge-dirty">{dirtyCount} unsaved</span>
          ) : filled > 0 ? (
            <span className="group-badge">{filled} set</span>
          ) : null;

        return group.defaultOpen === true ? (
          <fieldset key={group.id}>
            <legend>
              {group.title}
              {badge}
            </legend>
            {renderFields(group)}
          </fieldset>
        ) : (
          // `undefined`, never `false`: an uncontrolled <details> keeps
          // whatever the seller opened. Passing false would slam a group shut
          // under their cursor on the next unrelated re-render.
          <details key={group.id} open={forcedOpen.has(group.id) ? true : undefined}>
            <summary>
              {group.title}
              {badge}
            </summary>
            <fieldset>{renderFields(group)}</fieldset>
          </details>
        );
      })}

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={busy || totalDirty === 0}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={discard} disabled={busy || totalDirty === 0}>
          Discard
        </Button>
        <span className="field-hint" role="status">
          {totalDirty === 0
            ? "No unsaved changes"
            : `${totalDirty} unsaved change${totalDirty === 1 ? "" : "s"}`}
        </span>
      </div>
    </form>
  );
}
