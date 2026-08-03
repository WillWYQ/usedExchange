# Seller Studio Item Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sellers manage two tiers of item defaults (site-wide + per-category, stored as sparse `_defaults.json` under `content/items/`) in a new Studio pane, and apply them when creating items in both Studio and `pnpm create-item`.

**Architecture:** A new pure module `scripts/lib/itemDefaults.ts` reads, validates, and merges the two default layers over the existing `buildItemTemplate()` scaffold. `studioApi.ts` gains `GET/PUT /api/defaults?scope=...` routes and an `applyDefaults` flag on item creation; `create-item.ts` calls the same module. The Studio SPA gets a `DefaultsPane` dialog (fields rendered by a `FieldInput` component extracted from `EditForm`) and an "Apply defaults" checkbox in the new-item dialog.

**Tech Stack:** TypeScript, Node (tsx), Zod, Vitest, React 19 + Vite (studio SPA), JSONC item files.

**Spec:** `docs/superpowers/specs/2026-08-02-studio-item-defaults-design.md`

## Global Constraints

Copied from `.claude/CLAUDE.md` iron rules and the spec. Every task inherits these:

- Iron Rule 1: tooling writes only under `content/` (plus `lib/generated/image-manifest.json`, which this work does not touch). Both `_defaults.json` files live under `content/items/`.
- Iron Rule 4: never read, write, or render `reserved_for`. Validation rejects it with its own error message; merge strips it defensively.
- Iron Rule 2: any doc edit ships with its `_zh` counterpart in the same commit (Task 8 handles all docs in one bilingual pass).
- Iron Rule 7: Phase 19 gets added to `IMPLEMENTATION_PLAN.md` / `_zh` with all tasks `[x]` and ✅ (done in Task 8, after verification).
- `content/config.ts` is not touched; no new config fields, so the backward-compat checklist of Iron Rule 8 does not apply.
- Tests run with `pnpm test` (Vitest), `pnpm type-check`, `pnpm lint` (zero warnings). All three must pass before every commit.
- Commit messages follow the repo style (`feat:`, `fix:`, `refactor:`, `docs:` prefixes) and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Work happens on the existing branch `feat/studio-item-defaults`.

---

### Task 1: `scripts/lib/itemDefaults.ts` — read, validate, merge

**Files:**
- Create: `scripts/lib/itemDefaults.ts`
- Test: `scripts/lib/itemDefaults.test.ts`

**Interfaces:**
- Consumes: `assertEditableValue(path, value)` and `EDITABLE_TOP_LEVEL_FIELDS` from `scripts/lib/itemFields.ts`; `fs/promises`, `path` from node.
- Produces (later tasks call these exact names):
  - `export const DEFAULTS_FILENAME = "_defaults.json"`
  - `export type DefaultsObject = Record<string, unknown>`
  - `export function parseDefaultsText(text: string, source: string): DefaultsObject` — throws `Error` naming `source`
  - `export function readDefaultsFile(filePath: string): Promise<DefaultsObject>` — missing file → `{}`
  - `export function validateDefaults(defaults: DefaultsObject): void` — throws `Error` naming the field
  - `export function mergeDefaultsLayers(site: DefaultsObject, category: DefaultsObject): DefaultsObject`
  - `export function mergeDefaultsIntoTemplate<T extends Record<string, unknown>>(template: T, defaults: DefaultsObject): T`
  - `export function loadMergedDefaults(itemsRoot: string, category: string): Promise<DefaultsObject>` — reads both files, validates each, merges category over site

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/itemDefaults.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildItemTemplate } from "./itemTemplate";
import {
  DEFAULTS_FILENAME,
  loadMergedDefaults,
  mergeDefaultsIntoTemplate,
  mergeDefaultsLayers,
  parseDefaultsText,
  readDefaultsFile,
  validateDefaults,
} from "./itemDefaults";

describe("parseDefaultsText", () => {
  it("parses a sparse defaults object", () => {
    expect(parseDefaultsText('{"no_lowball": true}', "x.json")).toEqual({ no_lowball: true });
  });

  it("rejects invalid JSON naming the source", () => {
    expect(() => parseDefaultsText("{nope", "content/items/_defaults.json")).toThrow(
      /content\/items\/_defaults\.json.*not valid JSON/,
    );
  });

  it("rejects non-object roots", () => {
    expect(() => parseDefaultsText("[1, 2]", "x.json")).toThrow(/expected a JSON object/);
    expect(() => parseDefaultsText("null", "x.json")).toThrow(/expected a JSON object/);
  });
});

describe("readDefaultsFile", () => {
  it("returns {} when the file does not exist", async () => {
    expect(await readDefaultsFile(path.join(os.tmpdir(), "no-such-dir", DEFAULTS_FILENAME))).toEqual({});
  });
});

describe("validateDefaults", () => {
  it("accepts a realistic sparse set", () => {
    expect(() =>
      validateDefaults({
        preferred_payment: ["cash", "venmo"],
        contact_note: "WeChat: xxx",
        pickup_windows: ["Weekday evenings"],
        no_lowball: true,
        price: { currency: "USD", negotiable: true },
        dimensions: { unit: "in" },
        weight: { unit: "lb" },
      }),
    ).not.toThrow();
  });

  it("rejects reserved_for with its own message", () => {
    expect(() => validateDefaults({ reserved_for: "someone" })).toThrow(/private buyer info/);
  });

  it.each(["name", "status", "listed_date", "sold_date"])(
    "rejects the per-item field %s",
    (field) => {
      expect(() => validateDefaults({ [field]: "x" })).toThrow(/can never be a default/);
    },
  );

  it("rejects a field outside the item.json schema", () => {
    expect(() => validateDefaults({ colour: "red" })).toThrow(/outside the item\.json schema/);
  });

  it("rejects an invalid leaf value naming the path", () => {
    expect(() => validateDefaults({ no_lowball: "yes" })).toThrow(/no_lowball/);
    expect(() => validateDefaults({ dimensions: { length: -1 } })).toThrow(/dimensions\.length/);
    expect(() => validateDefaults({ price: { bogus: true } })).toThrow(/bogus/);
  });

  it("rejects a non-object dimensions/weight default", () => {
    expect(() => validateDefaults({ dimensions: null })).toThrow(/dimensions.*expected an object/);
  });
});

describe("mergeDefaultsLayers", () => {
  it("category overrides site scalars and replaces arrays wholesale", () => {
    expect(
      mergeDefaultsLayers(
        { contact_note: "site", pickup_windows: ["a", "b"], no_lowball: false },
        { contact_note: "cat", pickup_windows: ["c"] },
      ),
    ).toEqual({ contact_note: "cat", pickup_windows: ["c"], no_lowball: false });
  });

  it("deep-merges nested objects leaf by leaf", () => {
    expect(
      mergeDefaultsLayers({ price: { currency: "EUR", negotiable: false } }, { price: { negotiable: true } }),
    ).toEqual({ price: { currency: "EUR", negotiable: true } });
  });
});

