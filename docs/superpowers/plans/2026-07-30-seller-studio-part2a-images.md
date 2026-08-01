# Seller Studio — Implementation Plan, Part 2A (Images)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the seller drag photos into the browser, reorder and delete them, and push them to the CDN with live progress — without leaving `pnpm studio`.

**Architecture:** `StudioResponse` grows from a JSON-only shape into a three-variant union (JSON, file, SSE event stream), so `scripts/lib/studioApi.ts` stays framework-independent while the Vite middleware learns to serve binary and streamed responses. Uploads travel one photo per request as base64 inside JSON, which keeps the Part 1 CSRF guard's "application/json only" invariant intact. Image order lives in filename prefixes, because the site loader derives order by sorting filenames.

**Tech Stack:** TypeScript, Vite 8 + `@vitejs/plugin-react`, React 19, Vitest, `jsonc-parser`, `@fontsource` fonts. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-29-seller-studio-design.md` (+ `_zh`) — §6 (API surface), §7 (image pane, filename-prefix ordering), §8 (sync mutex, SSE), §9 (image type validation).

**Builds on:** `docs/superpowers/plans/2026-07-30-seller-studio-part1.md` (merged as PR #1). Part 2B covers the item create/edit form, the publish pane, `TEMPLATE_PATHS` distribution, and the bilingual documentation.

## Global Constraints

- Studio code lives in `studio/` and `scripts/`. **Never add files to `app/`** (Iron Rule 3).
- Studio writes only under `content/`, plus `lib/generated/image-manifest.json` and `.image-cache/` (Iron Rule 1, 5).
- `reserved_for` must survive every edit, must never be written, and must never appear in a response (Iron Rule 4).
- The dev server binds `127.0.0.1` only, never `0.0.0.0`.
- **No new `content/config.ts` fields** — Part 1 introduced none and Part 2A introduces none, so Iron Rule 8 stays out of play.
- Every filesystem path derived from browser input passes **both** layers: a character allowlist *and* a resolved-path containment assertion against `content/items/`.
- **The CSRF guard's contract is load-bearing: every non-GET/HEAD request must be `content-type: application/json`.** `multipart/form-data`, `application/x-www-form-urlencoded`, and `text/plain` are CORS-simple content types that page script can forge cross-origin — that is exactly the hole `studio/csrfGuard.ts` closes. Do not relax it to accept a file upload.
- Bulk and batch operations do not roll back. Each unit is written independently and failures are reported per unit; successful work always lands.
- Image order is expressed as a numeric filename prefix, because `lib/content/loader.ts:50-56` sorts filenames case-insensitively to build `item.images`. Order held only in frontend state would not survive a build.
- `pnpm lint` runs with `--max-warnings 0`: an unused import is a hard failure.
- Tests run with `pnpm test` (Vitest, `environment: "node"`, `@` aliased to the repo root).
- React components get **no unit tests** (spec §10).
- Modules reachable from `studio/vite.config.ts`'s import graph must use **relative imports, not the `@/…` alias** — Vite's config bundler does not honour tsconfig paths and prints "Module not found" boxes on every start. This binds `scripts/lib/studioApi.ts`, `scripts/lib/itemEdit.ts`, `lib/content/loader.ts`, and every new module in this plan.
- **Keep `sharp` and `@aws-sdk/client-s3` out of the Vite config graph.** `scripts/lib/imageSync.ts` statically imports `stripImageMetadata` (which pulls `sharp`), and the R2 adapter pulls the S3 SDK. Nothing reachable from `studio/vite.config.ts` may import either — Task 5 injects the sync runner from `scripts/studio.ts` instead, which runs under tsx and resolves them natively.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `scripts/lib/studioImages.ts` | Image filename validation, listing, writing, deleting, and prefix-renaming. No HTTP, no printing. |
| `scripts/lib/studioImages.test.ts` | Filename rules, magic-byte sniffing, reorder collision handling. |
| `scripts/lib/loadEnv.ts` | `.env.local` parsing, extracted from `sync-images.ts` so `pnpm studio` can load `CF_R2_*` too. |
| `scripts/lib/studioSync.ts` | The sync mutex, the injected-runner registry, and the SSE event generator. Imports no adapter and no `sharp`. |
| `scripts/lib/studioSync.test.ts` | Mutex held and released (including on throw and on abandonment); events stream in order; failures surface as an event. |
| `studio/src/panes/ImagePane.tsx` | Drop zone, thumbnail grid with drag reorder, per-image delete. |
| `studio/src/panes/SyncBar.tsx` | The "Push to CDN" control and its progress readout. |

**Modified:**

| File | Change |
|---|---|
| `scripts/lib/studioApi.ts` | `StudioResponse` becomes a union; five image routes plus the sync route added. |
| `scripts/lib/studioApi.test.ts` | Route-level tests for the new endpoints. |
| `scripts/sync-images.ts` | Uses the extracted `.env.local` loader instead of its private copy. |
| `scripts/studio.ts` | Loads `.env.local` and registers the sync runner before the server starts. |
| `studio/vite.config.ts` | Serve the file and SSE response variants; cap the request body; guard against double-responding. |
| `studio/src/api.ts` | Typed wrappers for the new endpoints, including the SSE reader. |
| `studio/src/App.tsx` | Selecting a single row opens the image drawer. |
| `studio/src/tokens.css` | Drawer, drop zone, thumbnail grid, progress styles. |

---

### Task 1: Response variants and a safer middleware

Foundation. No new seller-visible behaviour; every later task depends on it.

**Files:**
- Modify: `scripts/lib/studioApi.ts` (the `StudioResponse` type and `handleStudioRequest`'s return sites)
- Modify: `studio/vite.config.ts` (the middleware body)
- Test: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `StudioError`, `handleStudioRequest` from Part 1.
- Produces:

```ts
type SseEvent = { event: string; data: unknown };

type StudioResponse =
  | { status: number; body: unknown }                                   // JSON — the Part 1 shape
  | { status: number; file: string; contentType: string }               // stream a file from disk
  | { status: number; events: AsyncIterable<SseEvent> };                // server-sent events

function isFileResponse(r: StudioResponse): r is { status: number; file: string; contentType: string }
function isSseResponse(r: StudioResponse): r is { status: number; events: AsyncIterable<SseEvent> }
```

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/studioApi.test.ts`:

```ts
import { isFileResponse, isSseResponse } from "./studioApi";

describe("response variants", () => {
  it("recognises a JSON response", () => {
    const res = { status: 200, body: { ok: true } };
    expect(isFileResponse(res)).toBe(false);
    expect(isSseResponse(res)).toBe(false);
  });

  it("recognises a file response", () => {
    const res = { status: 200, file: "/tmp/a.jpg", contentType: "image/jpeg" };
    expect(isFileResponse(res)).toBe(true);
    expect(isSseResponse(res)).toBe(false);
  });

  it("recognises an SSE response", () => {
    const events = (async function* () {
      yield { event: "ping", data: null };
    })();
    const res = { status: 200, events };
    expect(isSseResponse(res)).toBe(true);
    expect(isFileResponse(res)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: FAIL — `isFileResponse` is not exported.

- [ ] **Step 3: Widen the response type**

In `scripts/lib/studioApi.ts`, replace the `StudioResponse` type with:

```ts
/** One server-sent event. `data` is JSON-serialised by the transport. */
export type SseEvent = { event: string; data: unknown };

export type JsonResponse = { status: number; body: unknown };
export type FileResponse = { status: number; file: string; contentType: string };
export type SseResponse = { status: number; events: AsyncIterable<SseEvent> };

// Three variants rather than one JSON shape: studio has to serve image bytes
// for thumbnails and stream upload progress, and neither fits a buffered JSON
// body. The handler still never touches an http object — it names a file on
// disk or yields events, and studio/vite.config.ts does the writing. That is
// what keeps this module drivable from Vitest with no server running.
export type StudioResponse = JsonResponse | FileResponse | SseResponse;

