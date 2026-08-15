# Studio Categories + Contact QR Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Seller Studio full read/write coverage of `_category.json` metadata, category creation, and `content/contact/*.png` QR image upload/replace/delete — the three `content/` surfaces it currently can't touch.

**Architecture:** Two new pure filesystem modules (`scripts/lib/studioCategories.ts`, `scripts/lib/studioContact.ts`) mirror the existing `studioImages.ts`/`itemDefaults.ts` split — no HTTP, no StudioError, just directory-in/data-out functions. Five new routes are added to `scripts/lib/studioApi.ts`'s existing dispatch chain. Three client panes get new/extended UI: a new `CategoriesPane`, a mode toggle in `NewItemDialog`, and an inline upload control in `ConfigPane`.

**Tech Stack:** TypeScript, Zod (request validation), Vitest (+ `@testing-library/react` for components), React (Studio SPA), no new dependencies.

## Global Constraints

- Every write stays inside `content/` (Iron Rule 1) — `content/items/<slug>/_category.json` and `content/contact/*.png` only.
- Every mutating route relies on the existing global CSRF guard (`studio/csrfGuard.ts`) — no per-route CSRF code needed, but every fetch call must send `Content-Type: application/json`.
- No new `content/config.ts` field is introduced (Iron Rule 8 checklist not triggered) — `Platform.qr_image` already exists and is already optional.
- `_category.json` writes are sparse: a field is omitted when it equals `categoryJsonSchema`'s default (`""` for strings, `null` for `sort_order`); an all-default write deletes the file, mirroring `handleDefaultsPut`.
- QR uploads accept PNG only, verified by both extension and magic bytes (`sniffImageType(bytes) === "png"`).
- Every new UI string is added to both `studio/src/i18n/strings.en.ts` and `studio/src/i18n/strings.zh.ts` in the same task that introduces it.
- Any English doc touched must be mirrored to its `_zh` counterpart in the same pass (Iron Rule 2).

---

### Task 1: `studioCategories.ts` — pure filesystem module for `_category.json`

**Files:**
- Modify: `lib/content/loader.ts:23` (export the existing `readJsonc`)
- Create: `scripts/lib/studioCategories.ts`
- Test: `scripts/lib/studioCategories.test.ts`

**Interfaces:**
- Consumes: `categoryJsonSchema`, `ParsedCategoryJson` from `lib/content/schema.ts`; `readJsonc` from `lib/content/loader.ts`; `isValidSlug` from `lib/utils/slug.ts`.
- Produces: `export type CategoryMetaInput = { display_name?: string; description?: string; icon?: string; sort_order?: number | null }`, `listCategorySlugs(itemsRoot: string): Promise<string[]>`, `readCategoryMeta(dir: string): Promise<ParsedCategoryJson>`, `sparsifyCategoryMeta(meta: CategoryMetaInput): Record<string, unknown>`, `writeCategoryMeta(dir: string, meta: CategoryMetaInput): Promise<void>`, `countCategoryItems(categoryDir: string): Promise<number>` — all consumed by Task 3.

**Design note (caught in plan self-review):** `listStudioItems` elsewhere in `studioApi.ts` gets its item data from `loadAllItemsRaw()`, which resolves `content/` from `process.cwd()` — not from the `projectRoot` parameter threaded through every other function in this file (an existing, documented quirk: harmless today because `pnpm studio` always runs from the repo root, so the two are always equal in practice, but it means `loadAllItemsRaw()` cannot be used for anything that must respect a sandboxed `projectRoot`, including this plan's own tests). `countCategoryItems` below counts items with a direct, `projectRoot`-respecting directory read instead, so category item counts are correct under test sandboxes and would stay correct even if that cwd/projectRoot quirk elsewhere is ever fixed.

- [ ] **Step 1: Export `readJsonc` from `lib/content/loader.ts`**

In `lib/content/loader.ts:23`, change:
```ts
function readJsonc(text: string): unknown {
```
to:
```ts
export function readJsonc(text: string): unknown {
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/lib/studioCategories.test.ts`:
```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  countCategoryItems,
  listCategorySlugs,
  readCategoryMeta,
  sparsifyCategoryMeta,
  writeCategoryMeta,
} from "./studioCategories";

let itemsRoot: string;

beforeEach(async () => {
  itemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studio-categories-"));
});

afterEach(async () => {
  await fs.rm(itemsRoot, { recursive: true, force: true });
});

describe("listCategorySlugs", () => {
  it("returns an empty array when the directory doesn't exist", async () => {
    expect(await listCategorySlugs(path.join(itemsRoot, "missing"))).toEqual([]);
  });

  it("lists only valid-slug directories, sorted", async () => {
    await fs.mkdir(path.join(itemsRoot, "electronics"));
    await fs.mkdir(path.join(itemsRoot, "books"));
    await fs.mkdir(path.join(itemsRoot, "_template"));
    await fs.writeFile(path.join(itemsRoot, "_defaults.json"), "{}");
    expect(await listCategorySlugs(itemsRoot)).toEqual(["books", "electronics"]);
  });
});

describe("readCategoryMeta", () => {
  it("returns all-default metadata when _category.json is absent", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    expect(await readCategoryMeta(dir)).toEqual({
      display_name: "",
      description: "",
      icon: "",
      sort_order: null,
    });
  });

  it("returns all-default metadata when _category.json fails to parse", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "_category.json"), "not json at all {{{");
    expect(await readCategoryMeta(dir)).toEqual({
      display_name: "",
      description: "",
      icon: "",
      sort_order: null,
    });
  });

  it("reads a sparse _category.json, JSONC comments included", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "_category.json"),
      '{\n  // seller comment\n  "icon": "📱",\n  "sort_order": 2,\n}\n',
    );
    expect(await readCategoryMeta(dir)).toEqual({
      display_name: "",
      description: "",
      icon: "📱",
      sort_order: 2,
    });
  });
});

describe("countCategoryItems", () => {
  it("returns 0 for a category with no subfolders", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    expect(await countCategoryItems(dir)).toBe(0);
  });

  it("counts only subfolders containing item.json", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(path.join(dir, "phone"), { recursive: true });
    await fs.writeFile(path.join(dir, "phone", "item.json"), "{}");
    await fs.mkdir(path.join(dir, "empty-folder"), { recursive: true });
    expect(await countCategoryItems(dir)).toBe(1);
  });
});

describe("sparsifyCategoryMeta", () => {
  it("drops fields equal to their default", () => {
    expect(
      sparsifyCategoryMeta({ display_name: "", description: "", icon: "", sort_order: null }),
    ).toEqual({});
  });

  it("keeps only the fields that differ from default", () => {
    expect(
      sparsifyCategoryMeta({ display_name: "Electronics", description: "", icon: "📱", sort_order: null }),
    ).toEqual({ display_name: "Electronics", icon: "📱" });
  });
});

describe("writeCategoryMeta", () => {
  it("writes a sparse file for non-default metadata", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await writeCategoryMeta(dir, { display_name: "Electronics", sort_order: 1 });
    const written = JSON.parse(await fs.readFile(path.join(dir, "_category.json"), "utf-8"));
    expect(written).toEqual({ display_name: "Electronics", sort_order: 1 });
  });

  it("deletes an existing file when the new metadata is all-default", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await writeCategoryMeta(dir, { display_name: "Electronics" });
    await writeCategoryMeta(dir, {});
    await expect(fs.access(path.join(dir, "_category.json"))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/studioCategories.test.ts`
Expected: FAIL — `Cannot find module './studioCategories'`

Note: this file now has 10 test cases (the 2 `countCategoryItems` cases from Step 2 above are included in the file alongside the others already shown).

- [ ] **Step 4: Implement `scripts/lib/studioCategories.ts`**

```ts
// Pure filesystem operations on content/items/<slug>/_category.json. No HTTP,
// no StudioError — studioApi.ts owns status codes and path containment
// (resolveCategoryDir), the same split studioImages.ts and itemDefaults.ts
// use for item photos and item-field defaults.

import fsPromises from "fs/promises";
import path from "path";
import { categoryJsonSchema, type ParsedCategoryJson } from "../../lib/content/schema";
import { readJsonc } from "../../lib/content/loader";
import { isValidSlug } from "../../lib/utils/slug";

export type CategoryMetaInput = {
  display_name?: string;
  description?: string;
  icon?: string;
  sort_order?: number | null;
};

const CATEGORY_JSON_FILENAME = "_category.json";

/** Every content/items/ subdirectory whose name is itself a valid slug — this
 * naturally excludes _defaults.json, _template.json, and any `_`-prefixed
 * folder, since isValidSlug requires an alphanumeric first character. */
export async function listCategorySlugs(itemsRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await fsPromises.readdir(itemsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && isValidSlug(e.name))
    .map((e) => e.name)
    .sort();
}

/** Counts subfolders that contain an item.json, ignoring any stray directory
 * that doesn't (e.g. a manually-created scratch folder). A direct, isolated
 * directory read — not loadAllItemsRaw() — so this always respects the
 * `dir` it's given rather than silently reading content/ from
 * process.cwd() (see the Task 1 design note above). */
export async function countCategoryItems(categoryDir: string): Promise<number> {
  let entries;
  try {
    entries = await fsPromises.readdir(categoryDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidSlug(entry.name)) continue;
    try {
      await fsPromises.access(path.join(categoryDir, entry.name, "item.json"));
      count++;
    } catch {
      // Not an item folder — skip.
    }
  }
  return count;
}

/** Falls back to all-default metadata on a missing or malformed file — the
 * same fallback lib/content/loader.ts's buildCategoriesFromItems already
 * applies, so Studio's read of a category never disagrees with the site
 * build's. */
export async function readCategoryMeta(dir: string): Promise<ParsedCategoryJson> {
  try {
    const raw = readJsonc(await fsPromises.readFile(path.join(dir, CATEGORY_JSON_FILENAME), "utf-8"));
    const parsed = categoryJsonSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  } catch {
    // No _category.json, or it doesn't parse — defaults stand.
  }
  return categoryJsonSchema.parse({});
}

/** Drops any field equal to categoryJsonSchema's default, matching how
 * _defaults.json stays sparse: only what the seller explicitly set appears
 * on disk. */
export function sparsifyCategoryMeta(meta: CategoryMetaInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (meta.display_name !== undefined && meta.display_name !== "") out.display_name = meta.display_name;
  if (meta.description !== undefined && meta.description !== "") out.description = meta.description;
  if (meta.icon !== undefined && meta.icon !== "") out.icon = meta.icon;
  if (meta.sort_order !== undefined && meta.sort_order !== null) out.sort_order = meta.sort_order;
  return out;
}

/** An all-default write deletes the file — "no _category.json" already means
 * "no metadata", so an empty file would be a second, redundant way to say
 * the same thing. Mirrors handleDefaultsPut's identical rule for
 * _defaults.json. */
export async function writeCategoryMeta(dir: string, meta: CategoryMetaInput): Promise<void> {
  const sparse = sparsifyCategoryMeta(meta);
  const filePath = path.join(dir, CATEGORY_JSON_FILENAME);
  if (Object.keys(sparse).length === 0) {
    await fsPromises.rm(filePath, { force: true });
    return;
  }
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(sparse, null, 2) + "\n", "utf-8");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/studioCategories.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 6: Run the full lib test suite to confirm the `loader.ts` export didn't break anything**

Run: `npx vitest run lib/content scripts/lib`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/content/loader.ts scripts/lib/studioCategories.ts scripts/lib/studioCategories.test.ts
git commit -m "feat(studio): add studioCategories.ts for _category.json read/write"
```

---

### Task 2: `studioContact.ts` — pure filesystem module for `content/contact/`

**Files:**
- Create: `scripts/lib/studioContact.ts`
- Test: `scripts/lib/studioContact.test.ts`

**Interfaces:**
- Consumes: nothing project-specific (plain `fs/promises`, `path`).
- Produces: `CONTACT_IMAGE_FILENAME_RE`, `isValidContactImageFilename(name: string): boolean`, `resolveContactDir(projectRoot: string): string`, `deleteContactImage(dir: string, filename: string): Promise<boolean>` — consumed by Task 4. Task 4 also reuses `sanitizeUploadFilename`, `sniffImageType`, `writeImage`, `contentTypeFor` directly from `scripts/lib/studioImages.ts` (unchanged).

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/studioContact.test.ts`:
```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  deleteContactImage,
  isValidContactImageFilename,
  resolveContactDir,
} from "./studioContact";

