# Seller Studio Edit Form Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the drawer's Details tab from a flat 43-input wall into a two-tier form — the fields a seller touches every day are on the first screen (price tiers included), everything else is one click away — and close the four state bugs that let a draft go missing or a stale "Saved." linger.

**Architecture:** `studio/src/fields.ts` gains a stable `id` and a `defaultOpen` flag per group and is re-partitioned into eight groups. The edit logic (`buildEdits`, dirty computation, draft construction) moves out of `EditForm.tsx` into a pure module `studio/src/editForm.ts` that unit tests import directly, mirroring `filtering.ts` / `filtering.test.ts`. The value converters `toInput` / `fromInput` move from `FieldInput.tsx` to a React-free `studio/src/fieldValues.ts` so the pure module never imports a component. `EditForm` renders open groups as `<fieldset>` and closed ones as `<details>` with a badge, hosts the tier editor inside the Price group, and ends in a sticky action bar. `Drawer` keeps visited tabs mounted so switching to Photos no longer discards a draft.

**Tech Stack:** React 19 + Vite (studio SPA), Vitest, plain CSS custom properties. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-05-studio-edit-form-design.md`

## Global Constraints

Copied from the spec and `.claude/CLAUDE.md`. Every task inherits these:

- **`scripts/lib/itemFields.ts` is not touched.** The field grammar and the surgical JSONC write path are correctness-critical and already reviewed. The `FieldEdit[]` this form sends must stay semantically identical to today's.
- Iron Rule 2: any doc edit ships with its `_zh` counterpart in the same commit (Task 8 handles all docs).
- Iron Rule 4: `reserved_for` never becomes a descriptor, never gets read, never gets rendered.
- Iron Rule 7: Phase 22 is recorded in `IMPLEMENTATION_PLAN.md` / `_zh` with all tasks `[x]` and ✅ (Task 8, after verification).
- Iron Rule 8 does not apply: no new `content/config.ts` field.
- The 43 descriptors are re-partitioned and re-ordered, never added to or removed from. Every `path` stays byte-identical.
- One dirty predicate: `fieldIsDirty` is the single definition used by the footer count, the per-field marker, the group badges and `buildEdits`. They can never disagree.
- No new dependencies. Styling consumes existing tokens; no new colour literals.
- Gates: `pnpm test`, `pnpm type-check`, `pnpm lint` (zero warnings) — all clean before every commit. The repo suite is **646 tests in 38 files** before this work; Tasks 1 and 2 add to that count.
- Commits use repo prefixes (`feat:` / `fix:` / `docs:` / `refactor:`) and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch: `feat/studio-edit-form`, cut from `develop` (which contains PR #6).
- Repo conventions: 2-space indent, double quotes, comments explain *why*.

---

### Task 1: Extract the value converters into a React-free module

**Files:**
- Add: `studio/src/fieldValues.ts`
- Modify: `studio/src/panes/FieldInput.tsx` (drop the two functions, import them, re-export nothing)
- Modify: `studio/src/panes/DefaultsPane.tsx` (import path only)
- Modify: `studio/src/panes/EditForm.tsx` (import path only)

**Interfaces:**
- Produces: `toInput(value: unknown, kind: FieldKind): string` and `fromInput(raw: string, kind: FieldKind): { value: unknown } | { error: string }`, moved verbatim.
- Consumed by: Task 2's pure module, `FieldInput`, `DefaultsPane`, `EditForm`.

**Why:** `editForm.ts` is a pure module. Importing `./panes/FieldInput` to reach `toInput` would make it depend on a component module (and on `react/jsx-runtime` at eval time) for two string functions. The converters are not React.

- [ ] **Step 1: Move the functions**

Create `studio/src/fieldValues.ts` with the exact bodies of `toInput` and `fromInput` from `FieldInput.tsx`, including their comments, plus a file header:

```typescript
// The two conversions between an on-disk JSON value and the string an <input>
// holds. They live outside FieldInput.tsx because editForm.ts — a pure module
// with no React in it — needs them too, and a pure module must not import a
// component to reach two string functions.

