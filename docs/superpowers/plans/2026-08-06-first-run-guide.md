# First-Run Setup Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a freshly-cloned site one coherent entry point that says what is still missing, in what order to do it, and where to go for each step — reachable both in Seller Studio and from the terminal.

**Architecture:** One node-side module (`scripts/lib/siteReadiness.ts`) owns the entire "what's still missing" judgement and returns a tiered checklist. Two thin shells consume it: a `GET /api/readiness` route feeding a `GettingStarted` panel in Studio, and a `pnpm doctor` CLI that prints the same checklist. Config and env are injected rather than imported so the module is fully unit-testable offline.

**Tech Stack:** TypeScript (node), React 19 + Vite (studio SPA), Vitest, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-06-first-run-guide-design.md`

## Global Constraints

Copied from the spec and `.claude/CLAUDE.md`. Every task inherits these:

- **The readiness judgement is written once.** Both entry points call `buildReadinessReport`. A check implemented in only one shell defeats the point of the feature.
- Readiness is **read-only**: it never writes a file, never mutates config, never "fixes" anything. Diagnose and point, nothing more.
- Iron Rule 1: no writes outside `content/` anywhere in this work (readiness writes nothing at all).
- Iron Rule 2: any doc edit ships with its `_zh` counterpart in the same commit (Task 6).
- Iron Rule 7: Phase 24 recorded in `IMPLEMENTATION_PLAN.md` / `_zh` with all `[x]` and ✅ (Task 6).
- Iron Rule 8 does not apply: no config field is added; `lib/config/types.ts` is not modified.
- No new dependencies.
- `git` is invoked through `execFile` with an argument array — never a shell string (matches `scripts/lib/studioGit.ts`).
- Styling consumes existing tokens in `studio/src/tokens.css` (`--bg`, `--surface`, `--border`, `--ink`, `--ink-soft`, `--radius-*`, `--gap*`, `--speed`). No new colour literals.
- Status must never be conveyed by colour alone — every ✓/○ carries text.
- Gates: `pnpm type-check`, `pnpm lint` (zero warnings), `pnpm test` — all clean before every commit. Baseline on `develop` is 666 tests / 39 files.
- Commits use repo prefixes and end with `Co-Authored-By: <your model> <noreply@anthropic.com>`.
- Branch: `feat/studio-first-run-guide` (already created off develop).
- Repo conventions: 2-space indent, double quotes.

---

### Task 1: Extract `REQUIRED_KEYS` into a shared module

A pure refactor, done first so Task 2 can import the key list. `scripts/check-config.ts` currently holds `REQUIRED_KEYS` privately AND runs `main()` at module top level — importing that file to reuse the list would execute the checker as a side effect. Extracting the constant is the only safe way to share it.

**Files:**
- Create: `scripts/lib/i18nRequiredKeys.ts`
- Modify: `scripts/check-config.ts` (remove the local const at lines 17-42; import instead)

**Interfaces:**
- Produces: `export const REQUIRED_UI_STRING_KEYS: (keyof UIStrings)[]` — Task 2 imports this.

- [ ] **Step 1: Create the shared module**

Create `scripts/lib/i18nRequiredKeys.ts`. Copy the array **verbatim** from `scripts/check-config.ts` lines 17-42 (do not retype it from memory, and do not add or drop a key — the list is the contract two consumers now share):

```typescript
// The UI string keys every enabled locale must resolve, either in its own
// translations entry or via the default locale's entry.
//
// Extracted from scripts/check-config.ts so scripts/lib/siteReadiness.ts can
// apply the same rule without importing that file — check-config.ts calls
// main() at module scope, so importing it would run the build checker as a
// side effect.

import type { UIStrings } from "@/lib/config/types";

