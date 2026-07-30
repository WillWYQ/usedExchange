# Seller Studio — Implementation Plan, Part 1 (Foundations + Bulk Status)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local-only browser dashboard that lists every item in `content/` and bulk-changes item status, on top of two extracted, tested libraries.

**Architecture:** `pnpm studio` starts a single Vite dev server bound to `127.0.0.1`. A Vite middleware plugin routes `/api/*` to a framework-independent handler in `scripts/lib/studioApi.ts`; everything else is served as a React frontend from `studio/`. All `item.json` writes go through surgical JSONC edits so comments and `reserved_for` survive. Nothing is added to `app/`, so the static export is untouched.

**Tech Stack:** TypeScript, Vite 5 + `@vitejs/plugin-react`, React 19, Vitest, `jsonc-parser`, Tailwind-free hand-written CSS tokens, `@fontsource` fonts.

**Spec:** `docs/superpowers/specs/2026-07-29-seller-studio-design.md` (+ `_zh`). Part 1 covers spec phases 1–3; Part 2 covers images, edit form, publish, and downstream distribution.

## Global Constraints

- Studio code lives in `studio/` and `scripts/`. **Never add files to `app/`** (Iron Rule 3).
- Studio writes only under `content/`, plus `lib/generated/image-manifest.json` (Iron Rule 1, 5).
- `item.json` is **JSONC with comments**. Never save via parse → re-serialize. All writes go through `applyFieldEdits` (`jsonc-parser` `modify`/`applyEdits`).
- **`reserved_for` must survive every edit and must never be written** (Iron Rule 4).
- **Do NOT reuse `itemJsonSchema` field schemas to validate API input.** Many fields carry `.catch(...)` (`lib/content/schema.ts:120-131`), so `safeParse("garbage")` *succeeds* and silently returns the fallback. API input gets its own explicit `z.enum(...)` / `z.string()` schemas.
- Server binds `127.0.0.1` only — never `0.0.0.0`. This API writes files and holds R2 credentials.
- Port: hardcoded `5174`, overridable via `pnpm studio --port <n>`. **No new `content/config.ts` fields** in Part 1 or 2 (Iron Rule 8 avoided entirely).
- Slug validation uses `isValidSlug` from `lib/utils/slug.ts` (`/^[a-z0-9][a-z0-9-]*$/`) **and** a resolved-path containment check. Both layers, always.
- Existing CLI behaviour must not change: `pnpm upload-images` and `pnpm mark-sold` keep their current output and exit codes.
- Tests run with `pnpm test` (Vitest, `environment: "node"`, `@` aliased to the repo root).
- Design tokens are fixed by spec §14.2: `carbon-pale #E4EBEF`, `carbon-rule #C2CFD6`, `ink #1B2A35`, `ink-soft #5C6E7A`, `stamp #B3241E`, `pending #8A6A12`. `stamp` is used for `sold` and nothing else.
- Fonts: `Courier Prime` (data), `IBM Plex Sans` (interface), `Archivo Narrow` (headings/status). Installed as `@fontsource` packages — **never a CDN link**.
- Respect `prefers-reduced-motion`: the SOLD stamp renders its end state with no animation.

---

## File Structure

**Created in Part 1:**

| File | Responsibility |
|---|---|
| `scripts/lib/itemEdit.ts` | Surgical JSONC field edits + editable-field allowlist. No fs, no HTTP. |
| `scripts/lib/itemEdit.test.ts` | Comment/`reserved_for` preservation, allowlist rejection, nested paths. |
| `scripts/lib/imageSync.ts` | Pure image-sync logic extracted from `sync-images.ts`. Returns structured results, never prints, never exits. |
| `scripts/lib/imageSync.test.ts` | Scan rules + partial-failure semantics with an injected fake adapter. |
| `scripts/lib/studioApi.ts` | Framework-independent request handler: routing, path safety, JSON responses. |
| `scripts/lib/studioApi.test.ts` | Handler called directly: routes, traversal rejection, bulk-status result shape. |
| `scripts/studio.ts` | `pnpm studio` entry: vite presence check, `--port` parsing, server start. |
| `studio/vite.config.ts` | Vite config + `/api` middleware plugin. Binds `127.0.0.1`. |
| `studio/index.html` | Single HTML entry. |
| `studio/src/main.tsx` | React root. |
| `studio/src/tokens.css` | Spec §14 palette, type scale, font imports. |
| `studio/src/App.tsx` | Shell: header, category rail, item table, bulk toolbar. |
| `studio/src/api.ts` | Typed `fetch` wrappers for the API. |
| `studio/src/panes/ItemList.tsx` | Table, selection state, SOLD stamp rendering. |
| `studio/src/panes/BulkToolbar.tsx` | Selection-count toolbar and status actions. |

**Modified in Part 1:**

| File | Change |
|---|---|
| `scripts/lib/markSold.ts` | Reimplemented as a thin wrapper over `applyFieldEdits`. |
| `scripts/sync-images.ts` | `runUpload` delegates to `syncImagesToCdn`; keeps printing, quality checks, contact copy, exit codes. |
| `package.json` | `studio` script; `vite`, `@vitejs/plugin-react`, three `@fontsource` packages in `devDependencies`. |

---

### Task 1: Surgical JSONC field edits (`itemEdit.ts`)

Pure refactor + new library. No studio code yet. `pnpm mark-sold` behaviour must be identical afterwards.

**Files:**
- Create: `scripts/lib/itemEdit.ts`
- Create: `scripts/lib/itemEdit.test.ts`
- Modify: `scripts/lib/markSold.ts` (whole file, 22 lines)
- Test: `scripts/lib/itemEdit.test.ts`, existing `scripts/lib/markSold.test.ts`

**Interfaces:**
- Consumes: `itemJsonSchema` from `@/lib/content/schema`, `jsonc-parser`.
- Produces:
  - `type FieldEdit = { path: (string | number)[]; value: unknown }`
  - `applyFieldEdits(text: string, edits: FieldEdit[]): string` — throws `Error` on a non-allowlisted field
  - `isEditableField(path: (string | number)[]): boolean`
  - `readItemField(text: string, field: string): unknown`
  - `applyMarkSold(text: string, today: string): string | null` (unchanged signature)

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/itemEdit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyFieldEdits, isEditableField, readItemField } from "./itemEdit";

// A realistic item.json: JSONC comments from `pnpm create-item`, plus the
// private reserved_for field that Iron Rule 4 protects.
const SAMPLE = `{
  "name": "Desk lamp",
  // options: new | like-new | good | fair | for-parts
  "condition": "good",
  "status": "available",
  "sold_date": null,
  "reserved_for": "alice@example.com",
  "price": {
    "currency": "USD",
    "negotiable": false
  }
}
`;

