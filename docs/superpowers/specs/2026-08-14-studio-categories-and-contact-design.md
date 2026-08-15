# Design: Studio coverage for categories and contact QR images

**Date:** 2026-08-14
**Status:** Approved (auto-mode task — brainstormed and self-reviewed without an interactive checkpoint, per task instructions)

## 1. Problem

Seller Studio (`studio/src/`, `scripts/lib/studioApi.ts`) is the local-only GUI sellers use instead of hand-editing `content/`. It already covers items, site-wide config, photos, defaults, price tiers, bulk status, and publish. Three `content/` surfaces are still seller-hand-edit-only:

1. `content/items/<category>/_category.json` — no Studio endpoint reads or writes it.
2. Creating a brand-new category — `handleItemCreate` (`scripts/lib/studioApi.ts:1009-1072`) already `mkdir`s a category folder on the fly when an item is created in an unseen category (comment at line 1029: *"No `_category.json` is written — `lib/content/loader.ts` derives a display name from the slug when it is absent"*), but there is no explicit "create a category" action, and no way to give it metadata.
3. `content/contact/*.png` — QR code images referenced by `contact.platforms[].qr_image` (`lib/config/types.ts`). Studio's Config pane can already edit the `qr_image` path as text, but nothing uploads the actual file. `scripts/sync-images.ts` already copies `content/contact/` → `public/contact/` verbatim during dev/build, entirely outside the CDN/R2 pipeline — that copy step is unaffected by this feature.

Key findings from exploration (agent research, cross-checked directly against the source):

- `studioApi.ts` has no HTTP framework — `handleStudioRequest(req)` is a plain function matched against `pathname`/`method`, wrapped in one try/catch that turns `StudioError` into `{status, body:{error}}`. New routes are added the same way.
- CSRF protection lives entirely in `studio/csrfGuard.ts`, wired into `studio/vite.config.ts`'s middleware *before* `handleStudioRequest` runs. It is method/header-based, not per-route, so every new POST/PUT/DELETE route is automatically covered — nothing project-specific to add.
- `categoryJsonSchema` already exists (`lib/content/schema.ts:190-199`) and is the only reader of `_category.json` today, via `lib/content/loader.ts:314-391`'s `buildCategoriesFromItems`. No Studio write path has ever touched this file.
- `content/config.ts`'s `Platform` type already has an optional `qr_image`/`label` pair (`lib/config/types.ts:3-15`) — no new config field is needed for this feature.
- The item-photo upload pipeline (`scripts/lib/studioImages.ts`) is already directory-parameterized and item-agnostic: `sanitizeUploadFilename`, `sniffImageType`, and `writeImage` take a plain `dir` argument, so they are directly reusable for `content/contact/` without modification.
- `studio/src/App.tsx`'s `categories` list (passed to `NewItemDialog`'s datalist and `FilterBar`) is currently derived from `items.map(i => i.categorySlug)` — a category with a folder but zero items would not appear anywhere in the UI today. This needs to change so an empty new category is immediately usable.
- `ConfigPane.tsx` renders `content/config.ts` as a flat list of `ConfigField`s (`scripts/lib/configEdit.ts`), each with a dotted/indexed `path` like `contact.platforms.2.qr_image` — arrays of objects are already flattened to scalar leaves by the existing AST-based parser. This means QR upload only needs to augment the rendering of fields matching that path pattern; no change to the config parser/writer is needed.

## 2. Scope

**In scope:**
- Studio can read and write `_category.json` (`display_name`, `description`, `icon`, `sort_order`) for any existing category folder.
- Studio can create a brand-new category folder, optionally seeded with `_category.json` metadata, via an extended "New item" dialog.
- Studio can upload, replace, and delete `content/contact/*.png` QR images, and keep a platform's `qr_image` field in the Config pane in sync with the uploaded file's path.

