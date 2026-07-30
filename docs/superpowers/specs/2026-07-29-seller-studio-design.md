# Seller Studio — Local-Only Seller Dashboard

**Date:** 2026-07-29
**Status:** Design approved, ready for implementation planning
**Roadmap item:** "Seller dashboard (local-only GUI)" — `docs/FEATURES_ROADMAP.md`, listed as the key non-CS-user growth unlock

---

## 1. Purpose

Sellers currently manage listings entirely through CLI scripts (`pnpm create-item`,
`pnpm mark-sold`, `pnpm upload-images`, `pnpm push`). Non-technical sellers stall on
two tasks in particular: getting photos onto the CDN, and changing the status of
several items at once after a weekend of sales.

Seller Studio is a browser UI that runs **only on the seller's own machine**. It covers
four operations:

1. Drag-and-drop image upload, reorder, delete, and push to R2
2. Multi-select items and change status in bulk (sold / pending / draft)
3. Create and edit items through a schema-driven form instead of hand-editing JSON
4. Commit and push the resulting changes to go live

It is never deployed. The site remains a Next.js static export on GitHub Pages, and
nothing in this design adds a runtime server to the published site.

## 2. Non-Goals

- No multi-seller support, no authentication, no remote access (v3 concerns)
- No buyer-facing behaviour changes whatsoever
- No React component unit tests (see §8)
- No new `content/config.ts` fields (see §7)

## 3. Run Model

A single process: `pnpm studio` starts one Vite dev server. A custom Vite plugin
routes `/api/*` to the studio API handler; everything else is served as the frontend.
One port, no CORS, no concurrent-process management, one terminal to close.

The server binds **`127.0.0.1`**, explicitly not `0.0.0.0`. This API writes to the
filesystem, holds R2 credentials, and runs `git` — it must not be reachable from the
local network.

Port is hardcoded to **5174**, overridable with `pnpm studio --port 5200`. No config
field is introduced; a field would add downstream migration burden for a problem
nobody has reported yet.

## 4. File Layout

```
studio/                        # new; dev-time only, never touched by `next build`
  index.html
  src/
    App.tsx
    panes/                     # ItemList, ImagePane, EditForm, PublishPane
    components/
  vite.config.ts               # includes the /api middleware plugin

scripts/studio.ts              # `pnpm studio` entry: starts the Vite dev server
scripts/lib/
  imageSync.ts                 # new — pure logic extracted from sync-images.ts
  itemEdit.ts                  # new — surgical JSONC edits to item.json
  studioApi.ts                 # new — API handlers, framework-independent
```

`studio/` sits outside `app/`, so it cannot leak into the static export. This is why
the rejected alternative — a `/studio` route inside `app/` gated on `NODE_ENV` — was
not chosen: Iron Rule 3 designates `app/` as production code, and the risk of a gated
route reaching build output is real.

## 5. Two Hard Constraints From The Existing Codebase

### 5.1 item.json is JSONC and must be edited surgically

`item.json` files carry `// options: ...` comments written by `pnpm create-item`, and
may carry a `reserved_for` field. `itemJsonSchema` (`lib/content/schema.ts:183`)
deliberately **strips** `reserved_for` via Zod's default strip behaviour.

Therefore studio must never save by "Zod parse → re-serialize": that would delete both
the seller's comments and their private buyer information.

All writes go through `scripts/lib/itemEdit.ts`, which generalizes the existing
`applyMarkSold` pattern (`scripts/lib/markSold.ts`) into:

```ts
applyFieldEdits(text: string, edits: Array<{ path: (string|number)[]; value: unknown }>): string
```

using `jsonc-parser`'s `modify` / `applyEdits`. `applyMarkSold` becomes a thin wrapper
over it, so its existing tests keep protecting the behaviour.

### 5.2 sync-images.ts needs extraction before reuse

`scripts/sync-images.ts` is ~500 lines with all logic in private functions, coupled to
`console` output and `process.exit`. The upload path alone is 13 sequential steps.

Extract the pure logic into `scripts/lib/imageSync.ts`, returning structured results.
Exit codes and printing stay in the CLI layer, so `pnpm upload-images` behaviour is
unchanged while studio can call the same code and stream progress.

This is targeted refactoring required by the feature, not opportunistic cleanup.

## 6. API Surface

| Endpoint | Purpose |
|---|---|
| `GET /api/items` | List all items via `lib/content/loader.ts`, plus each item's image files |
| `POST /api/items` | Create an item, reusing `scripts/lib/itemTemplate.ts` |
| `PATCH /api/items/:cat/:name` | Partial field update via `itemEdit.ts` (comment-preserving) |
| `POST /api/items/:cat/:name/images` | Write uploaded images to disk |
| `DELETE /api/items/:cat/:name/images/:file` | Delete one image |
| `POST /api/sync-images` | Push to R2; streams per-file progress over SSE |
| `POST /api/publish` | `git add` / `commit` / `push`; returns the change summary |