describe("applyFieldEdits", () => {
  it("preserves JSONC comments", () => {
    const next = applyFieldEdits(SAMPLE, [{ path: ["status"], value: "sold" }]);
    expect(next).toContain("// options: new | like-new | good | fair | for-parts");
  });

  it("preserves reserved_for", () => {
    const next = applyFieldEdits(SAMPLE, [{ path: ["status"], value: "sold" }]);
    expect(readItemField(next, "reserved_for")).toBe("alice@example.com");
  });

  it("applies every edit in one pass", () => {
    const next = applyFieldEdits(SAMPLE, [
      { path: ["status"], value: "sold" },
      { path: ["sold_date"], value: "2026-07-30" },
    ]);
    expect(readItemField(next, "status")).toBe("sold");
    expect(readItemField(next, "sold_date")).toBe("2026-07-30");
  });

  it("edits nested paths", () => {
    const next = applyFieldEdits(SAMPLE, [{ path: ["price", "negotiable"], value: true }]);
    const price = readItemField(next, "price") as Record<string, unknown>;
    expect(price["negotiable"]).toBe(true);
  });

  it("refuses to write reserved_for", () => {
    expect(() => applyFieldEdits(SAMPLE, [{ path: ["reserved_for"], value: "bob" }])).toThrow(
      /reserved_for/,
    );
  });

  it("refuses unknown fields", () => {
    expect(() => applyFieldEdits(SAMPLE, [{ path: ["evil"], value: 1 }])).toThrow(/evil/);
  });

  it("rejects the whole batch when any edit is disallowed", () => {
    expect(() =>
      applyFieldEdits(SAMPLE, [
        { path: ["status"], value: "sold" },
        { path: ["reserved_for"], value: "bob" },
      ]),
    ).toThrow();
    // Nothing was written: the caller still holds the original text.
    expect(readItemField(SAMPLE, "status")).toBe("available");
  });
});