import type { FieldDescriptor } from "./fields";
```

- [ ] **Step 2: Update the three importers**

`FieldInput.tsx` imports `{ toInput, fromInput }` from `"../fieldValues"` only if it still uses them — it does not (it only renders), so it imports nothing new; delete the two functions and keep `import type { FieldDescriptor } from "../fields";`.

`DefaultsPane.tsx` and `EditForm.tsx`: change `import { FieldInput, fromInput, toInput } from "./FieldInput";` to two imports — `import { FieldInput } from "./FieldInput";` and `import { fromInput, toInput } from "../fieldValues";`.

- [ ] **Step 3: Gates**

`pnpm type-check && pnpm lint && pnpm test` — 646 tests still pass (`scripts/studioFields.test.ts` asserts `FieldInput.tsx` contains `field-offlist`, which is untouched).

**Commit:** `refactor: move the studio field value converters out of the component`

---

### Task 2: Re-partition `fields.ts` into eight identified groups

**Files:**
- Modify: `studio/src/fields.ts`
- Modify: `scripts/studioFields.test.ts` (the group-title assertion)

**Interfaces:**
- Produces:
  ```typescript
  export type GroupId =
    | "listing" | "price" | "translations" | "specs"
    | "payment" | "books" | "extras" | "dates";

  export type FieldGroup = {
    id: GroupId;
    title: string;
    /** Expanded on load in the EditForm. Closed groups render as <details>.
        DefaultsPane deliberately does NOT use this — see its own pinned set. */
    defaultOpen?: boolean;
    fields: FieldDescriptor[];
  };
  ```
- Consumed by: `EditForm` (Task 4), `DefaultsPane` (Task 6), `scripts/studioFields.test.ts`.

**Constraint:** `fields.ts` must stay import-free of anything but its own types — `scripts/studioFields.test.ts` transpiles it standalone with `ts.transpileModule` and runs it through `new Function`, so a `require` of a sibling module would throw there.

- [ ] **Step 1: Update the failing test first**

In `scripts/studioFields.test.ts`, replace the `"group order and titles match the spec's grouping"` test with:

```typescript
  it("group ids, order and titles match the spec's grouping", () => {
    const { FIELD_GROUPS } = loadFields();
    expect(FIELD_GROUPS.map((g) => g.id)).toEqual([
      "listing", "price", "translations", "specs",
      "payment", "books", "extras", "dates",
    ]);
    expect(FIELD_GROUPS.map((g) => g.title)).toEqual([
      "Listing", "Price", "Translations", "Specs",
      "Payment & pickup", "Books & courses", "Extras", "Dates",
    ]);
    // Only the two groups a seller touches on an ordinary edit start open.
    expect(FIELD_GROUPS.filter((g) => g.defaultOpen === true).map((g) => g.id)).toEqual([
      "listing", "price",
    ]);
  });
```

Add one more test pinning the invariant this whole task must not break:

```typescript
  it("re-grouping neither added nor dropped a descriptor", () => {
    const { FIELD_GROUPS } = loadFields();
    const paths = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.path.join(".")));
    expect(paths.length).toBe(43);
    expect(new Set(paths).size).toBe(43);
  });
