# Seller Studio i18n — Make Studio UI Follow the Language Selector

> Spec v1.0 — 2026-08-13

## 1. Overview & Decisions

Seller Studio currently has a `LocaleSwitcher` that controls only the item-content
display language (name/description). All UI chrome — buttons, labels, tabs, hints,
statuses, errors — is hardcoded in English. This spec extends the existing
`displayLocale` to also drive the Studio's full UI language.

### Decisions (from user Q&A)

| Question | Decision |
|---|---|
| Scope | **Comprehensive** — translate every string Studio renders from its own code, plus the setup-readiness checklist. Low-level technical `StudioError` messages and auto-parsed config field docs remain English. |
| Translation location | **Hybrid** — built-in template dictionary (`studio/src/i18n/`) as the default, with optional seller overrides via `content/config.ts`. |
| Server-generated strings | **Client-side + checklist** — most "deep" strings are client-side and get translated. The readiness checklist (shared with `pnpm doctor`) gets structured `params` so the client can translate; the English prose stays as a fallback. Raw `StudioError` messages and config doc strings stay English. |
| Locale source | Tied to the existing `LocaleSwitcher` / `availableLocales` from the site config. One `displayLocale`, two effects: item content + UI chrome. |

## 2. Architecture

### 2.1 Approach: React Context + typed keys

A small i18n module with a `React.Context` provider and a `useStudioT()` hook.
This avoids prop-drilling `displayLocale` through ~20 components.

```
App.tsx
  │  displayLocale (state, already exists)
  │  overrides (fetched from /api/items)
  │
  └─ StudioI18nProvider locale={displayLocale} overrides={overrides}
       │
       ├─ useStudioT() → { t, locale }   ← used by every pane/component
       │
       ├─ <header> ... <FilterBar /> ... <ItemList /> ... etc.
       │
       └─ <Drawer> → <EditForm /> → <FieldInput />, <TierEditor />
```

### 2.2 Merge order (highest priority wins)

```
1. Seller override for the active locale  (from content/config.ts)
2. Built-in dictionary for the active locale  (e.g. strings.zh.ts)
3. Built-in English dictionary  (strings.en.ts — the complete source of truth)
```

### 2.3 The i18n module (`studio/src/i18n/`)

| File | Purpose |
|---|---|
| `types.ts` | `StudioKey = keyof typeof EN`, `StudioStrings = Record<StudioKey, string>`. A typo in `t(…)` is a compile error. |
| `strings.en.ts` | Complete built-in English dictionary. Every string the Studio can render. Namespaced keys (e.g. `app.title`, `filter.status.active`, `header.newItem`). |
| `strings.zh.ts` | Built-in Chinese overrides (same keys). Partial — any missing key falls back to EN. |
| `resolve.ts` | `resolveStudioStrings(locale, overrides)` — the merge function. Also `format(template, params)` for `{count}`-style interpolation. |
| `StudioI18n.tsx` | `StudioI18nProvider` + `useStudioT()` returning `{ t, locale }`. |

### 2.4 Parameterized strings

Strings with dynamic values use `{param}` syntax:

- `app.itemCount` → `"content/ · {count} items"`
- `bulk.selected` → `"{count} selected"`
- `editForm.unsaved` → `"{count} unsaved change{plural}"` (plural-aware)

A small `format()` helper replaces `{param}` with the provided value. English
pluralization is handled via a `{plural}` token that expands to `"s"` or `""`
based on the count. Other locales override the whole template string.

## 3. Built-in Dictionary — Key Namespace

The dictionary is flat with dot-separated namespaces. Key groups:

| Prefix | Source Component(s) |
|---|---|
| `app.` | `App.tsx` — header title, item count, uncommitted count |
| `header.` | `App.tsx` — header buttons (Config, Setup, Defaults, New item) |
| `sync.` | `SyncBar.tsx` — "Push photos to CDN", progress, status |
| `gettingStarted.` | `GettingStarted.tsx` — "All set…", "Show checklist", "Hide", "Advanced (optional)", etc. |
| `filter.status.` | `FilterBar.tsx` — Active, Available, Reserved, Pending, Draft, Sold, All |
| `filter.` | `FilterBar.tsx` — search placeholder, category label, sort labels, views, item count |
| `bulk.` | `BulkToolbar.tsx` — "Mark sold", "Mark pending", etc. |
| `publish.` | `PublishPane.tsx` — "Publish", "Nothing to publish…", "Saving…", "Publishing…", load errors |
| `itemList.` | `ItemList.tsx` — column headers (Photo, Name, Category, Status, Price), aria labels |
| `newItem.` | `NewItemDialog.tsx` — "New item", "Category", "Item name (slug)", "Apply defaults", "Create", "Cancel", validation errors |
| `drawer.` | `Drawer.tsx` — "Photos", "Details", "Close" |
| `editForm.` | `EditForm.tsx` — "Save changes", "Saving…", "Discard", "No unsaved changes", "Nothing changed.", "Saved.", group badges |
| `field.` | `fields.ts` — field labels, hints, group titles |
| `fieldValue.` | `fieldValues.ts` — "must be a number", "must be a whole number" |
| `editFormProblem.` | `editForm.ts` — "pick a unit to set dimensions", "pick a unit to set a weight" |
| `configPane.` | `ConfigPane.tsx` — "Site config", "Sections", "Save section", "Close", danger messages, "Missing", "All translations", "Other", hints |
| `defaults.` | `DefaultsPane.tsx` — "Item defaults", "Site-wide", "Save defaults", "Close", "Loading…", scope labels, inherited hints, validation messages |
| `imagePane.` | `ImagePane.tsx` — "Drop photos here", "Choose photos", "Remove", "No photos yet.", "No preview", non-editable hints |
| `tierEditor.` | `TierEditor.tsx` — "Price tiers", "Label", "From (mi)", "To (mi)", "Amount", "Remove", "Add tier", "No tiers." |
| `statusBadge.` | `StatusBadge.tsx` — status labels (available, sold, pending, reserved, draft) |
| `emptyState.` | `App.tsx` — "No items yet.", "Use **New item**…", "No items match your filters.", "Clear filters" |
| `readiness.` | `GettingStarted.tsx` + Phase 2 — checklist items (client-side chrome + item titles/details) |
| `localeSwitcher.` | `LocaleSwitcher.tsx` — aria-label "Display language" |
| `themeToggle.` | `ThemeToggle.tsx` — aria labels |
| `common.` | Shared — "Error", "Saving…", "Loading…", "Close", "Save" |

The full key list is determined at implementation by exhaustively extracting every
hardcoded string from the 31 studio source files.

## 4. Seller Overrides (Hybrid)

### 4.1 Config field

A new optional field in `SiteConfig` (`lib/config/types.ts`):

```ts
// content/config.ts — optional seller override
studio?: {
  translations?: Record<string, Record<string, string>>;
  // locale → key → translated string
  // Merged on top of the built-in dictionary for that locale.
};
```

**Iron Rule 8 compliance:**
- Type definition: `?` (optional) ✓
- Consumer code: read with `?? {}` ✓
- Upstream content/config.ts: leave absent (no demo value needed) — it's an override
- configDefaults.ts: NOT registered (it's a purely optional override; absent is the
  correct default. Rule 8's checklist applies to config fields that every site
  should have. Studio overrides are optional machinery.)

### 4.2 Server exposure

The server (scripts/lib/studioApi.ts) already returns `defaultLocale` and
`availableLocales` from `GET /api/items`. We add the `studio.translations` slice
(if present) to the same response body:

```json
{
  "items": [...],
  "defaultLocale": "en",
  "availableLocales": ["en", "zh"],
  "studioTranslations": { "zh": { "app.title": "Seller Studio" } }
}
```

The client (App.tsx) stores this alongside availableLocales and passes it to
`StudioI18nProvider`.

### 4.3 Merge logic

```ts
function resolveStudioStrings(
  locale: string,
  overrides: Record<string, Record<string, string>>,
): StudioStrings {
  return {
    ...EN,                                  // built-in English (complete)
    ...(BUILTIN[locale] ?? {}),             // built-in locale override
    ...(overrides[locale] ?? {}),           // seller override for this locale
  };
}
```

## 5. String Replacement — Phase 1

All files in `studio/src/` (31 non-test files) that contain hardcoded display
strings get their strings replaced with `t(…)` calls. The rough scope:

| File | Strings to extract |
|---|---|
| App.tsx | Header title, buttons, empty states, error messages, counts |
| FilterBar.tsx | Status tabs, sort options, search placeholder, labels, aria labels, item count |
| ItemList.tsx | Column headers, stamp text, aria labels |
| ItemGrid.tsx | (aria labels, shared with ItemList patterns) |
| ItemCard.tsx | (item display strings) |
| BulkToolbar.tsx | Action labels, "N selected", "Clear selection", "Apply default tiers" |
| PublishPane.tsx | "Publish", "Saving…", "Publishing…", empty/error messages, hints |
| SyncBar.tsx | "Push photos to CDN", progress messages |
| GettingStarted.tsx | "All set…", "Show checklist", "Hide", "Getting started — X of Y done", "Advanced (optional)", "Done: ", "Still to do: ", "Open Config", "New item", aria labels, skeleton |
| NewItemDialog.tsx | Title, labels, hints, validation message, buttons |
| Drawer.tsx | Tab labels, "Close", aria labels |
| EditForm.tsx | "Save changes", "Saving…", "Discard", "No unsaved changes", "Nothing changed.", "Saved.", group badges, loading |
| fields.ts | All field labels, hints, group titles |
| fieldValues.ts | "must be a number", "must be a whole number" |
| editForm.ts | "pick a unit to set dimensions", "pick a unit to set a weight" |
| ConfigPane.tsx | "Site config", "Sections", "Save section", "Close", "Missing", "All translations", "Other", danger messages, each hint string, "Saving…", "Saved.", loading |
| DefaultsPane.tsx | "Item defaults", "Site-wide", "Save defaults", "Close", "Loading…", "Price tiers", validation messages, "site: …" hints, aria labels |
| ImagePane.tsx | "Drop photos here", "Choose photos", "Remove", "No photos yet.", "No preview", hints, error messages |
| TierEditor.tsx | "Price tiers", "Label", "From (mi)", "To (mi)", "Amount", "Remove", "Add tier", "No tiers." |
| StatusBadge.tsx | Status names (rendered text — the badge renders the raw status string) |
| ThemeToggle.tsx | Aria labels |
| LocaleSwitcher.tsx | Aria-label "Display language" |
| useDialogBehavior.ts | (none — no display strings) |
| itemDisplay.ts | (none — pure data transformation) |
| filtering.ts | (none — pure data transformation) |
| api.ts | (none — no display strings) |
| Button.tsx | (none — generic component) |
| ItemThumb.tsx | (none — pure image display) |

### 5.1 StatusBadge special case

`StatusBadge` currently renders the raw status string directly (e.g. `"available"`).
In the localized UI, it should show the translated status label. The status strings
are already simple English words; we add a `translateStatus` helper or use
`t("statusBadge.available")` etc. The `ItemList`'s stamp animation (`"sold"`)
also gets translated.

### 5.2 Empty states

App.tsx has two empty-state blocks:
- "No items yet." + "Use **New item** in the header…"
- "No items match your filters." + "Clear filters"

Both get translated.

## 6. Phase 2: Readiness Checklist

The setup readiness report (`/api/readiness` → `buildReadinessReport` in
`scripts/lib/siteReadiness.ts`) is shared with the `pnpm doctor` CLI.

### 6.1 Approach

Keep the existing `ReadinessItem` shape (`title`, `detail` as English prose) as
the fallback, and add a new additive field:

```ts
export type ReadinessItem = {
  id: string;
  tier: ReadinessTier;
  title: string;        // English — kept as fallback
  detail: string;       // English — kept as fallback
  params?: {            // NEW — structured data for client-side translation
    variant: string;    // discriminator e.g. "template", "set", "missing"
    [key: string]: unknown;
  };
  done: boolean;
  action?: ReadinessAction;
};
```

The `params` object carries the dynamic values the client needs to compose a
localized string. For example:

| Item ID | Variant | Params | Client translation template |
|---|---|---|---|
| `identity` | `"template"` | `{ baseUrl }` | `"baseUrl 仍是模板值({baseUrl})"` |
| `identity` | `"set"` | `{ baseUrl }` | `"baseUrl 已设为 {baseUrl}"` |
| `image-storage` | `"missing"` | `{ provider, missing }` | `"已选 {provider},缺少: {missing}"` |
| `first-item` | `"empty"` | `{}` | `"尚无商品"` |
| `first-item` | `"has"` | `{ count }` | `"content/items/ 下有 {count} 件"` |
| `git-ready` | `"repo"` | `{}` | `"已找到仓库"` |
| `git-ready` | `"no-repo"` | `{}` | `"不是 git 仓库"` |

### 6.2 Client-side merge

`GettingStarted.tsx` uses the translation dictionary:

```ts
const tpl = t(`readiness.${item.id}.${item.params?.variant ?? "default"}`);
const displayDetail = tpl ? format(tpl, item.params) : item.detail;
```

When no translation template exists for a given locale/id/variant, it falls back
to the server's English `detail` (the existing behavior). The `pnpm doctor` CLI
reads `title`/`detail` directly and is untouched.

### 6.3 Example: readiness i18n keys