describe("isEditableField", () => {
  it("accepts a known schema field", () => {
    expect(isEditableField(["condition"])).toBe(true);
  });

  it("rejects a numeric-only path", () => {
    expect(isEditableField([0])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/itemEdit.test.ts`
Expected: FAIL — cannot resolve `./itemEdit`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/itemEdit.ts`:

```ts
// Surgical field edits for item.json, which is JSONC: it carries `// options: ...`
// comments written by `pnpm create-item`, and may carry `reserved_for` (private
// buyer info — Iron Rule 4). A parse/stringify round trip would delete both, and
// lib/content/schema.ts strips reserved_for by design, so a Zod round trip is
// especially destructive here. modify/applyEdits touch only the target range.

import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
import { itemJsonSchema } from "@/lib/content/schema";

export type FieldEdit = { path: (string | number)[]; value: unknown };

// The allowlist is derived from the schema itself, so it stays in sync with
// docs/DESIGN.md §5 automatically. reserved_for is absent from the schema, which
// is exactly why it lands on the wrong side of this check.
const EDITABLE_TOP_LEVEL_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(itemJsonSchema.shape),
);

const FORMATTING_OPTIONS = { tabSize: 2, insertSpaces: true, eol: "\n" };

export function isEditableField(path: (string | number)[]): boolean {
  const head = path[0];
  return typeof head === "string" && EDITABLE_TOP_LEVEL_FIELDS.has(head);
}

/**
 * Applies every edit to `text` and returns the new text. Throws before writing
 * anything if any edit targets a field outside the schema allowlist, so a
 * partially-applied batch is impossible.
 */
export function applyFieldEdits(text: string, edits: FieldEdit[]): string {
  for (const edit of edits) {
    if (!isEditableField(edit.path)) {
      throw new Error(
        `Refusing to write field outside the item.json schema: "${edit.path.join(".")}"`,
      );
    }
  }

  let next = text;
  for (const edit of edits) {
    next = applyEdits(
      next,
      modify(next, edit.path, edit.value, { formattingOptions: FORMATTING_OPTIONS }),
    );
  }
  return next;
}

/** Reads one top-level field out of JSONC text without mutating it. */
export function readItemField(text: string, field: string): unknown {
  const raw = parseJsonc(text) as Record<string, unknown> | undefined;
  return raw?.[field];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/itemEdit.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Reimplement `applyMarkSold` over the new primitive**

Replace the body of `scripts/lib/markSold.ts` with:

```ts
import { parse as parseJsonc } from "jsonc-parser";
import { applyFieldEdits } from "./itemEdit";

// Sets status to "sold" and sold_date to `today` on the given item.json text.
// Returns null if the item is already marked sold. Comment preservation and the
// field allowlist now live in itemEdit.ts — see that file for why a parse/
// stringify round trip is not an option here.
export function applyMarkSold(text: string, today: string): string | null {
  const raw = parseJsonc(text) as Record<string, unknown>;
  if (raw["status"] === "sold") return null;

  return applyFieldEdits(text, [
    { path: ["status"], value: "sold" },
    { path: ["sold_date"], value: today },
  ]);
}
```

- [ ] **Step 6: Run the existing mark-sold tests to prove the refactor is behaviour-preserving**

Run: `pnpm vitest run scripts/lib/markSold.test.ts`
Expected: PASS — no test file changes were needed.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/itemEdit.ts scripts/lib/itemEdit.test.ts scripts/lib/markSold.ts
git commit -m "refactor: extract applyFieldEdits for comment-preserving item.json edits"
```

---

### Task 2: Extract image-sync logic (`imageSync.ts`)

`scripts/sync-images.ts` keeps all printing, quality checks, contact-file copying, and exit codes. Only the upload core moves, so studio can call it and stream progress.

**Files:**
- Create: `scripts/lib/imageSync.ts`
- Create: `scripts/lib/imageSync.test.ts`
- Modify: `scripts/sync-images.ts` (`runUpload`, lines 266-406; helpers `sha256`, `scanImages`, `loadJson`, `writeJson` move out)
- Test: `scripts/lib/imageSync.test.ts`

**Interfaces:**
- Consumes: `ImageStorageAdapter` from `@/lib/images/adapter`, `stripImageMetadata` from `@/lib/images/stripMetadata`, `mapWithConcurrency` from `@/lib/utils/concurrency`.
- Produces:

```ts
type ScannedImage = { sourcePath: string; manifestKey: string };

type ImageSyncProgress =
  | { type: "scanned"; total: number }
  | { type: "file"; manifestKey: string; index: number; total: number; uploaded: boolean }
  | { type: "file-failed"; manifestKey: string; index: number; total: number; error: string };

type ImageSyncResult = {
  total: number;
  uploaded: number;
  skipped: number;
  stripped: number;
  purged: number;
  manifest: Record<string, string>;
  images: ScannedImage[];
  failures: Array<{ manifestKey: string; error: string }>;
};

type ImageSyncOptions = {
  adapter: ImageStorageAdapter;
  contentItemsDir: string;
  manifestPath: string;
  checksumsPath: string;
  onProgress?: (progress: ImageSyncProgress) => void;
};

scanImages(root: string): Promise<ScannedImage[]>
syncImagesToCdn(options: ImageSyncOptions): Promise<ImageSyncResult>
```

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/imageSync.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { ImageStorageAdapter } from "@/lib/images/adapter";
import { scanImages, syncImagesToCdn } from "./imageSync";

let root: string;

// A 1x1 PNG — real bytes, so stripImageMetadata (sharp) can decode it.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function writeImage(relPath: string): Promise<void> {
  const full = path.join(root, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, PNG_1X1);
}

class FakeAdapter implements ImageStorageAdapter {
  public calls: string[] = [];
  constructor(private failOn: Set<string> = new Set()) {}
  async syncImage(_src: string, manifestKey: string): Promise<string> {
    this.calls.push(manifestKey);
    if (this.failOn.has(manifestKey)) throw new Error("boom");
    return `https://cdn.example.com/${manifestKey}`;
  }
  loadChecksums(): void {}
  getUpdatedChecksums(): Record<string, string> {
    return {};
  }
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-imagesync-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("scanImages", () => {
  it("returns forward-slash manifest keys relative to the root", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const found = await scanImages(root);
    expect(found.map((f) => f.manifestKey)).toEqual(["electronics/desk-lamp/01-front.png"]);
  });

  it("skips underscore-prefixed directories and non-image files", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("_drafts/hidden/01-front.png");
    await fs.writeFile(path.join(root, "electronics", "desk-lamp", "notes.txt"), "hi");
    const keys = (await scanImages(root)).map((f) => f.manifestKey);
    expect(keys).toEqual(["electronics/desk-lamp/01-front.png"]);
  });
});

describe("syncImagesToCdn", () => {
  it("writes a manifest entry per image and reports counts", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("books/cs61a/01-cover.png");

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.total).toBe(2);
    expect(result.uploaded).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.manifest["books/cs61a/01-cover.png"]).toBe(
      "https://cdn.example.com/books/cs61a/01-cover.png",
    );
  });

  it("isolates a single file failure and still writes the manifest", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("books/cs61a/01-cover.png");

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(new Set(["books/cs61a/01-cover.png"])),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.uploaded).toBe(1);
    expect(result.failures).toEqual([{ manifestKey: "books/cs61a/01-cover.png", error: "boom" }]);
    // The successful file is still persisted — a failed sibling must not discard it.
    const written = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf-8"));
    expect(written["electronics/desk-lamp/01-front.png"]).toBeTruthy();
    // Never write an empty URL for a file that has never uploaded successfully.
    expect(written["books/cs61a/01-cover.png"]).toBeUndefined();
  });

  it("purges manifest entries whose files are gone", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const manifestPath = path.join(root, "manifest.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ "books/deleted/01-cover.png": "https://cdn.example.com/old.png" }),
    );

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath,
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.purged).toBe(1);
    expect(result.manifest["books/deleted/01-cover.png"]).toBeUndefined();
  });

  it("reports progress for every file", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const events: string[] = [];

    await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
      onProgress: (p) => events.push(p.type),
    });

    expect(events).toEqual(["scanned", "file"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/imageSync.test.ts`
Expected: FAIL — cannot resolve `./imageSync`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/imageSync.ts`:

```ts
// Pure image-sync logic, extracted from scripts/sync-images.ts so both the CLI
// (pnpm upload-images) and Seller Studio can drive the same pipeline. This module
// never prints and never calls process.exit: it returns a structured result and
// reports progress through an optional callback. Printing, advisory quality
// checks, contact-file copying, and exit codes stay in scripts/sync-images.ts.

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { ImageStorageAdapter } from "@/lib/images/adapter";
import { stripImageMetadata } from "@/lib/images/stripMetadata";
import { mapWithConcurrency } from "@/lib/utils/concurrency";

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;
const UPLOAD_CONCURRENCY = 8;

export type ScannedImage = { sourcePath: string; manifestKey: string };

export type ImageSyncProgress =
  | { type: "scanned"; total: number }
  | { type: "file"; manifestKey: string; index: number; total: number; uploaded: boolean }
  | { type: "file-failed"; manifestKey: string; index: number; total: number; error: string };

export type ImageSyncResult = {
  total: number;
  uploaded: number;
  skipped: number;
  stripped: number;
  purged: number;
  manifest: Record<string, string>;
  // The scan result is returned so callers that need the file list (the CLI's
  // advisory quality checks) don't walk the content tree a second time.
  images: ScannedImage[];
  failures: Array<{ manifestKey: string; error: string }>;
};

export type ImageSyncOptions = {
  adapter: ImageStorageAdapter;
  contentItemsDir: string;
  manifestPath: string;
  checksumsPath: string;
  onProgress?: (progress: ImageSyncProgress) => void;
};

export function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

export async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Scan a directory tree for image files; underscore-prefixed dirs are skipped. */
export async function scanImages(root: string): Promise<ScannedImage[]> {
  const results: ScannedImage[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith("_")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (IMAGE_EXT.test(entry.name)) {
        results.push({
          sourcePath: fullPath,
          manifestKey: path.relative(root, fullPath).replace(/\\/g, "/"),
        });
      }
    }
  }

  await walk(root);
  results.sort((a, b) => a.manifestKey.localeCompare(b.manifestKey));
  return results;
}

type SyncOutcome = {
  manifestKey: string;
  manifestUrl: string;
  uploaded: boolean;
  stripped: boolean;
  error?: string;
};

export async function syncImagesToCdn(options: ImageSyncOptions): Promise<ImageSyncResult> {
  const { adapter, contentItemsDir, manifestPath, checksumsPath, onProgress } = options;

  const savedChecksums = await loadJson<Record<string, string>>(checksumsPath, {});
  adapter.loadChecksums(savedChecksums);

  const existingManifest = await loadJson<Record<string, string>>(manifestPath, {});
  const images = await scanImages(contentItemsDir);
  onProgress?.({ type: "scanned", total: images.length });

  let completed = 0;

  // Each worker returns its outcome rather than mutating shared state, so
  // concurrent closures cannot race. Per-file failures are isolated: one
  // unreadable photo or transient CDN error must never discard the whole batch.
  const outcomes = await mapWithConcurrency(
    images,
    UPLOAD_CONCURRENCY,
    async ({ sourcePath, manifestKey }): Promise<SyncOutcome> => {
      try {
        const checksum = await sha256(sourcePath);
        const isNewOrChanged = savedChecksums[manifestKey] !== checksum;

        let body: Buffer | undefined;
        let stripped = false;
        if (isNewOrChanged) {
          const original = await fsPromises.readFile(sourcePath);
          const ext = path.extname(sourcePath).slice(1);
          body = await stripImageMetadata(original, ext);
          stripped = ext.toLowerCase() !== "gif";
        }

        const url = await adapter.syncImage(sourcePath, manifestKey, checksum, body);

        completed++;
        // "" is the Vercel Blob skip signal: unchanged, keep the existing URL.
        const resolvedUrl = url === "" ? (existingManifest[manifestKey] ?? "") : url;
        const uploaded = url !== "" && isNewOrChanged;
        onProgress?.({
          type: "file",
          manifestKey,
          index: completed,
          total: images.length,
          uploaded,
        });
        return {
          manifestKey,
          manifestUrl: resolvedUrl,
          uploaded,
          stripped: uploaded ? stripped : false,
        };
      } catch (err: unknown) {
        completed++;
        const error = err instanceof Error ? err.message : String(err);
        onProgress?.({
          type: "file-failed",
          manifestKey,
          index: completed,
          total: images.length,
          error,
        });
        return {
          manifestKey,
          manifestUrl: existingManifest[manifestKey] ?? "",
          uploaded: false,
          stripped: false,
          error,
        };
      }
    },
  );

  const manifest: Record<string, string> = {};
  let uploaded = 0;
  let skipped = 0;
  let stripped = 0;
  const failures: Array<{ manifestKey: string; error: string }> = [];

  for (const outcome of outcomes) {
    if (outcome.error !== undefined) {
      failures.push({ manifestKey: outcome.manifestKey, error: outcome.error });
      // Keep an entry only if a prior good URL was preserved — never write an
      // empty URL for a file that has never uploaded successfully.
      if (outcome.manifestUrl) manifest[outcome.manifestKey] = outcome.manifestUrl;
      continue;
    }
    manifest[outcome.manifestKey] = outcome.manifestUrl;
    if (outcome.uploaded) uploaded++;
    else skipped++;
    if (outcome.stripped) stripped++;
  }

  const activeKeys = new Set(images.map((i) => i.manifestKey));
  const purged = Object.keys(existingManifest).filter((k) => !activeKeys.has(k)).length;

  await writeJson(manifestPath, manifest);
  await writeJson(checksumsPath, adapter.getUpdatedChecksums());

  return {
    total: images.length,
    uploaded,
    skipped,
    stripped,
    purged,
    manifest,
    images,
    failures,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/imageSync.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Rewire the CLI to the extracted library**

In `scripts/sync-images.ts`: delete the local `sha256`, `scanImages`, `loadJson`, and `writeJson` definitions, import them from the new module, and replace the body of `runUpload` with the code below. `copyContactFiles`, `runQualityChecks`, and `printBackupReminder` stay exactly as they are.

```ts
import {
  loadJson,
  scanImages,
  syncImagesToCdn,
  writeJson,
} from "./lib/imageSync";
```

```ts
async function runUpload(): Promise<void> {
  const adapter = await createAdapter();

  if (!fs.existsSync(CONTENT_ITEMS)) {
    console.error("[upload-images] content/items/ not found — nothing to upload");
    process.exit(1);
  }

  const result = await syncImagesToCdn({
    adapter,
    contentItemsDir: CONTENT_ITEMS,
    manifestPath: MANIFEST_PATH,
    checksumsPath: CHECKSUMS_PATH,
  });

  // Copy QR codes: content/contact/ → public/contact/
  await copyContactFiles();

  // Advisory quality checks (never block the upload)
  const warnings = await runQualityChecks(result.images);

  const provider = siteConfig.imageStorage.provider;
  console.log(
    `[upload-images] provider=${provider}  uploaded=${result.uploaded}  skipped=${result.skipped}  failed=${result.failures.length}  purged=${result.purged}  total=${result.total}  warnings=${warnings.length}`,
  );
  if (result.uploaded > 0) {
    console.log(
      `  🔒 stripped EXIF/GPS metadata from ${result.stripped}/${result.uploaded} uploaded image(s)`,
    );
  }
  for (const w of warnings) console.warn(`  ⚠️  ${w}`);

  printBackupReminder();

  // Report per-file failures last (most visible) and exit non-zero — but only
  // after the manifest and checksum cache have been written, so successful
  // uploads in this run are never lost.
  if (result.failures.length > 0) {
    console.error(`\n[upload-images] ${result.failures.length} file(s) failed to upload:`);
    for (const f of result.failures) console.error(`  ✗ ${f.manifestKey}: ${f.error}`);
    console.error(
      `\nThe manifest was still written for the ${result.uploaded + result.skipped} successful file(s); ` +
        `re-run "pnpm upload-images" to retry the failed ones.`,
    );
    process.exit(1);
  }
}
```

- [ ] **Step 6: Verify the CLI still behaves identically**

Run: `pnpm upload-images`
Expected: the same `[upload-images] provider=… uploaded=… skipped=…` summary line as before the refactor, exit code 0, and `git diff --stat lib/generated/image-manifest.json` shows no change (nothing was edited, so every file is skipped).

- [ ] **Step 7: Run the full suite, type-check, and lint**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/imageSync.ts scripts/lib/imageSync.test.ts scripts/sync-images.ts
git commit -m "refactor: extract syncImagesToCdn from sync-images CLI"
```

---

### Task 3: Studio API — list items

Framework-independent handler with path-safety helpers. No Vite yet; tested by direct invocation.

**Files:**
- Create: `scripts/lib/studioApi.ts`
- Create: `scripts/lib/studioApi.test.ts`
- Test: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `isValidSlug` from `@/lib/utils/slug`; `loadAllItemsRaw` from `@/lib/content/loader`.
- Produces:

```ts
type StudioRequest = { method: string; url: string; body: Buffer; projectRoot: string };
type StudioResponse = { status: number; body: unknown };
type StudioItem = {
  id: string;               // "electronics/desk-lamp"
  categorySlug: string;
  itemSlug: string;
  name: string;
  status: string;
  currency: string;
  lowestTierAmount: number | null;
  imageCount: number;
};

class StudioError extends Error { constructor(status: number, message: string) }
resolveItemDir(projectRoot: string, category: string, name: string): string
handleStudioRequest(req: StudioRequest): Promise<StudioResponse>
listStudioItems(projectRoot: string): Promise<StudioItem[]>
```

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/studioApi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import path from "path";
import { handleStudioRequest, resolveItemDir, StudioError } from "./studioApi";

const PROJECT_ROOT = process.cwd();

describe("resolveItemDir", () => {
  it("resolves a valid category/item pair inside content/items", () => {
    const dir = resolveItemDir(PROJECT_ROOT, "electronics", "desk-lamp");
    expect(dir).toBe(path.join(PROJECT_ROOT, "content", "items", "electronics", "desk-lamp"));
  });

  it("rejects path traversal in the category", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "..", "desk-lamp")).toThrow(StudioError);
  });

  it("rejects path traversal in the item name", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "electronics", "../../etc")).toThrow(StudioError);
  });

  it("rejects uppercase and spaces", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "Electronics", "desk lamp")).toThrow(StudioError);
  });

  it("rejects an absolute path", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "electronics", "/etc/passwd")).toThrow(StudioError);
  });
});

