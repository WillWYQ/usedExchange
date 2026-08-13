# Seller Studio: Default Price Tiers + Apply-to-Selection Sync

**Date:** 2026-08-13
**Status:** Approved design, pending implementation plan
**Approach:** A — reuse the existing defaults pipeline, add one server-side bulk endpoint

## 1. Problem

Sellers retype the same distance-tiered price structure (labels, mile bands) for every item, and the bands drift across items (5 / 8 / 10 / 15 / 20 miles in the current catalog). The Item defaults pane (`DefaultsPane.tsx`) already exists for scalar fields, but `price.tiers` — an array of objects — cannot be set there. There is also no way to bring existing items' tiers in line with a chosen default.

Key findings from exploration:

- The server already accepts tiers inside defaults: `validateDefaults` validates a whole `price` object via `assertEditableValue(["price"], ...)`, which permits `tiers: Tier[]`. No storage-pipeline change is needed.
- New items already merge defaults (`mergeDefaultsIntoTemplate`, used by both Studio's `createItem` and `pnpm create-item`); arrays merge wholesale, which is exactly right for tiers.
- `TierEditor` already exists inside `studio/src/panes/EditForm.tsx` but is not shared.
- Bulk operations exist as `POST /api/items/bulk-status` (`handleBulkStatus`) with a `{ok, skipped, failed}` result shape that the UI renders.

## 2. Scope

### In scope

1. Edit default tiers in the existing Item defaults dialog (site-wide and per-category scopes).
2. Apply default tiers to seller-selected existing items via one bulk action.

### Out of scope (YAGNI)

- Auto-propagation to all items when defaults are saved (rejected: clobbers hand-tuned amounts).
- Structure-only sync (re-band but keep amounts) — ambiguous when tier counts differ.
- A per-item "reset tiers to default" button in the edit drawer.
- A CLI command for the sync.
- Any change to `package.json` version (rides the next `pnpm bump`).

## 3. Semantics

Sync means: **each item receives exactly what a new item of its category would receive.** Three rules:

1. Each selected item gets its **own category's merged defaults** (site ← category). Cross-category selections each receive their own merged result.
2. Items whose merged defaults contain no tiers (or an empty array) are **skipped**, not errors.
3. Items whose current tiers are already deep-equal to the merged default tiers are **skipped** (idempotent, no needless write).

The sync writes `price.tiers` **only**. Currency, `show_tiers`, `shipping_payer`, and all non-price fields are untouched. There is **no status filter**: available / pending / reserved / sold / draft items are all updated if selected — selection is the seller's explicit intent.

Tier amounts are item-specific in the current catalog (e.g. iPhone $580/$610 vs textbook $45/$60), so the action is selection-based, never blanket: the seller ticks exactly the items whose tiers should become the default.

## 4. Architecture

```
Browser (Studio SPA)                     Server (scripts/lib/studioApi.ts)
─────────────────────                    ──────────────────────────────────
components/TierEditor.tsx   (new, extracted from EditForm.tsx)
panes/DefaultsPane.tsx      (tiers section in pinned Price group)
panes/BulkToolbar.tsx       (+ "Apply default tiers" button)
api.ts                      (+ applyDefaultTiers(ids))
        │  PUT /api/defaults (unchanged)
        │  POST /api/items/bulk-apply-tiers   (new)
        └────────────────────────────►  handleBulkApplyTiers
                                          per item: loadMergedDefaults →
                                          applyFieldEdits writes price.tiers
```

Writes touch only files under `content/` (Iron Rule 1): `_defaults.json` files and `item.json` files.

Two data flows:

- **New items (existing, unchanged):** tiers stored in `_defaults.json` flow through `mergeDefaultsIntoTemplate`; the array replaces the template's empty `tiers` wholesale.
- **Sync (new):** one POST with selected ids; the server computes each item's merged defaults and writes only `price.tiers` through the same validated path the edit form uses.

## 5. Component details

### 5.1 Shared `TierEditor` — `studio/src/components/TierEditor.tsx` (new file)

Extracted from `EditForm.tsx` (the `Tier` type, `isTier`/`isTierArray` guards, and the component itself). Pure move plus generalised props:

- `initialTiers: Tier[]`, `resetToken: number` — same resync mechanics as today.
- `onDirtyChange?: (dirty: boolean) => void`.
- `registerCollector: (collect: () => Tier[] | null) => void` — at save time, returns the current rows, or `null` when unchanged from `initialTiers`.

Callers adapt thinly: EditForm wraps collected rows into `{path: ["price","tiers"], value: rows}` (behavior unchanged); DefaultsPane uses the rows directly. Existing input constraints (numeric amount/miles, add/remove rows, "needs at least one price tier" hint) stay in the shared component, as do the existing `tier-list`/`tier-row` styles.

### 5.2 `DefaultsPane.tsx` — tiers section

Location: inside the pinned **Price** fieldset, directly after the Currency row (amounts sit next to their currency, mirroring EditForm's placement). Present in both site-wide and category tabs.

Row model: tiers are one logical unit, so a single checkbox **"Set default tiers"** gates the whole block:

- **Unchecked:** editor hidden; `price.tiers` is not written on save. Since save rebuilds the defaults object from scratch, unchecking + saving removes previously saved default tiers from `_defaults.json`.
- **Checked:** `TierEditor` shown.
- **Checked but zero rows:** save fails with `Add at least one tier or switch the field off` (mirrors the pane's existing empty-select error style).
- **Category tab inheritance hint:** when tiers are unset at category scope but present at site scope, show the grey hint `site: N tiers` (mirrors existing inherited-value hints).

State: `tiersEnabled` tracked alongside the existing leaf-field draft; on load, enabled = the loaded defaults contain a `price.tiers` array, rows initialised from it. The collector ref follows the EditForm pattern (`useRef`, stable identity — the infinite-re-render lesson documented in EditForm applies). Rows reach the saved object via the existing `writeAtPath(out, ["price","tiers"], rows)` (its descent handles all-string paths; the final assignment accepts arrays).

### 5.3 Bulk endpoint — `POST /api/items/bulk-apply-tiers`

Modeled exactly on `handleBulkStatus`:

- **Body:** `{ ids: string[] }`, ids in `"<category>/<slug>"` form, same resolution and path-containment guards (`resolveItemDir`).
- **Per item** (sequential, each wrapped in try/catch so one bad item cannot abort the batch):
  1. Read `item.json`.
  2. `loadMergedDefaults(itemsRoot, category)` for the item's own category; extract `price?.tiers`.
  3. Absent or empty → `skipped`.
  4. Deep-equal to the item's current tiers → `skipped`.
  5. Otherwise `applyFieldEdits(text, [{path: ["price","tiers"], value: tiers}])` and write the file → `ok`. Field allowlist, strict tier schema validation, and the "rejected batch leaves the file untouched" contract all apply automatically because this is the edit form's own write path.
- **Response:** `200` with `{ ok: number, skipped: number, failed: Array<{ id: string, error: string }> }`.
- **CSRF:** all mutating requests already pass the guard; no change.
- Per-item failure causes include: unknown/illegal id, unreadable or unwritable `item.json`, and a hand-broken `_defaults.json` in the item's category (error message names the file); failures never spill into other items or categories.

### 5.4 `api.ts` + `BulkToolbar.tsx` + `App.tsx` wiring

- `api.ts`: `applyDefaultTiers(ids: string[]): Promise<BulkTiersResult>` alongside `bulkStatus`.
- `BulkToolbar`: new prop `onApplyTiers: () => void`; button **"Apply default tiers"** after the status actions, before "Clear selection", `busy`-disabled like the rest.
- `App.tsx`: handler mirroring `apply(status)` — collect `[...selectedIds]`, call the endpoint, then reuse the existing result conventions verbatim: failed rows stay selected for direct retry; `refresh()` + `bumpChanges()`; message bar shows `N updated, M skipped (…)`, or per-item failure reasons. No sold-stamping equivalent; no filter-exemption bookkeeping needed (tiers don't affect filter membership), but rows are refreshed in place.

## 6. Iron-rule compliance

- **Rule 1 (content/ only):** every write lands in `content/items/**`. No new runtime files outside it; the new source files are Studio app code, permitted because the seller explicitly requested this feature (Rule 3).
- **Rule 2 (bilingual docs):** the doc updates listed in §8 are applied to English and `_zh` versions in the same commit.
- **Rule 4 (`reserved_for`):** no new surface. The write path is allowlist-driven; the read path already deep-picks tiers entries (`pickEditableValue`).
- **Rule 8 (config compat):** no `SiteConfig`/`UIConfig` fields are added; N/A.

## 7. Testing

1. **Endpoint tests** (existing `studioApi` test file): successful write; skip when merged defaults have no tiers; skip when deep-equal (idempotence); category default overrides site default; mixed-category selection; one item failing does not abort the batch; malformed id rejected.
2. **Extraction non-regression:** `editForm.test.ts` stays green; add a minimal shared-TierEditor collector test (returns `null` when unchanged, rows when changed).
3. **DefaultsPane tests** (panel-test pattern next to `ConfigPane.test.tsx`): checked + save emits `price.tiers`; unchecked + save omits/removes it; zero rows yields the save error.
4. **BulkToolbar test:** new button fires the callback, disabled while busy.
5. **Manual pass (`pnpm studio`):** set site default tiers → create a new item, confirm it inherits them → select existing items across categories → apply → verify message bar and on-disk `item.json` files.

## 8. Doc updates (same commit, EN + `_zh`)

- `docs/DESIGN.md` / `docs/DESIGN_zh.md` §22 (Seller Studio): default tiers in the defaults pane; the bulk apply action.
- `docs/CURRENT_FUNCTIONALITY.md` / `_zh`: feature list additions.
- `docs/TECH_REQUIREMENTS.md` / `_zh` §30: add a `POST /api/items/bulk-apply-tiers` row to the Studio endpoint table (which already lists `POST /api/items/bulk-status`).