describe("isValidContactImageFilename", () => {
  it("accepts a lowercase-first .png name", () => {
    expect(isValidContactImageFilename("wechat-qr.png")).toBe(true);
    expect(isValidContactImageFilename("qr1.PNG")).toBe(true);
  });

  it("rejects non-png extensions", () => {
    expect(isValidContactImageFilename("wechat-qr.jpg")).toBe(false);
    expect(isValidContactImageFilename("wechat-qr")).toBe(false);
  });

  it("rejects traversal and a leading dot", () => {
    expect(isValidContactImageFilename("../secret.png")).toBe(false);
    expect(isValidContactImageFilename(".hidden.png")).toBe(false);
  });
});

describe("resolveContactDir", () => {
  it("resolves to content/contact under the project root", () => {
    expect(resolveContactDir("/tmp/project")).toBe(path.join("/tmp/project", "content", "contact"));
  });
});

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-contact-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("deleteContactImage", () => {
  it("removes an existing file and returns true", async () => {
    await fs.writeFile(path.join(dir, "wechat-qr.png"), "x");
    expect(await deleteContactImage(dir, "wechat-qr.png")).toBe(true);
    await expect(fs.access(path.join(dir, "wechat-qr.png"))).rejects.toThrow();
  });

  it("returns false for a file that doesn't exist", async () => {
    expect(await deleteContactImage(dir, "missing.png")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/studioContact.test.ts`
Expected: FAIL — `Cannot find module './studioContact'`

- [ ] **Step 3: Implement `scripts/lib/studioContact.ts`**

```ts
// Pure filesystem operations on content/contact/. No HTTP, no StudioError —
// studioApi.ts owns status codes. Upload reuses studioImages.ts's
// sanitizeUploadFilename/sniffImageType/writeImage directly: they already
// take a plain `dir` argument and carry no item-specific coupling, so QR
// images need no second copy of that logic, only a stricter (PNG-only)
// filename gate.

import fsPromises from "fs/promises";
import path from "path";

export const CONTACT_IMAGE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.png$/i;

export function isValidContactImageFilename(name: string): boolean {
  return CONTACT_IMAGE_FILENAME_RE.test(name);
}

export function resolveContactDir(projectRoot: string): string {
  return path.join(projectRoot, "content", "contact");
}

/** Returns false rather than throwing when the file is already gone, so the
 * route layer can turn that into a 404 without a try/catch of its own. */
export async function deleteContactImage(dir: string, filename: string): Promise<boolean> {
  try {
    await fsPromises.rm(path.join(dir, filename));
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/studioContact.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/studioContact.ts scripts/lib/studioContact.test.ts
git commit -m "feat(studio): add studioContact.ts for content/contact/ image writes"
```

---

### Task 3: Wire `/api/categories` routes into `studioApi.ts`

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `listCategorySlugs`, `readCategoryMeta`, `writeCategoryMeta`, `CategoryMetaInput` from `./studioCategories` (Task 1); existing `StudioError`, `isValidSlug`, `loadAllItemsRaw`, `parseJsonBody`, `z`.
- Produces: `export type CategorySummary = { slug: string; displayName: string; description: string; icon: string; sortOrder: number | null; itemCount: number }` — consumed by Task 5's client `api.ts`. Routes: `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/:slug`.

- [ ] **Step 1: Write the failing route tests**

Add to `scripts/lib/studioApi.test.ts` (new `describe` blocks, following the existing `POST /api/items` suite's `mkdtemp`/`tempProjects` pattern already in the file):
```ts
describe("GET /api/categories", () => {
  let tempProjects: string[] = [];
  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });
  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-categories-get-"));
    await fs.mkdir(path.join(root, "content", "items"), { recursive: true });
    tempProjects.push(root);
    return root;
  }

  it("returns [] when there are no category folders", async () => {
    const root = await emptyProject();
    const res = asJson(
      await handleStudioRequest({ method: "GET", url: "/api/categories", body: Buffer.alloc(0), projectRoot: root }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [] });
  });

  it("lists a folder-only category with default metadata and zero items", async () => {
    const root = await emptyProject();
    await fs.mkdir(path.join(root, "content", "items", "electronics"));
    const res = asJson(
      await handleStudioRequest({ method: "GET", url: "/api/categories", body: Buffer.alloc(0), projectRoot: root }),
    );
    expect(res.body).toEqual({
      categories: [
        { slug: "electronics", displayName: "", description: "", icon: "", sortOrder: null, itemCount: 0 },
      ],
    });
  });

  it("counts only subfolders that contain an item.json", async () => {
    const root = await emptyProject();
    const catDir = path.join(root, "content", "items", "electronics");
    await fs.mkdir(path.join(catDir, "phone"), { recursive: true });
    await fs.writeFile(path.join(catDir, "phone", "item.json"), "{}");
    await fs.mkdir(path.join(catDir, "laptop"), { recursive: true });
    await fs.writeFile(path.join(catDir, "laptop", "item.json"), "{}");
    // A stray directory with no item.json must not inflate the count.
    await fs.mkdir(path.join(catDir, "drafts-scratch"), { recursive: true });
    const res = asJson(
      await handleStudioRequest({ method: "GET", url: "/api/categories", body: Buffer.alloc(0), projectRoot: root }),
    );
    expect((res.body as { categories: Array<{ itemCount: number }> }).categories[0]?.itemCount).toBe(2);
  });
});

describe("POST /api/categories", () => {
  let tempProjects: string[] = [];
  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });
  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-categories-post-"));
    await fs.mkdir(path.join(root, "content", "items"), { recursive: true });
    tempProjects.push(root);
    return root;
  }
  function create(root: string, body: unknown) {
    return handleStudioRequest({
      method: "POST",
      url: "/api/categories",
      body: Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  it("creates an empty folder when no meta is given", async () => {
    const root = await emptyProject();
    const res = asJson(await create(root, { slug: "electronics" }));
    expect(res.status).toBe(201);
    const stat = await fs.stat(path.join(root, "content", "items", "electronics"));
    expect(stat.isDirectory()).toBe(true);
    await expect(
      fs.access(path.join(root, "content", "items", "electronics", "_category.json")),
    ).rejects.toThrow();
  });

  it("creates the folder and a sparse _category.json when meta is given", async () => {
    const root = await emptyProject();
    await create(root, { slug: "electronics", meta: { display_name: "Electronics", sort_order: 1 } });
    const written = JSON.parse(
      await fs.readFile(path.join(root, "content", "items", "electronics", "_category.json"), "utf-8"),
    );
    expect(written).toEqual({ display_name: "Electronics", sort_order: 1 });
  });

  it("409s rather than overwriting an existing category", async () => {
    const root = await emptyProject();
    await fs.mkdir(path.join(root, "content", "items", "electronics"));
    const res = asJson(await create(root, { slug: "electronics" }));
    expect(res.status).toBe(409);
  });

  it("400s on a non-kebab-case slug", async () => {
    const root = await emptyProject();
    const res = asJson(await create(root, { slug: "Not Kebab" }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/categories/:slug", () => {
  let tempProjects: string[] = [];
  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });
  async function projectWithCategory(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-categories-put-"));
    await fs.mkdir(path.join(root, "content", "items", "electronics"), { recursive: true });
    tempProjects.push(root);
    return root;
  }
  function put(root: string, slug: string, body: unknown) {
    return handleStudioRequest({
      method: "PUT",
      url: `/api/categories/${slug}`,
      body: Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  it("writes sparse metadata for an existing category", async () => {
    const root = await projectWithCategory();
    const res = asJson(await put(root, "electronics", { display_name: "Electronics", icon: "📱" }));
    expect(res.status).toBe(200);
    const written = JSON.parse(
      await fs.readFile(path.join(root, "content", "items", "electronics", "_category.json"), "utf-8"),
    );
    expect(written).toEqual({ display_name: "Electronics", icon: "📱" });
  });

  it("deletes _category.json when saved back to all-default", async () => {
    const root = await projectWithCategory();
    await put(root, "electronics", { display_name: "Electronics" });
    await put(root, "electronics", {});
    await expect(
      fs.access(path.join(root, "content", "items", "electronics", "_category.json")),
    ).rejects.toThrow();
  });

  it("404s for a category that doesn't exist", async () => {
    const root = await projectWithCategory();
    const res = asJson(await put(root, "nonexistent", { display_name: "Ghost" }));
    expect(res.status).toBe(404);
  });

  it("400s for a non-integer sort_order", async () => {
    const root = await projectWithCategory();
    const res = asJson(await put(root, "electronics", { sort_order: 1.5 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/studioApi.test.ts -t "categories"`
Expected: FAIL — 404 "no route for /api/categories" on every case

- [ ] **Step 3: Add the import and route handlers to `scripts/lib/studioApi.ts`**

In the import block (after the existing `import { ... } from "./studioImages";` block, around `studioApi.ts:65`), add:
```ts
import {
  countCategoryItems,
  listCategorySlugs,
  readCategoryMeta,
  writeCategoryMeta,
  type CategoryMetaInput,
} from "./studioCategories";
```

Directly below `resolveItemDir` (`studioApi.ts:133-148`), add the category-only path resolver, following the exact same two-layer pattern:
```ts
function resolveCategoryDir(projectRoot: string, slug: string): string {
  if (!isValidSlug(slug)) {
    throw new StudioError(
      400,
      `category must be kebab-case (lowercase letters, digits, hyphens): got "${slug}"`,
    );
  }
  const itemsRoot = path.join(projectRoot, "content", "items");
  const dir = path.resolve(itemsRoot, slug);
  const rel = path.relative(itemsRoot, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new StudioError(400, "resolved path escapes content/items");
  }
  return dir;
}
```

Below `listStudioItems` (after `studioApi.ts:227`), add the summary type and listing function:
```ts
export type CategorySummary = {
  slug: string;
  displayName: string;
  description: string;
  icon: string;
  sortOrder: number | null;
  itemCount: number;
};

async function listCategorySummaries(projectRoot: string): Promise<CategorySummary[]> {
  const itemsRoot = path.join(projectRoot, "content", "items");
  const slugs = await listCategorySlugs(itemsRoot);

  // Deliberately NOT loadAllItemsRaw(): that function resolves content/ from
  // process.cwd(), not from projectRoot (see listStudioItems's own comment
  // above), which would silently ignore a sandboxed projectRoot in tests
  // (and, in principle, anywhere cwd and projectRoot ever diverged).
  // countCategoryItems reads the given directory directly instead.
  return Promise.all(
    slugs.map(async (slug) => {
      const dir = path.join(itemsRoot, slug);
      const [meta, itemCount] = await Promise.all([readCategoryMeta(dir), countCategoryItems(dir)]);
      return {
        slug,
        displayName: meta.display_name,
        description: meta.description,
        icon: meta.icon,
        sortOrder: meta.sort_order,
        itemCount,
      } satisfies CategorySummary;
    }),
  );
}

const categoryMetaInputSchema = z.object({
  display_name: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  sort_order: z.number().int().nullable().optional(),
});

const createCategoryBodySchema = z.object({
  slug: z.string().min(1),
  meta: categoryMetaInputSchema.optional(),
});

async function handleCategoryCreate(req: StudioRequest): Promise<StudioResponse> {
  const { slug, meta } = parseJsonBody(req.body, createCategoryBodySchema);
  const dir = resolveCategoryDir(req.projectRoot, slug);

  await fsPromises.mkdir(path.dirname(dir), { recursive: true });
  try {
    // Non-recursive mkdir fails with EEXIST if the category already exists,
    // making the existence check and the creation one atomic step — the
    // same reason handleItemCreate writes item.json with the "wx" flag.
    await fsPromises.mkdir(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new StudioError(409, `category "${slug}" already exists`);
    }
    throw err;
  }

  if (meta !== undefined) {
    await writeCategoryMeta(dir, meta as CategoryMetaInput);
  }

  return { status: 201, body: { slug } };
}

async function handleCategoryMetaPut(req: StudioRequest, slug: string): Promise<StudioResponse> {
  const meta = parseJsonBody(req.body, categoryMetaInputSchema);
  const dir = resolveCategoryDir(req.projectRoot, slug);

  try {
    await fsPromises.access(dir);
  } catch {
    throw new StudioError(404, `category "${slug}" does not exist`);
  }

  await writeCategoryMeta(dir, meta as CategoryMetaInput);
  const updated = await readCategoryMeta(dir);
  return {
    status: 200,
    body: {
      slug,
      displayName: updated.display_name,
      description: updated.description,
      icon: updated.icon,
      sortOrder: updated.sort_order,
    },
  };
}
```

Add the route regex near `IMAGE_ROUTE_RE`/`ITEM_ROUTE_RE` (search for `const ITEM_ROUTE_RE`):
```ts
const CATEGORY_ROUTE_RE = /^\/api\/categories\/([^/]+)$/;
```

Wire the routes into `handleStudioRequest` (`studioApi.ts:1120-1288`), inserting right after the existing `/api/config` block and before `/api/readiness`:
```ts
    if (pathname === "/api/categories") {
      if (req.method === "GET") {
        return { status: 200, body: { categories: await listCategorySummaries(req.projectRoot) } };
      }
      if (req.method === "POST") {
        return await handleCategoryCreate(req);
      }
      return { status: 405, body: { error: "GET or POST only" } };
    }

    const categoryMatch = CATEGORY_ROUTE_RE.exec(pathname);
    if (categoryMatch !== null) {
      const [, slugRaw] = categoryMatch;
      if (slugRaw === undefined) {
        return { status: 400, body: { error: "malformed category route" } };
      }
      let slug: string;
      try {
        slug = decodeURIComponent(slugRaw);
      } catch {
        return { status: 400, body: { error: "malformed URL encoding" } };
      }
      if (req.method === "PUT") return await handleCategoryMetaPut(req, slug);
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/studioApi.test.ts -t "categories"`
Expected: PASS (all 10 new cases)

- [ ] **Step 5: Run the full server test suite**

Run: `npx vitest run scripts/lib`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat(studio): add GET/POST /api/categories and PUT /api/categories/:slug"
```

---

### Task 4: Wire `/api/contact/images` routes into `studioApi.ts`

**Files:**
- Modify: `scripts/lib/studioApi.ts`
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `isValidContactImageFilename`, `resolveContactDir`, `deleteContactImage` from `./studioContact` (Task 2); `sanitizeUploadFilename`, `sniffImageType`, `writeImage`, `contentTypeFor` from `./studioImages` (already imported in `studioApi.ts`).
- Produces: routes `POST /api/contact/images`, `GET /api/contact/images/:filename`, `DELETE /api/contact/images/:filename`. Response shape for upload: `{ file: string; path: string }` where `path` is the `/contact/<file>` public-site path — consumed by Task 5's client `api.ts`.

- [ ] **Step 1: Write the failing route tests**

Add to `scripts/lib/studioApi.test.ts`:
```ts
describe("POST /api/contact/images", () => {
  let tempProjects: string[] = [];
  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });
  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-contact-post-"));
    await fs.mkdir(path.join(root, "content", "contact"), { recursive: true });
    tempProjects.push(root);
    return root;
  }
  // Real PNG header bytes, base64-encoded — a sniffer that passes on
  // fabricated input proves nothing.
  const PNG_BASE64 = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
  const JPG_BASE64 = Buffer.from("ffd8ffe000104a4649460001", "hex").toString("base64");
  function upload(root: string, body: unknown) {
    return handleStudioRequest({
      method: "POST",
      url: "/api/contact/images",
      body: Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  it("writes a real PNG into content/contact/", async () => {
    const root = await emptyProject();
    const res = asJson(await upload(root, { filename: "wechat-qr.png", contentBase64: PNG_BASE64 }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ file: "wechat-qr.png", path: "/contact/wechat-qr.png" });
    await expect(fs.access(path.join(root, "content", "contact", "wechat-qr.png"))).resolves.toBeUndefined();
  });

  it("rejects a .png-named file whose bytes aren't a real PNG", async () => {
    const root = await emptyProject();
    const res = asJson(await upload(root, { filename: "fake.png", contentBase64: JPG_BASE64 }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-png extension outright", async () => {
    const root = await emptyProject();
    const res = asJson(await upload(root, { filename: "wechat-qr.jpg", contentBase64: PNG_BASE64 }));
    expect(res.status).toBe(400);
  });

  it("appends a -1 suffix on a filename collision", async () => {
    const root = await emptyProject();
    await upload(root, { filename: "qr.png", contentBase64: PNG_BASE64 });
    const res = asJson(await upload(root, { filename: "qr.png", contentBase64: PNG_BASE64 }));
    expect(res.body).toEqual({ file: "qr-1.png", path: "/contact/qr-1.png" });
  });
});

describe("GET/DELETE /api/contact/images/:filename", () => {
  let tempProjects: string[] = [];
  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });
  async function projectWithImage(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-contact-del-"));
    await fs.mkdir(path.join(root, "content", "contact"), { recursive: true });
    await fs.writeFile(path.join(root, "content", "contact", "qr.png"), "x");
    tempProjects.push(root);
    return root;
  }

  it("GETs an existing file with the right content type", async () => {
    const root = await projectWithImage();
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/contact/images/qr.png",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(isFileResponse(res)).toBe(true);
  });

  it("removes an existing file", async () => {
    const root = await projectWithImage();
    const res = asJson(
      await handleStudioRequest({
        method: "DELETE",
        url: "/api/contact/images/qr.png",
        body: Buffer.alloc(0),
        projectRoot: root,
      }),
    );
    expect(res.status).toBe(200);
    await expect(fs.access(path.join(root, "content", "contact", "qr.png"))).rejects.toThrow();
  });

  it("404s deleting a file that doesn't exist", async () => {
    const root = await projectWithImage();
    const res = asJson(
      await handleStudioRequest({
        method: "DELETE",
        url: "/api/contact/images/missing.png",
        body: Buffer.alloc(0),
        projectRoot: root,
      }),
    );
    expect(res.status).toBe(404);
  });
});
```

Confirm `isFileResponse` is already imported at the top of `scripts/lib/studioApi.test.ts` (it is — used by the existing item-image `GET` tests); if not already imported, add it to the existing `import { ... } from "./studioApi";` line.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/lib/studioApi.test.ts -t "contact"`
Expected: FAIL — 404 "no route for /api/contact/images" on every case

- [ ] **Step 3: Add the import and route handlers to `scripts/lib/studioApi.ts`**

In the import block, add:
```ts
import {
  deleteContactImage,
  isValidContactImageFilename,
  resolveContactDir,
} from "./studioContact";
```

Below `handleCategoryMetaPut` (added in Task 3), add:
```ts
const contactUploadBodySchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
});

async function handleContactImageUpload(req: StudioRequest): Promise<StudioResponse> {
  const { filename, contentBase64 } = parseJsonBody(req.body, contactUploadBodySchema);
  const sanitized = sanitizeUploadFilename(filename);
  if (!isValidContactImageFilename(sanitized)) {
    throw new StudioError(400, `"${filename}" must be a .png file`);
  }

  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length === 0) throw new StudioError(400, "uploaded file is empty");

  // The extension is whatever the browser sent; the header bytes are what
  // decide, exactly like item photo uploads.
  if (sniffImageType(bytes) !== "png") {
    throw new StudioError(400, `"${filename}" is not a valid PNG`);
  }

  const dir = resolveContactDir(req.projectRoot);
  const written = await writeImage(dir, sanitized, bytes);
  return { status: 201, body: { file: written, path: `/contact/${written}` } };
}

async function handleContactImageGet(req: StudioRequest, filename: string): Promise<StudioResponse> {
  if (!isValidContactImageFilename(filename)) {
    throw new StudioError(400, `not a contact image filename: "${filename}"`);
  }
  const dir = resolveContactDir(req.projectRoot);
  const filePath = path.join(dir, filename);
  const rel = path.relative(dir, filePath);
  if (rel !== filename || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new StudioError(400, "resolved path escapes content/contact");
  }
  try {
    await fsPromises.access(filePath);
  } catch {
    throw new StudioError(404, `no such contact image: ${filename}`);
  }
  return { status: 200, file: filePath, contentType: contentTypeFor(filename) };
}

async function handleContactImageDelete(req: StudioRequest, filename: string): Promise<StudioResponse> {
  if (!isValidContactImageFilename(filename)) {
    throw new StudioError(400, `not a contact image filename: "${filename}"`);
  }
  const dir = resolveContactDir(req.projectRoot);
  const deleted = await deleteContactImage(dir, filename);
  if (!deleted) throw new StudioError(404, `${filename} not found in content/contact`);
  return { status: 200, body: { ok: true } };
}
```

Add the route regex next to `CATEGORY_ROUTE_RE`:
```ts
const CONTACT_IMAGE_ROUTE_RE = /^\/api\/contact\/images\/([^/]+)$/;
```

Wire the routes into `handleStudioRequest`, right after the `itemMatch` block and before `/api/sync-images`:
```ts
    if (pathname === "/api/contact/images") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handleContactImageUpload(req);
    }

    const contactImageMatch = CONTACT_IMAGE_ROUTE_RE.exec(pathname);
    if (contactImageMatch !== null) {
      const [, filenameRaw] = contactImageMatch;
      if (filenameRaw === undefined) {
        return { status: 400, body: { error: "malformed contact image route" } };
      }
      let filename: string;
      try {
        filename = decodeURIComponent(filenameRaw);
      } catch {
        return { status: 400, body: { error: "malformed URL encoding" } };
      }
      if (req.method === "GET") return await handleContactImageGet(req, filename);
      if (req.method === "DELETE") return await handleContactImageDelete(req, filename);
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/lib/studioApi.test.ts -t "contact"`
Expected: PASS (all 7 new cases)

- [ ] **Step 5: Run the full server test suite**

Run: `npx vitest run scripts/lib`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat(studio): add contact QR image upload/get/delete routes"
```

---

### Task 5: Client `api.ts` wrappers

**Files:**
- Modify: `studio/src/api.ts`
- Modify: `studio/src/api.test.ts`

**Interfaces:**
- Consumes: `CategorySummary` (type-only, from `../../scripts/lib/studioApi`, Task 3); `CategoryMetaInput` (type-only, from `../../scripts/lib/studioCategories`, Task 1); existing `readJsonBody`, `errorMessage`, `fileToBase64` helpers already in `api.ts`.
- Produces: `fetchCategories(): Promise<CategorySummary[]>`, `createCategory(slug: string, meta?: CategoryMetaInput): Promise<string>`, `saveCategoryMeta(slug: string, meta: CategoryMetaInput): Promise<void>`, `uploadContactImage(file: File): Promise<{ file: string; path: string }>`, `deleteContactImage(filename: string): Promise<void>` — consumed by Tasks 7, 8, 9. Also re-exports `CategorySummary` and `CategoryMetaInput` as types.

- [ ] **Step 1: Write the failing tests**

Add to `studio/src/api.test.ts` (find the existing pattern used for `createItem`/`fetchDefaults` — stub `global.fetch` per test, assert the request shape and the parsed response):
```ts
describe("fetchCategories", () => {
  it("returns the parsed category list", async () => {
    const categories = [
      { slug: "electronics", displayName: "Electronics", description: "", icon: "", sortOrder: null, itemCount: 2 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ categories }), { status: 200 })),
    );
    expect(await fetchCategories()).toEqual(categories);
  });

  it("throws on an unreadable response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(fetchCategories()).rejects.toThrow(/unreadable/);
  });
});

describe("createCategory", () => {
  it("POSTs the slug and meta, returns the created slug", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ slug: "electronics" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createCategory("electronics", { display_name: "Electronics" });
    expect(result).toBe("electronics");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ slug: "electronics", meta: { display_name: "Electronics" } });
  });
});

describe("saveCategoryMeta", () => {
  it("PUTs to /api/categories/:slug", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveCategoryMeta("electronics", { icon: "📱" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/categories/electronics");
    expect(init.method).toBe("PUT");
  });
});

describe("uploadContactImage", () => {
  it("POSTs the file as base64 and returns file+path", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ file: "qr.png", path: "/contact/qr.png" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["hello"], "qr.png", { type: "image/png" });
    const result = await uploadContactImage(file);
    expect(result).toEqual({ file: "qr.png", path: "/contact/qr.png" });
  });
});

describe("deleteContactImage", () => {
  it("DELETEs /api/contact/images/:filename", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await deleteContactImage("qr.png");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/contact/images/qr.png");
    expect(init.method).toBe("DELETE");
  });
});
```

Add the corresponding imports at the top of `studio/src/api.test.ts` next to the existing ones (find the `import { createItem, ... } from "./api";` line and extend it with `fetchCategories, createCategory, saveCategoryMeta, uploadContactImage, deleteContactImage`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run studio/src/api.test.ts`
Expected: FAIL — the new exports don't exist yet

- [ ] **Step 3: Implement the wrappers in `studio/src/api.ts`**

In the type-only import block at the top of `studio/src/api.ts`, extend:
```ts
import type { ConfigField, ConfigFieldKind } from "../../scripts/lib/configEdit";
```
to also pull in the new server types:
```ts
import type { CategoryMetaInput } from "../../scripts/lib/studioCategories";
import type {
  ReadinessAction,
  ReadinessItem,
  ReadinessReport,
} from "../../scripts/lib/siteReadiness";
import type { BulkStatusResult, BulkTiersResult, CategorySummary, ImageEntry, StudioItem } from "../../scripts/lib/studioApi";

export type { BulkStatusResult, BulkTiersResult, CategoryMetaInput, CategorySummary, ConfigField, ConfigFieldKind, ImageEntry, ReadinessAction, ReadinessItem, ReadinessReport, StudioItem };
```
(This replaces the existing `import type { BulkStatusResult, ... } from "../../scripts/lib/studioApi";` line and the `export type { ... }` line right below it — add `CategorySummary` to both, and add the new `CategoryMetaInput` import/export.)

Directly below `createItem` (`studio/src/api.ts:196-210`), add:
```ts
export async function fetchCategories(): Promise<CategorySummary[]> {
  const res = await fetch("/api/categories");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `GET /api/categories failed with ${res.status} ${res.statusText}`));
  }
  if (!Array.isArray(body?.categories)) {
    throw new Error(`GET /api/categories returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return body.categories as CategorySummary[];
}

export async function createCategory(slug: string, meta?: CategoryMetaInput): Promise<string> {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, meta }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `create category failed with ${res.status} ${res.statusText}`));
  }
  return (body?.slug as string | undefined) ?? slug;
}

export async function saveCategoryMeta(slug: string, meta: CategoryMetaInput): Promise<void> {
  const res = await fetch(`/api/categories/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `saving category "${slug}" failed with ${res.status} ${res.statusText}`));
  }
}

export async function uploadContactImage(file: File): Promise<{ file: string; path: string }> {
  const contentBase64 = await fileToBase64(file);
  const res = await fetch("/api/contact/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentBase64 }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `uploading QR image failed with ${res.status} ${res.statusText}`));
  }
  return { file: body?.file as string, path: body?.path as string };
}

export async function deleteContactImage(filename: string): Promise<void> {
  const res = await fetch(`/api/contact/images/${encodeURIComponent(filename)}`, { method: "DELETE" });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `deleting QR image failed with ${res.status} ${res.statusText}`));
  }
}
```

Note: `fileToBase64` is declared further down the file (`studio/src/api.ts:152-164`) but is already used the same way, above its declaration, by `uploadImage` — function declarations hoist, so no reordering is needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run studio/src/api.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add studio/src/api.ts studio/src/api.test.ts
git commit -m "feat(studio): add client api.ts wrappers for categories and contact images"
```

---

### Task 6: `CategoryMetaFields.tsx` shared form component

**Files:**
- Create: `studio/src/components/CategoryMetaFields.tsx`
- Test: `studio/src/components/CategoryMetaFields.test.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`

**Interfaces:**
- Consumes: `useStudioT` from `../i18n/StudioI18n`; `StudioKey` from `../i18n/types`; `CategoryMetaInput` (type-only, re-exported from `../api`).
- Produces: `export type CategoryMetaDraft = { displayName: string; description: string; icon: string; sortOrder: string }`, `EMPTY_CATEGORY_META_DRAFT: CategoryMetaDraft`, `draftToMetaInput(draft: CategoryMetaDraft): CategoryMetaInput | { error: StudioKey }`, `CategoryMetaFields` component — all consumed by Tasks 7 and 8.

- [ ] **Step 1: Add the i18n keys**

In `studio/src/i18n/strings.en.ts`, add (near the other field-group keys, e.g. after the `newItem.*` block):
```ts
  "categoryMeta.icon": "Icon",
  "categoryMeta.iconHint": "An emoji shown next to the category name, e.g. 📱.",
  "categoryMeta.displayName": "Display name",
  "categoryMeta.displayNameHint": "Shown instead of the folder name. Leave blank to use the slug.",
  "categoryMeta.description": "Description",
  "categoryMeta.sortOrder": "Sort order",
  "categoryMeta.sortOrderHint": "Lower numbers sort first. Leave blank to sort alphabetically after ordered categories.",
  "categoryMeta.sortOrderError": "Sort order must be a whole number.",
```

In `studio/src/i18n/strings.zh.ts`, add the matching keys:
```ts
  "categoryMeta.icon": "图标",
  "categoryMeta.iconHint": "显示在分类名称旁的表情符号，例如 📱。",
  "categoryMeta.displayName": "显示名称",
  "categoryMeta.displayNameHint": "代替文件夹名称显示。留空则使用 slug。",
  "categoryMeta.description": "描述",
  "categoryMeta.sortOrder": "排序",
  "categoryMeta.sortOrderHint": "数字越小越靠前。留空则按字母排序，排在有序分类之后。",
  "categoryMeta.sortOrderError": "排序必须是整数。",
```

- [ ] **Step 2: Write the failing test**

Create `studio/src/components/CategoryMetaFields.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { CategoryMetaFields, draftToMetaInput, EMPTY_CATEGORY_META_DRAFT } from "./CategoryMetaFields";

describe("CategoryMetaFields", () => {
  it("renders all four fields with their current values", () => {
    const { getByLabelText } = renderWithStudioI18n(
      <CategoryMetaFields
        value={{ displayName: "Electronics", description: "Gadgets", icon: "📱", sortOrder: "1" }}
        onChange={vi.fn()}
        busy={false}
      />,
    );
    expect(getByLabelText("Display name")).toHaveValue("Electronics");
    expect(getByLabelText("Icon")).toHaveValue("📱");
    expect(getByLabelText("Sort order")).toHaveValue("1");
  });

  it("calls onChange when a field is edited", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText } = renderWithStudioI18n(
      <CategoryMetaFields value={EMPTY_CATEGORY_META_DRAFT} onChange={onChange} busy={false} />,
    );
    await user.type(getByLabelText("Icon"), "📱");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("draftToMetaInput", () => {
  it("maps an empty draft to all-default meta", () => {
    expect(draftToMetaInput(EMPTY_CATEGORY_META_DRAFT)).toEqual({
      display_name: "",
      description: "",
      icon: "",
      sort_order: null,
    });
  });

  it("parses a numeric sort order", () => {
    const result = draftToMetaInput({ ...EMPTY_CATEGORY_META_DRAFT, sortOrder: "3" });
    expect(result).toEqual({ display_name: "", description: "", icon: "", sort_order: 3 });
  });

  it("errors on a non-integer sort order", () => {
    const result = draftToMetaInput({ ...EMPTY_CATEGORY_META_DRAFT, sortOrder: "1.5" });
    expect(result).toEqual({ error: "categoryMeta.sortOrderError" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run studio/src/components/CategoryMetaFields.test.tsx`
Expected: FAIL — `Cannot find module './CategoryMetaFields'`

- [ ] **Step 4: Implement `studio/src/components/CategoryMetaFields.tsx`**

```tsx
import type { CategoryMetaInput } from "../api";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

export type CategoryMetaDraft = {
  displayName: string;
  description: string;
  icon: string;
  sortOrder: string;
};

export const EMPTY_CATEGORY_META_DRAFT: CategoryMetaDraft = {
  displayName: "",
  description: "",
  icon: "",
  sortOrder: "",
};

/** Converts the form's string draft into the server's typed input, or an
 * i18n error key if the sort order isn't a whole number — mirrors the
 * `{value} | {error: StudioKey}` shape ConfigPane's fromInput already uses,
 * so one bad field reports itself without the caller needing a second
 * validation pass. */
export function draftToMetaInput(draft: CategoryMetaDraft): CategoryMetaInput | { error: StudioKey } {
  const trimmed = draft.sortOrder.trim();
  let sortOrder: number | null = null;
  if (trimmed !== "") {
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return { error: "categoryMeta.sortOrderError" };
    sortOrder = n;
  }
  return {
    display_name: draft.displayName,
    description: draft.description,
    icon: draft.icon,
    sort_order: sortOrder,
  };
}

export function CategoryMetaFields({
  value,
  onChange,
  busy,
}: {
  value: CategoryMetaDraft;
  onChange: (next: CategoryMetaDraft) => void;
  busy: boolean;
}) {
  const { t } = useStudioT();
  return (
    <div className="category-meta-fields">
      <label className="field">
        <span className="field-label">{t("categoryMeta.icon")}</span>
        <input
          type="text"
          value={value.icon}
          disabled={busy}
          maxLength={8}
          onChange={(e) => onChange({ ...value, icon: e.target.value })}
        />
        <span className="field-hint">{t("categoryMeta.iconHint")}</span>
      </label>
      <label className="field">
        <span className="field-label">{t("categoryMeta.displayName")}</span>
        <input
          type="text"
          value={value.displayName}
          disabled={busy}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
        />
        <span className="field-hint">{t("categoryMeta.displayNameHint")}</span>
      </label>
      <label className="field">
        <span className="field-label">{t("categoryMeta.description")}</span>
        <textarea
          value={value.description}
          disabled={busy}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">{t("categoryMeta.sortOrder")}</span>
        <input
          type="text"
          inputMode="numeric"
          value={value.sortOrder}
          disabled={busy}
          onChange={(e) => onChange({ ...value, sortOrder: e.target.value })}
        />
        <span className="field-hint">{t("categoryMeta.sortOrderHint")}</span>
      </label>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run studio/src/components/CategoryMetaFields.test.tsx`
Expected: PASS (all 5 cases)

- [ ] **Step 6: Add minimal styling**

In `studio/src/tokens.css`, after the `.config-row:last-child { border-bottom: 0; }` rule (around line 1398), add:
```css
/* ── Category metadata fields (shared by CategoriesPane + NewItemDialog) ── */

.category-meta-fields {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  margin-top: var(--gap);
}
```

- [ ] **Step 7: Commit**

```bash
git add studio/src/components/CategoryMetaFields.tsx studio/src/components/CategoryMetaFields.test.tsx studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts studio/src/tokens.css
git commit -m "feat(studio): add shared CategoryMetaFields form component"
```

---

### Task 7: `CategoriesPane.tsx` and `App.tsx` wiring

**Files:**
- Create: `studio/src/panes/CategoriesPane.tsx`
- Test: `studio/src/panes/CategoriesPane.test.tsx`
- Modify: `studio/src/App.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`

**Interfaces:**
- Consumes: `fetchCategories`, `saveCategoryMeta`, `CategorySummary` from `../api` (Task 5); `CategoryMetaFields`, `draftToMetaInput`, `CategoryMetaDraft` from `../components/CategoryMetaFields` (Task 6); `Button`, `useDialogBehavior`, `useStudioT`.
- Produces: `CategoriesPane({ onClose, onSaved }: { onClose: () => void; onSaved: () => void })` — mounted from `App.tsx`. `App.tsx`'s `categories: string[]` prop threaded to `FilterBar`/`NewItemDialog` is now sourced from a new `fetchCategories()` call inside `refresh()`, not derived from `items`.

- [ ] **Step 1: Add the i18n keys**

In `studio/src/i18n/strings.en.ts`:
```ts
  "header.categories": "Categories",
  "categoriesPane.title": "Categories",
  "categoriesPane.hint": "Edit how each category is labeled and ordered on the site.",
  "categoriesPane.empty": "No categories yet. Use “New item” → “Category” to create one.",
  "categoriesPane.itemCount": "{count} item{plural}",
  "categoriesPane.save": "Save",
  "categoriesPane.saving": "Saving…",
  "categoriesPane.saved": "Saved",
  "categoriesPane.close": "Close",
```

In `studio/src/i18n/strings.zh.ts`:
```ts
  "header.categories": "分类",
  "categoriesPane.title": "分类",
  "categoriesPane.hint": "编辑每个分类在网站上的名称和排序。",
  "categoriesPane.empty": "还没有分类。使用“新建商品”→“分类”创建一个。",
  "categoriesPane.itemCount": "{count} 件商品",
  "categoriesPane.save": "保存",
  "categoriesPane.saving": "保存中…",
  "categoriesPane.saved": "已保存",
  "categoriesPane.close": "关闭",
```

- [ ] **Step 2: Write the failing test**

Create `studio/src/panes/CategoriesPane.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { CategoriesPane } from "./CategoriesPane";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("CategoriesPane", () => {
  it("lists categories fetched from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          categories: [
            { slug: "electronics", displayName: "Electronics", description: "", icon: "📱", sortOrder: 1, itemCount: 3 },
          ],
        }),
      ),
    );
    const { findByText } = renderWithStudioI18n(<CategoriesPane onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await findByText(/electronics/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no categories", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ categories: [] })));
    const { findByText } = renderWithStudioI18n(<CategoriesPane onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await findByText(/No categories yet/)).toBeInTheDocument();
  });

  it("saves edited metadata for a category", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/categories" && (init === undefined || init.method === undefined)) {
        return jsonResponse({
          categories: [
            { slug: "electronics", displayName: "", description: "", icon: "", sortOrder: null, itemCount: 0 },
          ],
        });
      }
      if (url === "/api/categories/electronics" && init?.method === "PUT") {
        return jsonResponse({});
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const { findByLabelText, findByText } = renderWithStudioI18n(
      <CategoriesPane onClose={vi.fn()} onSaved={onSaved} />,
    );
    const displayName = await findByLabelText("Display name");
    fireEvent.change(displayName, { target: { value: "Electronics" } });
    fireEvent.click(await findByText("Save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse((putCall?.[1] as RequestInit).body as string)).toMatchObject({ display_name: "Electronics" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run studio/src/panes/CategoriesPane.test.tsx`
Expected: FAIL — `Cannot find module './CategoriesPane'`

- [ ] **Step 4: Implement `studio/src/panes/CategoriesPane.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { fetchCategories, saveCategoryMeta, type CategorySummary } from "../api";
import { Button } from "../components/Button";
import { CategoryMetaFields, draftToMetaInput, type CategoryMetaDraft } from "../components/CategoryMetaFields";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

function toDraft(cat: CategorySummary): CategoryMetaDraft {
  return {
    displayName: cat.displayName,
    description: cat.description,
    icon: cat.icon,
    sortOrder: cat.sortOrder === null ? "" : String(cat.sortOrder),
  };
}

function CategoryRow({ category, onSaved }: { category: CategorySummary; onSaved: () => void }) {
  const { t } = useStudioT();
  const [draft, setDraft] = useState<CategoryMetaDraft>(() => toDraft(category));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(toDraft(category));
    setSaved(false);
  }, [category]);

  async function save() {
    const parsed = draftToMetaInput(draft);
    if ("error" in parsed) {
      setError(t(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveCategoryMeta(category.slug, parsed);
      onSaved();
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="category-row">
      <h3>
        {category.icon !== "" ? `${category.icon} ` : ""}
        {category.slug}
        <span className="field-hint"> · {t("categoriesPane.itemCount", { count: category.itemCount })}</span>
      </h3>
      {error !== null && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {saved && <p className="form-saved">{t("categoriesPane.saved")}</p>}
      <CategoryMetaFields value={draft} onChange={setDraft} busy={busy} />
      <div className="dialog-actions">
        <Button variant="primary" onClick={() => void save()} disabled={busy}>
          {busy ? t("categoriesPane.saving") : t("categoriesPane.save")}
        </Button>
      </div>
    </div>
  );
}

export function CategoriesPane({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useStudioT();
  const dialogRef = useDialogBehavior(onClose);
  const [categories, setCategories] = useState<CategorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setCategories(await fetchCategories());
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog categories-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("categoriesPane.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("categoriesPane.title")}</h2>
        <p className="field-hint">{t("categoriesPane.hint")}</p>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {categories !== null && categories.length === 0 && <p className="field-hint">{t("categoriesPane.empty")}</p>}
        {categories?.map((cat) => (
          <CategoryRow
            key={cat.slug}
            category={cat}
            onSaved={() => {
              onSaved();
              void load();
            }}
          />
        ))}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            {t("categoriesPane.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run studio/src/panes/CategoriesPane.test.tsx`
Expected: PASS (all 3 cases)

- [ ] **Step 6: Wire into `studio/src/App.tsx`**

Add the import (near the other pane imports):
```ts
import { fetchCategories, applyDefaultTiers, bulkStatus, fetchItems, type StudioItem } from "./api";
```
(extend the existing `import { applyDefaultTiers, bulkStatus, fetchItems, type StudioItem } from "./api";` line with `fetchCategories`)
```ts
import { CategoriesPane } from "./panes/CategoriesPane";
```

In `App()`, add a `categorySlugs` state and fold the fetch into `refresh()`:
```ts
  const [categorySlugs, setCategorySlugs] = useState<string[]>([]);
```
Change:
```ts
  const refresh = useCallback(async () => {
    const { items, defaultLocale, availableLocales: al, studioTranslations: st } =
      await fetchItems();
    setItems(items);
    setAvailableLocales(al);
    setStudioTranslations(st);
    setDisplayLocale((prev) => (al.includes(prev) ? prev : defaultLocale));
  }, []);
```
to:
```ts
  const refresh = useCallback(async () => {
    const [{ items, defaultLocale, availableLocales: al, studioTranslations: st }, categories] =
      await Promise.all([fetchItems(), fetchCategories()]);
    setItems(items);
    setAvailableLocales(al);
    setStudioTranslations(st);
    setDisplayLocale((prev) => (al.includes(prev) ? prev : defaultLocale));
    // Sourced from the category folders themselves, not from items: a
    // category created with zero items must still be selectable and
    // filterable everywhere the seller can pick a category.
    setCategorySlugs(categories.map((c) => c.slug).sort());
  }, []);
```

Thread it into `StudioChrome`'s props (both the `<StudioChrome ... />` call site and its prop type/destructuring):
```tsx
      <StudioChrome
        items={items}
        error={error}
        setError={setError}
        availableLocales={availableLocales}
        displayLocale={displayLocale}
        setDisplayLocale={setDisplayLocale}
        refresh={refresh}
        categorySlugs={categorySlugs}
      />
```
```ts
function StudioChrome({
  items,
  error,
  setError,
  availableLocales,
  displayLocale,
  setDisplayLocale,
  refresh,
  categorySlugs,
}: {
  items: StudioItem[];
  error: string | null;
  setError: (error: string | null) => void;
  availableLocales: string[];
  displayLocale: string;
  setDisplayLocale: (locale: string) => void;
  refresh: () => Promise<void>;
  categorySlugs: string[];
}) {
```

Replace the items-derived `categories` memo:
```ts
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.categorySlug))].sort(),
    [items],
  );
```
with:
```ts
  const categories = categorySlugs;
```

Add `showCategories` state next to `showConfig`:
```ts
  const [showCategories, setShowCategories] = useState(false);
```

Add the header button next to the "Defaults" button:
```tsx
          <Button onClick={() => setShowCategories(true)}>
            {t("header.categories")}
          </Button>
```

Add the pane mount next to `{showConfig && <ConfigPane onClose={() => setShowConfig(false)} />}`:
```tsx
      {showCategories && (
        <CategoriesPane
          onClose={() => setShowCategories(false)}
          onSaved={() => {
            void refresh();
          }}
        />
      )}
```

- [ ] **Step 7: Add minimal styling**

In `studio/src/tokens.css`, after the `.category-meta-fields` rule added in Task 6, add:
```css
.categories-dialog {
  width: min(40rem, calc(100vw - 2rem));
  max-height: 80vh;
  overflow-y: auto;
}

.category-row {
  padding-top: var(--gap-lg);
  margin-top: var(--gap-lg);
  border-top: 1px solid var(--border);
}

.category-row:first-of-type {
  padding-top: 0;
  margin-top: 0;
  border-top: 0;
}

.category-row h3 {
  margin: 0 0 0.25rem;
  font-size: var(--step-1);
  font-weight: 600;
}
```

- [ ] **Step 8: Run the full test suite and type-check**

Run: `pnpm type-check && npx vitest run studio/src`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add studio/src/panes/CategoriesPane.tsx studio/src/panes/CategoriesPane.test.tsx studio/src/App.tsx studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts studio/src/tokens.css
git commit -m "feat(studio): add Categories pane and wire folder-derived category list into App"
```

---

### Task 8: `NewItemDialog.tsx` — category creation mode

**Files:**
- Modify: `studio/src/panes/NewItemDialog.tsx`
- Modify: `studio/src/panes/NewItemDialog.test.tsx` (create if it doesn't already exist — check first)
- Modify: `studio/src/App.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`

**Interfaces:**
- Consumes: `createCategory` from `../api` (Task 5); `CategoryMetaFields`, `draftToMetaInput`, `EMPTY_CATEGORY_META_DRAFT`, `CategoryMetaDraft` from `../components/CategoryMetaFields` (Task 6).
- Produces: `NewItemDialog` gains an `onCategoryCreated: (slug: string) => void` prop alongside the existing `onCreated`. `App.tsx` passes a handler that closes the dialog and refreshes.

- [ ] **Step 1: Check for an existing test file**

Run: `ls studio/src/panes/NewItemDialog.test.tsx 2>/dev/null || echo "none"`

If it exists, read it fully before editing (it has existing item-mode test cases that must keep passing). If it doesn't exist, create it fresh in the next step with both item-mode and category-mode coverage.

- [ ] **Step 2: Add the i18n keys**

In `studio/src/i18n/strings.en.ts`:
```ts
  "newItem.modeLabel": "What to create",
  "newItem.mode.item": "Item",
  "newItem.mode.category": "Category",
  "newItem.categorySlug": "Category slug",
  "newItem.categorySlugPlaceholder": "e.g. electronics",
  "newItem.categorySlugHint": "Lowercase letters, digits, and hyphens only.",
  "newItem.categoryMeta.show": "Add details",
  "newItem.categoryMeta.hide": "Hide details",
```

In `studio/src/i18n/strings.zh.ts`:
```ts
  "newItem.modeLabel": "创建类型",
  "newItem.mode.item": "商品",
  "newItem.mode.category": "分类",
  "newItem.categorySlug": "分类 slug",
  "newItem.categorySlugPlaceholder": "例如 electronics",
  "newItem.categorySlugHint": "仅限小写字母、数字和连字符。",
  "newItem.categoryMeta.show": "添加详情",
  "newItem.categoryMeta.hide": "隐藏详情",
```

- [ ] **Step 3: Write the failing tests**

Create (or extend) `studio/src/panes/NewItemDialog.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithStudioI18n } from "../i18n/StudioI18n";
import { NewItemDialog } from "./NewItemDialog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("NewItemDialog", () => {
  it("creates an item in item mode (default)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "electronics/phone" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const { getByLabelText, getByText } = renderWithStudioI18n(
      <NewItemDialog categories={["electronics"]} onCreated={onCreated} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(getByLabelText("Category"), { target: { value: "electronics" } });
    fireEvent.change(getByLabelText("Name"), { target: { value: "phone" } });
    fireEvent.click(getByText("Create"));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith("electronics/phone"));
    expect(fetchMock).toHaveBeenCalledWith("/api/items", expect.objectContaining({ method: "POST" }));
  });

  it("switches to category mode and creates a category with no metadata", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ slug: "toys" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCategoryCreated = vi.fn();
    const { getByText, getByLabelText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={onCategoryCreated} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByText("Category"));
    fireEvent.change(getByLabelText("Category slug"), { target: { value: "toys" } });
    fireEvent.click(getByText("Create"));
    await vi.waitFor(() => expect(onCategoryCreated).toHaveBeenCalledWith("toys"));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ slug: "toys", meta: undefined });
  });

  it("creates a category with metadata when details are shown", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ slug: "toys" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onCategoryCreated = vi.fn();
    const { getByText, getByLabelText } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={onCategoryCreated} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByText("Category"));
    fireEvent.change(getByLabelText("Category slug"), { target: { value: "toys" } });
    fireEvent.click(getByText("Add details"));
    fireEvent.change(getByLabelText("Display name"), { target: { value: "Toys" } });
    fireEvent.click(getByText("Create"));
    await vi.waitFor(() => expect(onCategoryCreated).toHaveBeenCalledWith("toys"));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ slug: "toys", meta: { display_name: "Toys" } });
  });

  it("rejects a non-kebab-case category slug", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { getByText, getByLabelText, findByRole } = renderWithStudioI18n(
      <NewItemDialog categories={[]} onCreated={vi.fn()} onCategoryCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(getByText("Category"));
    fireEvent.change(getByLabelText("Category slug"), { target: { value: "Not Kebab" } });
    fireEvent.click(getByText("Create"));
    expect(await findByRole("alert")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run studio/src/panes/NewItemDialog.test.tsx`
Expected: FAIL — `onCategoryCreated` is not a recognized prop / category mode UI doesn't exist

- [ ] **Step 5: Implement the category mode in `studio/src/panes/NewItemDialog.tsx`**

Replace the full file with:
```tsx
import { useState } from "react";
import { createCategory, createItem, type CategoryMetaInput } from "../api";
import { Button } from "../components/Button";
import {
  CategoryMetaFields,
  draftToMetaInput,
  EMPTY_CATEGORY_META_DRAFT,
  type CategoryMetaDraft,
} from "../components/CategoryMetaFields";
import { useDialogBehavior } from "../components/useDialogBehavior";
import { useStudioT } from "../i18n/StudioI18n";

// Mirrors lib/utils/slug.ts's SAFE_SLUG_RE — the server is the real gate
// (resolveItemDir/resolveCategoryDir re-check with the shared allowlist plus
// a containment assertion); this is only so a typo fails before the round
// trip.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type Mode = "item" | "category";

export function NewItemDialog({
  categories,
  onCreated,
  onCategoryCreated,
  onCancel,
}: {
  categories: string[];
  onCreated: (id: string) => void;
  onCategoryCreated: (slug: string) => void;
  onCancel: () => void;
}) {
  const { t } = useStudioT();
  const [mode, setMode] = useState<Mode>("item");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyDefaults, setApplyDefaults] = useState(true);
  const [showCategoryMeta, setShowCategoryMeta] = useState(false);
  const [categoryMeta, setCategoryMeta] = useState<CategoryMetaDraft>(EMPTY_CATEGORY_META_DRAFT);

  const dialogRef = useDialogBehavior(onCancel);

  async function createNewItem() {
    const cat = category.trim();
    const slug = name.trim();
    if (!SLUG_RE.test(cat) || !SLUG_RE.test(slug)) {
      setError(t("newItem.slugError"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await createItem(cat, slug, applyDefaults));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function createNewCategory() {
    const slug = name.trim();
    if (!SLUG_RE.test(slug)) {
      setError(t("newItem.slugError"));
      return;
    }
    let metaInput: CategoryMetaInput | undefined;
    if (showCategoryMeta) {
      const parsed = draftToMetaInput(categoryMeta);
      if ("error" in parsed) {
        setError(t(parsed.error));
        return;
      }
      metaInput = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      onCategoryCreated(await createCategory(slug, metaInput));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      {/* Stop clicks inside the sheet from closing it. */}
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("newItem.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{t("newItem.title")}</h2>
        <div className="new-item-mode" role="tablist" aria-label={t("newItem.modeLabel")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "item"}
            className={mode === "item" ? "tab tab-active" : "tab"}
            onClick={() => setMode("item")}
          >
            {t("newItem.mode.item")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "category"}
            className={mode === "category" ? "tab tab-active" : "tab"}
            onClick={() => setMode("category")}
          >
            {t("newItem.mode.category")}
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (mode === "item" ? createNewItem() : createNewCategory());
          }}
        >
          {mode === "item" ? (
            <>
              <label className="field">
                <span className="field-label">{t("newItem.category")}</span>
                <input
                  type="text"
                  list="studio-categories"
                  value={category}
                  autoFocus
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t("newItem.categoryPlaceholder")}
                />
                <datalist id="studio-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <span className="field-hint">{t("newItem.categoryHint")}</span>
              </label>
              <label className="field">
                <span className="field-label">{t("newItem.name")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("newItem.namePlaceholder")}
                />
                <span className="field-hint">{t("newItem.nameHint")}</span>
              </label>
              <label className="field">
                <span className="field-label">
                  <input
                    type="checkbox"
                    checked={applyDefaults}
                    onChange={(e) => setApplyDefaults(e.target.checked)}
                  />{" "}
                  {t("newItem.applyDefaults")}
                </span>
                <span className="field-hint">{t("newItem.applyDefaultsHint")}</span>
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span className="field-label">{t("newItem.categorySlug")}</span>
                <input
                  type="text"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("newItem.categorySlugPlaceholder")}
                />
                <span className="field-hint">{t("newItem.categorySlugHint")}</span>
              </label>
              <button
                type="button"
                className="disclosure-toggle"
                onClick={() => setShowCategoryMeta((v) => !v)}
              >
                {showCategoryMeta ? t("newItem.categoryMeta.hide") : t("newItem.categoryMeta.show")}
              </button>
              {showCategoryMeta && (
                <CategoryMetaFields value={categoryMeta} onChange={setCategoryMeta} busy={busy} />
              )}
            </>
          )}
          <div className="dialog-actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("newItem.creating") : t("newItem.create")}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              {t("newItem.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `studio/src/App.tsx`'s `<NewItemDialog>` usage**

Find the existing:
```tsx
      {showNewItem && (
        <NewItemDialog
          categories={categories}
          onCancel={() => setShowNewItem(false)}
          onCreated={(id) => {
            setShowNewItem(false);
            // Refresh first so the drawer has a row to open for the new item,
            // then land the seller straight in its editor.
            void refresh().then(() => setOpenItemId(id));
            bumpChanges();
          }}
        />
      )}
```
Replace with:
```tsx
      {showNewItem && (
        <NewItemDialog
          categories={categories}
          onCancel={() => setShowNewItem(false)}
          onCreated={(id) => {
            setShowNewItem(false);
            // Refresh first so the drawer has a row to open for the new item,
            // then land the seller straight in its editor.
            void refresh().then(() => setOpenItemId(id));
            bumpChanges();
          }}
          onCategoryCreated={() => {
            setShowNewItem(false);
            void refresh();
          }}
        />
      )}
```

- [ ] **Step 7: Add minimal styling**

In `studio/src/tokens.css`, after the `.category-row h3` rule added in Task 7, add:
```css
.new-item-mode {
  display: flex;
  gap: var(--gap);
  margin-bottom: var(--gap);
}

.disclosure-toggle {
  background: none;
  border: none;
  padding: 0;
  margin: 0.5rem 0;
  color: var(--ink-soft);
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run studio/src/panes/NewItemDialog.test.tsx`
Expected: PASS (all 4 cases)

- [ ] **Step 9: Run the full test suite and type-check**

Run: `pnpm type-check && npx vitest run studio/src`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add studio/src/panes/NewItemDialog.tsx studio/src/panes/NewItemDialog.test.tsx studio/src/App.tsx studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts studio/src/tokens.css
git commit -m "feat(studio): add category creation mode to New item dialog"
```

---

### Task 9: `ConfigPane.tsx` — contact QR image upload/replace/delete

**Files:**
- Modify: `studio/src/panes/ConfigPane.tsx`
- Modify: `studio/src/panes/ConfigPane.test.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`

**Interfaces:**
- Consumes: `uploadContactImage`, `deleteContactImage` from `../api` (Task 5).
- Produces: `FieldRow` renders an inline `QrImageControl` beneath any field whose `path` matches `contact.platforms.<n>.qr_image`; upload/replace feeds the resulting `/contact/<file>` path into the existing per-field draft via the field's own `onChange`; delete clears the draft to `""`.

- [ ] **Step 1: Add the i18n keys**

In `studio/src/i18n/strings.en.ts`:
```ts
  "configPane.qr.remove": "Remove",
  "configPane.qr.uploading": "Uploading…",
```

In `studio/src/i18n/strings.zh.ts`:
```ts
  "configPane.qr.remove": "删除",
  "configPane.qr.uploading": "上传中…",
```

- [ ] **Step 2: Write the failing test**

Add to `studio/src/panes/ConfigPane.test.tsx` (find the existing `mountPane`-style helper that stubs `fetch` for `/api/config`, and extend the stub to also answer `/api/contact/images`):
```tsx
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("QR image upload", () => {
  it("renders an upload control for a qr_image field and writes the returned path into the draft", async () => {
    const fields = [
      {
        path: "contact.platforms.0.qr_image",
        section: "Contact",
        kind: "string",
        value: "",
        doc: undefined,
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/config" && init === undefined) return jsonResponse(fields);
      if (url === "/api/contact/images" && init?.method === "POST") {
        return jsonResponse({ file: "wechat-qr.png", path: "/contact/wechat-qr.png" }, 201);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { findByLabelText, getByText } = renderWithStudioI18n(<ConfigPane onClose={vi.fn()} />);
    const fileInput = (await findByLabelText(/qr_image/)) as HTMLElement;
    // The file input has no accessible label of its own; locate it via the
    // upload control's file input role instead.
    const uploadInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "wechat-qr.png", { type: "image/png" });
    fireEvent.change(uploadInput, { target: { files: [file] } });
    await waitFor(() =>
      expect((document.querySelector('input[type="text"]') as HTMLInputElement).value).toBe(
        "/contact/wechat-qr.png",
      ),
    );
    expect(getByText("●", { exact: false })).toBeTruthy();
  });
});
```

Note: adapt the exact `fields`/`fetchConfig` stub shape to match whatever the existing tests in this file already use for `ConfigField` — read the top of `studio/src/panes/ConfigPane.test.tsx` first and reuse its established helper rather than introducing a second, disagreeing one. Add `fireEvent`, `waitFor` to the existing `@testing-library/react` import if not already imported.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run studio/src/panes/ConfigPane.test.tsx -t "QR image"`
Expected: FAIL — no file input rendered

- [ ] **Step 4: Implement the QR control in `studio/src/panes/ConfigPane.tsx`**

Add the import at the top:
```ts
import { fetchConfig, saveConfigValue, uploadContactImage, deleteContactImage, type ConfigField } from "../api";
```

Add the path matcher near `DANGER_FIELDS`:
```ts
const QR_IMAGE_PATH_RE = /^contact\.platforms\.\d+\.qr_image$/;
```

Add the control component just above `FieldRow`:
```tsx
function QrImageControl({
  raw,
  busy,
  onChange,
}: {
  raw: string;
  busy: boolean;
  onChange: (raw: string) => void;
}) {
  const { t } = useStudioT();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function basename(pathValue: string): string {
    return pathValue.split("/").pop() ?? pathValue;
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file === undefined) return;
    setUploading(true);
    setUploadError(null);
    try {
      if (raw !== "") {
        // Replace: remove the previous file first. If it's already gone
        // (deleted by hand, or never actually written), that's fine — the
        // goal is that the new upload ends up as the only file on disk.
        await deleteContactImage(basename(raw)).catch(() => {});
      }
      const uploaded = await uploadContactImage(file);
      onChange(uploaded.path);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (raw === "") return;
    setUploading(true);
    setUploadError(null);
    try {
      await deleteContactImage(basename(raw));
      onChange("");
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="qr-image-control">
      <input
        type="file"
        accept="image/png"
        disabled={busy || uploading}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {raw !== "" && (
        <Button variant="ghost" disabled={busy || uploading} onClick={() => void handleRemove()}>
          {t("configPane.qr.remove")}
        </Button>
      )}
      {uploading && <span className="field-hint">{t("configPane.qr.uploading")}</span>}
      {uploadError !== null && (
        <p role="alert" className="alert-error">
          {uploadError}
        </p>
      )}
    </div>
  );
}
```

Inside `FieldRow`, after the closing `</label>` and before the `{dangerKey !== undefined && ...}` block, add:
```tsx
      {QR_IMAGE_PATH_RE.test(field.path) && !readOnly && (
        <QrImageControl raw={raw} busy={busy} onChange={onChange} />
      )}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run studio/src/panes/ConfigPane.test.tsx`
Expected: PASS, including all pre-existing `ConfigPane` cases

- [ ] **Step 6: Add minimal styling**

In `studio/src/tokens.css`, after the `.disclosure-toggle` rule added in Task 8, add:
```css
.qr-image-control {
  display: flex;
  align-items: center;
  gap: var(--gap);
  margin-top: 0.35rem;
}
```

- [ ] **Step 7: Run the full test suite and type-check**

Run: `pnpm type-check && npx vitest run studio/src`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add studio/src/panes/ConfigPane.tsx studio/src/panes/ConfigPane.test.tsx studio/src/i18n/strings.en.ts studio/src/i18n/strings.zh.ts studio/src/tokens.css
git commit -m "feat(studio): add contact QR image upload/replace/remove to Config pane"
```

---

### Task 10: Documentation (EN + zh)

**Files:**
- Modify: `docs/CURRENT_FUNCTIONALITY.md`
- Modify: `docs/CURRENT_FUNCTIONALITY_zh.md`
- Modify: `docs/DESIGN.md`
- Modify: `docs/DESIGN_zh.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Read the current "Seller Studio" section**

Run: `grep -n "Seller Studio" docs/CURRENT_FUNCTIONALITY.md docs/DESIGN.md` and read the surrounding sections in both files (and their `_zh` counterparts) to match heading style, list format, and level of detail exactly.

- [ ] **Step 2: Update `docs/CURRENT_FUNCTIONALITY.md`**

In the "Seller Studio" feature list, add three bullets alongside the existing ones (price tiers, i18n, PDF export, etc.), matching the file's existing bullet style:
```markdown
- **Category metadata** — a "Categories" pane lists every category folder under `content/items/`, and lets the seller edit its display name, description, icon, and sort order (writes a sparse `content/items/<category>/_category.json`, matching how `_defaults.json` stays sparse).
- **Category creation** — the "New item" dialog has an "Item" / "Category" mode. Category mode creates a new category folder, optionally seeded with the same metadata fields as the Categories pane.
- **Contact QR images** — the Config pane's `contact.platforms[].qr_image` fields get an inline upload/replace/remove control that writes PNGs into `content/contact/` and keeps the field's path in sync; these images are never pushed to the CDN (they're git-tracked and served from `public/contact/` via the existing build-time copy step).
```

- [ ] **Step 3: Update `docs/CURRENT_FUNCTIONALITY_zh.md`**

Add the matching Chinese bullets at the same location in the mirrored section, translating the English added in Step 2 (match the file's existing tone/terminology for other Studio bullets — e.g. how "sparse" / "_defaults.json" / "CDN" are already phrased elsewhere in this file).

- [ ] **Step 4: Update `docs/DESIGN.md`**

In §22 (Seller Studio), add a subsection documenting the three new endpoints, following the style already used there for the price-tier and PDF-export endpoints (request/response shape, one short paragraph each):
```markdown
### Categories

- `GET /api/categories` → `{ categories: CategorySummary[] }` where `CategorySummary = { slug, displayName, description, icon, sortOrder, itemCount }`.
- `POST /api/categories` with `{ slug, meta? }` creates a category folder, optionally seeding a sparse `_category.json`. `409` if the category already exists.
- `PUT /api/categories/:slug` with `{ display_name?, description?, icon?, sort_order? }` writes (or, if all fields are default, deletes) `_category.json`. `404` if the category doesn't exist.

### Contact QR images

- `POST /api/contact/images` with `{ filename, contentBase64 }` writes a PNG into `content/contact/` (PNG-only, verified by magic bytes) and returns `{ file, path }`, where `path` is the `/contact/<file>` value to store in `qr_image`.
- `GET /api/contact/images/:filename` streams the file back (used for the Config pane's live preview, since Studio's own dev server doesn't serve `content/contact/` as `/contact/*` — only the site's build-time copy to `public/contact/` does that).
- `DELETE /api/contact/images/:filename` removes the file. `404` if it doesn't exist. Deleting does not edit `content/config.ts` — the seller must still Save the Config pane to persist a cleared `qr_image`.
```
Also add a one-line cross-reference at the end of §6 (`_category.json` schema): `Seller Studio's "Categories" pane can read and write this file — see §22.` And at the end of §7 (contact/QR): `Seller Studio can upload/replace/delete these PNGs — see §22.`

- [ ] **Step 5: Update `docs/DESIGN_zh.md`**

Mirror Step 4's additions in Chinese at the same locations (§22, §6, §7), matching this file's existing translation style for other Studio endpoint documentation.

- [ ] **Step 6: Commit**

```bash
git add docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md docs/DESIGN.md docs/DESIGN_zh.md
git commit -m "docs: document Studio category metadata, category creation, and contact QR coverage"
```

---

## Post-plan: self-review loop (not a task — run after Task 10)

1. `pnpm lint && pnpm type-check && pnpm test` — fix every failure.
2. `/code-review high` against the full diff (`git diff develop...HEAD` or equivalent) — apply every CONFIRMED finding; use judgment on PLAUSIBLE findings, noting any left unfixed.
3. Repeat step 2 after fixes, capped at 3 rounds total.
4. Re-run step 1 once more before declaring done — the review-fix rounds may have changed things since the last clean run.
5. Manual smoke test per spec §7: `pnpm studio`, create a category with metadata, confirm it appears in the Categories pane and category filters immediately; edit its metadata and confirm the file on disk; upload a QR PNG, Save the config, confirm `content/contact/<file>.png` exists.