export const REQUIRED_UI_STRING_KEYS: (keyof UIStrings)[] = [
  // ← paste lines 18-41 of scripts/check-config.ts here, unchanged
];
```

- [ ] **Step 2: Rewire `check-config.ts`**

Delete the local `const REQUIRED_KEYS: (keyof UIStrings)[] = [ … ];` block (lines 17-42) and add the import next to the existing ones:

```typescript
import { REQUIRED_UI_STRING_KEYS } from "@/scripts/lib/i18nRequiredKeys";
```

Then replace the single usage — `REQUIRED_KEYS.filter(` at line 67 — with `REQUIRED_UI_STRING_KEYS.filter(`. If `UIStrings` becomes an unused import in `check-config.ts` after the removal, drop it too (lint runs at zero warnings and will catch it either way).

- [ ] **Step 3: Verify the refactor changed no behaviour**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean, test count unchanged from the 666 baseline (this task adds no tests — it moves a constant).

Then prove the checker still runs and still passes on the repo's own config:

Run: `pnpm exec tsx scripts/check-config.ts && echo "check-config still passes"`
Expected: prints `check-config still passes` with no error output.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/i18nRequiredKeys.ts scripts/check-config.ts
git commit -m "refactor: share the required UI string keys with a small module

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 2: `scripts/lib/siteReadiness.ts` — the readiness engine (TDD)

**Files:**
- Create: `scripts/lib/siteReadiness.ts`
- Test: `scripts/lib/siteReadiness.test.ts`

**Interfaces:**
- Consumes: `REQUIRED_UI_STRING_KEYS` from `./i18nRequiredKeys` (Task 1); `PLACEHOLDER_DOMAIN` and `DEMO_DOMAIN` from `../../lib/utils/templateStatus`.
- Produces (Tasks 3-5 depend on these exact names):
  - `export type ReadinessTier = 1 | 2`
  - `export type ReadinessAction = { kind: "pane"; pane: "config" } | { kind: "docs"; doc: string } | { kind: "command"; command: string } | { kind: "studio"; view: "new-item" }`
  - `export type ReadinessItem = { id: string; tier: ReadinessTier; title: string; detail: string; done: boolean; action?: ReadinessAction }`
  - `export type ReadinessReport = { items: ReadinessItem[]; tier1Done: number; tier1Total: number; allTier1Done: boolean }`
  - `export type ReadinessConfig = { name: string; baseUrl: string; imageStorage: { provider: string }; contact: { platforms: Array<{ type: string }> }; shipping?: { enabled: boolean }; i18n: { availableLocales: string[]; defaultLocale: string; translations: Record<string, Record<string, string>> } }`
  - `export async function buildReadinessReport(projectRoot: string, config: ReadinessConfig | null, env: NodeJS.ProcessEnv): Promise<ReadinessReport>`

**Implementation notes:**

- **Why config and env are injected, not imported:** importing `@/content/config` would make every unit test depend on the repo's real config, and would make the `config === null` path (a broken config file) untestable. The caller passes both; `siteConfig` structurally satisfies `ReadinessConfig` with no cast.
- `config === null` short-circuits: return a single tier-1 item `{ id: "config-parse", done: false, action: { kind: "command", command: "pnpm type-check" } }` and nothing else. `tier1Total` is 1.
- Item order is the spec's order: `identity`, `image-storage`, `first-item`, `first-item-live`, `git-ready`, `contact`, then `translations`, `shipping`, `aceternity`.
- **identity:** done when `baseUrl` contains neither `PLACEHOLDER_DOMAIN` nor `DEMO_DOMAIN` (reuse both constants — `lib/utils/templateStatus.ts` is the single source of truth for what "still the template" means; do not re-declare the strings).
- **image-storage:** `local` → always done. `cloudflare-r2` → needs all of `CF_R2_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET`, `CF_R2_PUBLIC_URL` present and non-empty in `env`. `vercel-blob` → needs `BLOB_READ_WRITE_TOKEN`. An unknown provider is `done: false` with a detail naming it. When keys are missing, the detail must name **which** ones.
- **first-item / first-item-live:** walk `content/items/<category>/<item>/item.json` with `fs.promises`. Do NOT use `loadAllItemsRaw()` — it resolves `content/` from `process.cwd()`, which would ignore `projectRoot` and break the sandboxed tests. Read each `item.json` with `JSON.parse` inside a try/catch; a file that fails to parse counts as an existing item but not a live one, and must not throw.
- **git-ready:** `execFile("git", ["rev-parse", "--git-dir"], { cwd: projectRoot })` in a try/catch — failure means `done: false`, never a thrown error.
- **contact:** done when `config.contact.platforms.length > 0`.
- **translations:** mirror `check-config.ts`'s **two** rules, not just the obvious one:
  1. A locale listed in `availableLocales` with **no entry at all** in `translations` is a gap, checked separately via `locale in translations`.
  2. For a locale that does have an entry, a key is satisfied if present in that locale's dict OR in the default locale's dict.

  Rule 1 is not redundant: with the default locale fully populated, the per-key fallback in rule 2 would find nothing missing for an absent locale, so checking keys alone would wrongly report it as done. Done when neither rule fires for any locale; the detail names the first offending locale and, for rule 2, its missing count.
- **shipping:** `shipping?.enabled === true` → done. Otherwise `done: false` with detail `"Optional — not configured"`. (Tier 2 is collapsed and never blocks, so reporting it honestly costs nothing.)
- **aceternity:** done when `components/ui/` exists and contains at least one `.tsx` file.
- `tier1Total` counts tier-1 items; `tier1Done` counts those with `done: true`; `allTier1Done` is `tier1Done === tier1Total`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/siteReadiness.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  buildReadinessReport,
  type ReadinessConfig,
  type ReadinessItem,
} from "./siteReadiness";

const run = promisify(execFile);

let sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.map((d) => fs.rm(d, { recursive: true, force: true })));
  sandboxes = [];
});

async function sandbox(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "readiness-"));
  sandboxes.push(dir);
  return dir;
}

async function writeItem(root: string, id: string, status: string): Promise<void> {
  const dir = path.join(root, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), JSON.stringify({ name: id, status }), "utf-8");
}

/** A config with everything configured; tests override one field at a time. */
function configuredConfig(over: Partial<ReadinessConfig> = {}): ReadinessConfig {
  return {
    name: "My Store",
    baseUrl: "https://my-real-store.example",
    imageStorage: { provider: "local" },
    contact: { platforms: [{ type: "email" }] },
    shipping: { enabled: true },
    i18n: { availableLocales: ["en"], defaultLocale: "en", translations: { en: {} } },
    ...over,
  };
}

/** A freshly-cloned template: every tier-1 check should fail. */
function templateConfig(): ReadinessConfig {
  return {
    name: "UsedExchange",
    baseUrl: "https://your-domain.com",
    imageStorage: { provider: "cloudflare-r2" },
    contact: { platforms: [] },
    i18n: { availableLocales: ["en"], defaultLocale: "en", translations: { en: {} } },
  };
}

const byId = (items: ReadinessItem[], id: string): ReadinessItem => {
  const found = items.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no readiness item with id ${id}`);
  return found;
};

