// The save logic behind EditForm, kept out of the component so it can be
// unit-tested directly (same split as filtering.ts / filtering.test.ts).
//
// The one rule that holds this module together: `fieldIsDirty` is the SINGLE
// definition of "changed". The footer count, the per-field marker, the group
// badges and the edits actually sent all derive from it, so the form can
// never say "3 unsaved changes" and then send five.

import type { FieldEdit, ItemFields } from "./api";
import {
  FIELD_GROUPS,
  groupIdForPath,
  pathKey,
  readAtPath,
  WHOLE_OBJECT_GROUPS,
  WHOLE_OBJECT_SEEDS,
  type FieldDescriptor,
  type GroupId,
} from "./fields";
import { fromInput, toInput } from "./fieldValues";

/** One field that could not be saved, and the group holding it. */
export type Problem = { label: string; message: string; groupId: GroupId | null };

/** The input strings for every descriptor, read out of a loaded item file. */
export function draftFromFields(fields: ItemFields): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      draft[pathKey(field.path)] = toInput(readAtPath(fields, field.path), field.kind);
    }
  }
  return draft;
}

/**
 * Whether this field would contribute an edit if the seller saved now.
 *
 * The blank "—" option means "no change" for the enums whose strict schemas
 * accept no empty value (status, condition, both units, shipping_payer): the
 * seller has no empty state to express for those fields, and silently sending
 * "" or null would 400 a batch of otherwise-valid edits. Blank is therefore
 * only ever shown, never sent — the one deliberate exception to "the form
 * shows the raw file" is that clearing shipping_payer needs a hand edit.
 */
export function fieldIsDirty(
  field: FieldDescriptor,
  loaded: ItemFields,
  draft: Record<string, string>,
): boolean {
  const next = draft[pathKey(field.path)] ?? "";
  const current = toInput(readAtPath(loaded, field.path), field.kind);
  // Only changed fields are sent (spec §7) — an untouched field must not be
  // rewritten, or every save would rewrite the whole file and bury the real
  // change in the seller's git diff.
  if (next === current) return false;
  if (next === "" && field.kind === "select") return false;
  return true;
}

export function computeDirtyKeys(
  loaded: ItemFields,
  draft: Record<string, string>,
): Set<string> {
  const keys = new Set<string>();
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (fieldIsDirty(field, loaded, draft)) keys.add(pathKey(field.path));
    }
  }
  return keys;
}

/** Unsaved-change count per group id, for the collapsed groups' badges. */
export function dirtyCountByGroup(dirtyKeys: ReadonlySet<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of FIELD_GROUPS) {
    counts[group.id] = group.fields.filter((f) => dirtyKeys.has(pathKey(f.path))).length;
  }
  return counts;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * How many fields in each group already hold something on disk. A collapsed
 * group is opaque; this is what its badge says when nothing in it is dirty,
 * so the seller can see which groups carry data without opening all six.
 */
export function filledCountByGroup(loaded: ItemFields): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of FIELD_GROUPS) {
    counts[group.id] = group.fields.filter((f) => hasValue(readAtPath(loaded, f.path))).length;
  }
  return counts;
}

export function buildEdits(
  loaded: ItemFields,
  draft: Record<string, string>,
): { edits: FieldEdit[]; problems: Problem[] } {
  const edits: FieldEdit[] = [];
  const problems: Problem[] = [];
  // Changes inside these objects are sent as ONE whole-object edit per
  // object, not as leaf edits: a leaf edit for an item with no dimensions/
  // weight object would create a partial object on disk that the site schema
  // .catch()es to null, silently discarding the seller's edit.
  const changedGroups = new Map<string, Record<string, unknown>>();

  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (!fieldIsDirty(field, loaded, draft)) continue;

      const next = draft[pathKey(field.path)] ?? "";
      const parsed = fromInput(next, field.kind);
      if ("error" in parsed) {
        problems.push({ label: field.label, message: parsed.error, groupId: group.id });
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
          ? { label: "Size unit", message: "pick a unit to set dimensions", groupId: groupIdForPath([head]) }
          : { label: "Weight unit", message: "pick a unit to set a weight", groupId: groupIdForPath([head]) },
      );
      continue;
    }
    edits.push({ path: [head], value });
  }

  return { edits, problems };
}

/** The groups a save's problems live in — EditForm opens these before it
    shows the message, so no error names a field that is off-screen. */
export function problemGroupIds(problems: readonly Problem[]): Set<GroupId> {
  const ids = new Set<GroupId>();
  for (const problem of problems) {
    if (problem.groupId !== null) ids.add(problem.groupId);
  }
  return ids;
}