export function isFileResponse(res: StudioResponse): res is FileResponse {
  return "file" in res;
}

export function isSseResponse(res: StudioResponse): res is SseResponse {
  return "events" in res;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts`
Expected: PASS — the Part 1 cases still pass because `{status, body}` is unchanged.

- [ ] **Step 5: Teach the middleware the new variants**

In `studio/vite.config.ts`, replace the `req.on("end", …)` handler with the version below. Three things change: the file and SSE branches are new, `res.headersSent` now guards every write (closing the double-respond race the Part 1 final review flagged), and the SSE branch keeps the connection open until the generator finishes.

```ts
        req.on("end", () => {
          void handleStudioRequest({
            method: req.method ?? "GET",
            url: req.url ?? "",
            body: Buffer.concat(chunks),
            projectRoot,
          })
            .then(async (result) => {
              // The request-error listener above may already have answered if
              // the seller closed the tab mid-request; writing again throws
              // ERR_HTTP_HEADERS_SENT and takes the dev server down with it.
              if (res.headersSent || res.writableEnded) return;

              if (isFileResponse(result)) {
                res.statusCode = result.status;
                res.setHeader("content-type", result.contentType);
                // Photos change whenever the seller re-uploads; never cache.
                res.setHeader("cache-control", "no-store");
                createReadStream(result.file).pipe(res);
                return;
              }

              if (isSseResponse(result)) {
                res.statusCode = result.status;
                res.setHeader("content-type", "text/event-stream");
                res.setHeader("cache-control", "no-store");
                res.setHeader("connection", "keep-alive");
                for await (const evt of result.events) {
                  if (res.writableEnded) break;
                  res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
                }
                res.end();
                return;
              }

              res.statusCode = result.status;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify(result.body));
            })
            .catch((err: unknown) => {
              if (res.headersSent || res.writableEnded) return;
              res.statusCode = 500;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
              );
            });
        });
```

Add the imports this needs at the top of the file:

```ts
import { createReadStream } from "fs";
import { handleStudioRequest, isFileResponse, isSseResponse } from "../scripts/lib/studioApi";
```

(Replace the existing `handleStudioRequest` import line — one import per module, or `import/no-duplicates` fails the lint.)

- [ ] **Step 6: Cap the request body**

Uploads arrive through this same buffer, so an unbounded `chunks` array is now a real memory risk rather than a theoretical one. Immediately after the `chunks` declaration in `studio/vite.config.ts`, replace the `data` listener with:

```ts
        // One photo per request (see the upload route); 32 MB is far above any
        // camera JPEG plus base64's ~33% overhead, and far below anything that
        // would exhaust the dev server.
        const MAX_BODY_BYTES = 32 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let received = 0;
        let aborted = false;

        req.on("data", (chunk: Buffer) => {
          if (aborted) return;
          received += chunk.length;
          if (received > MAX_BODY_BYTES) {
            aborted = true;
            if (!res.headersSent && !res.writableEnded) {
              res.statusCode = 413;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "request body exceeds 32 MB" }));
            }
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
```

Then guard the `end` handler's first line with `if (aborted) return;`.

- [ ] **Step 7: Verify the server still works**

Run: `pnpm studio --port 5401` in the background, then:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5401/api/items
curl -sS -o /dev/null -w "%{http_code}\n" -X POST -H "content-type: text/plain" --data '{}' http://127.0.0.1:5401/api/items/bulk-status
```
Expected: `200` then `415` — the JSON path and the CSRF guard both still behave. Stop the server.

- [ ] **Step 8: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts studio/vite.config.ts
git commit -m "feat: add file and SSE response variants to the studio API"
```

---

### Task 2: Image filename rules and listing

**Files:**
- Create: `scripts/lib/studioImages.ts`
- Create: `scripts/lib/studioImages.test.ts`
- Test: `scripts/lib/studioImages.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:

```ts
const IMAGE_FILENAME_RE: RegExp;                       // /^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp|gif)$/i
function isValidImageFilename(name: string): boolean;
function sniffImageType(bytes: Buffer): "jpg" | "png" | "webp" | "gif" | null;
function listImageFiles(dir: string): Promise<string[]>;   // sorted the way the site loader sorts
```

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/studioImages.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { isValidImageFilename, listImageFiles, sniffImageType } from "./studioImages";

// Real headers, not invented bytes — a sniffer that passes on fabricated input
// proves nothing.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPG = Buffer.from("ffd8ffe000104a4649460001", "hex");
const GIF = Buffer.from("474946383961" + "0100010080", "hex");
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from("24000000", "hex"),
  Buffer.from("WEBPVP8 "),
]);

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-images-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("isValidImageFilename", () => {
  it("accepts ordinary photo names", () => {
    expect(isValidImageFilename("01-front.jpg")).toBe(true);
    expect(isValidImageFilename("IMG_2043.JPEG")).toBe(true);
    expect(isValidImageFilename("side.webp")).toBe(true);
  });

  it("rejects traversal and separators", () => {
    expect(isValidImageFilename("../secret.jpg")).toBe(false);
    expect(isValidImageFilename("a/b.jpg")).toBe(false);
    expect(isValidImageFilename("..")).toBe(false);
  });

  it("rejects a leading dot", () => {
    expect(isValidImageFilename(".hidden.jpg")).toBe(false);
  });

  it("rejects non-image extensions", () => {
    expect(isValidImageFilename("notes.txt")).toBe(false);
    expect(isValidImageFilename("item.json")).toBe(false);
  });
});

describe("sniffImageType", () => {
  it("identifies each accepted format from its header", () => {
    expect(sniffImageType(PNG)).toBe("png");
    expect(sniffImageType(JPG)).toBe("jpg");
    expect(sniffImageType(GIF)).toBe("gif");
    expect(sniffImageType(WEBP)).toBe("webp");
  });

  it("returns null for a file that is not an image", () => {
    expect(sniffImageType(Buffer.from("<!doctype html><html></html>"))).toBeNull();
  });

  it("returns null for a truncated header", () => {
    expect(sniffImageType(Buffer.from("89", "hex"))).toBeNull();
  });
});