describe("handleStudioRequest", () => {
  it("returns items for GET /api/items", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("404s an unknown route", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/nope",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(404);
  });

  it("405s a wrong method on a known route", async () => {
    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(405);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: FAIL — cannot resolve `./studioApi`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/studioApi.ts`:

```ts
// Seller Studio's HTTP surface, deliberately independent of any server
// framework: it takes a plain request description and returns a status plus a
// JSON-serialisable body, so it can be driven by the Vite middleware in
// studio/vite.config.ts and by Vitest without a running server.
//
// Every filesystem path derived from browser input passes two checks: the shared
// kebab-case slug allowlist (lib/utils/slug.ts) and a resolved-path containment
// assertion against content/items/. Both layers, because the allowlist may be
// relaxed later.

import fsPromises from "fs/promises";
import path from "path";
import { loadAllItemsRaw } from "@/lib/content/loader";
import { isValidSlug } from "@/lib/utils/slug";

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

export type StudioRequest = {
  method: string;
  url: string;
  body: Buffer;
  projectRoot: string;
};

export type StudioResponse = { status: number; body: unknown };

export type StudioItem = {
  id: string;
  categorySlug: string;
  itemSlug: string;
  name: string;
  status: string;
  currency: string;
  lowestTierAmount: number | null;
  imageCount: number;
};

export class StudioError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StudioError";
  }
}

export function resolveItemDir(projectRoot: string, category: string, name: string): string {
  if (!isValidSlug(category) || !isValidSlug(name)) {
    throw new StudioError(
      400,
      `category and item name must be kebab-case (lowercase letters, digits, hyphens): got "${category}/${name}"`,
    );
  }

  const itemsRoot = path.join(projectRoot, "content", "items");
  const dir = path.resolve(itemsRoot, category, name);
  const rel = path.relative(itemsRoot, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new StudioError(400, "resolved path escapes content/items");
  }
  return dir;
}

async function countImages(dir: string): Promise<number> {
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && IMAGE_EXT.test(e.name)).length;
  } catch {
    return 0;
  }
}