```

Both fail before the rewrite. `FieldGroup` in that test file's local type mirror gains `id: string` and `defaultOpen?: boolean`.

- [ ] **Step 2: Rewrite `FIELD_GROUPS`**

Eight groups in the spec's table order. Each descriptor keeps its existing `path`, `label`, `kind`, `options` and `hint` verbatim; only membership and order change, plus the three `stringList` hints:

```typescript
export const FIELD_GROUPS: readonly FieldGroup[] = [
  {
    id: "listing",
    title: "Listing",
    defaultOpen: true,
    fields: [
      { path: ["name"], label: "Name", kind: "text" },
      { path: ["status"], label: "Status", kind: "select",
        options: ["available", "pending", "reserved", "sold", "draft"],
        hint: "Draft items never appear on the site." },
      { path: ["condition"], label: "Condition", kind: "select",
        options: ["new", "like-new", "good", "fair", "for-parts"] },
      { path: ["quantity"], label: "Quantity", kind: "integer" },
      { path: ["description"], label: "Description", kind: "textarea" },
      { path: ["tags"], label: "Tags", kind: "stringList", hint: "One per line." },
    ],
  },
  {
    id: "price",
    title: "Price",
    defaultOpen: true,
    // The tier editor renders inside this group (EditForm), between Currency
    // and Negotiable: the amounts belong next to the currency they are in,
    // not at the far end of the form.
    fields: [
      { path: ["price", "currency"], label: "Currency", kind: "text", hint: "e.g. USD" },
      { path: ["price", "negotiable"], label: "Negotiable", kind: "boolean" },
      { path: ["price", "show_tiers"], label: "Show all tiers to buyers", kind: "boolean" },
      { path: ["min_acceptable_offer"], label: "Minimum acceptable offer", kind: "number" },
      { path: ["no_lowball"], label: "No lowball offers", kind: "boolean" },
      { path: ["price_reduced"], label: "Price reduced", kind: "boolean" },
      { path: ["previous_lowest_price"], label: "Previous lowest price", kind: "number" },
      { path: ["price", "shipping_payer"], label: "Shipping paid by", kind: "select",
        options: ["seller", "buyer"], hint: "Leave blank to use the site default." },
    ],
  },
  { id: "translations", title: "Translations", fields: [ /* name_zh, description_zh */ ] },
  { id: "specs", title: "Specs", fields: [ /* brand … original_price, order unchanged */ ] },
  {
    id: "payment",
    title: "Payment & pickup",
    fields: [
      { path: ["preferred_payment"], label: "Preferred payment", kind: "stringList", hint: "One per line." },
      { path: ["pickup_windows"], label: "Pickup windows", kind: "stringList", hint: "One per line." },
      { path: ["contact_note"], label: "Contact note", kind: "textarea" },
      { path: ["stripe_payment_link"], label: "Stripe payment link", kind: "text" },
      { path: ["venmo_payment_request"], label: "Venmo request link", kind: "text" },
    ],
  },
  { id: "books", title: "Books & courses", fields: [ /* isbn, course, edition, semester_listed */ ] },
  { id: "extras", title: "Extras",
    fields: [ /* meta_description, category_override, youtube_link */ ] },
  {
    id: "dates",
    title: "Dates",
    // pnpm mark-sold and the bulk status action maintain these; a hand edit
    // here is how sold_date ends up disagreeing with status. Collapsed on
    // purpose — reachable, not in the way.
    fields: [
      { path: ["listed_date"], label: "Listed date", kind: "date" },
      { path: ["sold_date"], label: "Sold date", kind: "date" },
    ],
  },
];
```

- [ ] **Step 3: Add the group lookup helper**

Still in `fields.ts` (needed by `editForm.ts` to map a failing path back to the group that must be expanded):

```typescript
/** Group id that owns a path, by its head segment. Whole-object paths
    (dimensions.length, price.currency) resolve through their head too. */
export function groupIdForPath(path: (string | number)[]): GroupId | null {
  const key = pathKey(path);
  const head = String(path[0]);
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (pathKey(field.path) === key) return group.id;
    }
  }
  // A whole-object edit is sent at the head path (["dimensions"]), which is
  // not itself a descriptor — resolve it through any leaf under that head.
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (String(field.path[0]) === head) return group.id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Gates** — 648 tests pass (646 + the two new). `DefaultsPane` still compiles because its `PINNED_GROUPS` is a `Set<string>` at this point; Task 6 tightens it.

> ⚠️ After this task and before Task 6, `DefaultsPane`'s `PINNED_GROUPS` matches `"Price"` (still a title) but no longer `"Platform"` — the defaults panel temporarily collapses Payment & pickup. Task 6 fixes it. Do not ship the branch between the two.

**Commit:** `feat: regroup the studio edit fields by how often a seller touches them`

---

### Task 3: The pure edit module

**Files:**
- Add: `studio/src/editForm.ts`
- Add: `studio/src/editForm.test.ts`
- Modify: `scripts/studioFields.test.ts` (retarget two source-string assertions)

**Interfaces:**
- Produces:
  ```typescript
  export type Problem = { label: string; message: string; groupId: GroupId | null };
  export function draftFromFields(fields: ItemFields): Record<string, string>;
  export function fieldIsDirty(field: FieldDescriptor, loaded: ItemFields, draft: Record<string, string>): boolean;
  export function computeDirtyKeys(loaded: ItemFields, draft: Record<string, string>): Set<string>;
  export function dirtyCountByGroup(dirtyKeys: ReadonlySet<string>): Record<string, number>;
  export function filledCountByGroup(loaded: ItemFields): Record<string, number>;
  export function buildEdits(loaded: ItemFields, draft: Record<string, string>): { edits: FieldEdit[]; problems: Problem[] };
  ```