describe("listImageFiles", () => {
  it("lists images case-insensitively sorted, matching the site loader", async () => {
    for (const name of ["02-Side.JPG", "01-front.jpg", "10-back.png", "notes.txt"]) {
      await fs.writeFile(path.join(dir, name), PNG);
    }
    expect(await listImageFiles(dir)).toEqual(["01-front.jpg", "02-Side.JPG", "10-back.png"]);
  });

  it("returns an empty list for a directory that does not exist", async () => {
    expect(await listImageFiles(path.join(dir, "nope"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioImages.test.ts`
Expected: FAIL — cannot resolve `./studioImages`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/studioImages.ts`:

```ts
// Filesystem operations on an item's photo folder. No HTTP, no printing — the
// route layer in studioApi.ts owns status codes and the middleware owns the
// wire. Every function here takes an already-resolved directory: containment
// against content/items/ is resolveItemDir's job, and doing it twice in two
// places is how the two copies drift apart.

import fsPromises from "fs/promises";
import path from "path";

// Photo names are not slugs: they carry an extension, and cameras produce
// names like IMG_2043.JPEG. Dots, dashes and underscores are allowed after the
// first character; "/" and a leading "." are not, which is what keeps "../" and
// dotfiles out. The extension list matches lib/content/loader.ts's IMAGE_EXT.
export const IMAGE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp|gif)$/i;

export function isValidImageFilename(name: string): boolean {
  return IMAGE_FILENAME_RE.test(name) && !name.includes("..");
}

export type ImageKind = "jpg" | "png" | "webp" | "gif";

/**
 * Identify an image by its header bytes. The extension is attacker-chosen even
 * when it passes isValidImageFilename, so the bytes are what decide whether a
 * file is written into content/.
 */
export function sniffImageType(bytes: Buffer): ImageKind | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "png";
  }
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("hex") === "ffd8ff") {
    return "jpg";
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Image filenames in the order the published site will show them.
 * lib/content/loader.ts:50-56 sorts case-insensitively with localeCompare, so
 * studio must sort identically or the seller's preview lies about the order.
 */
export async function listImageFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fsPromises.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => isValidImageFilename(name))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Content-type for an image filename, for the file response variant. */
export function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioImages.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Add the list and serve routes**

In `scripts/lib/studioApi.ts`, add the import:

```ts
import { contentTypeFor, isValidImageFilename, listImageFiles } from "./studioImages";
```

Add above `handleStudioRequest`:

```ts
// /api/items/<category>/<item>/images[/<filename>]
const IMAGE_ROUTE_RE = /^\/api\/items\/([^/]+)\/([^/]+)\/images(?:\/([^/]+))?$/;

async function handleImageList(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const dir = resolveItemDir(req.projectRoot, category, item);
  return { status: 200, body: { files: await listImageFiles(dir) } };
}

async function handleImageGet(
  req: StudioRequest,
  category: string,
  item: string,
  filename: string,
): Promise<StudioResponse> {
  if (!isValidImageFilename(filename)) {
    throw new StudioError(400, `not an image filename: "${filename}"`);
  }
  const dir = resolveItemDir(req.projectRoot, category, item);
  const filePath = path.join(dir, filename);

  // Containment again, not because the name could contain a separator — the
  // allowlist forbids that — but because this is the layer that would still
  // hold if the allowlist is ever relaxed.
  if (path.relative(dir, filePath) !== filename) {
    throw new StudioError(400, "resolved path escapes the item folder");
  }

  try {
    await fsPromises.access(filePath);
  } catch {
    throw new StudioError(404, `no such image: ${filename}`);
  }

  return { status: 200, file: filePath, contentType: contentTypeFor(filename) };
}
```

Then, inside `handleStudioRequest`'s `try` block and **before** the final 404 return:

```ts
    const imageMatch = IMAGE_ROUTE_RE.exec(pathname);
    if (imageMatch !== null) {
      const [, category, item, filename] = imageMatch;
      if (category === undefined || item === undefined) {
        return { status: 400, body: { error: "malformed image route" } };
      }
      if (req.method === "GET") {
        return filename === undefined
          ? await handleImageList(req, category, item)
          : await handleImageGet(req, category, item, filename);
      }
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }
```

- [ ] **Step 6: Test the routes**

Append to `scripts/lib/studioApi.test.ts` (this file already has a `sandbox` temp-dir fixture and a `seedItem` helper from Part 1 — reuse them; add a helper that writes a photo):

```ts
const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

async function seedImage(id: string, filename: string): Promise<void> {
  const dir = path.join(sandbox, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), PNG_BYTES);
}

function get(url: string) {
  return handleStudioRequest({
    method: "GET",
    url,
    body: Buffer.alloc(0),
    projectRoot: sandbox,
  });
}

describe("GET image routes", () => {
  it("lists an item's images in loader order", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "02-Side.JPG");
    await seedImage("electronics/desk-lamp", "01-front.jpg");

    const res = await get("/api/items/electronics/desk-lamp/images");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: ["01-front.jpg", "02-Side.JPG"] });
  });

  it("serves one image as a file response", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "01-front.jpg");

    const res = await get("/api/items/electronics/desk-lamp/images/01-front.jpg");

    expect(res.status).toBe(200);
    expect(isFileResponse(res)).toBe(true);
    if (isFileResponse(res)) {
      expect(res.contentType).toBe("image/jpeg");
      expect(res.file.endsWith("01-front.jpg")).toBe(true);
    }
  });

  it("404s an image that is not there", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await get("/api/items/electronics/desk-lamp/images/missing.jpg");
    expect(res.status).toBe(404);
  });

  it("rejects a traversal filename", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await get("/api/items/electronics/desk-lamp/images/..%2Fitem.json");
    expect(res.status).toBe(400);
  });

  it("rejects a bad category slug", async () => {
    const res = await get("/api/items/Electronics/desk-lamp/images");
    expect(res.status).toBe(400);
  });

  it("405s a POST-less method on the image collection", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await handleStudioRequest({
      method: "PUT",
      url: "/api/items/electronics/desk-lamp/images",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });
    expect(res.status).toBe(405);
  });
});
```

Note on the traversal case: the URL arrives percent-encoded, so decode `pathname` segments before matching. Add `const pathname = decodeURIComponent(req.url.split("?")[0] ?? "");` — but decode **before** any validation, never after, or the allowlist inspects a different string than the filesystem receives. Wrap the decode in a try/catch and return 400 on a malformed escape sequence.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts scripts/lib/studioImages.test.ts`
Expected: PASS — the six new route cases plus every Part 1 case.

- [ ] **Step 8: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add scripts/lib/studioImages.ts scripts/lib/studioImages.test.ts scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: list and serve item images from the studio API"
```

---

### Task 3: Upload

One photo per request, base64 inside JSON. That keeps the CSRF guard's "application/json only" rule intact — `multipart/form-data` is a CORS-simple content type and accepting it would reopen the hole Part 1 closed.

**Files:**
- Modify: `scripts/lib/studioImages.ts` (add `writeImage`)
- Modify: `scripts/lib/studioImages.test.ts`
- Modify: `scripts/lib/studioApi.ts` (POST branch of the image route)
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `sniffImageType`, `isValidImageFilename`, `listImageFiles` from Task 2; `resolveItemDir`, `StudioError` from Part 1.
- Produces:

```ts
function writeImage(dir: string, filename: string, bytes: Buffer): Promise<string>;
// returns the filename actually written (deduplicated if it already existed)
// POST /api/items/:cat/:item/images
// body: { filename: string, contentBase64: string }
// 201 { file: string, files: string[] }
```

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/studioImages.test.ts`:

```ts
import { writeImage } from "./studioImages";

describe("writeImage", () => {
  it("writes the bytes under the given name", async () => {
    const written = await writeImage(dir, "01-front.png", PNG);
    expect(written).toBe("01-front.png");
    expect(await fs.readFile(path.join(dir, "01-front.png"))).toEqual(PNG);
  });

  it("does not overwrite an existing photo", async () => {
    await writeImage(dir, "01-front.png", PNG);
    const second = await writeImage(dir, "01-front.png", JPG);

    expect(second).not.toBe("01-front.png");
    expect(second).toMatch(/^01-front-\d+\.png$/);
    // The original is untouched — a seller who drags the same filename twice
    // must not silently lose the first photo.
    expect(await fs.readFile(path.join(dir, "01-front.png"))).toEqual(PNG);
    expect(await fs.readFile(path.join(dir, second))).toEqual(JPG);
  });

  it("creates the item folder when it does not exist yet", async () => {
    const fresh = path.join(dir, "new-item");
    await writeImage(fresh, "01-front.png", PNG);
    expect(await fs.readFile(path.join(fresh, "01-front.png"))).toEqual(PNG);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioImages.test.ts`
Expected: FAIL — `writeImage` is not exported.

- [ ] **Step 3: Implement `writeImage`**

Append to `scripts/lib/studioImages.ts`:

```ts
/**
 * Write photo bytes into an item folder without ever clobbering an existing
 * file: a seller who drops two photos that happen to share a camera filename
 * must end up with both. Returns the filename actually used.
 */
export async function writeImage(
  dir: string,
  filename: string,
  bytes: Buffer,
): Promise<string> {
  await fsPromises.mkdir(dir, { recursive: true });

  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);

  let candidate = filename;
  let suffix = 1;
  for (;;) {
    try {
      // wx fails if the path exists, which makes the check and the write one
      // atomic step — a stat-then-write pair can lose a race with itself.
      await fsPromises.writeFile(path.join(dir, candidate), bytes, { flag: "wx" });
      return candidate;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      candidate = `${base}-${suffix}${ext}`;
      suffix++;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioImages.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Add the upload route**

In `scripts/lib/studioApi.ts`, add to the imports from `./studioImages`: `sniffImageType`, `writeImage`.

Add above `handleStudioRequest`:

```ts
const uploadBodySchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
});

async function handleImageUpload(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { filename, contentBase64 } = parseJsonBody(req.body, uploadBodySchema);

  if (!isValidImageFilename(filename)) {
    throw new StudioError(
      400,
      `"${filename}" is not an image filename — use .jpg, .png, .webp or .gif`,
    );
  }

  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length === 0) {
    throw new StudioError(400, "uploaded file is empty");
  }

  // The extension is whatever the browser sent; the header bytes are what
  // decide. A .jpg that is really an HTML document never reaches content/.
  const kind = sniffImageType(bytes);
  if (kind === null) {
    throw new StudioError(400, `${filename} is not a JPEG, PNG, WebP or GIF`);
  }

  const dir = resolveItemDir(req.projectRoot, category, item);
  const written = await writeImage(dir, filename, bytes);

  return { status: 201, body: { file: written, files: await listImageFiles(dir) } };
}
```

Extend the image-route branch so a POST to the collection dispatches here:

```ts
      if (req.method === "POST" && filename === undefined) {
        return await handleImageUpload(req, category, item);
      }
```

Place it directly after the `GET` branch, before the 405 return.

- [ ] **Step 6: Test the route**

Append to `scripts/lib/studioApi.test.ts`:

```ts
function postImage(id: string, filename: string, bytes: Buffer) {
  return handleStudioRequest({
    method: "POST",
    url: `/api/items/${id}/images`,
    body: Buffer.from(
      JSON.stringify({ filename, contentBase64: bytes.toString("base64") }),
    ),
    projectRoot: sandbox,
  });
}

describe("POST image upload", () => {
  it("writes the photo and returns the new listing", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "01-front.png", PNG_BYTES);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ file: "01-front.png", files: ["01-front.png"] });
    const onDisk = await fs.readFile(
      path.join(sandbox, "content", "items", "electronics", "desk-lamp", "01-front.png"),
    );
    expect(onDisk).toEqual(PNG_BYTES);
  });

  it("rejects a file whose bytes are not an image, whatever the extension says", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage(
      "electronics/desk-lamp",
      "evil.jpg",
      Buffer.from("<!doctype html><script>alert(1)</script>"),
    );

    expect(res.status).toBe(400);
    expect(await listImageFiles(
      path.join(sandbox, "content", "items", "electronics", "desk-lamp"),
    )).toEqual([]);
  });

  it("rejects a traversal filename", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await postImage("electronics/desk-lamp", "../item.json", PNG_BYTES);
    expect(res.status).toBe(400);
  });

  it("rejects an empty upload", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await postImage("electronics/desk-lamp", "01-front.png", Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it("keeps both photos when the filename collides", async () => {
    await seedItem("electronics/desk-lamp");
    await postImage("electronics/desk-lamp", "01-front.png", PNG_BYTES);

    const res = await postImage("electronics/desk-lamp", "01-front.png", PNG_BYTES);

    expect(res.status).toBe(201);
    const body = res.body as { file: string; files: string[] };
    expect(body.file).toBe("01-front-1.png");
    expect(body.files).toHaveLength(2);
  });
});
```

- [ ] **Step 7: Run the tests, then verify over HTTP**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts scripts/lib/studioImages.test.ts`
Expected: PASS.

Then start `pnpm studio --port 5402` in the background and upload a real photo into a scratch item:
```bash
mkdir -p content/items/houseware/studio-upload-probe
printf '{ "name": "Studio upload probe", "status": "draft" }\n' > content/items/houseware/studio-upload-probe/item.json
B64=$(python3 -c "import base64,sys;sys.stdout.write(base64.b64encode(open('/System/Library/Desktop Pictures/.donotdelete','rb').read()).decode())" 2>/dev/null || python3 -c "
import base64,sys
png=bytes.fromhex('89504e470d0a1a0a0000000d49484452')
sys.stdout.write(base64.b64encode(png).decode())")
curl -sS -X POST -H "content-type: application/json" \
  --data "{\"filename\":\"01-front.png\",\"contentBase64\":\"$B64\"}" \
  http://127.0.0.1:5402/api/items/houseware/studio-upload-probe/images
curl -sS http://127.0.0.1:5402/api/items/houseware/studio-upload-probe/images
```
Expected: a `201` with `{"file":"01-front.png",…}`, then a listing containing it.

Clean up: `rm -rf content/items/houseware/studio-upload-probe` and confirm `git status --porcelain content/` is empty. Stop the server.

- [ ] **Step 8: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add scripts/lib/studioImages.ts scripts/lib/studioImages.test.ts scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: upload item photos through the studio API"
```

---

### Task 4: Delete and reorder

**Files:**
- Modify: `scripts/lib/studioImages.ts` (add `deleteImage`, `reorderImages`)
- Modify: `scripts/lib/studioImages.test.ts`
- Modify: `scripts/lib/studioApi.ts` (DELETE branch + reorder route)
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `listImageFiles`, `isValidImageFilename` from Task 2.
- Produces:

```ts
function deleteImage(dir: string, filename: string): Promise<string[]>;   // returns the new listing
function reorderImages(dir: string, order: string[]): Promise<string[]>;  // returns the new listing
// DELETE /api/items/:cat/:item/images/:file          → 200 { files: string[] }
// POST   /api/items/:cat/:item/images/reorder        → 200 { files: string[] }
//        body: { order: string[] }
```

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/studioImages.test.ts`:

```ts
import { deleteImage, reorderImages } from "./studioImages";

describe("deleteImage", () => {
  it("removes the file and returns what is left", async () => {
    await writeImage(dir, "01-front.png", PNG);
    await writeImage(dir, "02-side.png", PNG);

    expect(await deleteImage(dir, "01-front.png")).toEqual(["02-side.png"]);
  });

  it("throws when the file is not there", async () => {
    await expect(deleteImage(dir, "ghost.png")).rejects.toThrow(/ghost\.png/);
  });
});

describe("reorderImages", () => {
  it("renames files so the loader's alphabetical sort matches the requested order", async () => {
    await writeImage(dir, "apple.png", PNG);
    await writeImage(dir, "banana.png", PNG);
    await writeImage(dir, "cherry.png", PNG);

    const files = await reorderImages(dir, ["cherry.png", "apple.png", "banana.png"]);

    expect(files).toEqual(["01-cherry.png", "02-apple.png", "03-banana.png"]);
    // listImageFiles sorts the same way the site does, so this IS the order
    // the published page will show.
    expect(await listImageFiles(dir)).toEqual(files);
  });

  it("strips an existing numeric prefix instead of stacking a second one", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    const files = await reorderImages(dir, ["02-banana.png", "01-apple.png"]);

    expect(files).toEqual(["01-banana.png", "02-apple.png"]);
  });

  it("survives an order that swaps two names into each other's slots", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    // A naive one-pass rename would hit EEXIST here: 02-banana -> 01-banana
    // while 01-apple still occupies its own slot in the same numbering space.
    const files = await reorderImages(dir, ["02-banana.png", "01-apple.png"]);

    expect(files).toEqual(["01-banana.png", "02-apple.png"]);
    expect(await fs.readdir(dir)).toHaveLength(2);
  });

  it("rejects an order that does not name exactly the files present", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    await expect(reorderImages(dir, ["01-apple.png"])).rejects.toThrow(/every image/);
    await expect(
      reorderImages(dir, ["01-apple.png", "02-banana.png", "ghost.png"]),
    ).rejects.toThrow(/every image/);
  });

  it("pads to two digits so ten or more photos still sort correctly", async () => {
    const names = Array.from({ length: 11 }, (_, i) => `photo${i}.png`);
    for (const name of names) await writeImage(dir, name, PNG);

    const files = await reorderImages(dir, names);

    expect(files[0]).toBe("01-photo0.png");
    expect(files[9]).toBe("10-photo9.png");
    expect(await listImageFiles(dir)).toEqual(files);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioImages.test.ts`