const R2_ENV = {
  CF_R2_ACCOUNT_ID: "a",
  CF_R2_ACCESS_KEY_ID: "b",
  CF_R2_SECRET_ACCESS_KEY: "c",
  CF_R2_BUCKET: "d",
  CF_R2_PUBLIC_URL: "https://cdn.example",
};

describe("a freshly-cloned template", () => {
  it("reports every tier-1 check as not done", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, templateConfig(), {});

    expect(report.tier1Done).toBe(0);
    expect(report.allTier1Done).toBe(false);
    expect(byId(report.items, "identity").done).toBe(false);
    expect(byId(report.items, "image-storage").done).toBe(false);
    expect(byId(report.items, "first-item").done).toBe(false);
    expect(byId(report.items, "first-item-live").done).toBe(false);
    expect(byId(report.items, "git-ready").done).toBe(false);
    expect(byId(report.items, "contact").done).toBe(false);
  });

  it("keeps the spec's item order", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, templateConfig(), {});
    expect(report.items.map((i) => i.id)).toEqual([
      "identity",
      "image-storage",
      "first-item",
      "first-item-live",
      "git-ready",
      "contact",
      "translations",
      "shipping",
      "aceternity",
    ]);
  });

  it("counts only tier-1 items in the tier-1 totals", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, templateConfig(), {});
    expect(report.tier1Total).toBe(6);
    expect(report.items.filter((i) => i.tier === 1)).toHaveLength(6);
    expect(report.items.filter((i) => i.tier === 2)).toHaveLength(3);
  });
});

describe("a fully configured site", () => {
  it("reports every tier-1 check as done", async () => {
    const root = await sandbox();
    await run("git", ["init"], { cwd: root });
    await writeItem(root, "electronics/lamp", "available");

    const report = await buildReadinessReport(root, configuredConfig(), {});

    expect(report.allTier1Done).toBe(true);
    expect(report.tier1Done).toBe(report.tier1Total);
  });
});

describe("identity", () => {
  it("is not done for the template placeholder domain", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ baseUrl: "https://your-domain.com" }),
      {},
    );
    expect(byId(report.items, "identity").done).toBe(false);
  });

  it("is not done for the template's own demo deployment", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ baseUrl: "https://usedexchangeproject.willsleep.dev" }),
      {},
    );
    expect(byId(report.items, "identity").done).toBe(false);
  });

  it("is done for a real domain", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ baseUrl: "https://shop.example.com" }),
      {},
    );
    expect(byId(report.items, "identity").done).toBe(true);
  });
});