### Single source of truth

The frontend keeps no local copy of item state. After any write it re-fetches
`GET /api/items` in full. Item counts are in the dozens, so full refresh is simpler
than incremental sync and cannot drift from disk.

Because the list is read through `lib/content/loader.ts`, categories, visibility,
price tiers, and status shown in studio match the live site exactly — studio can't say
"fine" and produce a different build.

## 7. Panes

1. **Item list** (main view) — table, one checkbox per row, columns for status, price,
   image count. A bulk-action toolbar appears when any row is selected.
2. **Image pane** (drawer, single item selected) — drop zone, thumbnail grid with
   drag reorder, per-image delete.
3. **Edit form** (second tab of the same drawer) — fields grouped as Basic / Price /
   Specs / Platform / Student / i18n. Saving sends **only changed fields**; the `PATCH`
   applies JSONC edits to exactly those paths.
4. **Publish pane** — file list parsed from `git status --porcelain`, plus a
   "Commit and push" button.

### Image order is persisted as filename prefixes

Manifest keys are file paths, so ordering must live in the filenames (`01-…jpg`,
`02-…jpg`), not in frontend state. Reordering renames files.

## 8. Failure Semantics

**Bulk edits do not roll back.** Each item is written independently and the response
reports per-item outcomes:

```jsonc
{ "ok": 19, "failed": [{ "id": "electronics/lamp", "error": "EACCES" }] }
```

This matches the failure philosophy already in `sync-images.ts` (`FIX M2`): one file's
failure must not discard the whole batch, and successful work must land. Rolling back
is more dangerous — undoing half-written files can itself fail, producing genuine
inconsistency. The frontend marks failed rows red and keeps them selected for retry.

**`POST /api/publish` is the exception:** git operations are atomic, so failure is
total and per-item semantics don't apply. Publish must re-read the change list
immediately before committing, so the diff the seller approved is the diff that ships.

**`POST /api/sync-images` holds a server-side mutex** — one sync at a time. Two
concurrent runs would both write `image-manifest.json` and the checksum cache, which
corrupts data. Progress streams over SSE because pushing dozens of photos to R2 can
take a minute or two, and a button with no feedback gets clicked again.

## 9. Input Validation

The API accepts `:cat`, `:name`, and filenames from the browser. Three checks are
mandatory:

- **Path traversal** — validate `cat` / `name` / filenames against the `lib/utils/slug.ts`
  allowlist (`[a-z0-9-]` only), *and* assert the resolved absolute path still lies
  inside `content/items/`. Both layers, because an allowlist may later be relaxed.
- **Image type** — extension allowlist plus magic-byte header check; accept only
  jpg / png / webp / gif.
- **Field writes** — every `PATCH` path must be a known `itemJsonSchema` field, and the
  value must pass that field's Zod validation before it reaches disk. `reserved_for` is
  on an explicit deny list: it is not in the schema, and studio should not become a way
  to write it.

## 10. Testing

| Test file | Covers |
|---|---|
| `scripts/lib/itemEdit.test.ts` | comments preserved, `reserved_for` preserved, field allowlist rejection, multi-field edits |
| `scripts/lib/imageSync.test.ts` | extracted logic behaves as before — regression net for the refactor |
| `scripts/lib/studioApi.test.ts` | handlers called directly: traversal rejected, magic-byte check, partial-failure response shape, sync mutex |
| `scripts/lib/markSold.test.ts` | already exists; must keep passing after `applyFieldEdits` refactor |

React components get **no unit tests**. They are thin, run only locally, and are
verified by clicking through once. The testing budget goes to server-side logic that
can damage seller data.

## 11. Distribution to Downstream Sites

- Add `"studio"` to `TEMPLATE_PATHS` in `scripts/update-site.ts:23`. (`scripts` is
  already listed, so the new `scripts/lib/*.ts` files ship automatically.)
- Update the Step 2 path list in `docs/UPDATE_GUIDE.md` **and** `docs/UPDATE_GUIDE_zh.md`,
  as that file's comment requires.
- Add `vite` + `@vitejs/plugin-react` to `devDependencies`. Downstream sellers who run
  `pnpm studio` before `pnpm install` would hit a module-resolution stack trace, so
  `scripts/studio.ts` resolves `vite` up front and prints "run `pnpm install` first"
  instead of throwing.

## 12. Documentation Updates (bilingual — Iron Rule 2)