Expected: FAIL — `deleteImage` is not exported.

- [ ] **Step 3: Implement both**

Append to `scripts/lib/studioImages.ts`:

```ts
const NUMERIC_PREFIX_RE = /^\d+-/;

export async function deleteImage(dir: string, filename: string): Promise<string[]> {
  try {
    await fsPromises.unlink(path.join(dir, filename));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`no such image: ${filename}`);
    }
    throw err;
  }
  return listImageFiles(dir);
}

/**
 * Persist a display order by renaming files to `NN-<name>`.
 *
 * Order has to live in the filenames: the site build has no per-item ordering
 * field, and lib/content/loader.ts derives item.images by sorting filenames.
 *
 * The renames run in two passes through temporary names. A single pass would
 * collide whenever the new numbering reuses a slot the old numbering still
 * holds — reversing two photos is enough to trigger it.
 */
export async function reorderImages(dir: string, order: string[]): Promise<string[]> {
  const present = await listImageFiles(dir);

  const sameSet =
    order.length === present.length && new Set(order).size === order.length &&
    order.every((name) => present.includes(name));
  if (!sameSet) {
    throw new Error(
      `the order must name every image in the folder exactly once (folder has ${present.length}: ${present.join(", ")})`,
    );
  }

  const width = Math.max(2, String(order.length).length);
  const targets = order.map((name, i) => {
    const stripped = name.replace(NUMERIC_PREFIX_RE, "");
    return `${String(i + 1).padStart(width, "0")}-${stripped}`;
  });

  // Pass 1: park everything under names that cannot collide with a target.
  const parked = order.map((_, i) => `.studio-reorder-${i}.tmp`);
  for (let i = 0; i < order.length; i++) {
    await fsPromises.rename(path.join(dir, order[i]!), path.join(dir, parked[i]!));
  }

  // Pass 2: move them into place.
  for (let i = 0; i < parked.length; i++) {
    await fsPromises.rename(path.join(dir, parked[i]!), path.join(dir, targets[i]!));
  }

  return listImageFiles(dir);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioImages.test.ts`
Expected: PASS — 22 tests.

- [ ] **Step 5: Add the routes**

In `scripts/lib/studioApi.ts`, add `deleteImage` and `reorderImages` to the `./studioImages` import, then add above `handleStudioRequest`:

```ts
const reorderBodySchema = z.object({ order: z.array(z.string()).min(1) });

async function handleImageDelete(
  req: StudioRequest,
  category: string,
  item: string,
  filename: string,
): Promise<StudioResponse> {
  if (!isValidImageFilename(filename)) {
    throw new StudioError(400, `not an image filename: "${filename}"`);
  }
  const dir = resolveItemDir(req.projectRoot, category, item);
  try {
    return { status: 200, body: { files: await deleteImage(dir, filename) } };
  } catch (err: unknown) {
    throw new StudioError(404, err instanceof Error ? err.message : String(err));
  }
}

async function handleImageReorder(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { order } = parseJsonBody(req.body, reorderBodySchema);

  for (const name of order) {
    if (!isValidImageFilename(name)) {
      throw new StudioError(400, `not an image filename: "${name}"`);
    }
  }

  const dir = resolveItemDir(req.projectRoot, category, item);
  try {
    return { status: 200, body: { files: await reorderImages(dir, order) } };
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }
}
```

In the image-route branch, `reorder` arrives in the filename position, so dispatch it before the per-file handlers:

```ts
      if (req.method === "POST" && filename === "reorder") {
        return await handleImageReorder(req, category, item);
      }
      if (req.method === "DELETE" && filename !== undefined) {
        return await handleImageDelete(req, category, item, filename);
      }
```

Place both directly after the upload branch. Because `reorder` has no extension it can never be a valid image filename, so it cannot shadow a real photo.

- [ ] **Step 6: Test the routes**

Append to `scripts/lib/studioApi.test.ts`:

```ts
describe("DELETE and reorder image routes", () => {
  it("deletes one image and returns the rest", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "01-front.png");
    await seedImage("electronics/desk-lamp", "02-side.png");

    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items/electronics/desk-lamp/images/01-front.png",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: ["02-side.png"] });
  });

  it("404s deleting an image that is not there", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items/electronics/desk-lamp/images/ghost.png",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });
    expect(res.status).toBe(404);
  });

  it("reorders by renaming with numeric prefixes", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    await seedImage("electronics/desk-lamp", "banana.png");

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      body: Buffer.from(JSON.stringify({ order: ["banana.png", "apple.png"] })),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: ["01-banana.png", "02-apple.png"] });
  });

  it("400s a reorder that does not name every image", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    await seedImage("electronics/desk-lamp", "banana.png");

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      body: Buffer.from(JSON.stringify({ order: ["apple.png"] })),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add scripts/lib/studioImages.ts scripts/lib/studioImages.test.ts scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: delete and reorder item photos through the studio API"
```

---

### Task 5: CDN sync with a mutex and streamed progress

The sync itself must not be imported by anything the Vite config touches: `scripts/lib/imageSync.ts` statically imports `stripImageMetadata` (and therefore `sharp`), and the R2 adapter pulls `@aws-sdk/client-s3`. Both would end up bundled into Vite's temporary config module. So `scripts/studio.ts` — which runs under tsx and resolves everything natively — builds the sync closure and registers it before the server starts. `studioSync.ts` holds only the mutex, the generator, and the registry.

**Files:**
- Create: `scripts/lib/loadEnv.ts`
- Create: `scripts/lib/studioSync.ts`
- Create: `scripts/lib/studioSync.test.ts`
- Modify: `scripts/sync-images.ts` (use the extracted env loader)
- Modify: `scripts/studio.ts` (register the sync runner)
- Modify: `scripts/lib/studioApi.ts` (the `/api/sync-images` route)
- Modify: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `SseEvent`, `StudioError`, `StudioRequest`, `StudioResponse` from Task 1; `ImageSyncProgress`, `ImageSyncResult`, `syncImagesToCdn` from `scripts/lib/imageSync.ts` (in `scripts/studio.ts` only).
- Produces:

```ts
// scripts/lib/loadEnv.ts
function loadDotEnvLocal(cwd?: string): void;

// scripts/lib/studioSync.ts
type SyncRunner = (onProgress: (p: ImageSyncProgress) => void) => Promise<ImageSyncResult>;
function setSyncRunner(runner: SyncRunner | null): void;
function getSyncRunner(): SyncRunner | null;
function isSyncRunning(): boolean;
function streamImageSync(runner: SyncRunner): AsyncGenerator<SseEvent>;

// POST /api/sync-images
//   200 SSE — "progress" events, then one "done" or "error", then close
//   409 JSON when a sync is already running
//   503 JSON when no runner is registered (studio started without one)
```

- [ ] **Step 1: Extract the `.env.local` loader**

`scripts/sync-images.ts` has a private `loadDotEnvLocal()` (around line 35) because tsx does not read `.env.local` automatically. The R2 adapter's constructor throws when `CF_R2_*` are missing, so `pnpm studio` needs the same loading — and two copies of an env parser is one too many.