describe("image storage", () => {
  it("is always done for the local provider", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "local" } }),
      {},
    );
    expect(byId(report.items, "image-storage").done).toBe(true);
  });

  it("is done when every CF_R2 variable is present", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "cloudflare-r2" } }),
      R2_ENV,
    );
    expect(byId(report.items, "image-storage").done).toBe(true);
  });

  it("names the missing variable when one CF_R2 key is absent", async () => {
    const root = await sandbox();
    const { CF_R2_BUCKET: _omitted, ...partial } = R2_ENV;
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "cloudflare-r2" } }),
      partial,
    );
    const item = byId(report.items, "image-storage");
    expect(item.done).toBe(false);
    expect(item.detail).toContain("CF_R2_BUCKET");
  });

  it("treats an empty string as missing", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "cloudflare-r2" } }),
      { ...R2_ENV, CF_R2_BUCKET: "" },
    );
    expect(byId(report.items, "image-storage").done).toBe(false);
  });

  it("checks the blob token for vercel-blob", async () => {
    const root = await sandbox();
    const missing = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "vercel-blob" } }),
      {},
    );
    expect(byId(missing.items, "image-storage").done).toBe(false);

    const present = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "vercel-blob" } }),
      { BLOB_READ_WRITE_TOKEN: "tok" },
    );
    expect(byId(present.items, "image-storage").done).toBe(true);
  });
});

describe("items", () => {
  it("sees an item that exists but is still a draft", async () => {
    const root = await sandbox();
    await writeItem(root, "electronics/lamp", "draft");
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "first-item").done).toBe(true);
    expect(byId(report.items, "first-item-live").done).toBe(false);
  });

  it("counts a published item as live", async () => {
    const root = await sandbox();
    await writeItem(root, "electronics/lamp", "draft");
    await writeItem(root, "electronics/desk", "available");
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "first-item-live").done).toBe(true);
  });

  it("survives an unparseable item.json", async () => {
    const root = await sandbox();
    const dir = path.join(root, "content", "items", "electronics", "broken");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "item.json"), "{not json", "utf-8");

    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "first-item").done).toBe(true);
    expect(byId(report.items, "first-item-live").done).toBe(false);
  });
});

describe("git", () => {
  it("is not done outside a repository", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "git-ready").done).toBe(false);
  });

  it("is done inside a repository", async () => {
    const root = await sandbox();
    await run("git", ["init"], { cwd: root });
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "git-ready").done).toBe(true);
  });
});

describe("translations", () => {
  it("is done when a locale supplies every key", async () => {
    const root = await sandbox();
    const full = Object.fromEntries(
      // Every required key present in the default locale satisfies all locales.
      (await import("./i18nRequiredKeys")).REQUIRED_UI_STRING_KEYS.map((k) => [k, "x"]),
    );
    const report = await buildReadinessReport(
      root,
      configuredConfig({
        i18n: { availableLocales: ["en"], defaultLocale: "en", translations: { en: full } },
      }),
      {},
    );
    expect(byId(report.items, "translations").done).toBe(true);
  });

  it("is not done when an added locale is missing keys", async () => {
    const root = await sandbox();
    const full = Object.fromEntries(
      (await import("./i18nRequiredKeys")).REQUIRED_UI_STRING_KEYS.map((k) => [k, "x"]),
    );
    const report = await buildReadinessReport(
      root,
      configuredConfig({
        i18n: {
          availableLocales: ["en", "zh"],
          defaultLocale: "en",
          // zh has no entry at all, and en cannot cover it because the fallback
          // only applies per-key — a wholly absent locale is still a gap.
          translations: { en: full },
        },
      }),
      {},
    );
    const item = byId(report.items, "translations");
    expect(item.done).toBe(false);
    expect(item.detail).toContain("zh");
  });
});

describe("tier 2 optional checks", () => {
  it("reports shipping honestly when it is disabled", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ shipping: undefined }),
      {},
    );
    const item = byId(report.items, "shipping");
    expect(item.tier).toBe(2);
    expect(item.done).toBe(false);
    expect(item.detail).toMatch(/optional/i);
  });

  it("sees installed Aceternity components", async () => {
    const root = await sandbox();
    const before = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(before.items, "aceternity").done).toBe(false);

    await fs.mkdir(path.join(root, "components", "ui"), { recursive: true });
    await fs.writeFile(path.join(root, "components", "ui", "aurora.tsx"), "export {};", "utf-8");

    const after = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(after.items, "aceternity").done).toBe(true);
  });
});