describe("mergeDefaultsIntoTemplate", () => {
  const template = () => buildItemTemplate("Desk Lamp", "2026-08-02");

  it("merges defaults over the template", () => {
    const merged = mergeDefaultsIntoTemplate(template(), {
      contact_note: "WeChat: xxx",
      price: { currency: "EUR", negotiable: true },
      dimensions: { unit: "in" },
    });
    expect(merged.contact_note).toBe("WeChat: xxx");
    expect(merged.price.currency).toBe("EUR");
    expect(merged.price.negotiable).toBe(true);
    // Untouched template leaves survive the merge.
    expect(merged.price.show_tiers).toBe(false);
    expect(merged.dimensions.length).toBeNull();
    expect(merged.dimensions.unit).toBe("in");
  });

  it("never lets defaults touch name, status, listed_date, sold_date, reserved_for", () => {
    const merged = mergeDefaultsIntoTemplate(template(), {
      name: "Hijacked",
      status: "available",
      listed_date: "2000-01-01",
      sold_date: "2000-01-02",
      reserved_for: "someone",
    });
    expect(merged.name).toBe("Desk Lamp");
    expect(merged.status).toBe("draft");
    expect(merged.listed_date).toBe("2026-08-02");
    expect(merged.sold_date).toBeNull();
    expect("reserved_for" in merged).toBe(false);
  });

  it("does not mutate the template", () => {
    const base = template();
    mergeDefaultsIntoTemplate(base, { contact_note: "x" });
    expect(base.contact_note).toBe("");
  });
});