Create `scripts/lib/loadEnv.ts` by moving that function verbatim, parameterised on the working directory:

```ts
// tsx does not load .env.local automatically. Both `pnpm upload-images` and
// `pnpm studio` need CF_R2_* in the environment before an adapter is
// constructed, so the parser lives here rather than in either entry point.

import fs from "fs";
import path from "path";

/** Populate process.env from .env.local. Existing values always win. */
export function loadDotEnvLocal(cwd: string = process.cwd()): void {
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line
      .slice(eqIdx + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
```

In `scripts/sync-images.ts`, delete the local definition and import it instead:

```ts
import { loadDotEnvLocal } from "./lib/loadEnv";
```

The existing `loadDotEnvLocal();` call site stays exactly where it is.

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all clean — this is a pure move.

- [ ] **Step 2: Write the failing test**

Create `scripts/lib/studioSync.test.ts`:

```ts
import { describe, expect, it, afterEach } from "vitest";
import type { ImageSyncProgress, ImageSyncResult } from "./imageSync";
import type { SseEvent } from "./studioApi";
import {
  getSyncRunner,
  isSyncRunning,
  setSyncRunner,
  streamImageSync,
} from "./studioSync";

function emptyResult(overrides: Partial<ImageSyncResult> = {}): ImageSyncResult {
  return {
    total: 0,
    uploaded: 0,
    skipped: 0,
    stripped: 0,
    purged: 0,
    manifest: {},
    images: [],
    failures: [],
    ...overrides,
  };
}

async function collect(gen: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const evt of gen) events.push(evt);
  return events;
}

afterEach(() => {
  setSyncRunner(null);
});

describe("the sync runner registry", () => {
  it("starts empty and remembers what is registered", () => {
    expect(getSyncRunner()).toBeNull();
    const runner = async () => emptyResult();
    setSyncRunner(runner);
    expect(getSyncRunner()).toBe(runner);
  });
});

describe("streamImageSync", () => {
  it("streams every progress event and then a done event", async () => {
    const events = await collect(
      streamImageSync(async (onProgress) => {
        onProgress({ type: "scanned", total: 2 });
        onProgress({
          type: "file",
          manifestKey: "a/b/01.png",
          completed: 1,
          total: 2,
          uploaded: true,
        });
        return emptyResult({ total: 2, uploaded: 1, skipped: 1 });
      }),
    );

    expect(events.map((e) => e.event)).toEqual(["progress", "progress", "done"]);
    expect(events[0]?.data).toMatchObject({ type: "scanned", total: 2 });
    expect(events[2]?.data).toMatchObject({ total: 2, uploaded: 1 });
  });

  it("reports a failed sync as an error event rather than throwing", async () => {
    const events = await collect(
      streamImageSync(async () => {
        throw new Error("R2 credentials missing");
      }),
    );

    expect(events.map((e) => e.event)).toEqual(["error"]);
    expect(events[0]?.data).toMatchObject({ error: "R2 credentials missing" });
  });

  it("holds the mutex for the duration and releases it afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const gen = streamImageSync(async () => {
      await gate;
      return emptyResult();
    });

    expect(isSyncRunning()).toBe(false);
    const first = gen.next();
    await Promise.resolve();
    expect(isSyncRunning()).toBe(true);

    release();
    await first;
    await collect(gen);
    expect(isSyncRunning()).toBe(false);
  });

  it("releases the mutex even when the sync throws", async () => {
    await collect(
      streamImageSync(async () => {
        throw new Error("boom");
      }),
    );
    expect(isSyncRunning()).toBe(false);
  });

  it("releases the mutex when the consumer abandons the stream", async () => {
    // The seller closes the tab mid-sync: the middleware stops iterating, so
    // the generator's finally block is the only thing that can free the lock.
    const gen = streamImageSync(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return emptyResult();
    });

    await gen.next();
    await gen.return(undefined as never);
    expect(isSyncRunning()).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run scripts/lib/studioSync.test.ts`
Expected: FAIL — cannot resolve `./studioSync`.

- [ ] **Step 4: Write the implementation**

Create `scripts/lib/studioSync.ts`:

```ts
// The CDN sync, wrapped for studio: one run at a time, progress delivered as
// server-sent events.
//
// The mutex is not politeness. Two concurrent runs both write
// lib/generated/image-manifest.json and .image-cache/checksums.json, and the
// loser's write wins — which can leave a committed manifest that omits photos
// that were in fact uploaded, or a checksum cache claiming files are current
// when they are not. That damage outlives the session.
//
// The runner is injected rather than imported. scripts/lib/imageSync.ts pulls
// in sharp, and the R2 adapter pulls @aws-sdk/client-s3; importing either here
// would drag both into Vite's config bundle, since studio/vite.config.ts
// imports studioApi.ts which imports this file. scripts/studio.ts runs under
// tsx, resolves them natively, and registers the closure before listen().

import type { ImageSyncProgress, ImageSyncResult } from "./imageSync";
import type { SseEvent } from "./studioApi";

export type SyncRunner = (
  onProgress: (progress: ImageSyncProgress) => void,
) => Promise<ImageSyncResult>;

let runner: SyncRunner | null = null;
let running = false;

export function setSyncRunner(next: SyncRunner | null): void {
  runner = next;
}

export function getSyncRunner(): SyncRunner | null {
  return runner;
}

export function isSyncRunning(): boolean {
  return running;
}

export async function* streamImageSync(run: SyncRunner): AsyncGenerator<SseEvent> {
  running = true;

  // Progress arrives through a callback while the run is in flight, but a
  // generator can only yield when its consumer asks. Buffer what the callback
  // reports and drain the buffer between polls.
  const pending: ImageSyncProgress[] = [];
  let settled: { result: ImageSyncResult } | { error: string } | null = null;

  const inFlight = run((progress) => {
    pending.push(progress);
  }).then(
    (result) => {
      settled = { result };
    },
    (err: unknown) => {
      settled = { error: err instanceof Error ? err.message : String(err) };
    },
  );

  try {
    for (;;) {
      while (pending.length > 0) {
        yield { event: "progress", data: pending.shift() };
      }
      if (settled !== null) break;
      // Hand control back to the event loop so the sync can advance; without
      // this the loop spins without ever letting the callback fire.
      await Promise.race([inFlight, new Promise((r) => setTimeout(r, 50))]);
    }

    while (pending.length > 0) {
      yield { event: "progress", data: pending.shift() };
    }

    if ("error" in settled) {
      yield { event: "error", data: { error: settled.error } };
    } else {
      yield { event: "done", data: settled.result };
    }
  } finally {
    // Runs on normal completion, on throw, and when the consumer abandons the
    // generator (seller closes the tab) — the lock must never outlive the run.
    running = false;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run scripts/lib/studioSync.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Add the route**

In `scripts/lib/studioApi.ts`, add:

```ts
import { getSyncRunner, isSyncRunning, streamImageSync } from "./studioSync";
```

Add above `handleStudioRequest`:

```ts
function handleSyncImages(): StudioResponse {
  const runner = getSyncRunner();
  if (runner === null) {
    // Only reachable if studio was started without registering a runner —
    // a wiring bug, not something the seller can cause.
    throw new StudioError(503, "image sync is not available in this session");
  }
  if (isSyncRunning()) {
    throw new StudioError(409, "an image sync is already running");
  }
  return { status: 200, events: streamImageSync(runner) };
}
```

And the route, inside the `try` block before the final 404 return:

```ts
    if (pathname === "/api/sync-images") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return handleSyncImages();
    }
```

- [ ] **Step 7: Test the route's JSON paths**

Append to `scripts/lib/studioApi.test.ts`:

```ts
import { setSyncRunner } from "./studioSync";