describe("a config that failed to load", () => {
  it("reports a single actionable finding instead of throwing", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, null, {});

    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.id).toBe("config-parse");
    expect(report.items[0]?.done).toBe(false);
    expect(report.items[0]?.tier).toBe(1);
    expect(report.tier1Total).toBe(1);
    expect(report.allTier1Done).toBe(false);
    expect(report.items[0]?.action).toEqual({ kind: "command", command: "pnpm type-check" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/lib/siteReadiness.test.ts`
Expected: FAIL — cannot resolve `./siteReadiness`.

- [ ] **Step 3: Implement the module**

Write `scripts/lib/siteReadiness.ts` per the implementation notes above. Keep every check in its own small function returning a `ReadinessItem`, and assemble them in spec order. No `fs` writes anywhere. Comment the two non-obvious choices: why config/env are injected, and why `loadAllItemsRaw()` is deliberately not used.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/lib/siteReadiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/siteReadiness.ts scripts/lib/siteReadiness.test.ts
git commit -m "feat: site readiness checklist engine

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 3: `pnpm doctor`

**Files:**
- Create: `scripts/doctor.ts`
- Modify: `package.json` (add the script entry)

**Interfaces:**
- Consumes: `buildReadinessReport`, `ReadinessReport`, `ReadinessItem`, `ReadinessConfig` from `./lib/siteReadiness` (Task 2).

**Implementation notes:**

- Register as `"doctor": "tsx scripts/doctor.ts"`, placed next to the other `tsx scripts/*` entries in `package.json`.
- Load the config defensively — this is the whole reason `buildReadinessReport` accepts `null`:

```typescript
let config: ReadinessConfig | null = null;
try {
  const mod = await import("@/content/config");
  config = mod.siteConfig;
} catch {
  // A config with a syntax error, a bad import, or a type that no longer
  // matches: report that as the finding rather than crashing. This path is
  // exactly why buildReadinessReport takes `config: ReadinessConfig | null`.
  config = null;
}
```

- Output format, printed with `console.log`:

```
UsedExchange setup doctor

Core — 4 of 6 done

  ✓ Site identity            baseUrl is set to https://mysite.com
  ○ First item               No items yet
      → Run: pnpm new electronics/iphone-14

Advanced — optional

  ○ Aceternity UI            components/ui/ not installed
      → Run: pnpm setup-ui

Run `pnpm studio` for the browser version of this checklist.
```

- Render each action as a following indented line: `command` → `→ Run: <command>`; `docs` → `→ See: <doc>`; `pane`/`studio` → `→ In Studio: <human phrase>` (e.g. `open the Config pane`, `use New item`). Done items print no action line.
- `✓` and `○` are always accompanied by the title and detail text — the glyph never carries the meaning alone.
- **Exit code:** `process.exit(report.allTier1Done ? 0 : 1)`. It is a readiness check, so a non-zero exit lets it gate a script; it is not wired into `prebuild`, so it never blocks a build.

- [ ] **Step 1: Write the CLI**

Create `scripts/doctor.ts` following the notes above.

- [ ] **Step 2: Add the package.json entry**

```json
    "doctor": "tsx scripts/doctor.ts",
```

- [ ] **Step 3: Verify against the real repo**

Run: `pnpm doctor; echo "exit=$?"`
Expected: the checklist prints with both sections. On this repo `identity` is not done (the config still points at the demo domain), so expect `exit=1`. Confirm at least one `→ Run:` or `→ See:` line appears under a not-done item.

- [ ] **Step 4: Verify the broken-config path**

```bash
cp content/config.ts /tmp/config-backup.ts
printf 'export const siteConfig = {\n' > content/config.ts   # deliberately unparseable
pnpm doctor; echo "exit=$?"
cp /tmp/config-backup.ts content/config.ts
git diff --stat content/config.ts   # must be empty — the file is restored
```
Expected: doctor prints the `config-parse` finding (not a stack trace) and exits `1`; the final `git diff --stat` is empty.

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add scripts/doctor.ts package.json
git commit -m "feat: pnpm doctor prints the setup checklist

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 4: `GET /api/readiness` route

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Test: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `buildReadinessReport` from `./siteReadiness` (Task 2); the existing `siteConfig` import already at the top of `studioApi.ts`.
- Produces: `GET /api/readiness` → `{ report: ReadinessReport }`.

**Implementation notes:**

- The handler is small: `buildReadinessReport(req.projectRoot, siteConfig, process.env)` wrapped in the file's existing error conventions. `studioApi.ts` already imports `siteConfig` at module scope, so the `config: null` path is unreachable here — Studio cannot start at all with a broken config. Add a one-line comment saying so, so the asymmetry with `doctor.ts` is deliberate rather than a mystery.
- Register the route immediately after the `/api/config` block in `handleStudioRequest`:

```typescript
    if (pathname === "/api/readiness") {
      if (req.method === "GET") return await handleReadinessGet(req);
      return { status: 405, body: { error: "GET only" } };
    }
```

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/studioApi.test.ts`, following the sandbox pattern already used by the `config routes` describe block:

```typescript
describe("readiness route", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  async function readinessProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-readiness-"));
    tempProjects.push(root);
    return root;
  }

  it("GET returns a tiered report", async () => {
    const root = await readinessProject();
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/readiness",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(200);
    const report = (asJson(res).body as { report: { items: Array<{ id: string; tier: number }>; tier1Total: number } }).report;
    expect(report.items.map((i) => i.id)).toContain("identity");
    expect(report.items.map((i) => i.id)).toContain("aceternity");
    expect(report.tier1Total).toBe(6);
  });

  it("405s a POST", async () => {
    const root = await readinessProject();
    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/readiness",
      body: Buffer.from("{}"),
      projectRoot: root,
    });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/lib/studioApi.test.ts -t "readiness route"`
Expected: FAIL — 404, no such route.

- [ ] **Step 3: Implement the handler and register the route**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/lib/studioApi.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Full gates**

Run: `pnpm test && pnpm type-check && pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: studio readiness route

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 5: `GettingStarted` panel in Studio

**Files:**
- Modify: `studio/src/api.ts`
- Create: `studio/src/panes/GettingStarted.tsx`
- Modify: `studio/src/tokens.css` (append a getting-started section at the end)
- Modify: `studio/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/readiness` (Task 4); `Button` from `../components/Button`.
- Produces: `fetchReadiness(): Promise<ReadinessReport>` in `api.ts`; `GettingStarted({ open, onToggle, onOpenConfig, onNewItem })` component.

**Implementation notes:**

- `api.ts`: re-export the readiness types with `import type { ReadinessReport, ReadinessItem, ReadinessAction } from "../../scripts/lib/siteReadiness"` — the type-only import keeps the node module out of the browser bundle (the file already does this for `StudioItem` and `ConfigField`).
- The panel renders **below the header, above the filter bar** — inline, not a dialog. It is not a modal, so it does NOT use `useDialogBehavior`.
- Visibility: `App` owns a `showGuide` boolean. Initial value is `false`; when the fetched report has `allTier1Done === false`, set it to `true` once (auto-open on a not-ready site). A header button toggles it at any time, so a ready seller can still open it.
- Group items by tier: tier 1 in an always-visible `<section>` headed `Getting started — N of M done`; tier 2 inside `<details><summary>Advanced (optional)</summary>`.
- Each row: a status glyph with a screen-reader label (`<span aria-hidden="true">✓</span><span className="visually-hidden">Done</span>` — `visually-hidden` already exists in `tokens.css`), the title, the detail, and the action.
- Action rendering: `pane:config` → `<Button>` calling `onOpenConfig`; `studio:new-item` → `<Button>` calling `onNewItem`; `command` → `<code>`; `docs` → `<a href={doc} target="_blank" rel="noreferrer">`.
- States, all three required: loading → three `.skeleton` rows; error → `<p role="alert" className="alert-error">`; all-done → collapse to a single line `All set — your site is ready to publish.` with the toggle still available.
- CSS: append `.getting-started`, `.gs-row`, `.gs-status`, `.gs-body`, `.gs-title`, `.gs-detail`, `.gs-action` at the end of `tokens.css`, consuming existing tokens only. At `max-width: 40rem`, `.gs-row` switches to `flex-direction: column` so the action wraps beneath the text (same breakpoint the filter bar uses).

- [ ] **Step 1: Add the client fetcher to `api.ts`**

```typescript
export async function fetchReadiness(): Promise<ReadinessReport> {
  const res = await fetch("/api/readiness");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `loading setup status failed with ${res.status} ${res.statusText}`));
  }
  if (body?.report === undefined) {
    throw new Error(`GET /api/readiness returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return body.report as ReadinessReport;
}
```

- [ ] **Step 2: Create `GettingStarted.tsx`**

- [ ] **Step 3: Append the styles to `tokens.css`**

- [ ] **Step 4: Wire it into `App.tsx`**

Add `const [showGuide, setShowGuide] = useState(false);`, a `Setup` button in `.head-actions` before the `Config` button, and render `<GettingStarted … />` directly beneath the header block — above the `FilterBar`. Pass `onOpenConfig={() => setShowConfig(true)}` and `onNewItem={() => setShowNewItem(true)}` so the panel's actions land in the panes that already exist.

- [ ] **Step 5: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add studio/src/api.ts studio/src/panes/GettingStarted.tsx studio/src/tokens.css studio/src/App.tsx
git commit -m "feat: getting-started panel in studio

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 6: Documentation (bilingual, one commit)

Every edit ships in both the English file and its `_zh` counterpart (Iron Rule 2). Locate each anchor by structure; the `_zh` files are parallel translations.

**Files:**
- Modify: `docs/CURRENT_FUNCTIONALITY.md` + `_zh.md`
- Modify: `docs/ARCHITECTURE.md` + `_zh.md`
- Modify: `docs/SCRIPTS.md` + `_zh.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md` + `_zh.md`

- [ ] **Step 1: CURRENT_FUNCTIONALITY**

Check the operations-count sentence first — earlier phases have incremented it, so read the current number rather than assuming. Bump it by one, and add a row to the Seller Studio operations table:

```markdown
| Getting started | A setup checklist for a new site: what is still missing (site identity, CDN credentials, first item, git, contact) and where to fix each one. Opens itself until the core steps are done, then stays one click away in the header |
```

Chinese:

```markdown
| 上手引导 | 新站点的就绪清单：还缺什么（站点身份、CDN 凭据、第一个商品、git、联系方式）以及每项去哪里处理。核心步骤未完成时自动展开，完成后收起为顶栏一个按钮 |
```

- [ ] **Step 2: ARCHITECTURE**

Add to the `scripts/lib/` module table:

```markdown
| `siteReadiness.ts` | The one place that decides what a fresh site is still missing: a tiered checklist (core path + optional extras) built from config, env vars and the filesystem. Config and env are injected, so it is unit-testable offline and can report a broken `content/config.ts` instead of crashing on it. Shared by `pnpm doctor` and studio's readiness route |
| `i18nRequiredKeys.ts` | The UI string keys every locale must resolve, shared by `check-config.ts` and `siteReadiness.ts` |
```

Chinese:

```markdown
| `siteReadiness.ts` | 判断"新站点还缺什么"的唯一出处：由 config、环境变量与文件系统构建的分级清单（核心路径 + 可选增强）。config 与 env 采用注入，因此可离线单测，并能在 `content/config.ts` 损坏时如实报告而非崩溃。由 `pnpm doctor` 与 studio 的就绪路由共用 |
| `i18nRequiredKeys.ts` | 每个 locale 都必须解析的 UI 字符串键，由 `check-config.ts` 与 `siteReadiness.ts` 共用 |
```

Add the panel to the studio panes enumeration in both languages:

```markdown
- `studio/src/panes/GettingStarted.tsx` — the first-run checklist panel, rendered inline above the item table; its actions open the Config pane or the new-item dialog
```

```markdown
- `studio/src/panes/GettingStarted.tsx` — 首次上手清单面板，内联渲染在商品表格上方；面板中的动作会打开 Config 面板或新建商品弹窗
```

- [ ] **Step 3: SCRIPTS**

Add a row to the scripts table, matching the existing three-column format:

```markdown
| `pnpm doctor` | `tsx scripts/doctor.ts` | Print the setup checklist: what is still missing and the command or pane for each step. Exits 1 while core steps remain |
```

Chinese:

```markdown
| `pnpm doctor` | `tsx scripts/doctor.ts` | 打印就绪清单：还缺什么，以及每一步对应的命令或面板。核心步骤未完成时以 1 退出 |
```

- [ ] **Step 4: IMPLEMENTATION_PLAN — Phase 24**

Append after the Phase 23 section, before the Risk Register, matching the `---` separator style the neighbouring phases use (English):

```markdown
## Phase 24 — First-Run Setup Guide ✅

- [x] `scripts/lib/siteReadiness.ts`: tiered readiness checklist (core: identity, image storage, first item, first item live, git, contact; optional: translations, shipping, Aceternity) with config and env injected so it is unit-testable and can report a broken config instead of crashing
- [x] `scripts/lib/i18nRequiredKeys.ts`: required UI string keys extracted so `check-config.ts` and the readiness engine share one list
- [x] `pnpm doctor`: prints the checklist with a next step per item; exits 1 while core steps remain
- [x] `GET /api/readiness` + `GettingStarted` panel: opens itself on a not-ready site, collapses when everything core is done, always reachable from the header
- [x] Docs sync (CURRENT_FUNCTIONALITY, ARCHITECTURE, SCRIPTS, this plan) — both languages
```

Chinese:

```markdown
## Phase 24 — 首次安装引导 ✅

- [x] `scripts/lib/siteReadiness.ts`：分级就绪清单（核心：站点身份、图片存储、第一个商品、商品上架、git、联系方式；可选：翻译、运费、Aceternity），config 与 env 采用注入，因而可单测，并能在 config 损坏时如实报告而非崩溃
- [x] `scripts/lib/i18nRequiredKeys.ts`：抽出必需的 UI 字符串键，供 `check-config.ts` 与就绪引擎共用同一份列表
- [x] `pnpm doctor`：打印清单并为每项给出下一步；核心步骤未完成时以 1 退出
- [x] `GET /api/readiness` 与 `GettingStarted` 面板：站点未就绪时自动展开，核心全部完成后收起，随时可从顶栏打开
- [x] 文档同步（CURRENT_FUNCTIONALITY、ARCHITECTURE、SCRIPTS、本计划），中英双语
```

- [ ] **Step 5: Commit**

```bash
git add docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md \
        docs/ARCHITECTURE.md docs/ARCHITECTURE_zh.md \
        docs/SCRIPTS.md docs/SCRIPTS_zh.md \
        docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_PLAN_zh.md
git commit -m "docs: first-run setup guide (Phase 24) in four doc pairs

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 7: Full verification

Verification only — no code changes, no commits (a required fix gets its own `fix:` commit).

- [ ] **Step 1: Automated gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean. Baseline was 666 tests / 39 files; Tasks 2 and 4 add to that.

- [ ] **Step 2: Prove the two entry points agree**

This is the feature's central claim — one judgement, two shells.

```bash
pnpm doctor > /tmp/doctor.txt; echo "exit=$?"
pnpm studio --port 5199 &
sleep 8
curl -s http://127.0.0.1:5199/api/readiness | head -c 600
```
Compare: every item id in the API response must appear in the doctor output, with the same done/not-done state. Then kill the server and confirm the port is free.

- [ ] **Step 3: Prove readiness writes nothing**

```bash
git status --porcelain > /tmp/before.txt
pnpm doctor > /dev/null
git status --porcelain > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo "doctor wrote nothing"
```
Expected: prints `doctor wrote nothing`.

- [ ] **Step 4: Confirm the tree is clean**

Run: `git status --porcelain`
Expected: empty.

- [ ] **Step 5: Record the human-only checklist in the report**

1. On a not-ready site the panel is open on load; on a ready site it is collapsed to one line.
2. The header `Setup` button opens and closes the panel in both states.
3. The Config action opens the Config pane; the New item action opens the new-item dialog.
4. Tier-2 items sit inside a collapsed `Advanced (optional)` disclosure.
5. Each row's status reads correctly in a screen reader (the glyph is `aria-hidden`, the text is not).
6. Tab reaches every action; focus rings are visible.
7. At 320px and 768px the rows stack without overlap.
8. Light and dark themes both render the panel with readable contrast.

---

## Self-Review Notes (done at plan-writing time)

- Spec coverage: readiness engine + data model + injection → Task 2; tiered checklist (all nine items) → Task 2; `REQUIRED_KEYS` extraction → Task 1; doctor + exit codes + broken-config path → Task 3; API route → Task 4; panel with auto-open, always-reachable button, three states, a11y, responsive → Task 5; docs incl. Phase 24 → Task 6; verification of the "two entry points agree" claim → Task 7.
- No placeholders: every step carries exact code, exact commands, or exact implementation notes.
- Type/name consistency: `ReadinessTier`, `ReadinessAction`, `ReadinessItem`, `ReadinessReport`, `ReadinessConfig`, `buildReadinessReport`, `REQUIRED_UI_STRING_KEYS`, `fetchReadiness`, `GettingStarted` are spelled identically wherever they appear.
- Ordering: Task 1 must precede Task 2 (the key list is imported); Task 2 precedes 3-5 (all consume the engine); Task 5's panel is only mounted in its own task, so no task leaves a half-wired UI; Task 7 verifies before the docs' Phase 24 claim is trusted.
- Known risk flagged for the implementer: `first-item` deliberately does not reuse `loadAllItemsRaw()` because that helper resolves `content/` from `process.cwd()`, which would ignore `projectRoot` and silently pass the sandboxed tests against the real repo. Task 2's notes call this out.