- Consumes: `FIELD_GROUPS`, `pathKey`, `readAtPath`, `groupIdForPath`, `WHOLE_OBJECT_GROUPS`, `WHOLE_OBJECT_SEEDS` from `./fields`; `toInput`, `fromInput` from `./fieldValues`; `FieldEdit`, `ItemFields` types from `./api`.

- [ ] **Step 1: Write `studio/src/editForm.test.ts` first**

It imports from `./editForm` relatively (same pattern as `filtering.test.ts`). Cases, one `it` each:

1. `draftFromFields` returns a string for all 43 keys, `""` for absent values, `"true"`/`"false"` for booleans, newline-joined for `stringList`.
2. `fieldIsDirty` — false when the draft equals disk; true when the text differs; **false** for a select whose draft is `""` (blank means "no change"); true for `" 5 "` against a stored `5` (documented, harmless: it re-sends `5`).
3. `computeDirtyKeys` returns exactly the changed keys.
4. `buildEdits` sends only changed leaves.
5. `buildEdits` skips a blank select — this is the behavioural replacement for the source-string assertion in `scripts/studioFields.test.ts`.
6. `buildEdits` on a bad number produces a `Problem` carrying the field label, the message and `groupId: "specs"` — and produces **no** edit for it while still emitting edits for the other changed fields.
7. `buildEdits` with `dimensions.length` changed on an item that has no `dimensions` object merges `WHOLE_OBJECT_SEEDS.dimensions`, and — with no unit chosen — yields the "pick a unit" problem with `groupId: "specs"` instead of an edit.
8. Same case with `dimensions.unit` also set emits exactly one edit at `["dimensions"]` whose value has all four keys.
9. `dirtyCountByGroup` / `filledCountByGroup` bucket by group id.

- [ ] **Step 2: Write `editForm.ts`**

`buildEdits` is the current function moved verbatim, with three changes:
- `problems` become `Problem` objects (`{ label, message, groupId }`) instead of pre-joined strings; the joining moves to the component.
- the "changed?" branch calls `fieldIsDirty` instead of inlining the two conditions.
- the whole-object unit problem carries `groupId: groupIdForPath([head])`.

Keep every existing comment — they record why the whole-object path exists at all.

```typescript
export function fieldIsDirty(field, loaded, draft) {
  const next = draft[pathKey(field.path)] ?? "";
  const current = toInput(readAtPath(loaded, field.path), field.kind);
  if (next === current) return false;
  // The blank "—" option means "no change": the strict enums accept no empty
  // value, so blank is only ever shown, never sent.
  if (next === "" && field.kind === "select") return false;
  return true;
}
```

`filledCountByGroup` counts descriptors whose on-disk value is neither `undefined`, `null`, `""` nor `[]` — it feeds the "3 set" badge that tells a seller a collapsed group holds data.

- [ ] **Step 3: Retarget the source-string assertions**

In `scripts/studioFields.test.ts`:
- `"EditForm seeds a missing object from WHOLE_OBJECT_SEEDS and asks for a unit"` now reads `studio/src/editForm.ts` (rename the test to say `editForm`).
- In `"EditForm sends tiers as one whole-array edit and never sends blank selects"`, keep the `{ path: ["price", "tiers"], value: rows }` check against `EditForm.tsx` (the tier editor does not move files) and the `field-offlist` check against `FieldInput.tsx`; **delete** the `if (next === "" && field.kind === "select") continue;` string check — `editForm.test.ts` case 5 asserts the behaviour, which is strictly stronger than matching a line of source. Rename the test to drop "never sends blank selects".

- [ ] **Step 4: Gates** — expect ~657 tests.

**Commit:** `refactor: move the edit-form save logic into a testable pure module`

---

### Task 4: Render the two-tier form

**Files:**
- Modify: `studio/src/panes/EditForm.tsx`
- Modify: `studio/src/panes/FieldInput.tsx` (add the optional `dirty` prop)