export async function listStudioItems(projectRoot: string): Promise<StudioItem[]> {
  // loadAllItemsRaw applies no visibility filter, which is exactly what the
  // seller needs to see: drafts, pending, and sold items included. Reading
  // through the loader also guarantees studio shows the same parse result the
  // site build will produce.
  //
  // Note: the loader resolves content/ from process.cwd(), not from projectRoot.
  // That is correct here because `pnpm studio` always runs from the repo root, so
  // cwd and projectRoot are the same directory. projectRoot is still threaded
  // through every write path, where it is what makes the containment check
  // meaningful and the tests sandboxable.
  const items = await loadAllItemsRaw();

  return Promise.all(
    items.map(async (item) => {
      const dir = resolveItemDir(projectRoot, item.categorySlug, item.itemSlug);
      const amounts = item.price.tiers.map((t) => t.amount);
      return {
        id: `${item.categorySlug}/${item.itemSlug}`,
        categorySlug: item.categorySlug,
        itemSlug: item.itemSlug,
        name: item.name,
        status: item.status,
        currency: item.price.currency,
        lowestTierAmount: amounts.length > 0 ? Math.min(...amounts) : null,
        imageCount: await countImages(dir),
      } satisfies StudioItem;
    }),
  );
}

export async function handleStudioRequest(req: StudioRequest): Promise<StudioResponse> {
  const pathname = req.url.split("?")[0] ?? "";

  try {
    if (pathname === "/api/items") {
      if (req.method !== "GET") {
        return { status: 405, body: { error: "GET only" } };
      }
      return { status: 200, body: { items: await listStudioItems(req.projectRoot) } };
    }

    return { status: 404, body: { error: `no route for ${pathname}` } };
  } catch (err: unknown) {
    if (err instanceof StudioError) {
      return { status: err.status, body: { error: err.message } };
    }
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Type-check, lint, commit**

Run: `pnpm type-check && pnpm lint`

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: add studio API handler with GET /api/items"
```

---

### Task 4: `pnpm studio` — Vite shell and read-only item table

First runnable studio. Delivers spec §14's palette and type on a read-only table.

**Files:**
- Create: `scripts/studio.ts`, `studio/vite.config.ts`, `studio/index.html`, `studio/src/main.tsx`, `studio/src/tokens.css`, `studio/src/api.ts`, `studio/src/App.tsx`, `studio/src/panes/ItemList.tsx`
- Modify: `package.json` (scripts + devDependencies)

**Interfaces:**
- Consumes: `handleStudioRequest`, `StudioItem` from `scripts/lib/studioApi.ts`.
- Produces: `fetchItems(): Promise<StudioItem[]>` in `studio/src/api.ts`; `<ItemList items selectedIds onToggle />` in `studio/src/panes/ItemList.tsx`.

- [ ] **Step 1: Install the dev dependencies**

Run:
```bash
pnpm add -D vite @vitejs/plugin-react @fontsource/courier-prime @fontsource/ibm-plex-sans @fontsource/archivo-narrow
```
Expected: all five land in `devDependencies`; nothing enters `dependencies` (the published site must not grow).

- [ ] **Step 2: Add the `studio` script**

In `package.json`, add to `"scripts"` immediately after `"setup-ui"`:

```json
    "studio": "tsx scripts/studio.ts",
```

- [ ] **Step 3: Write the entry script**

Create `scripts/studio.ts`:

```ts
// Usage: pnpm studio [--port 5200]
// Starts Seller Studio: a local-only dashboard for managing content/.
// Binds 127.0.0.1 only — this server writes files, holds CDN credentials, and
// runs git, so it must never be reachable from the network.

import path from "path";
import { createRequire } from "module";

const DEFAULT_PORT = 5174;
const require = createRequire(import.meta.url);

function assertViteInstalled(): void {
  try {
    require.resolve("vite");
  } catch {
    console.error(
      "Error: vite is not installed.\n" +
        "  Seller Studio ships as a dev dependency. Run `pnpm install` first, then `pnpm studio`.",
    );
    process.exit(1);
  }
}

function parsePort(args: string[]): number {
  const idx = args.indexOf("--port");
  if (idx === -1) return DEFAULT_PORT;

  const port = Number(args[idx + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error(`Error: --port must be an integer between 1024 and 65535. Got: "${args[idx + 1]}"`);
    process.exit(1);
  }
  return port;
}

async function main(): Promise<void> {
  assertViteInstalled();

  const port = parsePort(process.argv.slice(2));
  const { createServer } = await import("vite");

  const server = await createServer({
    configFile: path.join(process.cwd(), "studio", "vite.config.ts"),
    server: { host: "127.0.0.1", port },
  });

  await server.listen();
  console.log(
    `\n  Seller Studio  →  http://127.0.0.1:${port}\n` +
      `  Local only — not reachable from your network.\n` +
      `  Press Ctrl+C to stop.\n`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Write the Vite config with the API middleware**

Create `studio/vite.config.ts`:

```ts
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleStudioRequest } from "../scripts/lib/studioApi";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(studioDir, "..");

// One port for both the frontend and the API: no CORS, no second process to
// manage, one terminal to close.
function studioApiPlugin(): Plugin {
  return {
    name: "studio-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          void handleStudioRequest({
            method: req.method ?? "GET",
            url: req.url ?? "",
            body: Buffer.concat(chunks),
            projectRoot,
          })
            .then((result) => {
              res.statusCode = result.status;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result.body));
            })
            .catch((err: unknown) => {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
              );
            });
        });
      });
    },
  };
}

export default defineConfig({
  root: studioDir,
  // Local tool: never expose the write/git/CDN surface to the network.
  server: { host: "127.0.0.1", port: 5174 },
  plugins: [react(), studioApiPlugin()],
  resolve: { alias: { "@": projectRoot } },
});
```

- [ ] **Step 5: Write the HTML entry and design tokens**

Create `studio/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Seller Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `studio/src/tokens.css`:

```css
/* Spec §14.2–14.3. Fonts are bundled from @fontsource packages so studio works
   with no network. Palette is the carbon-copy consignment form: cool grey-blue
   paper, cool pen ink, and stamp red reserved exclusively for `sold`. */

@import "@fontsource/courier-prime/400.css";
@import "@fontsource/courier-prime/700.css";
@import "@fontsource/ibm-plex-sans/400.css";
@import "@fontsource/ibm-plex-sans/500.css";
@import "@fontsource/archivo-narrow/600.css";

:root {
  --carbon-pale: #e4ebef;
  --carbon-rule: #c2cfd6;
  --ink: #1b2a35;
  --ink-soft: #5c6e7a;
  --stamp: #b3241e;
  --pending: #8a6a12;

  --font-data: "Courier Prime", ui-monospace, monospace;
  --font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --font-head: "Archivo Narrow", var(--font-ui);

  --step-0: 0.875rem;
  --step-1: 1rem;
  --step-2: 1.25rem;
  --gap: 0.75rem;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--carbon-pale);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--step-0);
}

:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.studio-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--gap);
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--carbon-rule);
}

