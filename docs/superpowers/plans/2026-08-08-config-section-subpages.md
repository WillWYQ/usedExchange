# Config Section Subpages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Studio config editor into section-based subpages with per-section saving, and render UI translations as grouped translation matrices instead of a long locale-by-locale list.

**Architecture:** Keep `content/config.ts` as the single source of truth and change only the Studio editing layer plus the config field parser. Add one extra grouping dimension for translation categories, then let the config pane render top-level section tabs and a nested translation subpage selector. Saving should stay field-level on the API side, but the pane should expose one save action per visible section or translation subpage and avoid any forced re-fetch after a save.

**Tech Stack:** TypeScript, React, Vitest, existing Studio API routes.

## Global Constraints

- Preserve `content/config.ts` comments and formatting unless a value actually changes.
- Do not change the runtime i18n read path in `lib/i18n/*`; only the Studio editor experience changes.
- Keep config saves type-checked through the existing `/api/config` gate.
- Do not introduce a forced full refresh after section save; only update the touched editor state locally.

---

### Task 1: Add translation subgroup metadata to config fields

**Files:**
- Modify: `scripts/lib/configEdit.ts`
- Test: `scripts/lib/configEdit.test.ts`

**Interfaces:**
- Consumes: `readConfig(source, typesSource)` and `ConfigField`
- Produces: `ConfigField.subsection` for translation fields so the UI can group them by category

- [ ] **Step 1: Write the failing test**

```ts
it("assigns translation fields to their nearest category divider", () => {
  const list = readConfig(real, realTypes);
  const navigation = list.filter((f) => f.path.startsWith("i18n.translations.en.") && f.subsection === "Navigation");
  expect(navigation.map((f) => f.path)).toContain("i18n.translations.en.home");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest scripts/lib/configEdit.test.ts -t "assigns translation fields to their nearest category divider"`

- [ ] **Step 3: Implement the minimal parser change**

```ts
export type ConfigField = {
  path: string;
  value: string | number | boolean | null;
  kind: ConfigFieldKind;
  options?: string[];
  doc?: string;
  section: string;
  subsection?: string;
  range: [number, number];
};

const I18N_SECTION = "UI translations";

function subsectionFor(sf: ts.SourceFile, prop: ts.PropertyAssignment, path: string, dividers: Array<{ line: number; title: string }>): string | undefined {
  if (!path.startsWith(I18N_TRANSLATIONS_PREFIX)) return undefined;
  const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line;
  let best: { line: number; title: string } | undefined;
  for (const d of dividers) {
    if (d.line < line && (best === undefined || d.line > best.line)) best = d;
  }
  return best?.title;
}
```

- [ ] **Step 4: Run the test again and confirm it passes**

Run: `pnpm vitest scripts/lib/configEdit.test.ts`

### Task 2: Make config saves section-scoped and stop reloading the pane after save

**Files:**
- Modify: `studio/src/panes/ConfigPane.tsx`
- Test: `studio/src/panes/ConfigPane.test.tsx` if needed, otherwise validate with the Studio test suite

**Interfaces:**
- Consumes: `fetchConfig()`, `saveConfigValue()`, and `ConfigField` with `section`/`subsection`
- Produces: section tabs, nested translation category tabs, and a single save action per visible page

- [ ] **Step 1: Write the failing behavior test or component-level assertion**

```ts
// Pseudocode: selecting a section and saving it should not call fetchConfig() again.
```

- [ ] **Step 2: Run the targeted test or typecheck to confirm the old refresh behavior exists**

Run: `pnpm vitest studio/src/panes/ConfigPane.test.tsx` or `pnpm exec tsc --noEmit`

- [ ] **Step 3: Rewrite the pane around local draft state**

```tsx
const [selectedSection, setSelectedSection] = useState<string>("");
const [selectedTranslationGroup, setSelectedTranslationGroup] = useState<string>("");
const [drafts, setDrafts] = useState<Record<string, string>>({});

async function saveSection(sectionKey: string) {
  const dirtyFields = sectionFields.filter((field) => drafts[field.path] !== toInput(field));
  for (const field of dirtyFields) {
    await saveConfigValue(field.path, parsedValueFor(field, drafts[field.path]));
  }
  // Do not call fetchConfig() here; update local baseline state only.
}
```

- [ ] **Step 4: Run the Studio typecheck and the relevant UI tests**

Run: `pnpm exec tsc --noEmit`

### Task 3: Render UI translations as grouped locale matrices

**Files:**
- Modify: `studio/src/panes/ConfigPane.tsx`
- Modify: `scripts/lib/configEdit.ts` if the translator grouping needs additional helpers

**Interfaces:**
- Consumes: `ConfigField.subsection` and translation paths like `i18n.translations.<locale>.<key>`
- Produces: a matrix UI where one row shows the same key across locales, grouped by translation category

- [ ] **Step 1: Write the failing visual/data-shape test**

```ts
// Pseudocode: translation rows are grouped by key, with locales rendered side by side.
```

- [ ] **Step 2: Run the targeted validation**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 3: Build the translation matrix renderer**

```tsx
const locales = [...new Set(translationFields.map((f) => parseLocale(f.path)))];
const rows = groupByTranslationKey(translationFields);

rows.map((row) => (
  <div key={row.key} className="translation-row">
    <div>{row.key}</div>
    {locales.map((locale) => (
      <input key={locale} value={row.values[locale] ?? ""} onChange={...} />
    ))}
  </div>
));
```

- [ ] **Step 4: Validate the updated pane**

Run: `pnpm exec tsc --noEmit`

### Task 4: Confirm the config editor behavior end to end

**Files:**
- Test: `scripts/lib/configEdit.test.ts`
- Test: Studio config pane coverage if added

**Interfaces:**
- Consumes: the config parser and pane behavior from Tasks 1-3
- Produces: verified section/subpage grouping and save flow

- [ ] **Step 1: Run the full focused test set**

Run: `pnpm vitest scripts/lib/configEdit.test.ts`

- [ ] **Step 2: Run the workspace typecheck**

Run: `pnpm exec tsc --noEmit`

- [ ] **Step 3: Review for any remaining UX gaps**

If translation subpages still feel too dense, split one more layer by category label rather than locale.
