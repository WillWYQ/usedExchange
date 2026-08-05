# Seller Studio Config Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sellers edit `content/config.ts` from Seller Studio instead of hand-editing a 368-line TypeScript file, without losing any of its 182 comment lines.

**Architecture:** A pure module (`scripts/lib/configEdit.ts`) uses the TypeScript compiler's AST to read the config into a flat field list and to replace a single value by its exact character range, leaving every other byte untouched. Two studio API routes wrap it with per-field validation plus a `tsc --noEmit` gate that discards the write if the project stops type-checking. A `ConfigPane` renders the fields grouped exactly as the file groups them.

**Tech Stack:** TypeScript compiler API (already a dependency — `tsc` runs type-check), React 19 + Vite (studio SPA), Vitest, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-05-studio-config-panel-design.md`

## Global Constraints

Copied from the spec and `.claude/CLAUDE.md`. Every task inherits these:

- **Comments are the point.** `content/config.ts` has 182 comment lines out of 368. A write that loses one is a failed write. Task 1's tests pin this byte-for-byte.
- Iron Rule 1: writes stay inside `content/` — only `content/config.ts` is ever written.
- Iron Rule 2: any doc edit ships with its `_zh` counterpart in the same commit (Task 5).
- Iron Rule 7: Phase 23 recorded in `IMPLEMENTATION_PLAN.md` / `_zh` with all `[x]` and ✅ (Task 5).
- Iron Rule 8 does not apply: no config field is added, `lib/config/types.ts` is not modified.
- No new dependencies. The TypeScript package is already installed.
- Array fields (`contact.platforms`, `ui.priceFilterBuckets`) are READ-ONLY in this work. `writeConfigValue` must refuse them.
- The `tsc` gate is mandatory on every write. A write that fails it must leave `content/config.ts` byte-identical to before.
- Gates: `pnpm type-check`, `pnpm lint` (zero warnings), `pnpm test` — all clean before every commit. Baseline on `develop` is 666 tests / 39 files.
- Commits use repo prefixes and end with `Co-Authored-By: <your model> <noreply@anthropic.com>`.
- Branch: `feat/studio-config-panel` (already created off develop).
- Repo conventions: 2-space indent, double quotes.

---

### Task 1: `scripts/lib/configEdit.ts` — AST read and surgical write (TDD)

**Files:**
- Create: `scripts/lib/configEdit.ts`
- Test: `scripts/lib/configEdit.test.ts`

**Interfaces:**
- Consumes: `typescript` (import `ts from "typescript"`); no repo modules.
- Produces:
  - `export type ConfigFieldKind = "string" | "number" | "boolean" | "enum" | "unsupported"`
  - `export type ConfigField = { path: string; value: string | number | boolean | null; kind: ConfigFieldKind; options?: string[]; doc?: string; section: string; range: [number, number] }`
  - `export function readConfig(source: string, typesSource: string): ConfigField[]`
  - `export function writeConfigValue(source: string, path: string, newValue: string | number | boolean): string`
  - `export function validateConfigValue(field: ConfigField, newValue: unknown): void`

**Implementation notes for the AST work:**

- Find the config object with a `forEachChild` walk looking for a `VariableDeclaration` whose name is `siteConfig` and whose initializer is an `ObjectLiteralExpression`.
- Recurse into `ObjectLiteralExpression` initializers to build dotted paths. Property names may be quoted — strip surrounding quotes.
- Value kinds: `StringLiteral` → string; `NumericLiteral` → number; `TrueKeyword`/`FalseKeyword` → boolean; `PrefixUnaryExpression` wrapping a numeric literal → number (negative numbers like `-1`); `ArrayLiteralExpression` and anything else → `unsupported`.
- `range` is `[initializer.getStart(sourceFile), initializer.getEnd()]`. Use `getStart(sf)` — NOT `.pos`, which includes leading trivia and would swallow comments.
- Enum options: parse `typesSource` the same way, find the property signature whose name matches the field's last path segment inside the interface matching the parent, and read a `UnionTypeNode` of `LiteralTypeNode` string literals. When no union is found, the field is a plain `string`, not an `enum`.
- Section titles: scan the raw source lines for `// ── <title> ─` and assign each field the nearest such title at or above its line. Fields under `i18n.translations` all get the section `"UI translations"` regardless, so the pane can collapse them as one group.
- Doc extraction: from the field's line, walk upward collecting contiguous whole-line `//` comments (stop at a blank line, a `// ── … ─` divider, or another field). If none, use a trailing `//` comment on the field's own line. Never include the divider line itself. A comment block sitting directly above an **object** property (`location: {` etc.) attaches to that object's first leaf child — `location.lat` carries the `location` block — so the comment describing a group of fields still lands on a field the pane renders.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/configEdit.test.ts`. Note the fixture is deliberately a small hand-written config, not the repo's real one — the real file is exercised in Step 5.