.studio-head h1 {
  margin: 0;
  font-family: var(--font-head);
  font-size: var(--step-2);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.studio-head .counts {
  font-family: var(--font-data);
  color: var(--ink-soft);
}

.item-table {
  width: 100%;
  border-collapse: collapse;
}

.item-table th {
  font-family: var(--font-head);
  font-weight: 600;
  font-size: var(--step-0);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  color: var(--ink-soft);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--carbon-rule);
}

.item-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--carbon-rule);
}

.item-table td.data {
  font-family: var(--font-data);
}

.status-sold {
  color: var(--stamp);
  font-family: var(--font-head);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-pending {
  color: var(--pending);
}

/* Narrow screens: the table collapses to stacked cards. */
@media (max-width: 40rem) {
  .item-table thead {
    display: none;
  }
  .item-table tr {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem var(--gap);
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--carbon-rule);
  }
  .item-table td {
    border: 0;
    padding: 0;
  }
}
```

- [ ] **Step 6: Write the React shell**

Create `studio/src/api.ts`:

```ts
// Type-only import: studioApi.ts pulls in the content loader and node:fs, which
// must never reach the browser bundle. `import type` is erased at compile time,
// so this shares the types without shipping the module.
import type { StudioItem } from "../../scripts/lib/studioApi";

export type { StudioItem };

export async function fetchItems(): Promise<StudioItem[]> {
  const res = await fetch("/api/items");
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `GET /api/items failed with ${res.status}`);
  }
  const body = (await res.json()) as { items: StudioItem[] };
  return body.items;
}
```

Create `studio/src/panes/ItemList.tsx`:

```tsx
import type { StudioItem } from "../api";

function formatPrice(item: StudioItem): string {
  if (item.lowestTierAmount === null) return "—";
  return `${item.currency || "$"}${item.lowestTierAmount.toFixed(2)}`;
}

function StatusCell({ status }: { status: string }) {
  if (status === "sold") return <span className="status-sold">sold</span>;
  if (status === "pending") return <span className="status-pending">pending</span>;
  return <span>{status}</span>;
}