**Interfaces:**
- `EditForm` gains an optional prop `onDirtyChange?: (count: number) => void` (Task 5 consumes it).
- `FieldInput` gains `dirty?: boolean`.

- [ ] **Step 1: `FieldInput` renders the marker**

```tsx
<span className="field-label">
  {field.label}
  {dirty === true && (
    <>
      <span className="field-dot" aria-hidden="true">●</span>
      <span className="visually-hidden"> (unsaved)</span>
    </>
  )}
</span>
```

Colour alone must not carry the meaning — hence the glyph plus the screen-reader text.

- [ ] **Step 2: `EditForm` state**

- Import `buildEdits`, `draftFromFields`, `computeDirtyKeys`, `dirtyCountByGroup`, `filledCountByGroup` from `../editForm`.
- `load()` sets `draft` via `draftFromFields(fields)`.
- Every `setDraft` call is followed by `setSaved(false)`.
- `const dirtyKeys = useMemo(() => loaded === null ? new Set<string>() : computeDirtyKeys(loaded, draft), [loaded, draft]);`
- `const totalDirty = dirtyKeys.size + (tiersDirty ? 1 : 0);`
- `useEffect(() => onDirtyChange?.(totalDirty), [totalDirty, onDirtyChange]);`
- `const [forcedOpen, setForcedOpen] = useState<ReadonlySet<string>>(new Set());`
- `notice` state, separate from `error`, for "Nothing changed."

- [ ] **Step 3: `save()` changes**

```typescript
const { edits, problems } = buildEdits(loaded, draft);
const tiersEdit = tierCollector();
if (tiersEdit !== null) edits.push(tiersEdit);

if (problems.length > 0) {
  // A message pointing at a field inside a collapsed group names something
  // the seller cannot see. Open those groups before showing it.
  setForcedOpen(new Set(problems.map((p) => p.groupId).filter((id): id is GroupId => id !== null)));
  setError(problems.map((p) => `${p.label}: ${p.message}`).join("; "));
  setBusy(false);
  return;
}
if (edits.length === 0) { setNotice("Nothing changed."); setBusy(false); return; }
```

On success: `setLoaded(fields); setDraft(draftFromFields(fields)); setSaved(true); onSaved();` — the re-read result is what the inputs show, so the dirty count returns to zero and any server-side normalisation is visible.

- [ ] **Step 4: `discard()`**

```typescript
function discard() {
  if (loaded === null) return;
  setDraft(draftFromFields(loaded));
  setTierResetToken((t) => t + 1);
  setError(null); setNotice(null); setSaved(false); setForcedOpen(new Set());
}
```

`TierEditor` gains a `resetToken: number` prop; add it to the deps of the effect that does `setRows(loadedTiers); setBaseline(loadedTiers);`. The existing `loadedTiers` dependency stays — a save or a hand edit still resyncs.

- [ ] **Step 5: Render**

One `renderGroup(group)` helper returns the field list (each `FieldInput` gets `dirty={dirtyKeys.has(key)}`), with the tier editor spliced in after the Currency field when `group.id === "price"`. Then:

```tsx
{FIELD_GROUPS.map((group) => {
  const dirtyCount = dirtyByGroup[group.id] ?? 0;
  const filled = filledByGroup[group.id] ?? 0;
  const badge =
    dirtyCount > 0 ? <span className="group-badge group-badge-dirty">{dirtyCount} unsaved</span>
    : filled > 0 ? <span className="group-badge">{filled} set</span>
    : null;

  return group.defaultOpen === true ? (
    <fieldset key={group.id}>
      <legend>{group.title}{badge}</legend>
      {renderGroup(group)}
    </fieldset>
  ) : (
    <details key={group.id} open={forcedOpen.has(group.id) ? true : undefined}>
      <summary>{group.title}{badge}</summary>
      <fieldset>{renderGroup(group)}</fieldset>
    </details>
  );
})}
```

`open={… : undefined}` rather than `open={false}`: an uncontrolled `<details>` keeps whatever the seller opened. Passing `false` would slam a group shut under their cursor the moment an unrelated re-render happened.

- [ ] **Step 6: The sticky action bar**

Replaces the trailing Save button:

```tsx
<div className="form-actions">
  <Button type="submit" variant="primary" disabled={busy || totalDirty === 0}>
    {busy ? "Saving…" : "Save changes"}
  </Button>
  <Button variant="ghost" onClick={discard} disabled={busy || totalDirty === 0}>Discard</Button>
  <span className="field-hint" role="status">
    {totalDirty === 0 ? "No unsaved changes" : `${totalDirty} unsaved change${totalDirty === 1 ? "" : "s"}`}
  </span>
</div>
```

`Button` defaults to `type="button"`; verify in `components/Button.tsx` and pass `type="button"` on Discard if it does not, or the discard click would submit the form.

- [ ] **Step 7: Gates.**

**Commit:** `feat: two-tier edit form with unsaved-change tracking and a sticky action bar`

---

### Task 5: The drawer stops discarding drafts

**Files:**
- Modify: `studio/src/panes/Drawer.tsx`

- [ ] **Step 1: Keep visited tabs mounted**

```tsx
const [tab, setTab] = useState<"photos" | "details">("photos");
const [visited, setVisited] = useState<ReadonlySet<string>>(new Set(["photos"]));
const [dirtyCount, setDirtyCount] = useState(0);

function open(next: "photos" | "details") {
  setTab(next);
  setVisited((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
}
```

Render both visited panes, hiding the inactive one:

```tsx
{visited.has("photos") && (
  <div className="drawer-pane" hidden={tab !== "photos"}>
    <ImagePane item={item} onChanged={onChanged} />
  </div>
)}
{visited.has("details") && (
  <div className="drawer-pane" hidden={tab !== "details"}>
    <EditForm id={item.id} onSaved={onChanged} onDirtyChange={setDirtyCount} />
  </div>
)}
```

Lazy on first mount (an unopened Details tab still costs no `GET …/fields`), alive afterwards — which is the whole point: today, going to Photos and back silently throws the draft away.

- [ ] **Step 2: Mark the tab**

The Details tab label becomes `Details ●` when `dirtyCount > 0`, with the same `visually-hidden` "(unsaved)" text. The drawer's `key={openItem.id}` in `App.tsx` already remounts everything when the seller opens a different item, so `visited` and `dirtyCount` reset on their own.

- [ ] **Step 3: Gates.**

**Commit:** `fix: switching drawer tabs no longer throws away an unsaved edit`

---

### Task 6: `DefaultsPane` pins by group id

**Files:**
- Modify: `studio/src/panes/DefaultsPane.tsx`

- [ ] **Step 1: Type the pinned set**

```typescript
import { FIELD_GROUPS, pathKey, readAtPath, type FieldGroup, type GroupId } from "../fields";

// Deliberately NOT FieldGroup.defaultOpen: the two panels have opposite
// priorities. Payment & pickup is collapsed in the edit form (nobody changes
// how they get paid while editing one item) and pinned here (presetting it
// once is exactly what defaults are for — see the 2026-08-02 defaults spec).
// Typed as GroupId so renaming a group is a compile error, not a silent
// "everything collapsed".
const PINNED_GROUPS: ReadonlySet<GroupId> = new Set<GroupId>(["price", "payment"]);
```

Replace both `PINNED_GROUPS.has(group.title)` call sites with `PINNED_GROUPS.has(group.id)`, and the two `.filter` calls in `SORTED_GROUPS` likewise. Keys change from `group.title` to `group.id`.

`NEVER_DEFAULTABLE` is unchanged — it filters by path head, so the new `dates` group ends up empty and the existing `.filter(g => g.fields.length > 0)` drops it. That is correct: `listed_date` and `sold_date` were never defaultable.

- [ ] **Step 2: Gates.** Confirm by eye in Task 7's smoke run that the defaults dialog shows Price and Payment & pickup expanded.

**Commit:** `fix: the defaults panel pins groups by id so a rename cannot silently break it`

---

### Task 7: Styles

**Files:**
- Modify: `studio/src/tokens.css`

- [ ] **Step 1: Add the new rules**

In the `── Edit form ──` section, using existing tokens only:

- `.visually-hidden` — the standard 1px-clip utility (the file has none today).
- `.edit-form details` — bottom margin matching `fieldset`'s `1.25rem`.
- `.edit-form summary` — same typography as `.edit-form legend` (uppercase, `0.75rem`, `--ink-soft`, `0.04em` tracking), `cursor: pointer`, `list-style: none` plus `::-webkit-details-marker { display: none }`, and a `::before` chevron (`▸`) that rotates via `details[open] > summary::before`. `padding: 0.35rem 0` gives it a real click target.
- `.edit-form summary:hover { color: var(--ink) }` and a `:focus-visible` outline using `--accent`, so the group headers are as keyboard-legible as `.tab`.
- `.group-badge` — `margin-left: 0.5rem`, `font-size: 0.7rem`, `--ink-soft`, `text-transform: none`, `letter-spacing: normal` (the legend/summary rules are uppercase; the badge must not be).
- `.group-badge-dirty` — `color: var(--accent)`, `font-weight: 600`.
- `.field-dot` — `margin-left: 0.35rem`, `color: var(--accent)`, `font-size: 0.6rem`.
- `.form-actions` — `position: sticky; bottom: 0; display: flex; align-items: center; gap: var(--gap); padding: 0.75rem 0; margin-top: 0.5rem; background: var(--surface); border-top: 1px solid var(--border);`. The drawer is the scroll container, so it pins to the drawer's bottom edge. `background` is required — without it the form scrolls visibly under the buttons.
- `.drawer-pane[hidden] { display: none; }` — explicit, so a future `display` rule on that class cannot resurrect a hidden pane.
- `.form-notice { color: var(--ink-soft); }` for the "Nothing changed." line.

Check the `@media (prefers-reduced-motion: reduce)` block still covers the chevron: it uses `* { transition: none !important }`, so it does.

- [ ] **Step 2: Smoke-run the app**

```
pnpm studio --port 5199 &
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5199/   # expect 200
kill %1
```

- [ ] **Step 3: Gates.**

**Commit:** `feat: style the collapsible field groups and the sticky form actions`

---

### Task 8: Docs (bilingual, Iron Rule 2) and Phase 22

**Files:** all in pairs, English + `_zh`, **one commit**:
- `docs/CURRENT_FUNCTIONALITY.md` / `_zh`
- `docs/ARCHITECTURE.md` / `_zh`
- `docs/TECH_REQUIREMENTS.md` / `_zh`
- `docs/IMPLEMENTATION_PLAN.md` / `_zh`

- [ ] **Step 1: `CURRENT_FUNCTIONALITY`** — rewrite the drawer/edit-form paragraph: eight groups, Listing and Price open, the rest collapsed with a badge showing unsaved changes or filled-field count; price tiers sit inside Price; a sticky bar carries Save / Discard / the unsaved count; switching to Photos keeps the draft.

- [ ] **Step 2: `ARCHITECTURE`** — add `studio/src/editForm.ts` (pure save/dirty logic) and `studio/src/fieldValues.ts` (value converters) to the studio file list, next to the existing `filtering.ts` entry.

- [ ] **Step 3: `TECH_REQUIREMENTS`** — extend the `src/fields.ts` line: groups carry a stable `id` (`GroupId`) and a `defaultOpen` flag; `EditForm` openness comes from `defaultOpen`, `DefaultsPane` keeps its own `ReadonlySet<GroupId>` so the two panels' priorities stay independent and a rename fails the build.

- [ ] **Step 4: `IMPLEMENTATION_PLAN`** — add **Phase 22 — Seller Studio edit form experience ✅** after Phase 21, tasks all `[x]`, mirroring Phase 21's shape in both languages. Bump the doc version and the date row in `.claude/CLAUDE.md`'s version table if Phase 21 did so.

- [ ] **Step 5: Final gates** — `pnpm test && pnpm type-check && pnpm lint`, then the studio boot check from Task 7.

**Commit:** `docs: studio edit form experience (Phase 22) in four doc pairs`

---

## Verification checklist before the PR

- [ ] `pnpm test` — all pass, count reported in the PR
- [ ] `pnpm type-check` — clean
- [ ] `pnpm lint` — zero warnings
- [ ] `pnpm studio --port 5199` boots; `curl http://127.0.0.1:5199/` returns 200
- [ ] `git diff develop --stat` shows no change under `scripts/lib/itemFields.ts` or `content/`
- [ ] Every English doc touched has its `_zh` sibling in the same commit