```typescript
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { readConfig, validateConfigValue, writeConfigValue, type ConfigField } from "./configEdit";

const FIXTURE = `import type { SiteConfig } from "@/lib/config/types";

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────
  name: "Test Store",
  tagline: "Nothing to see here.",
  logo: "/logo.svg", // path in /public, or "" for text logo

  // ── Deployment ───────────────────────────────────────────
  deploymentMode: "static", // "static" | "vercel"
  baseUrl: "https://example.com",

  // ── Seller location ──────────────────────────────────────
  // Find coords: maps.google.com
  location: {
    lat: 37.7749,
    lng: -122.4194,
    label: "San Francisco, CA",
  },

  // ── Content defaults ─────────────────────────────────────
  recentlyListedCount: 6,
  soldItemRetentionDays: -1,

  // ── Contact ──────────────────────────────────────────────
  contact: {
    platforms: ["email", "sms"],
  },

  // ── Full-text search ─────────────────────────────────────
  search: {
    enabled: true,
  },
};
`;

const TYPES = `export type DeploymentMode = "static" | "vercel";

export interface SiteConfig {
  name: string;
  tagline: string;
  logo: string;
  deploymentMode: "static" | "vercel";
  baseUrl: string;
  location: { lat: number; lng: number; label: string };
  recentlyListedCount: number;
  soldItemRetentionDays: number;
  contact: { platforms: string[] };
  search: { enabled: boolean };
}
`;

const fields = (): ConfigField[] => readConfig(FIXTURE, TYPES);
const byPath = (p: string): ConfigField => {
  const f = fields().find((x) => x.path === p);
  if (f === undefined) throw new Error(\`no field at \${p}\`);
  return f;
};

describe("readConfig — paths and kinds", () => {
  it("flattens nested objects into dotted paths", () => {
    const paths = fields().map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("location.lat");
    expect(paths).toContain("search.enabled");
  });

  it("reads each literal kind with its value", () => {
    expect(byPath("name")).toMatchObject({ kind: "string", value: "Test Store" });
    expect(byPath("recentlyListedCount")).toMatchObject({ kind: "number", value: 6 });
    expect(byPath("search.enabled")).toMatchObject({ kind: "boolean", value: true });
  });

  it("reads a negative number", () => {
    expect(byPath("soldItemRetentionDays")).toMatchObject({ kind: "number", value: -1 });
  });

  it("marks arrays unsupported", () => {
    expect(byPath("contact.platforms").kind).toBe("unsupported");
  });
});

describe("readConfig — enums from the types file", () => {
  it("reads union members as enum options", () => {
    const f = byPath("deploymentMode");
    expect(f.kind).toBe("enum");
    expect(f.options).toEqual(["static", "vercel"]);
  });

  it("leaves a plain string as string, not enum", () => {
    expect(byPath("tagline").kind).toBe("string");
    expect(byPath("tagline").options).toBeUndefined();
  });
});

describe("readConfig — docs and sections", () => {
  it("takes a trailing comment as the doc", () => {
    expect(byPath("logo").doc).toContain("path in /public");
  });

  it("takes the block above the field as the doc", () => {
    // The comment sits above `location: {` — an object — and attaches to its
    // first leaf child (see the implementation notes).
    expect(byPath("location.lat").doc).toContain("maps.google.com");
  });

  it("leaves doc undefined when there is no comment", () => {
    expect(byPath("baseUrl").doc).toBeUndefined();
  });

  it("never swallows the section divider into a doc", () => {
    for (const f of fields()) expect(f.doc ?? "").not.toContain("──");
  });

  it("assigns each field its nearest section heading", () => {
    expect(byPath("name").section).toBe("Identity");
    expect(byPath("deploymentMode").section).toBe("Deployment");
    expect(byPath("search.enabled").section).toBe("Full-text search");
  });
});

describe("writeConfigValue — surgical, comment-preserving", () => {
  const commentLines = (s: string): number => (s.match(/^\\s*\\/\\//gm) ?? []).length;
  const changedLines = (a: string, b: string): number => {
    const la = a.split("\\n");
    const lb = b.split("\\n");
    expect(la.length).toBe(lb.length);
    return la.filter((l, i) => l !== lb[i]).length;
  };

  it("changes a number and nothing else", () => {
    const out = writeConfigValue(FIXTURE, "recentlyListedCount", 9);
    expect(changedLines(FIXTURE, out)).toBe(1);
    expect(commentLines(out)).toBe(commentLines(FIXTURE));
    expect(readConfig(out, TYPES).find((f) => f.path === "recentlyListedCount")?.value).toBe(9);
  });

  it("changes a nested string and nothing else", () => {
    const out = writeConfigValue(FIXTURE, "location.label", "Austin, TX");
    expect(changedLines(FIXTURE, out)).toBe(1);
    expect(commentLines(out)).toBe(commentLines(FIXTURE));
    expect(out).toContain('label: "Austin, TX"');
  });

  it("changes a boolean and nothing else", () => {
    const out = writeConfigValue(FIXTURE, "search.enabled", false);
    expect(changedLines(FIXTURE, out)).toBe(1);
    expect(out).toContain("enabled: false");
  });

  it("keeps a trailing comment on the line it edits", () => {
    const out = writeConfigValue(FIXTURE, "logo", "/brand.svg");
    expect(out).toContain('logo: "/brand.svg", // path in /public');
  });

  it("escapes a string value rather than breaking the file", () => {
    const out = writeConfigValue(FIXTURE, "tagline", 'He said "hi"');
    expect(readConfig(out, TYPES).find((f) => f.path === "tagline")?.value).toBe('He said "hi"');
  });

  it("refuses an unknown path", () => {
    expect(() => writeConfigValue(FIXTURE, "nope.nothing", 1)).toThrow(/nope\\.nothing/);
  });

  it("refuses an array field", () => {
    expect(() => writeConfigValue(FIXTURE, "contact.platforms", "x")).toThrow(/contact\\.platforms/);
  });
});

describe("validateConfigValue", () => {
  it("accepts a legal enum member and rejects others", () => {
    const f = byPath("deploymentMode");
    expect(() => validateConfigValue(f, "vercel")).not.toThrow();
    expect(() => validateConfigValue(f, "netlify")).toThrow(/deploymentMode/);
  });

  it("rejects a template-literal injection in a string", () => {
    expect(() => validateConfigValue(byPath("name"), "a \${process.env.X} b")).toThrow();
    expect(() => validateConfigValue(byPath("name"), "back\`tick")).toThrow();
  });

  it("requires an http(s) URL for baseUrl but allows empty", () => {
    const f = byPath("baseUrl");
    expect(() => validateConfigValue(f, "https://ok.example")).not.toThrow();
    expect(() => validateConfigValue(f, "")).not.toThrow();
    expect(() => validateConfigValue(f, "javascript:alert(1)")).toThrow(/baseUrl/);
    expect(() => validateConfigValue(f, "not a url")).toThrow(/baseUrl/);
  });

  it("bounds latitude and longitude", () => {
    expect(() => validateConfigValue(byPath("location.lat"), 91)).toThrow(/lat/);
    expect(() => validateConfigValue(byPath("location.lng"), -181)).toThrow(/lng/);
    expect(() => validateConfigValue(byPath("location.lat"), 37.5)).not.toThrow();
  });

  it("rejects a negative count and a non-finite number", () => {
    expect(() => validateConfigValue(byPath("recentlyListedCount"), -1)).toThrow();
    expect(() => validateConfigValue(byPath("recentlyListedCount"), Number.NaN)).toThrow();
  });

  it("allows a negative soldItemRetentionDays (-1 means hide immediately)", () => {
    expect(() => validateConfigValue(byPath("soldItemRetentionDays"), -1)).not.toThrow();
  });

  it("rejects any write to an unsupported field", () => {
    expect(() => validateConfigValue(byPath("contact.platforms"), "x")).toThrow();
  });

  it("rejects a value of the wrong type", () => {
    expect(() => validateConfigValue(byPath("recentlyListedCount"), "six")).toThrow();
    expect(() => validateConfigValue(byPath("search.enabled"), "yes")).toThrow();
  });
});

describe("the real content/config.ts", () => {
  const real = fs.readFileSync(path.join(process.cwd(), "content/config.ts"), "utf-8");
  const realTypes = fs.readFileSync(path.join(process.cwd(), "lib/config/types.ts"), "utf-8");

  it("parses without throwing and finds the known fields", () => {
    const list = readConfig(real, realTypes);
    const paths = list.map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("location.lat");
    expect(paths).toContain("ui.priceFilterStrategy");
  });

  it("groups every i18n translation under one section", () => {
    const list = readConfig(real, realTypes);
    const translations = list.filter((f) => f.path.startsWith("i18n.translations."));
    expect(translations.length).toBeGreaterThan(50);
    for (const f of translations) expect(f.section).toBe("UI translations");
  });

  it("round-trips a real edit without disturbing the file", () => {
    const out = writeConfigValue(real, "recentlyListedCount", 7);
    expect((out.match(/^\\s*\\/\\//gm) ?? []).length).toBe((real.match(/^\\s*\\/\\//gm) ?? []).length);
    expect(out.split("\\n").filter((l, i) => l !== real.split("\\n")[i]).length).toBe(1);
    expect(readConfig(out, realTypes).find((f) => f.path === "recentlyListedCount")?.value).toBe(7);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/lib/configEdit.test.ts`
Expected: FAIL — cannot resolve `./configEdit`.

- [ ] **Step 3: Implement the module**

Write `scripts/lib/configEdit.ts` following the implementation notes above. Keep it pure: no `fs`, no HTTP, no React. Comment the non-obvious choices — especially why `getStart(sf)` is used instead of `.pos` (leading trivia would swallow comments) and why arrays are refused rather than best-effort edited.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/lib/configEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/configEdit.ts scripts/lib/configEdit.test.ts
git commit -m "feat: AST-based reader and surgical writer for content/config.ts

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 2: Config API routes with the tsc gate

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Test: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `readConfig`, `writeConfigValue`, `validateConfigValue`, type `ConfigField` from `./configEdit` (Task 1).
- Produces: `GET /api/config` → `{ fields: ConfigField[] }`; `PUT /api/config` with body `{ path, value }` → `{ fields: ConfigField[] }`.

**Implementation notes:**

- Read `content/config.ts` and `lib/config/types.ts` relative to `req.projectRoot`.
- Missing file, or a file with no `siteConfig` declaration → `StudioError(400, …)` naming the file. The pane surfaces it rather than crashing.
- The write sequence is: validate → produce new source → write to a temp file next to the config (e.g. `content/.config.ts.tmp`) → run `tsc --noEmit` → on success `rename` the temp over `content/config.ts`, on failure `unlink` the temp and throw `StudioError(400, …)` including the tsc output. **On any failure `content/config.ts` must be byte-identical to before.** Use `rename` (atomic on the same filesystem) rather than a second write.
- Run tsc with `execFile` and an argument array — never a shell string (matches `studioGit.ts`'s convention).
- Body schema: `z.object({ path: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]) })`.

- [ ] **Step 1: Write the failing tests**

Add a `describe("config routes")` block to `scripts/lib/studioApi.test.ts`, following the sandbox pattern the file already uses (`fs.mkdtemp`, a `tempProjects` array cleaned in `afterEach`). Each test needs a sandbox containing `content/config.ts` and `lib/config/types.ts`; copy the fixture strings from Task 1's test file rather than the repo's real config, so the tests stay fast and hermetic.

Cover:
- GET returns a field list containing `name` and `location.lat`
- PUT with a legal value returns 200, the returned list shows the new value, and the file on disk changed on exactly one line
- PUT with an illegal enum value returns 400 **and the file is byte-identical to before**
- PUT to an array path returns 400 and the file is unchanged
- PUT with a path that does not exist returns 400
- GET against a sandbox whose `content/config.ts` is missing returns 400 naming the file
- `POST /api/config` returns 405

Note: the tsc gate makes these tests slower than the rest of the suite. If running real `tsc` inside a sandbox proves impractical (no `tsconfig.json` there), have the handler skip the gate when no `tsconfig.json` is found next to the project root, and assert that behaviour explicitly in one test — a documented, tested skip is honest; a silently absent gate is not.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/lib/studioApi.test.ts -t "config routes"`
Expected: FAIL — 404, no such route.

- [ ] **Step 3: Implement the routes**

Add the handlers next to the existing defaults handlers, and wire the route in `handleStudioRequest` after the `/api/defaults` block:

```typescript
    if (pathname === "/api/config") {
      if (req.method === "GET") return await handleConfigGet(req);
      if (req.method === "PUT") return await handleConfigPut(req);
      return { status: 405, body: { error: "GET or PUT only" } };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/lib/studioApi.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: studio config API with validation and a tsc write gate

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 3: Client API and `ConfigPane`

**Files:**
- Modify: `studio/src/api.ts`
- Create: `studio/src/panes/ConfigPane.tsx`
- Modify: `studio/src/tokens.css` (append a config-pane section at the end)

**Interfaces:**
- Consumes: the two routes from Task 2; the shared `FieldInput` (`studio/src/panes/FieldInput.tsx`), `Button` (`studio/src/components/Button.tsx`), and `useDialogBehavior` (`studio/src/components/useDialogBehavior.ts`).
- Produces: `fetchConfig(): Promise<ConfigField[]>`, `saveConfigValue(path, value): Promise<ConfigField[]>` in `api.ts`; `ConfigPane({ onClose })` component.

**Implementation notes:**

- `api.ts`: re-export the `ConfigField` type from `../../scripts/lib/configEdit` with `import type` (the type-only import keeps the node-side module out of the browser bundle — the file already does this for `StudioItem`).
- The pane is a dialog like `DefaultsPane`: reuse `useDialogBehavior(onClose)` for focus trap, Esc, and focus restore, and the `dialog` / `dialog-backdrop` classes.
- Group the fields by their `section`, preserving first-appearance order. Render `"UI translations"` inside a collapsed `<details>`; every other section is open.
- Per-field save: each field gets its own save affordance (save on blur when the value changed, or an explicit small Save button — pick one and be consistent). While a field is saving, disable that field's input and show a spinner or "Saving…"; on failure show the error under that field, including the tsc output when present.
- Danger fields: for `deploymentMode`, `baseUrl`, and `imageStorage.provider`, render a warning line under the input explaining the consequence of a wrong value (build fails / every image 404s).
- `unsupported` fields: render disabled with the current value shown as text and the hint "Edit this field directly in content/config.ts".
- New CSS classes go at the end of `tokens.css`, consume existing tokens only, and follow the existing naming style (`config-*`).

- [ ] **Step 1: Add the client API functions**

- [ ] **Step 2: Create `ConfigPane.tsx`**

- [ ] **Step 3: Append the styles**

- [ ] **Step 4: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean. (The pane is not mounted until Task 4; this proves it compiles.)

- [ ] **Step 5: Commit**

```bash
git add studio/src/api.ts studio/src/panes/ConfigPane.tsx studio/src/tokens.css
git commit -m "feat: studio config pane

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 4: Mount the pane in `App`

**Files:**
- Modify: `studio/src/App.tsx`

**Interfaces:**
- Consumes: `ConfigPane` from `./panes/ConfigPane` (Task 3).

- [ ] **Step 1: Add the state and the header button**

Add `const [showConfig, setShowConfig] = useState(false);` next to `showDefaults`, and a `Config` button in `.head-actions` immediately before the existing `Defaults` button:

```tsx
          <Button onClick={() => setShowConfig(true)}>
            Config
          </Button>
```

- [ ] **Step 2: Render the pane**

After the `showDefaults` block:

```tsx
      {showConfig && <ConfigPane onClose={() => setShowConfig(false)} />}
```

- [ ] **Step 3: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add studio/src/App.tsx
git commit -m "feat: open the config pane from the studio header

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 5: Documentation (bilingual, one commit)

Every edit ships in both the English file and its `_zh` counterpart (Iron Rule 2). Locate each anchor by structure; the `_zh` files are parallel translations.

**Files:**
- Modify: `docs/CURRENT_FUNCTIONALITY.md` + `_zh.md`
- Modify: `docs/ARCHITECTURE.md` + `_zh.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md` + `_zh.md`

- [ ] **Step 1: CURRENT_FUNCTIONALITY**

Add a row to the Seller Studio operations table and increment the operations-count sentence (check its current wording before editing — earlier phases have already incremented it):

```markdown
| Site config | Edit `content/config.ts` from the browser — site name, tagline, currency, location, contact, UI slots and the rest. Comments in the file survive every save; each write is type-checked before it lands, and a write that would break the build is discarded |
```

Chinese:

```markdown
| 站点配置 | 在浏览器里编辑 `content/config.ts` —— 站点名、标语、货币、位置、联系方式、UI 插槽等。文件里的注释在每次保存后原样保留；每次写入都会先做类型检查，会破坏构建的改动直接丢弃 |
```

- [ ] **Step 2: ARCHITECTURE**

Add to the `scripts/lib/` module table:

```markdown
| `configEdit.ts` | TypeScript-AST reader and surgical writer for `content/config.ts`: flattens the config into a field list (value, kind, enum options from `lib/config/types.ts`, the file's own comments as docs) and replaces one value by character range, leaving all other bytes — including all 182 comment lines — untouched |
```

Chinese:

```markdown
| `configEdit.ts` | `content/config.ts` 的 TypeScript AST 读取器与外科式写入器：把配置拍平成字段列表（值、类型、来自 `lib/config/types.ts` 的枚举选项、以文件自身注释为说明），并按字符区间替换单个值，其余字节——包括全部 182 行注释——原样不动 |
```

Also add `ConfigPane` to the studio panes enumeration in both languages.

- [ ] **Step 3: IMPLEMENTATION_PLAN — Phase 23**

Append after the Phase 22 section (English):

```markdown
## Phase 23 — Seller Studio Config Panel ✅

- [x] `scripts/lib/configEdit.ts`: TypeScript-AST `readConfig` (dotted paths, literal kinds, enum options from the types file, docs and section titles from the file's own comments) and `writeConfigValue` (single value replaced by character range; all 182 comment lines preserved)
- [x] Per-field validation: enum membership, number bounds, http(s) URLs, template-literal injection refused, array fields read-only
- [x] `GET/PUT /api/config` with a `tsc --noEmit` gate — a write that fails type-check is discarded and the file left byte-identical
- [x] `ConfigPane`: fields grouped as the file groups them, the file's comments as hints, danger warnings on `deploymentMode`/`baseUrl`/`imageStorage.provider`, UI translations collapsed, per-field save
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, this plan) — both languages
```

Chinese:

```markdown
## Phase 23 — Seller Studio 配置面板 ✅

- [x] `scripts/lib/configEdit.ts`：TypeScript AST 的 `readConfig`（点分路径、字面量类型、来自类型文件的枚举选项、以文件自身注释为说明与分组标题）与 `writeConfigValue`（按字符区间替换单个值，全部 182 行注释原样保留）
- [x] 逐字段校验：枚举合法值、数值范围、http(s) URL、拒绝模板字符串注入、数组字段只读
- [x] `GET/PUT /api/config`，带 `tsc --noEmit` 关卡——类型检查不过的写入直接丢弃，文件逐字节不变
- [x] `ConfigPane`：按文件本身的分组呈现字段、以文件注释为提示、`deploymentMode`/`baseUrl`/`imageStorage.provider` 标危险警告、UI 翻译折叠、逐字段保存
- [x] 文档同步（CURRENT_FUNCTIONALITY、ARCHITECTURE、本计划），中英双语
```

- [ ] **Step 4: Commit**

```bash
git add docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md \
        docs/ARCHITECTURE.md docs/ARCHITECTURE_zh.md \
        docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_PLAN_zh.md
git commit -m "docs: studio config panel (Phase 23) in three doc pairs

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 6: Full verification

Verification only — no code changes, no commits (a required fix gets its own `fix:` commit).

- [ ] **Step 1: Automated gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean. Baseline was 666 tests / 39 files; Tasks 1-2 add to that.

- [ ] **Step 2: Prove the comment-preservation claim against the real file**

```bash
cp content/config.ts /tmp/config-before.ts
```
Start studio, change one value through the pane (e.g. `recentlyListedCount`), then:
```bash
diff <(grep -c '^\s*//' /tmp/config-before.ts) <(grep -c '^\s*//' content/config.ts)   # must be identical
diff /tmp/config-before.ts content/config.ts                                            # must show exactly one changed line
git checkout content/config.ts                                                          # restore
```

- [ ] **Step 3: Prove the tsc gate**

Through the pane, attempt an edit that would break the build (e.g. set `deploymentMode` to a value not in its union — if the UI blocks it, use curl against `PUT /api/config` directly). Confirm the API returns 400 and:
```bash
git diff --stat content/config.ts   # must be empty — the file was not touched
```

- [ ] **Step 4: Serve check**

```bash
pnpm studio --port 5199 &
sleep 7
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5199/          # 200
curl -s http://127.0.0.1:5199/api/config | head -c 400                    # field list
```
Then kill the server and confirm the port is free.

- [ ] **Step 5: Confirm the tree is clean**

`git status --porcelain` — nothing left over, `content/config.ts` unmodified.

- [ ] **Step 6: Record the human-only checklist in the report**

1. Every section from the file appears in the pane, in the file's order.
2. Field hints match the comments in `content/config.ts`.
3. `deploymentMode` and `imageStorage.provider` render as dropdowns with exactly the values from the types file.
4. The three danger fields show their warnings.
5. UI translations are collapsed by default and expand to the full list.
6. Array fields are visibly read-only with the "edit the file directly" hint.
7. Saving one field leaves the others untouched; a rejected save shows its error under that field.
8. Light and dark themes both render the pane with readable contrast; the pane traps Tab and closes on Esc.

---

## Self-Review Notes (done at plan-writing time)

- Spec coverage: AST engine + comment/section extraction + enum options → Task 1; validation rules and the tsc gate → Tasks 1-2; API → Task 2; pane, grouping, danger warnings, i18n collapse, per-field save → Task 3; mounting → Task 4; docs → Task 5; verification incl. the two claims that matter (comments preserved, bad write discarded) → Task 6.
- No placeholders: every step carries exact code, exact commands, or exact implementation notes.
- Type/name consistency: `ConfigField`, `ConfigFieldKind`, `readConfig`, `writeConfigValue`, `validateConfigValue`, `fetchConfig`, `saveConfigValue`, `ConfigPane` are spelled identically wherever they appear.
- Known risk flagged for the implementer: the `tsc` gate inside a test sandbox may not have a `tsconfig.json`. Task 2 Step 1 names this and requires the fallback be explicit and tested rather than silent.