describe("POST /api/sync-images", () => {
  afterEach(() => {
    setSyncRunner(null);
  });

  function post() {
    return handleStudioRequest({
      method: "POST",
      url: "/api/sync-images",
      body: Buffer.from("{}"),
      projectRoot: sandbox,
    });
  }

  it("405s a GET", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/sync-images",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });
    expect(res.status).toBe(405);
  });

  it("503s when no runner is registered", async () => {
    const res = await post();
    expect(res.status).toBe(503);
  });

  it("returns an SSE response once a runner is registered", async () => {
    setSyncRunner(async () => ({
      total: 0,
      uploaded: 0,
      skipped: 0,
      stripped: 0,
      purged: 0,
      manifest: {},
      images: [],
      failures: [],
    }));

    const res = await post();

    expect(res.status).toBe(200);
    expect(isSseResponse(res)).toBe(true);
    // Drain it so the mutex is released before the next test.
    if (isSseResponse(res)) {
      for await (const _evt of res.events) {
        // consume
      }
    }
  });
});
```

- [ ] **Step 8: Register the runner in the entry script**

In `scripts/studio.ts`, add these imports:

```ts
import { loadDotEnvLocal } from "./lib/loadEnv";
import { setSyncRunner } from "./lib/studioSync";
import { syncImagesToCdn } from "./lib/imageSync";
import { siteConfig } from "@/content/config";
import type { ImageStorageAdapter } from "@/lib/images/adapter";
```

`scripts/studio.ts` runs under tsx, not through Vite's config bundler, so the `@/` alias is fine here and `sharp` / `@aws-sdk` stay out of the config graph.

Add above `main()`:

```ts
/**
 * The adapter for the configured provider. Mirrors createAdapter() in
 * scripts/sync-images.ts, which is private to that CLI; duplicating a
 * three-branch switch is cheaper than a third extraction with one consumer.
 * All three constructors take no arguments; the R2 one throws when any CF_R2_*
 * variable is missing, which is why loadDotEnvLocal() runs first.
 */
async function createAdapter(): Promise<ImageStorageAdapter> {
  const provider = siteConfig.imageStorage.provider;
  if (provider === "cloudflare-r2") {
    const { CloudflareR2Adapter } = await import("@/lib/images/cloudflare-r2");
    return new CloudflareR2Adapter();
  }
  if (provider === "vercel-blob") {
    const { VercelBlobAdapter } = await import("@/lib/images/vercel-blob");
    return new VercelBlobAdapter();
  }
  const { LocalAdapter } = await import("@/lib/images/local");
  return new LocalAdapter();
}
```

Then, inside `main()` before `createServer(...)`:

```ts
  loadDotEnvLocal();

  const cwd = process.cwd();
  // The adapter is constructed per run, not once at startup: the R2 constructor
  // throws on missing credentials, and that must surface as an "error" event on
  // the seller's progress stream rather than preventing studio from starting at
  // all — they may only want the item table.
  setSyncRunner(async (onProgress) =>
    syncImagesToCdn({
      adapter: await createAdapter(),
      contentItemsDir: path.join(cwd, "content", "items"),
      manifestPath: path.join(cwd, "lib", "generated", "image-manifest.json"),
      checksumsPath: path.join(cwd, ".image-cache", "checksums.json"),
      onProgress,
    }),
  );
```

- [ ] **Step 9: Verify over HTTP**

Check which provider this repo is configured for: `grep -n "provider" content/config.ts`.

Start `pnpm studio --port 5403` in the background, then:
```bash
curl -sS -N -X POST -H "content-type: application/json" --data '{}' \
  http://127.0.0.1:5403/api/sync-images | head -20
```

Expected: a `text/event-stream` body with `event: progress` lines and a final `event: done` (provider `local`, or `cloudflare-r2` with `.env.local` present) **or** a final `event: error` carrying the missing-credentials message (provider `cloudflare-r2` with no `.env.local`). Either outcome proves the streaming path; a hang or a dead server does not. Record which you saw.

Then, while the first request is still streaming, fire a second one and confirm it is refused:
```bash
curl -sS -o /dev/null -w "%{http_code}\n" -X POST -H "content-type: application/json" \
  --data '{}' http://127.0.0.1:5403/api/sync-images
```
Expected: `409` if the first is still running. If the first sync finishes too fast to overlap, say so rather than claiming a 409 you did not see — the mutex is covered by unit tests either way.

Confirm `git status --porcelain` shows no unexpected changes (a successful local-provider sync legitimately rewrites `lib/generated/image-manifest.json`; leave that change if the manifest genuinely changed, and say so). Stop the server.

- [ ] **Step 10: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add scripts/lib/loadEnv.ts scripts/lib/studioSync.ts scripts/lib/studioSync.test.ts scripts/sync-images.ts scripts/studio.ts scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat: stream CDN image sync over SSE with a single-run mutex"
```

---


### Task 6: The image pane

**Files:**
- Create: `studio/src/panes/ImagePane.tsx`
- Create: `studio/src/panes/SyncBar.tsx`
- Modify: `studio/src/api.ts`
- Modify: `studio/src/App.tsx`
- Modify: `studio/src/tokens.css`

**Interfaces:**
- Consumes: every route from Tasks 2–5.
- Produces: `<ImagePane item onClose onChanged />`, `<SyncBar />`.

- [ ] **Step 1: Add the API wrappers**

Append to `studio/src/api.ts`:

```ts
export async function fetchImages(id: string): Promise<string[]> {
  const res = await fetch(`/api/items/${id}/images`);
  const body = (await res.json()) as { files?: string[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `listing images failed with ${res.status}`);
  return body.files ?? [];
}

export async function uploadImage(id: string, file: File): Promise<string[]> {
  const contentBase64 = await fileToBase64(file);
  const res = await fetch(`/api/items/${id}/images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentBase64 }),
  });
  const body = (await res.json()) as { files?: string[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `upload failed with ${res.status}`);
  return body.files ?? [];
}

export async function deleteImage(id: string, filename: string): Promise<string[]> {
  const res = await fetch(`/api/items/${id}/images/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });
  const body = (await res.json()) as { files?: string[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `delete failed with ${res.status}`);
  return body.files ?? [];
}

export async function reorderImages(id: string, order: string[]): Promise<string[]> {
  const res = await fetch(`/api/items/${id}/images/reorder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  });
  const body = (await res.json()) as { files?: string[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `reorder failed with ${res.status}`);
  return body.files ?? [];
}

// DELETE and reorder both send content-type: application/json even though
// DELETE has no body — studio/csrfGuard.ts requires it on every non-GET method.

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/png;base64,AAAA" — the API wants only the payload.
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export type SyncEvent =
  | { event: "progress"; data: { type: string; total?: number; completed?: number; manifestKey?: string } }
  | { event: "done"; data: { total: number; uploaded: number; skipped: number; failures: unknown[] } }
  | { event: "error"; data: { error: string } };

/** POSTs to /api/sync-images and yields each server-sent event as it arrives. */
export async function* streamSync(): AsyncGenerator<SyncEvent> {
  const res = await fetch("/api/sync-images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `sync failed with ${res.status}`);
  }
  if (res.body === null) throw new Error("sync returned no stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let split = buffer.indexOf("\n\n");
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine !== undefined && dataLine !== undefined) {
        yield {
          event: eventLine.slice(7),
          data: JSON.parse(dataLine.slice(6)),
        } as SyncEvent;
      }
      split = buffer.indexOf("\n\n");
    }
  }
}
```

- [ ] **Step 2: Write the image pane**

Create `studio/src/panes/ImagePane.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { deleteImage, fetchImages, reorderImages, uploadImage, type StudioItem } from "../api";