describe("loadMergedDefaults", () => {
  let root = "";

  afterEach(async () => {
    if (root !== "") await fs.rm(root, { recursive: true, force: true });
    root = "";
  });

  async function itemsRoot(): Promise<string> {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "item-defaults-"));
    const items = path.join(root, "content", "items");
    await fs.mkdir(path.join(items, "electronics"), { recursive: true });
    return items;
  }

  it("merges site and category layers, category winning", async () => {
    const items = await itemsRoot();
    await fs.writeFile(
      path.join(items, DEFAULTS_FILENAME),
      JSON.stringify({ contact_note: "site", no_lowball: true }),
      "utf-8",
    );
    await fs.writeFile(
      path.join(items, "electronics", DEFAULTS_FILENAME),
      JSON.stringify({ contact_note: "cat" }),
      "utf-8",
    );
    expect(await loadMergedDefaults(items, "electronics")).toEqual({
      contact_note: "cat",
      no_lowball: true,
    });
  });

  it("returns {} when neither file exists", async () => {
    const items = await itemsRoot();
    expect(await loadMergedDefaults(items, "electronics")).toEqual({});
  });

  it("rejects an invalid layer naming the file and the field", async () => {
    const items = await itemsRoot();
    await fs.writeFile(path.join(items, DEFAULTS_FILENAME), JSON.stringify({ name: "X" }), "utf-8");
    await expect(loadMergedDefaults(items, "electronics")).rejects.toThrow(
      new RegExp(`${path.join(items, DEFAULTS_FILENAME).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*"name"`),
    );
  });

  it("rejects unparseable JSON naming the file", async () => {
    const items = await itemsRoot();
    await fs.writeFile(path.join(items, "electronics", DEFAULTS_FILENAME), "{oops", "utf-8");
    await expect(loadMergedDefaults(items, "electronics")).rejects.toThrow(/electronics\/_defaults\.json.*not valid JSON/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test scripts/lib/itemDefaults.test.ts`
Expected: FAIL — cannot resolve `./itemDefaults` (module does not exist yet).

- [ ] **Step 3: Write the module**

Create `scripts/lib/itemDefaults.ts`:

```typescript
// Two-tier item defaults for studio and the CLIs.
//
// Defaults live in sparse JSON files under content/items/:
//   content/items/_defaults.json                (site-wide)
//   content/items/<category>/_defaults.json     (per category)
// Only the fields the seller explicitly set appear in them. When an item is
// created, the layers merge over the built-in template:
//   template <- site <- category,
// with name/listed_date/status re-applied from the template last.
//
// This module parses, validates and merges. It owns no HTTP status codes and
// writes no files — studioApi.ts and create-item.ts own the paths, the writes,
// and the translation of Error into their respective failure shapes.

import fsPromises from "fs/promises";
import path from "path";
import { assertEditableValue, EDITABLE_TOP_LEVEL_FIELDS } from "./itemFields";

export const DEFAULTS_FILENAME = "_defaults.json";

export type DefaultsObject = Record<string, unknown>;

// Fields that belong to one item, never to a template: wrong for every new
// item (name, the dates) or hiding the listing from the site (status).
// reserved_for is Iron Rule 4 — private buyer info, never written by tooling —
// and gets its own message so the reason is obvious.
const NEVER_DEFAULTABLE = new Set(["name", "status", "listed_date", "sold_date"]);
const PRIVATE_FIELD = "reserved_for";

// dimensions/weight defaults may hold single leaves (e.g. only `unit`), so
// they are validated leaf by leaf: the whole-object schemas require every key,
// which sparse defaults must not.
const LEAF_OBJECT_FIELDS = new Set(["dimensions", "weight"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDefaultsText(text: string, source: string): DefaultsObject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`invalid defaults in ${source}: not valid JSON`);
  }
  if (!isPlainObject(raw)) {
    throw new Error(`invalid defaults in ${source}: expected a JSON object`);
  }
  return raw;
}

/** A missing file is "no defaults", not an error. Anything else that fails
 * reading propagates — a permissions problem must not read as empty defaults. */
export async function readDefaultsFile(filePath: string): Promise<DefaultsObject> {
  let text: string;
  try {
    text = await fsPromises.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return parseDefaultsText(text, filePath);
}

export function validateDefaults(defaults: DefaultsObject): void {
  for (const [field, value] of Object.entries(defaults)) {
    if (field === PRIVATE_FIELD) {
      throw new Error(`"${field}" is private buyer info and can never be a default`);
    }
    if (NEVER_DEFAULTABLE.has(field)) {
      throw new Error(`"${field}" belongs to each item and can never be a default`);
    }
    if (!EDITABLE_TOP_LEVEL_FIELDS.includes(field)) {
      throw new Error(`Refusing to store a default outside the item.json schema: "${field}"`);
    }
    if (LEAF_OBJECT_FIELDS.has(field)) {
      if (!isPlainObject(value)) {
        throw new Error(`Invalid value for "${field}": expected an object`);
      }
      for (const [leaf, leafValue] of Object.entries(value)) {
        assertEditableValue([field, leaf], leafValue);
      }
      continue;
    }
    assertEditableValue([field], value);
  }
}

/** Deep merge for plain objects; arrays and scalars are replaced wholesale. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = deepMerge(base[key], value);
    }
    return out;
  }
  return override;
}

export function mergeDefaultsLayers(site: DefaultsObject, category: DefaultsObject): DefaultsObject {
  return deepMerge(site, category) as DefaultsObject;
}

export function mergeDefaultsIntoTemplate<T extends Record<string, unknown>>(
  template: T,
  defaults: DefaultsObject,
): T {
  // Defense in depth: validateDefaults rejects these on the write path, but a
  // hand-edited _defaults.json never passed through it, so the merge strips
  // the never-defaultable and private keys itself.
  const safe: DefaultsObject = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (key === PRIVATE_FIELD || NEVER_DEFAULTABLE.has(key)) continue;
    safe[key] = value;
  }
  const merged = deepMerge(template, safe) as T;
  // TypeScript only permits property writes to a generic T through a widened
  // view; the casts are type-level only and change no runtime behavior.
  const mergedRecord = merged as Record<string, unknown>;
  const templateRecord = template as Record<string, unknown>;
  mergedRecord.name = templateRecord.name;
  mergedRecord.listed_date = templateRecord.listed_date;
  mergedRecord.status = templateRecord.status;
  return merged;
}

async function readAndValidate(filePath: string): Promise<DefaultsObject> {
  const defaults = await readDefaultsFile(filePath);
  try {
    validateDefaults(defaults);
  } catch (err: unknown) {
    throw new Error(`invalid defaults in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return defaults;
}

/** Reads and validates both layers and returns them merged, category over
 * site. Either file may be absent; that is {} and not an error. */
export async function loadMergedDefaults(itemsRoot: string, category: string): Promise<DefaultsObject> {
  const site = await readAndValidate(path.join(itemsRoot, DEFAULTS_FILENAME));
  const categoryDefaults = await readAndValidate(path.join(itemsRoot, category, DEFAULTS_FILENAME));
  return mergeDefaultsLayers(site, categoryDefaults);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test scripts/lib/itemDefaults.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/itemDefaults.ts scripts/lib/itemDefaults.test.ts
git commit -m "feat: two-tier item defaults module (read, validate, merge)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Studio API — defaults routes + `applyDefaults` on item create

**Files:**
- Modify: `scripts/lib/studioApi.ts` (imports near line 24; `createItemBodySchema`/`handleItemCreate` around lines 639-691; route block inside `handleStudioRequest` around line 745)
- Test: `scripts/lib/studioApi.test.ts` (new `describe("defaults routes")`; extend the existing `describe("POST /api/items")` block starting around line 1167)

**Interfaces:**
- Consumes: `DEFAULTS_FILENAME`, `loadMergedDefaults`, `mergeDefaultsIntoTemplate`, `readDefaultsFile`, `validateDefaults` from `./itemDefaults` (Task 1); existing `StudioError`, `parseJsonBody`, `isValidSlug` in `studioApi.ts`.
- Produces: `GET /api/defaults?scope=site|<category>` → 200 with the scope's defaults object (`{}` when no file); `PUT /api/defaults?scope=...` with a sparse JSON body → 200, file written or deleted (empty body); `POST /api/items` gains optional `applyDefaults?: boolean` (default `true`).

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `scripts/lib/studioApi.test.ts` (after the `describe("POST /api/items")` block), and add three tests inside that existing block. New block:

```typescript
describe("defaults routes", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-defaults-"));
    await fs.mkdir(path.join(root, "content", "items"), { recursive: true });
    tempProjects.push(root);
    return root;
  }

  function req(root: string, method: string, url: string, body?: unknown) {
    return handleStudioRequest({
      method,
      url,
      body: body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  it("GET returns {} when no defaults file exists", async () => {
    const root = await emptyProject();
    const res = await req(root, "GET", "/api/defaults?scope=site");
    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({});
  });

  it("PUT then GET round-trips site defaults", async () => {
    const root = await emptyProject();
    const put = await req(root, "PUT", "/api/defaults?scope=site", { contact_note: "WeChat: xxx" });
    expect(put.status).toBe(200);
    expect(
      await fs.readFile(path.join(root, "content", "items", "_defaults.json"), "utf-8"),
    ).toContain('"contact_note": "WeChat: xxx"');
    const get = await req(root, "GET", "/api/defaults?scope=site");
    expect(asJson(get).body).toEqual({ contact_note: "WeChat: xxx" });
  });

  it("PUT to a category scope creates the folder and file", async () => {
    const root = await emptyProject();
    const put = await req(root, "PUT", "/api/defaults?scope=electronics", { no_lowball: true });
    expect(put.status).toBe(200);
    expect(
      await fs.readFile(
        path.join(root, "content", "items", "electronics", "_defaults.json"),
        "utf-8",
      ),
    ).toContain('"no_lowball": true');
  });

  it("PUT with an empty object deletes the existing file", async () => {
    const root = await emptyProject();
    const filePath = path.join(root, "content", "items", "_defaults.json");
    await fs.writeFile(filePath, '{"no_lowball": true}', "utf-8");
    const put = await req(root, "PUT", "/api/defaults?scope=site", {});
    expect(put.status).toBe(200);
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it("400s a PUT of reserved_for, a per-item field, or a bad value", async () => {
    const root = await emptyProject();
    expect((await req(root, "PUT", "/api/defaults?scope=site", { reserved_for: "x" })).status).toBe(400);
    expect((await req(root, "PUT", "/api/defaults?scope=site", { name: "x" })).status).toBe(400);
    expect((await req(root, "PUT", "/api/defaults?scope=site", { no_lowball: "yes" })).status).toBe(400);
  });

  it("400s a missing or malformed scope", async () => {
    const root = await emptyProject();
    expect((await req(root, "GET", "/api/defaults")).status).toBe(400);
    expect((await req(root, "GET", "/api/defaults?scope=Electronics")).status).toBe(400);
    expect((await req(root, "GET", "/api/defaults?scope=..")).status).toBe(400);
  });

  it("400s GET when the file on disk is invalid, naming the field", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      JSON.stringify({ name: "X" }),
      "utf-8",
    );
    const res = await req(root, "GET", "/api/defaults?scope=site");
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain('"name"');
  });

  it("405s POST /api/defaults", async () => {
    const root = await emptyProject();
    expect((await req(root, "POST", "/api/defaults?scope=site", {})).status).toBe(405);
  });
});
```

Inside the existing `describe("POST /api/items")` block (which already defines `create()` and `emptyProject()`), add:

```typescript
  it("applies merged site and category defaults on create", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      JSON.stringify({ contact_note: "site note", no_lowball: true, price: { currency: "EUR" } }),
      "utf-8",
    );
    await fs.mkdir(path.join(root, "content", "items", "electronics"), { recursive: true });
    await fs.writeFile(
      path.join(root, "content", "items", "electronics", "_defaults.json"),
      JSON.stringify({ contact_note: "cat note", price: { negotiable: true } }),
      "utf-8",
    );

    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(201);

    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"contact_note": "cat note"'); // category wins
    expect(text).toContain('"no_lowball": true'); // site layer survives
    expect(text).toContain('"currency": "EUR"'); // deep-merged price leaf
    expect(text).toContain('"negotiable": true'); // deep-merged price leaf
    expect(text).toContain('"name": "Desk Lamp"'); // per-item fields stay fresh
    expect(text).toContain('"status": "draft"');
  });

  it("skips defaults when applyDefaults is false", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      JSON.stringify({ contact_note: "site note" }),
      "utf-8",
    );
    const res = await create(root, {
      category: "electronics",
      name: "desk-lamp",
      applyDefaults: false,
    });
    expect(res.status).toBe(201);
    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"contact_note": ""');
  });

  it("400s when a defaults file is invalid, naming the file", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      "{not json",
      "utf-8",
    );
    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain("_defaults.json");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test scripts/lib/studioApi.test.ts`
Expected: the new tests FAIL (404s / missing defaults in created items); all pre-existing tests still PASS.

- [ ] **Step 3: Implement in `studioApi.ts`**

Add to the imports section (after the `./itemTemplate` import):

```typescript
import {
  DEFAULTS_FILENAME,
  loadMergedDefaults,
  mergeDefaultsIntoTemplate,
  readDefaultsFile,
  validateDefaults,
} from "./itemDefaults";
```

Add the scope helpers and handlers (place them just above `handleItemCreate`):

```typescript
// "site" maps to content/items/_defaults.json; any other scope is a category
// slug mapping to content/items/<category>/_defaults.json. The slug allowlist
// plus the containment assertion mirror resolveItemDir — same two layers, same
// reason: browser input never reaches a path unchecked.
function resolveDefaultsPath(projectRoot: string, scope: string): string {
  const itemsRoot = path.join(projectRoot, "content", "items");
  if (scope === "site") return path.join(itemsRoot, DEFAULTS_FILENAME);
  if (!isValidSlug(scope)) {
    throw new StudioError(
      400,
      `scope must be "site" or a kebab-case category slug: got "${scope}"`,
    );
  }
  const dir = path.resolve(itemsRoot, scope);
  const rel = path.relative(itemsRoot, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new StudioError(400, "resolved path escapes content/items");
  }
  return path.join(dir, DEFAULTS_FILENAME);
}

function readScopeParam(req: StudioRequest): string {
  const url = new URL(req.url, "http://studio.local");
  const scope = url.searchParams.get("scope");
  if (scope === null || scope === "") {
    throw new StudioError(400, "the defaults routes need ?scope=site or ?scope=<category>");
  }
  return scope;
}

async function handleDefaultsGet(req: StudioRequest): Promise<StudioResponse> {
  const filePath = resolveDefaultsPath(req.projectRoot, readScopeParam(req));
  const defaults = await readDefaultsFile(filePath);
  // Validate on read too: a hand-broken file surfaces in the pane with the
  // field named, instead of loading garbage the seller then saves back.
  try {
    validateDefaults(defaults);
  } catch (err: unknown) {
    throw new StudioError(400, `invalid defaults in ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { status: 200, body: defaults };
}

async function handleDefaultsPut(req: StudioRequest): Promise<StudioResponse> {
  const filePath = resolveDefaultsPath(req.projectRoot, readScopeParam(req));
  const defaults = parseJsonBody(req.body, z.record(z.unknown()));
  try {
    validateDefaults(defaults);
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }

  if (Object.keys(defaults).length === 0) {
    // An empty save deletes the file: no file means "no defaults", and an
    // empty {} shell in content/ would only read as a forgotten cleanup.
    await fsPromises.rm(filePath, { force: true });
    return { status: 200, body: defaults };
  }

  // recursive also creates a category folder that does not exist yet — the
  // same behaviour item create has, so a defaults-first workflow is not a
  // dead end on a fresh site.
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(defaults, null, 2) + "\n", "utf-8");
  return { status: 200, body: defaults };
}
```

Extend `createItemBodySchema`:

```typescript
const createItemBodySchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  applyDefaults: z.boolean().optional(),
});
```

In `handleItemCreate`, destructure the new field and apply the merge after `buildItemTemplate`:

```typescript
  const { category, name, applyDefaults } = parseJsonBody(req.body, createItemBodySchema);