```
readiness.identity.template = "baseUrl 仍是模板值({baseUrl})"
readiness.identity.set       = "baseUrl 已设为 {baseUrl}"
readiness.imageStorage.local = "本地存储,无需凭据"
readiness.imageStorage.ok    = "Cloudflare R2 凭据齐全"
readiness.imageStorage.missing = "已选 {provider},缺少: {missing}"
readiness.firstItem.empty    = "尚无商品"
readiness.firstItem.has      = "content/items/ 下有 {count} 件"
readiness.firstItemLive.empty = "尚无商品"
readiness.firstItemLive.allDraft = "所有商品都是草稿模式"
readiness.firstItemLive.has  = "{liveCount} 件已发布"
readiness.gitReady.repo      = "已找到仓库"
readiness.gitReady.noRepo    = "不是 git 仓库"
readiness.contact.empty      = "未配置联系方式"
readiness.contact.has        = "已配置 {count} 种联系方式"
readiness.translations.ok    = "所有启用的语言都完整"
readiness.translations.problem = "{problem}"
readiness.shipping.enabled   = "已启用"
readiness.shipping.disabled  = "可选 — 尚未配置"
readiness.aceternity.installed = "组件已安装"
readiness.aceternity.missing = "components/ui/ 尚未安装"
readiness.configParse       = "content/config.ts 无法加载"
```

## 7. Testing

### 7.1 i18n module unit tests

| Test | What it covers |
|---|---|
| `resolve.test.ts` | Merge order: EN base → built-in locale → seller override wins. |
| `resolve.test.ts` | Missing locale falls back to EN. |
| `resolve.test.ts` | Missing key falls back to EN. |
| `format.test.ts` | `{param}` replacement works. |
| `format.test.ts` | `{plural}` for count-aware English. |

### 7.2 Provider/hook tests

- `StudioI18n.test.tsx`: render with provider, check `t()` returns correctly.
- Test that zh locale produces zh strings.
- Test that seller overrides win over built-in.

### 7.3 Component test updates

Existing component tests that assert on rendered text (e.g. `FilterBar.test.tsx`,
`ItemList.test.tsx`, `ConfigPane.test.tsx`, `DefaultsPane.test.tsx`, etc.) need
their test wrappers to include the `StudioI18nProvider` or a mock `useStudioT`.

Strategy for tests: export a test helper `renderWithStudioI18n(ui, opts)` that
wraps the component with the provider, defaulting to `locale: "en"` and
`overrides: {}`. Tests that check for specific strings verify against the
resolved English strings.

Alternatively, for simple tests, just mock `useStudioT` to return `t: (key) => key`
or a known mapping.

## 8. Documentation Updates

Per the bilingual sync rule (CLAUDE.md Rule 2), the following docs get updated
in both EN and `_zh`:

| File | Changes |
|---|---|
| `docs/DESIGN.md` | §22 (Seller Studio) — add i18n architecture section noting the hybrid dictionary, locale sourcing, and override mechanism. |
| `docs/CURRENT_FUNCTIONALITY.md` | Add "Studio UI follows the language selector" to the relevant feature list. |
| `docs/UPDATE_GUIDE.md` | Note the new `studio.translations` optional config field if relevant. |

The spec itself (`docs/superpowers/specs/2026-08-13-studio-i18n-design.md`) is
a planning artifact and does not have a `_zh` counterpart.

## 9. Implementation Order

1. **Foundation**: Create `studio/src/i18n/` module (types, EN dict, resolve, format, provider, hook).
2. **Config override pipe**: Add optional `studio.translations` to `SiteConfig`; expose in `/api/items`; wire in `App.tsx`.
3. **String replacement**: Replace hardcoded strings with `t(…)` across all 31 files, working pane by pane.
4. **zh dictionary**: Author the `strings.zh.ts` file with all keys translated.
5. **Tests**: i18n module unit tests + update component test wrappers.
6. **Phase 2**: Add `params` to `siteReadiness.ts` items; add readiness translation keys to dictionary; wire `GettingStarted.tsx` to use them.
7. **Docs**: Update DESIGN.md, CURRENT_FUNCTIONALITY.md in both languages.

## 10. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Large number of strings (200+) — high refactoring boilerplate | Phase 1 is mechanical; each file is a straightforward search-and-replace pattern. Build-friendly (no logic changes). |
| `siteReadiness.ts` shared with `pnpm doctor` | `params` is additive only; `title`/`detail` stay as fallback. CLI unchanged. |
| `format()` and `{plural}` — different languages pluralize differently | `{plural}` is English-only. Other locales override the entire template string, so they can restructure the sentence however their grammar requires. |
| Component tests become brittle if they check exact string values | Tests use the dictionary values, not inline strings. The test helper provides the resolved EN dict. |