- `docs/CURRENT_FUNCTIONALITY.md` / `_zh` — new Studio section
- `docs/FEATURES_ROADMAP.md` / `_zh` — mark Seller dashboard ✅
- `docs/IMPLEMENTATION_PLAN.md` / `_zh` — add Phase 18, mark complete when done (Iron Rule 7)
- `docs/UPDATE_GUIDE.md` / `_zh` — Step 2 path list
- `.claude/CLAUDE.md` — add `pnpm studio` to the Common Seller Tasks table

## 13. Iron Rule Compliance

| Rule | How this design complies |
|---|---|
| 1 — sellers touch only `content/` | Studio writes only under `content/`, plus the generated `lib/generated/image-manifest.json` that `upload-images` already owns |
| 2 — bilingual docs | §12 lists both versions of every doc |
| 3 — `app/` is production code | Studio lives in `studio/`; nothing is added to `app/` |
| 4 — never render `reserved_for` | Field is on the write deny list and preserved (not stripped) on every edit |
| 5 — manifest stays in git | Unchanged; studio calls the same sync logic |
| 6 — `pricing.ts` has no `"use client"` | Not touched |
| 7 — mark phases complete | Phase 18 added and checked off on completion |
| 8 — config fields optional | No new config fields introduced (§3) |

## 14. Visual Direction

Studio is a tool a single seller opens several times a week — a dense table plus a
drawer form. There is no hero. Density and legibility come first, with boldness spent
in exactly one place.

### 14.1 Subject vocabulary

The material world of resale is consignment paperwork: NCR carbon-copy forms,
handwritten price tags, thermal shipping labels, rubber stamps. The project already has
a shipping calculator and a `sold_date` field, so this vocabulary is literal, not a
borrowed metaphor.

### 14.2 Palette — carbon-copy form, not cream paper

| Token | Value | Use |
|---|---|---|
| `carbon-pale` | `#E4EBEF` | Page background — the cool grey-blue of a form's second copy |
| `carbon-rule` | `#C2CFD6` | Table rules, field underlines |
| `ink` | `#1B2A35` | Body text and data — cool pen black |
| `ink-soft` | `#5C6E7A` | Secondary labels, help text |
| `stamp` | `#B3241E` | **`sold` only** — stamp red |
| `pending` | `#8A6A12` | `pending` status — archival ochre |

Cream + serif + terracotta was rejected deliberately: it is one of the current
AI-default looks and appears regardless of subject. Carbon-copy grey-blue carries the
same paper quality but belongs to paperwork rather than a boutique, and a cool ground
lets stamp red carry real signal — a warm ground flattens it.

### 14.3 Typography

All faces install locally via `@fontsource` npm packages, never a CDN — a local tool
must work offline.

- **Data / utility:** `Courier Prime`. Prices, dates, dimensions, filenames. Monospace
  aligns amounts and dates for free, and it is where the carbon-copy reference earns
  its place.
- **Interface:** `IBM Plex Sans`. Neutral, legible at small sizes.
- **Headings / status labels:** `Archivo Narrow`. Condensed, drawn from labels and form
  column headers — not a display serif.

### 14.4 Layout

```
┌────────────────────────────────────────────────────────────────┐
│ SELLER STUDIO            content/ · 34 items · 3 uncommitted   │
├──────────┬─────────────────────────────────────────────────────┤
│ electronics 12│ ☐  NAME              STATUS   PRICE   IMG      │
│ books       9 │ ☐  Desk lamp         avail    $24.00   4       │
│ furniture   6 │ ☑  IKEA shelf     ╱SOLD╱      $60.00   7       │
│ misc        7 │ ☑  Monitor stand  ╱SOLD╱      $15.00   2       │
│ ─────────────│ ☐  Textbook CS61A    pending   $45.00   3       │
│ sold       18 │                                                │
│ drafts      2 │                                                │
├──────────┴─────────────────────────────────────────────────────┤
│ 2 selected   [Mark sold]  [Pending]  [Draft]        [Publish 3]│
└────────────────────────────────────────────────────────────────┘
```

Structural devices encode real information only. Left-rail numbers are actual counts;
there is no 01 / 02 / 03 numbering, because an item list is not a sequence. The header
surfaces the uncommitted-change count most prominently, since editing without pushing
is this tool's one true failure mode.

### 14.5 Signature: the SOLD rubber stamp

Bulk-marking sold presses a stamp impression onto the selected rows — slight rotation
(about -4°), uneven ink edges, a single press animation, then the row settles into its
sold state. This is the only bold element; everything around it stays quiet: no
decorative radii, no gradients, no stacked shadows.

It earns the signature slot because it *is* the reason the tool exists: "sold three
things this weekend, mark them all at once."

Under `prefers-reduced-motion` the end state renders directly, with no press animation.

### 14.6 Quality floor

Responsive down to narrow screens (table collapses to cards), visible keyboard focus,
reduced motion respected. Stated once here rather than announced in the UI.