export function ItemList({ items }: { items: StudioItem[] }) {
  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Category</th>
          <th scope="col">Status</th>
          <th scope="col">Price</th>
          <th scope="col">Images</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.name}</td>
            <td className="data">{item.categorySlug}</td>
            <td>
              <StatusCell status={item.status} />
            </td>
            <td className="data">{formatPrice(item)}</td>
            <td className="data">{item.imageCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `studio/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchItems, type StudioItem } from "./api";
import { ItemList } from "./panes/ItemList";

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <header className="studio-head">
        <h1>Seller Studio</h1>
        <span className="counts">content/ · {items.length} items</span>
      </header>
      {/* An error tells the seller what happened and how to fix it. */}
      {error !== null && <p role="alert">Could not read content/: {error}</p>}
      {error === null && items.length === 0 && (
        <p>No items yet. Run `pnpm create-item &lt;category&gt;/&lt;name&gt;` to add the first one.</p>
      )}
      {items.length > 0 && <ItemList items={items} />}
    </>
  );
}
```

Create `studio/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./tokens.css";

const root = document.getElementById("root");
if (root === null) throw new Error("#root not found in studio/index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Verify studio runs**

Run: `pnpm studio`
Expected: prints `Seller Studio → http://127.0.0.1:5174`. Open it: the header shows the item count, the table lists every item in `content/` including drafts and sold, prices are monospaced, `sold` renders in stamp red. Stop with Ctrl+C.

- [ ] **Step 8: Verify the binding is local-only**

Run (in a second terminal, with `pnpm studio` running): `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5174/api/items`
Expected: `200`.

Run: `ifconfig | grep "inet " | grep -v 127.0.0.1` to find your LAN IP, then `curl -sS --max-time 3 http://<lan-ip>:5174/api/items`
Expected: connection refused or timeout — the server must not answer on the LAN address.

- [ ] **Step 9: Verify the static export is unaffected**

Run: `pnpm build`
Expected: succeeds, and `grep -r "Seller Studio" out/ | head` returns nothing.

- [ ] **Step 10: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add package.json pnpm-lock.yaml scripts/studio.ts studio/
git commit -m "feat: add pnpm studio with read-only item table"
```

---

### Task 5: Bulk status API

**Files:**
- Modify: `scripts/lib/studioApi.ts` (add the route + handler)
- Modify: `scripts/lib/studioApi.test.ts` (add the cases below)

**Interfaces:**
- Consumes: `applyFieldEdits` from `./itemEdit`; `resolveItemDir`, `StudioError` from itself.
- Produces:

```ts
type BulkStatusResult = {
  ok: number;
  failed: Array<{ id: string; error: string }>;
};
// POST /api/items/bulk-status
// body: { ids: string[], status: "available" | "pending" | "reserved" | "sold" | "draft" }
```

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/studioApi.test.ts`:

```ts
import fs from "fs/promises";
import os from "os";
import { beforeEach, afterEach } from "vitest";

const ITEM_JSON = `{
  "name": "Desk lamp",
  // options: available | pending | reserved | sold | draft
  "status": "available",
  "sold_date": null,
  "reserved_for": "alice@example.com"
}
`;

let sandbox: string;

async function seedItem(id: string): Promise<void> {
  const dir = path.join(sandbox, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), ITEM_JSON);
}

async function readItemJson(id: string): Promise<string> {
  return fs.readFile(path.join(sandbox, "content", "items", ...id.split("/"), "item.json"), "utf-8");
}

function bulkStatus(ids: string[], status: string) {
  return handleStudioRequest({
    method: "POST",
    url: "/api/items/bulk-status",
    body: Buffer.from(JSON.stringify({ ids, status })),
    projectRoot: sandbox,
  });
}

describe("POST /api/items/bulk-status", () => {
  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it("marks several items sold and stamps sold_date", async () => {
    await seedItem("electronics/desk-lamp");
    await seedItem("books/cs61a");

    const res = await bulkStatus(["electronics/desk-lamp", "books/cs61a"], "sold");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: 2, failed: [] });
    const text = await readItemJson("books/cs61a");
    expect(text).toContain('"status": "sold"');
    expect(text).toMatch(/"sold_date": "\d{4}-\d{2}-\d{2}"/);
  });

  it("preserves comments and reserved_for", async () => {
    await seedItem("electronics/desk-lamp");
    await bulkStatus(["electronics/desk-lamp"], "sold");
    const text = await readItemJson("electronics/desk-lamp");
    expect(text).toContain("// options: available | pending | reserved | sold | draft");
    expect(text).toContain('"reserved_for": "alice@example.com"');
  });

  it("clears sold_date when moving off sold", async () => {
    await seedItem("electronics/desk-lamp");
    await bulkStatus(["electronics/desk-lamp"], "sold");
    await bulkStatus(["electronics/desk-lamp"], "available");
    const text = await readItemJson("electronics/desk-lamp");
    expect(text).toContain('"sold_date": null');
  });

  it("reports per-item failures without discarding successes", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await bulkStatus(["electronics/desk-lamp", "books/missing"], "sold");

    expect(res.status).toBe(200);
    const body = res.body as { ok: number; failed: Array<{ id: string; error: string }> };
    expect(body.ok).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]?.id).toBe("books/missing");
    expect(await readItemJson("electronics/desk-lamp")).toContain('"status": "sold"');
  });

  it("rejects an unknown status without touching any file", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await bulkStatus(["electronics/desk-lamp"], "liquidated");
    expect(res.status).toBe(400);
    expect(await readItemJson("electronics/desk-lamp")).toContain('"status": "available"');
  });

  it("rejects a traversal id", async () => {
    const res = await bulkStatus(["../../etc/passwd"], "sold");
    const body = res.body as { ok: number; failed: Array<{ id: string }> };
    expect(body.ok).toBe(0);
    expect(body.failed[0]?.id).toBe("../../etc/passwd");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: FAIL — bulk-status returns 404.

- [ ] **Step 3: Write the implementation**

In `scripts/lib/studioApi.ts`, add these imports:

```ts
import { z } from "zod";
import { applyFieldEdits } from "./itemEdit";
```

Add above `handleStudioRequest`:

```ts
// Input validation deliberately does NOT reuse itemJsonSchema's field schemas:
// several of them carry .catch(...) (see lib/content/schema.ts:126-131), so
// safeParse("liquidated") would *succeed* and silently yield "available". An
// explicit enum is the only way to reject bad input here.
const bulkStatusBodySchema = z.object({
  ids: z.array(z.string()).min(1),
  status: z.enum(["available", "pending", "reserved", "sold", "draft"]),
});

export type BulkStatusResult = {
  ok: number;
  failed: Array<{ id: string; error: string }>;
};

function parseJsonBody<T>(body: Buffer, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(body.toString("utf-8"));
  } catch {
    throw new StudioError(400, "request body is not valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StudioError(400, parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
}

async function applyStatus(
  projectRoot: string,
  id: string,
  status: string,
  today: string,
): Promise<void> {
  const slashIdx = id.indexOf("/");
  if (slashIdx === -1) throw new StudioError(400, `id must be "<category>/<item>": got "${id}"`);

  const dir = resolveItemDir(projectRoot, id.slice(0, slashIdx), id.slice(slashIdx + 1));
  const jsonPath = path.join(dir, "item.json");
  const text = await fsPromises.readFile(jsonPath, "utf-8");

  // sold_date is bound to status: entering sold stamps today, leaving sold
  // clears it, so the two fields can never disagree.
  const next = applyFieldEdits(text, [
    { path: ["status"], value: status },
    { path: ["sold_date"], value: status === "sold" ? today : null },
  ]);

  await fsPromises.writeFile(jsonPath, next, "utf-8");
}

async function handleBulkStatus(req: StudioRequest): Promise<StudioResponse> {
  const { ids, status } = parseJsonBody(req.body, bulkStatusBodySchema);
  const today = new Date().toISOString().slice(0, 10);

  // Each item is written independently and failures are reported per item. No
  // rollback: undoing half-written files can itself fail, and the successful
  // writes are work the seller does not want discarded. Matches the failure
  // philosophy in imageSync.ts.
  const result: BulkStatusResult = { ok: 0, failed: [] };

  for (const id of ids) {
    try {
      await applyStatus(req.projectRoot, id, status, today);
      result.ok++;
    } catch (err: unknown) {
      result.failed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { status: 200, body: result };
}
```

Then add the route inside `handleStudioRequest`'s `try` block, before the 404 return:

```ts
    if (pathname === "/api/items/bulk-status") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return handleBulkStatus(req);
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Confirm no regression in the CLI path**

Run: `pnpm test`
Expected: all suites green, including `markSold.test.ts`.

- [ ] **Step 6: Type-check, lint, commit**

Run: `pnpm type-check && pnpm lint`

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: add bulk status endpoint with per-item failure reporting"
```

---

### Task 6: Bulk selection UI and the SOLD stamp

Spec §14.5's signature element. This is the one bold moment; everything around it stays quiet.

**Files:**
- Modify: `studio/src/api.ts` (add `bulkStatus`)
- Modify: `studio/src/App.tsx` (selection state, refetch, failure display)
- Modify: `studio/src/panes/ItemList.tsx` (checkboxes, stamp)
- Create: `studio/src/panes/BulkToolbar.tsx`
- Modify: `studio/src/tokens.css` (stamp + toolbar styles)

**Interfaces:**
- Consumes: `POST /api/items/bulk-status` from Task 5; `BulkStatusResult` type.
- Produces: `bulkStatus(ids: string[], status: string): Promise<BulkStatusResult>`; `<BulkToolbar count onApply onClear />`.

- [ ] **Step 1: Add the API wrapper**

In `studio/src/api.ts`, extend the existing type-only import to
`import type { BulkStatusResult, StudioItem } from "../../scripts/lib/studioApi";`
and the existing re-export to `export type { BulkStatusResult, StudioItem };`
(one import line per module — do not add a second one). Then append:

```ts
export async function bulkStatus(ids: string[], status: string): Promise<BulkStatusResult> {
  const res = await fetch("/api/items/bulk-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids, status }),
  });
  const body = (await res.json()) as BulkStatusResult & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `bulk status failed with ${res.status}`);
  return body;
}
```

- [ ] **Step 2: Add the stamp and toolbar styles**

Append to `studio/src/tokens.css`:

```css
/* §14.5 — the SOLD rubber stamp is the one bold element in studio. It presses
   onto rows the seller just marked sold, then the row settles. Everything around
   it stays quiet: no decorative radii, no gradients, no stacked shadows. */

.stamp {
  display: inline-block;
  padding: 0.05em 0.35em;
  border: 2px solid var(--stamp);
  color: var(--stamp);
  font-family: var(--font-head);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transform: rotate(-4deg);
  /* Uneven ink: the edge breaks up where a real stamp lifts off the paper. */
  mask-image: radial-gradient(circle at 30% 40%, #000 78%, transparent 100%);
}

.stamp-press {
  animation: stamp-press 260ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
}

@keyframes stamp-press {
  0% {
    transform: rotate(-4deg) scale(1.6);
    opacity: 0;
  }
  60% {
    transform: rotate(-4deg) scale(0.96);
    opacity: 1;
  }
  100% {
    transform: rotate(-4deg) scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stamp-press {
    animation: none;
  }
}

.bulk-toolbar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--gap);
  padding: 0.625rem 1rem;
  background: var(--carbon-pale);
  border-top: 1px solid var(--carbon-rule);
}

.bulk-toolbar .count {
  font-family: var(--font-data);
  color: var(--ink-soft);
}

.bulk-toolbar button {
  font-family: var(--font-ui);
  font-size: var(--step-0);
  padding: 0.3rem 0.7rem;
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--ink);
  cursor: pointer;
}

.bulk-toolbar button:hover {
  color: var(--carbon-pale);
  background: var(--ink);
}

tr.failed td {
  box-shadow: inset 3px 0 0 var(--stamp);
}
```

- [ ] **Step 3: Write the toolbar**

Create `studio/src/panes/BulkToolbar.tsx`:

```tsx
// Actions keep the same name from button to result: "Mark sold" produces rows
// that read "sold". One job per control.
const ACTIONS: Array<{ label: string; status: string }> = [
  { label: "Mark sold", status: "sold" },
  { label: "Mark pending", status: "pending" },
  { label: "Mark available", status: "available" },
  { label: "Move to draft", status: "draft" },
];

export function BulkToolbar({
  count,
  busy,
  onApply,
  onClear,
}: {
  count: number;
  busy: boolean;
  onApply: (status: string) => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
      <span className="count">{count} selected</span>
      {ACTIONS.map((action) => (
        <button
          key={action.status}
          type="button"
          disabled={busy}
          onClick={() => onApply(action.status)}
        >
          {action.label}
        </button>
      ))}
      <button type="button" onClick={onClear} disabled={busy}>
        Clear selection
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add checkboxes and stamp rendering to the table**

Replace `studio/src/panes/ItemList.tsx` with:

```tsx
import type { StudioItem } from "../api";

function formatPrice(item: StudioItem): string {
  if (item.lowestTierAmount === null) return "—";
  return `${item.currency || "$"}${item.lowestTierAmount.toFixed(2)}`;
}

function StatusCell({ status, pressed }: { status: string; pressed: boolean }) {
  if (status === "sold") {
    return <span className={pressed ? "stamp stamp-press" : "stamp"}>sold</span>;
  }
  if (status === "pending") return <span className="status-pending">pending</span>;
  return <span>{status}</span>;
}

export function ItemList({
  items,
  selectedIds,
  failedIds,
  justStampedIds,
  onToggle,
  onToggleAll,
}: {
  items: StudioItem[];
  selectedIds: Set<string>;
  failedIds: Set<string>;
  justStampedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label="Select all items"
            />
          </th>
          <th scope="col">Name</th>
          <th scope="col">Category</th>
          <th scope="col">Status</th>
          <th scope="col">Price</th>
          <th scope="col">Images</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className={failedIds.has(item.id) ? "failed" : undefined}>
            <td>
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => onToggle(item.id)}
                aria-label={`Select ${item.name}`}
              />
            </td>
            <td>{item.name}</td>
            <td className="data">{item.categorySlug}</td>
            <td>
              <StatusCell status={item.status} pressed={justStampedIds.has(item.id)} />
            </td>
            <td className="data">{formatPrice(item)}</td>
            <td className="data">{item.imageCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Wire selection, apply, and refetch in the shell**

Replace `studio/src/App.tsx` with:

```tsx
import { useCallback, useEffect, useState } from "react";
import { bulkStatus, fetchItems, type StudioItem } from "./api";
import { BulkToolbar } from "./panes/BulkToolbar";
import { ItemList } from "./panes/ItemList";

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [justStampedIds, setJustStampedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Studio keeps no local copy of item state: after any write it re-reads the
  // full list, so the table can never drift from what is on disk.
  const refresh = useCallback(async () => {
    setItems(await fetchItems());
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(items.map((i) => i.id)) : new Set());
    },
    [items],
  );

  async function apply(status: string) {
    const ids = [...selectedIds];
    setBusy(true);
    setError(null);
    try {
      const result = await bulkStatus(ids, status);
      const failed = new Set(result.failed.map((f) => f.id));
      setFailedIds(failed);
      // Failed rows stay selected so the seller can retry them directly.
      setSelectedIds(failed);
      setJustStampedIds(
        status === "sold" ? new Set(ids.filter((id) => !failed.has(id))) : new Set(),
      );
      await refresh();
      if (result.failed.length > 0) {
        setError(
          `${result.failed.length} of ${ids.length} items could not be updated: ` +
            result.failed.map((f) => `${f.id} (${f.error})`).join(", "),
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="studio-head">
        <h1>Seller Studio</h1>
        <span className="counts">content/ · {items.length} items</span>
      </header>
      {error !== null && <p role="alert">{error}</p>}
      {error === null && items.length === 0 && (
        <p>No items yet. Run `pnpm create-item &lt;category&gt;/&lt;name&gt;` to add the first one.</p>
      )}
      {items.length > 0 && (
        <ItemList
          items={items}
          selectedIds={selectedIds}
          failedIds={failedIds}
          justStampedIds={justStampedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}
      <BulkToolbar
        count={selectedIds.size}
        busy={busy}
        onApply={(status) => void apply(status)}
        onClear={() => setSelectedIds(new Set())}
      />
    </>
  );
}
```

- [ ] **Step 6: Verify by hand**

Run: `pnpm studio`, then in the browser:
1. Select two available items → the toolbar appears reading "2 selected".
2. Click **Mark sold** → both rows show the rotated SOLD stamp with a single press animation; the table refetches.
3. Confirm on disk: `git diff content/` shows only `status` and `sold_date` changed, comments intact, any `reserved_for` untouched.
4. Select those two rows again → **Mark available** → `sold_date` returns to `null`.
5. Tab through the page: every checkbox and button shows a visible focus ring.
6. Enable "Reduce motion" in macOS System Settings → Accessibility → Display, mark another item sold → the stamp appears with no animation.
7. Narrow the window below 640px → the table collapses to stacked rows with no horizontal page scroll.

- [ ] **Step 7: Revert the manual test edits**

Run: `git checkout content/` (only if the items you toggled were test subjects — keep real status changes).

- [ ] **Step 8: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add studio/
git commit -m "feat: add bulk selection UI with SOLD stamp"
```

---

## Part 1 Definition of Done

- `pnpm studio` lists every item in `content/`, including drafts and sold.
- Bulk status changes write `status` + `sold_date` while preserving comments and `reserved_for`.
- Partial failures are reported per item; successful writes always land.
- `pnpm upload-images` and `pnpm mark-sold` behave exactly as before.
- `pnpm build` output contains no studio code.
- `pnpm test`, `pnpm type-check`, `pnpm lint` all clean.

## Deferred to Part 2

Image upload / reorder / delete / R2 push (with the SSE progress stream and the sync mutex), the item create + edit form, the publish pane, `TEMPLATE_PATHS` distribution, and the bilingual documentation updates (spec §11–12). Part 2 is planned after Part 1 is merged, so its tasks can build on the real API surface rather than a predicted one.