export function ImagePane({
  item,
  onClose,
  onChanged,
}: {
  item: StudioItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setFiles(await fetchImages(item.id));
  }, [item.id]);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(list: FileList) {
    // One request per photo: the API takes a single file, which keeps each
    // request small and lets a failed photo report itself without taking the
    // rest of the batch down.
    await run(async () => {
      const failed: string[] = [];
      for (const file of Array.from(list)) {
        try {
          setFiles(await uploadImage(item.id, file));
        } catch (err: unknown) {
          failed.push(`${file.name} (${err instanceof Error ? err.message : String(err)})`);
        }
      }
      if (failed.length > 0) throw new Error(`Could not add ${failed.join(", ")}`);
    });
  }

  async function drop(index: number) {
    if (dragFrom === null || dragFrom === index) return;
    const next = [...files];
    const [moved] = next.splice(dragFrom, 1);
    if (moved === undefined) return;
    next.splice(index, 0, moved);
    setDragFrom(null);
    await run(async () => {
      setFiles(await reorderImages(item.id, next));
    });
  }

  return (
    <aside className="drawer" aria-label={`Photos for ${item.name}`}>
      <header className="drawer-head">
        <h2>{item.name}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {error !== null && <p role="alert">{error}</p>}

      <div
        className={dragOver ? "dropzone over" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
        }}
      >
        <p>Drop photos here</p>
        <label className="file-button">
          Choose photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            disabled={busy}
            onChange={(e) => {
              if (e.target.files !== null) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {files.length === 0 && <p>No photos yet. The listing needs at least one.</p>}

      <ol className="thumb-grid">
        {files.map((file, index) => (
          <li
            key={file}
            className="thumb"
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void drop(index)}
          >
            <img src={`/api/items/${item.id}/images/${encodeURIComponent(file)}`} alt="" />
            <span className="thumb-name">{file}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setFiles(await deleteImage(item.id, file));
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
```

- [ ] **Step 3: Write the sync bar**

Create `studio/src/panes/SyncBar.tsx`:

```tsx
import { useState } from "react";
import { streamSync } from "../api";

export function SyncBar({ onFinished }: { onFinished: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function push() {
    setRunning(true);
    setError(null);
    setStatus("Starting…");
    try {
      for await (const evt of streamSync()) {
        if (evt.event === "progress") {
          const d = evt.data;
          setStatus(
            d.type === "scanned"
              ? `Found ${d.total} photos`
              : `${d.completed} of ${d.total} — ${d.manifestKey ?? ""}`,
          );
        } else if (evt.event === "done") {
          const d = evt.data;
          setStatus(
            `Pushed ${d.uploaded}, skipped ${d.skipped}` +
              (d.failures.length > 0 ? `, ${d.failures.length} failed` : ""),
          );
          onFinished();
        } else {
          setError(evt.data.error);
          setStatus(null);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="sync-bar">
      <button type="button" disabled={running} onClick={() => void push()}>
        {running ? "Pushing to CDN…" : "Push photos to CDN"}
      </button>
      {status !== null && <span className="sync-status">{status}</span>}
      {error !== null && <span role="alert">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Wire the drawer into the shell**

In `studio/src/App.tsx`: import `ImagePane` and `SyncBar`, add `const [openItemId, setOpenItemId] = useState<string | null>(null);`, render `<SyncBar onFinished={() => void refresh()} />` in the header row, and render the drawer when exactly one item is open:

```tsx
      {openItemId !== null && (() => {
        const openItem = items.find((i) => i.id === openItemId);
        return openItem === undefined ? null : (
          <ImagePane
            item={openItem}
            onClose={() => setOpenItemId(null)}
            onChanged={() => void refresh()}
          />
        );
      })()}
```

Pass `onOpen={setOpenItemId}` into `ItemList` and make the name cell a button that calls it, so the row's checkbox keeps its own job:

```tsx
            <td>
              <button type="button" className="name-button" onClick={() => onOpen(item.id)}>
                {item.name}
              </button>
            </td>
```

Add `onOpen: (id: string) => void;` to `ItemList`'s props.

- [ ] **Step 5: Style it**

Append to `studio/src/tokens.css`:

```css
/* The image drawer. Quiet by construction — the SOLD stamp stays the only bold
   element on the page (spec §14.5), so nothing here competes with it. */

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(30rem, 100vw);
  overflow-y: auto;
  padding: 1rem;
  background: var(--carbon-pale);
  border-left: 1px solid var(--carbon-rule);
}

.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--gap);
  margin-bottom: 1rem;
}

.drawer-head h2 {
  margin: 0;
  font-family: var(--font-head);
  font-size: var(--step-2);
  font-weight: 600;
}

.dropzone {
  padding: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
  border: 1px dashed var(--carbon-rule);
}

.dropzone.over {
  border-color: var(--ink);
  border-style: solid;
}

.dropzone p {
  margin: 0 0 0.5rem;
  color: var(--ink-soft);
}

.file-button input[type="file"] {
  display: block;
  margin: 0 auto;
  font-family: var(--font-ui);
  font-size: var(--step-0);
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: var(--gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.thumb {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--carbon-rule);
  cursor: grab;
}

.thumb img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  background: var(--carbon-rule);
}

.thumb-name {
  font-family: var(--font-data);
  font-size: 0.75rem;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.sync-bar {
  display: flex;
  align-items: baseline;
  gap: var(--gap);
}

.sync-status {
  font-family: var(--font-data);
  color: var(--ink-soft);
}

.name-button {
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--carbon-rule);
  cursor: pointer;
}

.name-button:hover {
  border-bottom-color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  .dropzone,
  .thumb {
    transition: none;
  }
}
```

- [ ] **Step 6: Verify by hand**

Run `pnpm studio`, then:
1. Click an item's name → the drawer opens listing its photos.
2. Drag two photos from Finder onto the drop zone → both appear as thumbnails; `git status content/` shows the new files.
3. Drag a thumbnail to a new position → the filenames renumber to `01-`, `02-` and the grid reflects the new order.
4. Click **Remove** on one → it disappears and the file is gone from disk.
5. Drop a `.txt` renamed to `.jpg` → a clear error appears and nothing is written.
6. Click **Push photos to CDN** → the status line advances, then reports totals (or an error, if this repo has no R2 credentials — that is a valid outcome).
7. Tab through the drawer: the close button, the file input, and every Remove button take visible focus.
8. Narrow the window below 640px → the drawer takes the full width and the grid reflows without horizontal page scroll.

- [ ] **Step 7: Clean up any test photos**

Run: `git status --porcelain content/` and remove anything you added during step 6. Confirm the output is empty before committing.

- [ ] **Step 8: Type-check, lint, test, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`

```bash
git add studio/
git commit -m "feat: add the image pane with drag upload, reorder, and CDN push"
```

---

## Part 2A Definition of Done

- The seller can drag photos into a browser, reorder them, delete them, and push them to the CDN without leaving `pnpm studio`.
- Reordering renames files so the published site shows the same order the seller arranged.
- A file whose bytes are not a JPEG, PNG, WebP or GIF is never written into `content/`.
- Two syncs cannot run at once, and progress streams while one runs.
- The CSRF guard's "application/json only" rule is intact; no route accepts a CORS-simple content type.
- `pnpm upload-images`, `pnpm mark-sold`, and `pnpm build` behave exactly as before.
- `pnpm test`, `pnpm type-check`, `pnpm lint` clean.

## Deferred to Part 2B

The item create and edit form (including the nested-path constraint on `applyFieldEdits` that Part 1's review flagged — `isEditableField` gates `path[0]` only, and the form is the first place field paths come from the browser), the publish pane, `TEMPLATE_PATHS` distribution with the bilingual `UPDATE_GUIDE` update, seller-facing documentation for `pnpm studio`, threading a content root through the loader so studio's reads and writes agree, the studio-layer `reserved_for` test that unblocks, and distinguishing a skipped no-op from `ok` in the bulk-status result shape.