**Out of scope (YAGNI, and per the task's explicit constraints):**
- Renaming or deleting existing categories, or moving/cascading items between categories.
- Drag-to-reorder UI for `sort_order` — a plain integer input is enough; sellers who want fine control over ordering already think in numbers (mirrors how `price.tiers` amounts are edited).
- Syncing `content/contact/*.png` to the CDN/R2 — these files are git-tracked and served from `public/contact/` via the existing build-time copy step, never through `imageSync.ts`'s adapter path. Wiring them into `pnpm sync-images` / the "Push photos to CDN" flow would be a second feature with its own tradeoffs (batching, manifest entries) that nothing here requires.
- A `GET /api/contact/images` listing/orphan-detection endpoint. The Config pane already shows every `qr_image` path as editable text; a seller who deletes a file the config still references will see nothing render on the live site contact button, which is a debuggable, low-frequency failure mode, not one worth a new endpoint and UI surface today.
- Any new `content/config.ts` field. `contact.platforms[].qr_image` already exists and is already optional at the type level, so Iron Rule 8's checklist has nothing new to register in `scripts/lib/configDefaults.ts`.
- A generic form-schema engine for category fields (mirroring `studio/src/fields.ts`'s `FIELD_GROUPS`). Four fields is too small a surface to justify pulling in the `FieldDescriptor`/`GroupId` machinery, which is coupled to per-item field paths (`EDITABLE_TOP_LEVEL_FIELDS`) that categories don't have; a small hand-rolled shared component is clearer and just as testable.

## 3. Semantics

**Category metadata:**
- `_category.json` is sparse, matching `_defaults.json`'s convention: a field is only written when it differs from `categoryJsonSchema`'s default (`display_name`/`description`/`icon`: `""`; `sort_order`: `null`). If every field is at its default, the file is deleted (or never created) rather than written as `{}` — mirrors `handleDefaultsPut`'s "an empty save deletes the file" rule exactly.
- Reading a category with no `_category.json`, or one that fails to parse, returns all-default metadata (the same fallback `buildCategoriesFromItems` already applies) — the pane never errors out over a missing or malformed file, it just shows blank fields.
- `PUT /api/categories/:slug` only succeeds for a category folder that already exists (`404` otherwise) — it edits metadata, it does not create categories. Creation is `POST /api/categories`.
- Editing is per-category, not batched: the pane's Save button writes one category at a time, mirroring the isolation of `handleBulkStatus`/`handleBulkApplyTiers` acting on individually-addressed items rather than one giant PUT.

**Category creation:**
- `POST /api/categories` creates the folder (`mkdir` with the same kebab-case slug allowlist + containment check `resolveItemDir` already applies) and, only if the seller filled in at least one metadata field, writes the sparse `_category.json` in the same request — one atomic-enough step from the seller's point of view, no separate "create then edit" round trip required for the common case.
- Creating a category whose folder already exists is a `409`, exactly like `handleItemCreate`'s existing-item check.
- A category created with no metadata behaves exactly as `handleItemCreate`'s implicit category creation already does today: `lib/content/loader.ts` derives the display name from the slug. No behavior changes for the existing implicit-creation path — this feature only adds an explicit, metadata-capable alternative alongside it.

**Contact QR images:**
- Filenames are sanitized and disambiguated exactly like item photos (`sanitizeUploadFilename`, then `writeImage`'s collision-avoiding `wx` retry loop with a `-1`, `-2`, … suffix) — reused verbatim, not reimplemented.
- Only PNG is accepted: extension **and** magic bytes must both say PNG (`sniffImageType(bytes) === "png"`), matching the task's framing of these as `content/contact/*.png` and the existing convention in `content/config.ts`'s commented example (`/contact/wechat-qr.png`). This is stricter than the item-photo pipeline (which accepts jpg/webp/gif too) by design — QR codes are always exported as PNG by every generator a seller is likely to use, and a tighter allowlist here is one less thing that can silently fail to render inside `<QRModal>`.
- "Replace" is not a separate server operation: the client deletes the platform's current `qr_image` file (if any) and then uploads the new one, then updates the draft field — same two calls the seller could make by hand via "remove" + "upload", just chained behind one button for convenience.
- Deleting a QR image removes the file only; it does not touch `content/config.ts`. The Config pane clears the corresponding `qr_image` draft field locally (same in-memory-draft-until-Save model every other Config field already uses) so the seller sees the field go blank and must explicitly Save to persist that change — consistent with the rest of the pane, where nothing hits disk until Save.
- Upload/delete are local filesystem writes only, exactly like every other Studio image write — no CDN/R2 call, no `lib/generated/image-manifest.json` entry (that manifest is for `content/items/` photos synced to the CDN; QR images never go through that path).

## 4. Architecture

```
Browser (Studio SPA, studio/src/)                    Server (scripts/lib/studioApi.ts)
──────────────────────────────────                   ──────────────────────────────────
CategoriesPane.tsx  ──GET /api/categories────────────▶ listCategorySummaries()
                     ──PUT /api/categories/:slug─────▶ handleCategoryMetaPut()
                                                          │
NewItemDialog.tsx    ──POST /api/categories───────────▶ handleCategoryCreate()
  (mode: item | category)                                │  both call into
                                                           ▼
                                                  scripts/lib/studioCategories.ts
                                                  (resolveCategoryDir, readCategoryMeta,
                                                   writeCategoryMeta [sparsify], mkdir)
                                                           │
                                                           ▼
                                             content/items/<slug>/_category.json

ConfigPane.tsx       ──POST /api/contact/images───────▶ handleContactImageUpload()
  (qr_image fields)  ──DELETE /api/contact/images/:f──▶ handleContactImageDelete()
                                                           │  both call into
                                                           ▼
                                                  scripts/lib/studioContact.ts
                                                  (resolveContactDir, isValidContactFilename,
                                                   reuses sanitizeUploadFilename/sniffImageType/
                                                   writeImage from studioImages.ts)
                                                           │
                                                           ▼
                                                content/contact/<file>.png
```

`App.tsx` fetches the category list once (alongside `refresh()`) and threads it to `FilterBar`, `NewItemDialog`, and the new `CategoriesPane`, replacing the current items-derived `categories` array so a folder-only category is visible everywhere immediately after creation.

## 5. Component details

### Server

**`scripts/lib/studioCategories.ts` (new)** — pure filesystem module, no HTTP, mirroring how `studioImages.ts` and `itemDefaults.ts` are factored out from `studioApi.ts`:
- `resolveCategoryDir(projectRoot, slug): string` — same two-layer check as `resolveItemDir`/`resolveDefaultsPath` (kebab-case allowlist via `isValidSlug`, then resolved-path containment against `content/items/`).
- `readCategoryMeta(dir): Promise<ParsedCategoryJson>` — reads `_category.json` via `readJsonc` (see below) + `categoryJsonSchema.safeParse`, falling back to all-defaults on any read/parse failure, exactly mirroring `buildCategoriesFromItems`'s existing fallback.
- `sparsifyCategoryMeta(meta): Record<string, unknown>` — drops any field equal to its schema default; the write path deletes the file entirely when the result is empty.
- `writeCategoryMeta(dir, meta): Promise<void>` — sparsify, then either `fsPromises.rm(path, {force: true})` (all-default) or `fsPromises.writeFile(..., JSON.stringify(sparse, null, 2) + "\n")` (matches `_defaults.json`'s exact formatting convention).
- `listCategorySummaries(projectRoot): Promise<CategorySummary[]>` — reads every directory under `content/items/` that passes `isValidSlug` (naturally excluding `_defaults.json`, `_template.json`, and any `_`-prefixed folder), reads each one's metadata, and counts items per category by calling the existing `loadAllItemsRaw()` and grouping by `categorySlug` — reusing the loader's own definition of "what counts as an item" rather than re-deriving one from `readdir`.

`lib/content/loader.ts`'s private `readJsonc` (line 23) gains an `export` keyword so `studioCategories.ts` can reuse the exact same JSONC-tolerant parser the site build itself uses — guaranteeing Studio's read of `_category.json` never disagrees with the loader's. No other change to `loader.ts`.

**`scripts/lib/studioContact.ts` (new)** — same shape of module for `content/contact/`:
- `resolveContactDir(projectRoot): string` — `path.join(projectRoot, "content", "contact")`; no seller-supplied path segment to validate at this level (the directory is fixed), so no containment check is needed here — the filename check below is what stands between browser input and the filesystem.
- `isValidContactImageFilename(name): boolean` — same shape as `IMAGE_FILENAME_RE` but PNG-only: `/^[a-z0-9][a-z0-9._-]*\.png$/i`.
- Upload and delete call straight into `studioImages.ts`'s existing `sanitizeUploadFilename`, `sniffImageType`, and `writeImage` (all already `dir`-parameterized) — `studioContact.ts` adds only the PNG-only filename gate and a thin `deleteContactImage(dir, filename)` (`fsPromises.rm` with `ENOENT` → `StudioError(404, …)`, since contact images don't need `deleteImage`'s item-photo-list return shape).

**`scripts/lib/studioApi.ts` (edited)** — new routes added to `handleStudioRequest`'s dispatch chain, same style as every existing route:
- `GET /api/categories` → `listCategorySummaries`.
- `POST /api/categories` → `handleCategoryCreate` (body: `{slug, meta?: CategoryMetaInput}`; `409` if the folder exists, `400` on a bad slug).
- `PUT /api/categories/:slug` (new regex, `CATEGORY_ROUTE_RE`, matched the same decode-after-match way as `ITEM_ROUTE_RE`) → `handleCategoryMetaPut` (`404` if the folder doesn't exist).
- `POST /api/contact/images` → `handleContactImageUpload` (body: `{filename, contentBase64}`, same shape as item-photo upload; response `{file, path: "/contact/<file>"}`).
- `DELETE /api/contact/images/:filename` (new regex `CONTACT_IMAGE_ROUTE_RE`) → `handleContactImageDelete`.

### Client

**`studio/src/api.ts` (edited)** — new thin wrappers following the existing `fetch`+`readJsonBody`+`errorMessage` pattern: `fetchCategories()`, `createCategory(slug, meta?)`, `saveCategoryMeta(slug, meta)`, `uploadContactImage(file)`, `deleteContactImage(filename)`.

**`studio/src/components/CategoryMetaFields.tsx` (new)** — a small controlled-input group (icon text input, display name text input, description textarea, sort-order number input with an empty string mapping to `null`), built from plain `<label className="field">` markup matching `NewItemDialog`/`ConfigPane`'s existing conventions, not the item-editing `FieldInput`/`fields.ts` engine (see Scope). Takes `{value, onChange}` so both call sites (`CategoriesPane` and `NewItemDialog`) own their own state and save button.

**`studio/src/panes/CategoriesPane.tsx` (new)** — a header-triggered dialog (`showCategories` state in `App.tsx`, same pattern as `showDefaults`/`showConfig`) listing every category from `fetchCategories()`, each row expandable into a `CategoryMetaFields` editor with its own Save button and dirty-indicator dot (matching `ConfigPane`'s `field-dot` convention). No create action here — creating stays in `NewItemDialog` per the task's suggested shape — but an empty-state hint points the seller at the "New item" button's category mode.

**`studio/src/panes/NewItemDialog.tsx` (edited)** — adds a two-option mode toggle ("Item" / "Category") above the existing form. Item mode is unchanged. Category mode swaps the category-combobox + name + apply-defaults-checkbox layout for: a single slug input (same `SLUG_RE` validation), and a collapsible "Add details" section wrapping `CategoryMetaFields` (collapsed by default — most categories won't need metadata on day one). Submits via the new `createCategory` API call instead of `createItem`.

**`studio/src/panes/ConfigPane.tsx` (edited)** — `FieldRow` gains a check for `field.path` matching `/^contact\.platforms\.\d+\.qr_image$/`; when true, it renders the existing text input (a seller can still hand-type a path) plus an inline upload control beneath it. Upload/replace calls `uploadContactImage` and feeds the returned `path` into the same `onChange(raw)` callback every other field already uses (so the change is a normal dirty draft until Save); delete calls `deleteContactImage` with the current value's basename and then `onChange("")`.

**`studio/src/App.tsx` (edited)** — `StudioChrome` gains `showCategories` state and a `header.categories` button next to `header.defaults`. `App`'s `refresh()` gains a parallel `fetchCategories()` call (new `categories` state of `CategorySummary[]`); the `categories: string[]` passed to `FilterBar`/`NewItemDialog` becomes `categoryList.map(c => c.slug)` instead of the items-derived set, so a category created with zero items is immediately selectable and filterable.

## 6. Iron-rule compliance

- **Rule 1 (`content/` boundary):** every new write lands under `content/items/<slug>/_category.json` or `content/contact/*.png` — both inside `content/`. No route touches anything outside it.
- **Rule 2 (bilingual docs):** `docs/CURRENT_FUNCTIONALITY.md` + `_zh` and `docs/DESIGN.md` + `_zh` are updated in the same implementation pass (§8 below), not deferred.
- **Rule 4 (`reserved_for`):** untouched — this feature never reads or renders item fields at all.
- **Rule 5 (`image-manifest.json`):** untouched — QR images never enter the CDN sync path that populates it.
- **Rule 8 (config field additions):** not triggered. No new field is added to `SiteConfig`/`UIConfig`/`Platform` — `qr_image` already exists and is already optional. `scripts/lib/configDefaults.ts` needs no new entry.

## 7. Testing

**Server (`scripts/lib/studioApi.test.ts`, new `describe` blocks, same `mkdtemp` sandbox pattern as the existing `POST /api/items` suite):**
- `GET /api/categories`: empty `content/items/` → `[]`; a folder with no `_category.json` → all-default metadata + correct `itemCount`; a folder with a sparse `_category.json` → only the set fields differ from default; `itemCount` matches the number of `item.json` files under the category, verified via a real `loadAllItemsRaw()` read against the sandbox.
- `POST /api/categories`: creates an empty folder with no `meta`; creates folder + sparse `_category.json` when `meta` has at least one non-default field; `409` when the folder already exists; `400` on a non-kebab-case slug.
- `PUT /api/categories/:slug`: writes a sparse file for an existing category; writing all-default metadata deletes an existing `_category.json`; `404` for a category folder that doesn't exist; `400` for a non-integer `sort_order`.
- `POST /api/contact/images`: writes into `content/contact/`; rejects a `.png`-named file whose bytes aren't a real PNG (magic-byte check); rejects a `.jpg` upload outright; sanitizes an unsafe filename; a second upload of the same name gets a `-1` suffix (via the reused `writeImage`).
- `DELETE /api/contact/images/:filename`: removes an existing file; `404` for a missing one.

**Component (Vitest + RTL, `renderWithStudioI18n`, `fetch` stubbed at the boundary — same pattern as `DefaultsPane.test.tsx`):**
- `CategoriesPane.test.tsx`: renders categories from a stubbed `GET /api/categories`; editing and saving a row calls `PUT /api/categories/:slug` with the edited fields and shows the saved confirmation.
- `NewItemDialog.test.tsx` (extended): switching to category mode changes the form; submitting calls `createCategory` with the slug and any filled-in metadata; slug validation still rejects non-kebab-case input in both modes.
- `ConfigPane.test.tsx` (extended): a `qr_image` field renders the upload control; a successful upload writes the returned path into the field's draft (shown as dirty, not yet saved); delete clears the field's draft.

**Manual (documented in the plan, run once during implementation):** `pnpm studio`, create a category with metadata via the New Item dialog, verify it appears in the Categories pane and the category filter immediately; edit its metadata and confirm `content/items/<slug>/_category.json` on disk; upload a QR PNG for a contact platform, Save the config, confirm `content/contact/<file>.png` exists and the live `/contact` button (via `pnpm dev`) shows the uploaded image.

## 8. Doc updates

Both touched in the same pass as the implementation, per Iron Rule 2:
- `docs/CURRENT_FUNCTIONALITY.md` / `_zh` — "Seller Studio" section gains category metadata editing, category creation, and contact QR image management to the feature list.
- `docs/DESIGN.md` / `_zh` — §22 (Seller Studio) documents the three new endpoints and their request/response shapes, following the existing style used for the price-tier and PDF-export additions; §6 (`_category.json` schema) and §7 (contact/QR) gain a one-line cross-reference noting Studio can now write these files.