```

Replace the block from `const template = buildItemTemplate(...)` through the `writeFile` call so the written content is the merged template:

```typescript
  const today = new Date().toISOString().slice(0, 10);
  const displayName = name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const template = buildItemTemplate(
    displayName,
    today,
    siteConfig.measurementUnit,
    siteConfig.defaultPriceTiers,
  );

  // Defaults are opt-out rather than opt-in: the point of the feature is that
  // a fresh listing starts pre-filled. A broken defaults file fails the create
  // loudly (400 naming file and field) instead of silently building a bare
  // template — the seller would otherwise wonder where their defaults went.
  const filled =
    applyDefaults === false
      ? template
      : mergeDefaultsIntoTemplate(
          template,
          await loadMergedDefaults(path.join(req.projectRoot, "content", "items"), category).catch(
            (err: unknown) => {
              throw new StudioError(400, err instanceof Error ? err.message : String(err));
            },
          ),
        );

  // "wx" rather than a plain write: two create requests for the same slug can
  // interleave between the access() check above and here, and the loser must
  // not silently flatten the winner's file.
  try {
    await fsPromises.writeFile(jsonPath, renderItemTemplateJsonc(filled), { flag: "wx" });
  } catch (err: unknown) {
```

Add the route in `handleStudioRequest`, right after the `/api/items/bulk-status` block:

```typescript
    if (pathname === "/api/defaults") {
      if (req.method === "GET") return await handleDefaultsGet(req);
      if (req.method === "PUT") return await handleDefaultsPut(req);
      return { status: 405, body: { error: "GET or PUT only" } };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test scripts/lib/studioApi.test.ts`
Expected: PASS (new and pre-existing tests).

- [ ] **Step 5: Full suite, type-check, lint**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: studio API for item defaults, applied on item create

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `pnpm create-item` applies the same defaults

**Files:**
- Modify: `scripts/create-item.ts` (import block near line 10; template creation around lines 74-82)

**Interfaces:**
- Consumes: `loadMergedDefaults(itemsRoot, category)`, `mergeDefaultsIntoTemplate(template, defaults)` from `./lib/itemDefaults` (Task 1).
- Produces: CLI behaviour change only — no new exports.

- [ ] **Step 1: Make the change**

Add the import (next to the existing `./lib/itemTemplate` import):

```typescript
import { loadMergedDefaults, mergeDefaultsIntoTemplate } from "./lib/itemDefaults";
```

Replace the template-creation and write section so it merges defaults first:

```typescript
  const today = new Date().toISOString().slice(0, 10);
  const displayName = itemName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const template = buildItemTemplate(displayName, today, siteConfig.measurementUnit, siteConfig.defaultPriceTiers);

  // Same two-tier defaults studio applies (content/items/_defaults.json plus
  // the category's own), so the CLI and the browser produce identical files.
  // A broken defaults file stops the create with the file and field named —
  // better than scaffolding a bare template the seller thinks got defaults.
  let filled = template;
  try {
    const defaults = await loadMergedDefaults(path.join(process.cwd(), "content", "items"), category);
    filled = mergeDefaultsIntoTemplate(template, defaults);
  } catch (err: unknown) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const jsonPath = path.join(itemDir, "item.json");
  await fs.writeFile(jsonPath, renderItemTemplateJsonc(filled));
```

- [ ] **Step 2: Verify automatically**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean (the merge itself is covered by Task 1's tests; the CLI wiring is verified manually next).

- [ ] **Step 3: Verify manually against the real repo, then clean up**

```bash
echo '{"contact_note": "defaults check"}' > content/items/electronics/_defaults.json
pnpm create-item electronics/zz-defaults-check
grep '"contact_note"' content/items/electronics/zz-defaults-check/item.json
```

Expected: the grep prints `"contact_note": "defaults check"`, and `"name": "Zz Defaults Check"` / `"status": "draft"` are present in the same file. Then remove the test artefacts:

```bash
rm -rf content/items/electronics/zz-defaults-check
rm content/items/electronics/_defaults.json
git status --short content/   # must show no changes
```

- [ ] **Step 4: Commit**

```bash
git add scripts/create-item.ts
git commit -m "feat: create-item applies the two-tier item defaults

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Extract `FieldInput` from `EditForm`

Refactor only — no behaviour change. `EditForm.tsx` is 422 lines; the Defaults pane (Task 5) needs the same per-field input rendering, so the kind-switch and the `toInput`/`fromInput` helpers move into a shared module.

**Files:**
- Create: `studio/src/panes/FieldInput.tsx`
- Modify: `studio/src/panes/EditForm.tsx` (drop `toInput`/`fromInput` definitions at lines 13-49; replace the inline label rendering in the field map around lines 356-406)

**Interfaces:**
- Consumes: `FieldDescriptor` type from `../fields`.
- Produces: `export function toInput(value: unknown, kind: FieldDescriptor["kind"]): string`, `export function fromInput(raw: string, kind: FieldDescriptor["kind"]): { value: unknown } | { error: string }`, `export function FieldInput({ field, value, onChange, disabled }: { field: FieldDescriptor; value: string; onChange: (next: string) => void; disabled?: boolean })`.

- [ ] **Step 1: Create `studio/src/panes/FieldInput.tsx`**

```tsx
import type { FieldDescriptor } from "../fields";

/** The on-disk value rendered as the string an input holds. */
export function toInput(value: unknown, kind: FieldDescriptor["kind"]): string {
  if (value === undefined || value === null) return "";
  if (kind === "stringList") return Array.isArray(value) ? value.join("\n") : String(value);
  if (kind === "boolean") return value === true ? "true" : "false";
  return String(value);
}

/**
 * The input string turned back into the JSON value the API will receive.
 * Returns { error } rather than throwing so one bad field reports itself
 * without discarding the seller's other edits.
 */
export function fromInput(
  raw: string,
  kind: FieldDescriptor["kind"],
): { value: unknown } | { error: string } {
  const trimmed = raw.trim();
  switch (kind) {
    case "boolean":
      return { value: raw === "true" };
    case "stringList":
      return { value: raw.split("\n").map((l) => l.trim()).filter((l) => l !== "") };
    case "number":
    case "integer": {
      // Empty means "not set", which item.json spells as null.
      if (trimmed === "") return { value: null };
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { error: "must be a number" };
      if (kind === "integer" && !Number.isInteger(n)) return { error: "must be a whole number" };
      return { value: n };
    }
    case "date":
      return { value: trimmed === "" ? null : trimmed };
    default:
      return { value: raw };
  }
}

// Shared by EditForm and DefaultsPane: one field's label + input, rendered by
// kind. `disabled` dims and locks the inputs — DefaultsPane uses it for
// fields whose enable switch is off.
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDescriptor;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span className="field-label">{field.label}</span>
      {field.kind === "textarea" ? (
        <textarea rows={3} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === "boolean" ? (
        <input
          type="checkbox"
          checked={value === "true"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        />
      ) : field.kind === "select" ? (
        <select
          value={value}
          disabled={disabled}
          className={
            value !== "" && field.options !== undefined && !field.options.includes(value)
              ? "field-offlist"
              : undefined
          }
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {value !== "" && field.options !== undefined && !field.options.includes(value) && (
            <option value={value}>{value}</option>
          )}
        </select>
      ) : field.kind === "stringList" ? (
        <textarea rows={2} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type={field.kind === "date" ? "date" : "text"}
          inputMode={field.kind === "number" || field.kind === "integer" ? "decimal" : undefined}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint !== undefined && <span className="field-hint">{field.hint}</span>}
    </label>
  );
}
```

- [ ] **Step 2: Rewire `EditForm.tsx`**

Delete the local `toInput` and `fromInput` functions (the block from `/** The on-disk value rendered…` through the end of `fromInput`, lines 12-49) and import them instead. Change the imports at the top to:

```typescript
import {
  FIELD_GROUPS,
  pathKey,
  readAtPath,
  WHOLE_OBJECT_GROUPS,
  WHOLE_OBJECT_SEEDS,
} from "../fields";
import { FieldInput, fromInput, toInput } from "./FieldInput";
```

(Drop `type FieldDescriptor` from the `../fields` import — it is no longer referenced in EditForm after this change.)

Replace the field map body inside the `FIELD_GROUPS.map((group) => …)` render (the part that builds one `<label className="field">` per field) with:

```tsx
          {group.fields.map((field) => {
            const key = pathKey(field.path);
            const value = draft[key] ?? "";
            const set = (next: string) => setDraft((prev) => ({ ...prev, [key]: next }));
            return <FieldInput key={key} field={field} value={value} onChange={set} />;
          })}
```

- [ ] **Step 3: Verify the refactor**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean. (No component tests exist for the studio SPA; equivalence is the identical rendering code plus type-check. Confirm visually in Task 7's manual pass that the edit form still behaves as before.)

- [ ] **Step 4: Commit**

```bash
git add studio/src/panes/FieldInput.tsx studio/src/panes/EditForm.tsx
git commit -m "refactor: extract FieldInput from the studio edit form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Client API + `DefaultsPane` + header button

**Files:**
- Modify: `studio/src/api.ts` (add two functions; change `createItem` signature around line 155)
- Create: `studio/src/panes/DefaultsPane.tsx`
- Modify: `studio/src/App.tsx` (import, state, header button, render)
- Modify: `studio/src/tokens.css` (append pane styles)

**Interfaces:**
- Consumes: `GET/PUT /api/defaults?scope=...` and the `applyDefaults` body field from Task 2; `FieldInput`, `toInput`, `fromInput` from Task 4; `FIELD_GROUPS`, `pathKey`, `readAtPath`, `FieldGroup` from `../fields`.
- Produces: `export async function fetchDefaults(scope: string): Promise<Record<string, unknown>>`, `export async function saveDefaults(scope: string, defaults: Record<string, unknown>): Promise<void>`, `createItem(category, name, applyDefaults)`, `export function DefaultsPane({ categories, onClose, onSaved })`.

- [ ] **Step 1: Client API functions**

In `studio/src/api.ts`, change `createItem` to:

```typescript
// Default parameter (not a required one): NewItemDialog only starts passing
// the flag in Task 6, and the call sites must type-check at every step.
export async function createItem(
  category: string,
  name: string,
  applyDefaults: boolean = true,
): Promise<string> {
  const res = await fetch("/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category, name, applyDefaults }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `create failed with ${res.status} ${res.statusText}`));
  }
  return (body?.id as string | undefined) ?? `${category}/${name}`;
}
```

Add the defaults functions (next to the other fetchers):

```typescript
export async function fetchDefaults(scope: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/defaults?scope=${encodeURIComponent(scope)}`);
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `loading ${scope} defaults failed with ${res.status} ${res.statusText}`));
  }
  return body ?? {};
}

export async function saveDefaults(scope: string, defaults: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/defaults?scope=${encodeURIComponent(scope)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(defaults),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `saving ${scope} defaults failed with ${res.status} ${res.statusText}`));
  }
}
```

- [ ] **Step 2: Create `studio/src/panes/DefaultsPane.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { fetchDefaults, saveDefaults } from "../api";
import { FIELD_GROUPS, pathKey, readAtPath, type FieldGroup } from "../fields";
import { FieldInput, fromInput, toInput } from "./FieldInput";

// name/status/listed_date/sold_date belong to each item, never to a template;
// the server rejects them too (scripts/lib/itemDefaults.ts). This set only
// keeps the panel from offering them.
const NEVER_DEFAULTABLE = new Set(["name", "status", "listed_date", "sold_date"]);

// The groups sellers retype most (price structure and the transaction fields)
// lead; everything else stays collapsed until opened.
const PINNED_GROUPS = new Set(["Price", "Platform"]);

const DEFAULTABLE_GROUPS: FieldGroup[] = FIELD_GROUPS.map((group) => ({
  ...group,
  fields: group.fields.filter((f) => {
    const head = f.path[0];
    return typeof head === "string" && !NEVER_DEFAULTABLE.has(head);
  }),
})).filter((group) => group.fields.length > 0);

const SORTED_GROUPS: FieldGroup[] = [
  ...DEFAULTABLE_GROUPS.filter((g) => PINNED_GROUPS.has(g.title)),
  ...DEFAULTABLE_GROUPS.filter((g) => !PINNED_GROUPS.has(g.title)),
];

type FieldState = { enabled: boolean; raw: string };

// Writes a leaf value into a sparse defaults object, creating the nested
// object for price/dimensions/weight paths on the way down. Defaults stay
// sparse: only enabled fields ever reach this function.
function writeAtPath(
  target: Record<string, unknown>,
  fieldPath: readonly (string | number)[],
  value: unknown,
): void {
  let cursor = target;
  for (let i = 0; i < fieldPath.length - 1; i++) {
    const segment = fieldPath[i];
    if (typeof segment !== "string") return;
    const next = cursor[segment];
    if (typeof next === "object" && next !== null && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      cursor[segment] = created;
      cursor = created;
    }
  }
  const last = fieldPath[fieldPath.length - 1];
  if (typeof last === "string") cursor[last] = value;
}

function formatInherited(value: unknown): string {
  const text = Array.isArray(value)
    ? value.join(", ")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function DefaultsPane({
  categories,
  onClose,
  onSaved,
}: {
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState("site");
  const [siteDefaults, setSiteDefaults] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, FieldState>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextScope: string) => {
    setLoaded(false);
    setError(null);
    setSaved(false);
    const current = await fetchDefaults(nextScope);
    setSiteDefaults(nextScope === "site" ? current : await fetchDefaults("site"));
    const nextDraft: Record<string, FieldState> = {};
    for (const group of SORTED_GROUPS) {
      for (const field of group.fields) {
        const value = readAtPath(current, field.path);
        nextDraft[pathKey(field.path)] = { enabled: value !== undefined, raw: toInput(value, field.kind) };
      }
    }
    setDraft(nextDraft);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load(scope).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [scope, load]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const out: Record<string, unknown> = {};
    const problems: string[] = [];
    for (const group of SORTED_GROUPS) {
      for (const field of group.fields) {
        const state = draft[pathKey(field.path)];
        if (state === undefined || !state.enabled) continue;
        // An enabled select with no choice would send "" and 400 server-side;
        // say so by the field's own name instead.
        if (field.kind === "select" && state.raw === "") {
          problems.push(`${field.label}: pick a value or switch the field off`);
          continue;
        }
        const parsed = fromInput(state.raw, field.kind);
        if ("error" in parsed) {
          problems.push(`${field.label}: ${parsed.error}`);
          continue;
        }
        writeAtPath(out, field.path, parsed.value);
      }
    }
    if (problems.length > 0) {
      setError(problems.join("; "));
      setBusy(false);
      return;
    }
    try {
      await saveDefaults(scope, out);
      setSaved(true);
      onSaved();
      // Re-read from disk after the write, same rule as EditForm.
      await load(scope);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog defaults-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Item defaults"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Item defaults</h2>
        <p className="field-hint">
          New items start with these values. Category defaults override site-wide ones; name,
          status and dates always start fresh.
        </p>
        {error !== null && <p role="alert">{error}</p>}
        {saved && <p className="form-saved">Saved.</p>}

        <div className="defaults-scopes" role="tablist" aria-label="Defaults scope">
          {["site", ...categories].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? "tab tab-active" : "tab"}
              onClick={() => setScope(s)}
            >
              {s === "site" ? "Site-wide" : s}
            </button>
          ))}
        </div>

        {!loaded && error === null && <p>Loading…</p>}
        {loaded && (
          <form
            className="edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {SORTED_GROUPS.map((group) => {
              const fields = group.fields.map((field) => {
                const key = pathKey(field.path);
                const state = draft[key] ?? { enabled: false, raw: "" };
                const inherited =
                  scope !== "site" && !state.enabled ? readAtPath(siteDefaults, field.path) : undefined;
                return (
                  <div key={key} className={state.enabled ? "defaults-row" : "defaults-row defaults-row-off"}>
                    <input
                      type="checkbox"
                      className="defaults-enable"
                      checked={state.enabled}
                      aria-label={`Set a default for ${field.label}`}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, [key]: { ...prev[key], enabled: e.target.checked } }));
                        setSaved(false);
                      }}
                    />
                    <FieldInput
                      field={field}
                      value={state.raw}
                      disabled={!state.enabled}
                      onChange={(raw) => {
                        setDraft((prev) => ({ ...prev, [key]: { ...prev[key], raw } }));
                        setSaved(false);
                      }}
                    />
                    {inherited !== undefined && (
                      <span className="field-hint defaults-inherited">site: {formatInherited(inherited)}</span>
                    )}
                  </div>
                );
              });
              return PINNED_GROUPS.has(group.title) ? (
                <fieldset key={group.title}>
                  <legend>{group.title}</legend>
                  {fields}
                </fieldset>
              ) : (
                <details key={group.title}>
                  <summary>{group.title}</summary>
                  <fieldset>{fields}</fieldset>
                </details>
              );
            })}
            <div className="dialog-actions">
              <button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save defaults"}
              </button>
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the pane into `App.tsx`**

Add the import next to the other pane imports:

```typescript
import { DefaultsPane } from "./panes/DefaultsPane";
```

Add the state next to `showNewItem`:

```typescript
  const [showDefaults, setShowDefaults] = useState(false);
```

Add the header button right before the existing "New item" button:

```tsx
        <button type="button" onClick={() => setShowDefaults(true)}>
          Defaults
        </button>
```

Render the pane after the `showNewItem` block at the bottom of the component:

```tsx
      {showDefaults && (
        <DefaultsPane
          categories={[...new Set(items.map((i) => i.categorySlug))].sort()}
          onClose={() => setShowDefaults(false)}
          onSaved={bumpChanges}
        />
      )}
```

- [ ] **Step 4: Append the pane styles to `studio/src/tokens.css`**

```css
/* The defaults pane reuses the new-item dialog's sheet, wider and scrollable:
   it can list every defaultable field. Rows pair an enable switch with the
   shared FieldInput; disabled rows dim rather than disappear, so sellers can
   see what a switch will bring back. */

.defaults-dialog {
  width: min(46rem, calc(100vw - 2rem));
  max-height: 80vh;
  overflow-y: auto;
}

.defaults-scopes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
  margin: 0.75rem 0;
}

.defaults-row {
  display: flex;
  align-items: flex-start;
  gap: var(--gap);
}

.defaults-row .field {
  flex: 1;
}

.defaults-row-off {
  opacity: 0.55;
}

.defaults-inherited {
  opacity: 0.7;
}
```

- [ ] **Step 5: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add studio/src/api.ts studio/src/panes/DefaultsPane.tsx studio/src/App.tsx studio/src/tokens.css
git commit -m "feat: studio defaults pane with two-tier scope management

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: "Apply defaults" toggle in the new-item dialog

**Files:**
- Modify: `studio/src/panes/NewItemDialog.tsx`

**Interfaces:**
- Consumes: `createItem(category, name, applyDefaults)` from Task 5's `api.ts` change.
- Produces: dialog passes the seller's choice through; defaults to applying.

- [ ] **Step 1: Add the toggle**

Add the state next to the existing `useState` calls:

```typescript
  const [applyDefaults, setApplyDefaults] = useState(true);
```

Change the create call to pass it:

```typescript
      onCreated(await createItem(cat, slug, applyDefaults));
```

Insert this field between the item-name field and `dialog-actions`:

```tsx
            <label className="field">
              <span className="field-label">
                <input
                  type="checkbox"
                  checked={applyDefaults}
                  onChange={(e) => setApplyDefaults(e.target.checked)}
                />{" "}
                Apply defaults
              </span>
              <span className="field-hint">
                Uses your site and category defaults (manage them under Defaults). Switch off for
                a blank template.
              </span>
            </label>
```

- [ ] **Step 2: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add studio/src/panes/NewItemDialog.tsx
git commit -m "feat: apply-defaults toggle in the studio new-item dialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification (automated + manual studio pass)

**Files:** none modified unless a fix is needed (fixes get their own commit with a `fix:` message).

- [ ] **Step 1: Automated gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean.

- [ ] **Step 2: Manual studio walkthrough**

Run `pnpm studio` and open the printed URL. Walk this exact list:

1. Header shows a Defaults button next to New item.
2. Defaults opens the pane; Site-wide scope active; every group listed (Price and Platform first, others collapsed under their `<summary>`).
3. Enable Contact note = `WeChat: test`, enable No lowball, enable Price → Negotiable. Save. `Saved.` appears; `content/items/_defaults.json` exists on disk with exactly those three fields.
4. Switch to a category scope (e.g. `electronics`). The three site values show as `site: …` hints. Enable Contact note = `electronics only`. Save. The category file exists; the site file is unchanged.
5. Back in Site-wide: disable No lowball, save. The file on disk lost the key. Disable the remaining two fields, save: the file is deleted.
6. New item → create `electronics/zz-pane-check` with Apply defaults ON (re-add a site default first if you deleted it in step 5). The drawer opens with the edit form pre-filled (contact_note shows the category value). 
7. New item → create `electronics/zz-pane-blank` with Apply defaults OFF. contact_note is empty in its edit form.
8. Header uncommitted count increased after each save; the publish pane lists the new/changed `_defaults.json` and item folders under its changed files.
9. Edit form of an existing item still loads, edits, and saves exactly as before (Task 4 regression check).

- [ ] **Step 3: Clean up manual artefacts**

```bash
rm -rf content/items/electronics/zz-pane-check content/items/electronics/zz-pane-blank
rm -f content/items/_defaults.json content/items/electronics/_defaults.json
git status --short content/   # must show no changes
```

- [ ] **Step 4: No commit needed** (verification only; if any fix was required, it was committed under its own task's conventions).

---

### Task 8: Documentation (bilingual, one commit)

Every edit below ships in both the English file and its `_zh` counterpart in the same commit (Iron Rule 2). Find each insertion point in the `_zh` file by matching the section described — the headings are parallel translations.

**Files:**
- Modify: `docs/DESIGN.md` + `docs/DESIGN_zh.md`
- Modify: `docs/CURRENT_FUNCTIONALITY.md` + `docs/CURRENT_FUNCTIONALITY_zh.md`
- Modify: `docs/ARCHITECTURE.md` + `docs/ARCHITECTURE_zh.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md` + `docs/IMPLEMENTATION_PLAN_zh.md`
- Modify: `docs/SCRIPTS.md` + `docs/SCRIPTS_zh.md`

- [ ] **Step 1: DESIGN.md §22 — Seller Studio subsection**

In the `### Seller Studio (`pnpm studio`, Phase 18)` bullet list, add a bullet after the item-creation bullet:

```markdown
- Item defaults live in sparse `_defaults.json` files — `content/items/_defaults.json`
  site-wide, `content/items/<category>/_defaults.json` per category — managed in the Defaults
  pane and merged over the scaffold on item creation: template ← site ← category, with
  `name`/`listed_date`/`status` re-applied last. `pnpm create-item` applies the same merge
  (`scripts/lib/itemDefaults.ts`); `reserved_for` and the per-item fields are rejected.
```

Chinese mirror (`DESIGN_zh.md` 对应小节):

```markdown
- 商品默认值存放在稀疏的 `_defaults.json` 文件中：全站级为 `content/items/_defaults.json`，
  分类级为 `content/items/<category>/_defaults.json`，在 Defaults 面板中管理，建 item 时按
  "模板 ← 全站 ← 分类" 叠加，最后强制重新写入 `name`/`listed_date`/`status`。
  `pnpm create-item` 走同一套合并逻辑（`scripts/lib/itemDefaults.ts`）；
  `reserved_for` 和逐 item 字段会被拒绝写入。
```

- [ ] **Step 2: CURRENT_FUNCTIONALITY.md — Studio section**

Change the line `Five operations, all from one page:` to `Six operations, all from one page:` and add a row to the operations table (after the Create row):

```markdown
| Defaults | Manage site-wide and per-category default field values (sparse `_defaults.json` under `content/items/`); new items merge them over the template, with an opt-out checkbox in the new-item dialog |
```

Chinese mirror: 将 "五项操作" 的说法改为六项，并在表格中加入：

```markdown
| 默认值 | 管理全站级和分类级的默认字段值（`content/items/` 下的稀疏 `_defaults.json`）；新建商品时按模板叠加默认值，新建弹窗可勾选关闭 |
```

- [ ] **Step 3: ARCHITECTURE.md — `scripts/lib/` module table**

Add a row (keep rough alphabetical grouping with its neighbours, next to the `itemEdit.ts` / `itemFields.ts` rows):

```markdown
| `itemDefaults.ts` | Two-tier sparse `_defaults.json`: parse/validate/merge (`loadMergedDefaults`, `mergeDefaultsIntoTemplate`); shared by the studio defaults routes and `create-item`; `reserved_for` and per-item fields rejected |
```

Update the paragraph above the table: `9 of the 13 modules` → `10 of the 14 modules` (itemDefaults adds one module with a colocated test).

Chinese mirror: 对应表格行：

```markdown
| `itemDefaults.ts` | 两级稀疏 `_defaults.json`：解析/校验/合并（`loadMergedDefaults`、`mergeDefaultsIntoTemplate`）；studio 默认值路由与 `create-item` 共用；拒绝 `reserved_for` 和逐 item 字段 |
```

并把 "13 个模块中的 9 个" 更新为 "14 个模块中的 10 个"。

- [ ] **Step 4: SCRIPTS.md — create-item entry**

In the scripts table, change the `pnpm create-item` row description from `Scaffold a 36-field draft `item.json`` to:

```markdown
Scaffold a 36-field draft `item.json`, applying site/category `_defaults.json` first
```

In the `### create-item.ts — item scaffolder` detail section, add a bullet:

```markdown
- Applies the two-tier defaults (`content/items/_defaults.json` + the category's own) via
  `scripts/lib/itemDefaults.ts` before writing; a broken defaults file aborts with the file and
  field named.
```

Chinese mirror: 表格描述改为 "先应用全站/分类 `_defaults.json`，再生成 36 字段的草稿 `item.json`"；细节小节加一条：

```markdown
- 写文件前通过 `scripts/lib/itemDefaults.ts` 应用两级默认值（`content/items/_defaults.json`
  加该分类自己的）；默认值文件损坏时报错中止，并指出文件和字段。
```

- [ ] **Step 5: IMPLEMENTATION_PLAN.md — Phase 19 (all checked)**

Append after the Phase 18 section:

```markdown
## Phase 19 — Seller Studio Item Defaults ✅

- [x] `scripts/lib/itemDefaults.ts`: parse/validate/merge for two-tier sparse `_defaults.json`
      (site + category); `reserved_for` and per-item fields rejected; merged over
      `buildItemTemplate()` with `name`/`listed_date`/`status` re-applied last
- [x] Studio API: `GET/PUT /api/defaults?scope=…` (empty save deletes the file; PUT creates
      missing category folders); `POST /api/items` gains `applyDefaults` (default true)
- [x] `pnpm create-item` applies the same merge
- [x] Studio UI: Defaults pane (scope tabs, per-field enable switches, Price/Platform pinned,
      site-inheritance hints), FieldInput extraction from EditForm, Apply-defaults toggle in the
      new-item dialog
- [x] Docs sync (DESIGN, CURRENT_FUNCTIONALITY, ARCHITECTURE, SCRIPTS, this plan) — both languages
```

Chinese mirror（`IMPLEMENTATION_PLAN_zh.md` 的 Phase 18 之后）:

```markdown
## Phase 19 — Seller Studio 商品默认值 ✅

- [x] `scripts/lib/itemDefaults.ts`：两级稀疏 `_defaults.json`（全站 + 分类）的解析/校验/合并；
      拒绝 `reserved_for` 与逐 item 字段；在 `buildItemTemplate()` 之上合并，
      最后重新写入 `name`/`listed_date`/`status`
- [x] Studio API：`GET/PUT /api/defaults?scope=…`（保存为空即删除文件；PUT 自动创建缺失的分类目录）；
      `POST /api/items` 新增 `applyDefaults`（默认 true）
- [x] `pnpm create-item` 应用同一套合并
- [x] Studio 界面：Defaults 面板（作用域切换、逐字段启用开关、Price/Platform 置顶、全站继承提示）、
      从 EditForm 抽出 FieldInput、新建弹窗的"应用默认值"开关
- [x] 文档同步（DESIGN、CURRENT_FUNCTIONALITY、ARCHITECTURE、SCRIPTS、本计划），中英双语
```

- [ ] **Step 6: Commit**

```bash
git add docs/DESIGN.md docs/DESIGN_zh.md docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md \
        docs/ARCHITECTURE.md docs/ARCHITECTURE_zh.md docs/IMPLEMENTATION_PLAN.md docs/IMPLEMENTATION_PLAN_zh.md \
        docs/SCRIPTS.md docs/SCRIPTS_zh.md
git commit -m "docs: two-tier item defaults (Phase 19) in all five doc pairs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes (done at plan-writing time)

- Spec coverage: storage format and merge semantics → Task 1; API endpoints, empty-save deletion, auto-mkdir, broken-file errors → Task 2; CLI parity → Task 3; pane, group pinning, inheritance hints, FieldInput extraction → Tasks 4-5; new-item toggle → Task 6; test list from the spec → Tasks 1-2; bilingual docs → Task 8. No spec section left without a task.
- Type consistency checked across tasks: `DefaultsObject`, `DEFAULTS_FILENAME`, `loadMergedDefaults(itemsRoot, category)`, `mergeDefaultsIntoTemplate(template, defaults)`, `fetchDefaults(scope)`, `saveDefaults(scope, defaults)`, `createItem(category, name, applyDefaults = true)`, `FieldInput({ field, value, onChange, disabled })` are spelled identically everywhere they appear. `createItem`'s new parameter is defaulted so every intermediate task type-checks before Task 6 updates the dialog.
- Verification ordering: Task 8 (docs, including the checked-off Phase 19) runs after Task 7's full verification, so the plan only claims completion once verified.
