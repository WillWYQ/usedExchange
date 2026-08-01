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
import { z } from "zod";
// Relative, not "@/…": this module is imported from studio/vite.config.ts, and
// Vite's config bundler does not resolve the "@/" alias (it only applies inside
// the dev server that this very config file produces). An unresolved "@/"
// import here isn't just cosmetic — it makes Vite treat the module as external
// and skip bundling it, so correctness would depend on tsx's tsconfig-paths
// hook resolving it at runtime, an undeclared and untested resolution chain.
import { siteConfig } from "../../content/config";
import { loadAllItemsRaw } from "../../lib/content/loader";
import { isValidSlug } from "../../lib/utils/slug";
import { applyFieldEdits, readItemField, readItemForEdit, type FieldEdit } from "./itemEdit";
import { buildItemTemplate, renderItemTemplateJsonc } from "./itemTemplate";
// assertEditableValue, directly: handleItemPatch needs to validate a
// COMPOSED tier object (built up from several leaf edits in the same batch)
// against the exact schema a whole-tier write would have to satisfy, and
// that schema — along with the "is this even a legal index" grammar — is
// itemFields.ts's alone to own. Re-deriving either here would be a second,
// disagreeing answer the moment itemFields.ts's grammar changes.
import { assertEditableValue } from "./itemFields";
import { getSyncRunner, isSyncRunning, streamImageSync } from "./studioSync";
import {
  contentTypeFor,
  deleteImage,
  IMAGE_EXTENSIONS,
  isValidImageFilename,
  listImageFiles,
  reorderImages,
  sanitizeUploadFilename,
  sniffImageType,
  writeImage,
  type ImageEntry,
} from "./studioImages";

export type { ImageEntry };

export type StudioRequest = {
  method: string;
  url: string;
  body: Buffer;
  projectRoot: string;
};

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
  // Delegates to listImageFiles rather than re-implementing the same readdir
  // + filter: the table's IMG column and the image pane's grid must count
  // the same thing, or the seller sees a number that disagrees with what
  // they can see and manage — the exact bug this shared function closes.
  return (await listImageFiles(dir)).length;
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
      let imageCount = 0;
      try {
        const dir = resolveItemDir(projectRoot, item.categorySlug, item.itemSlug);
        imageCount = await countImages(dir);
      } catch {
        // Item's directory cannot be resolved (e.g., invalid slug in folder name).
        // Still return the item with imageCount: 0 so the seller can see the
        // malformed folder and fix it, rather than hiding the entire list.
      }

      const amounts = item.price.tiers.map((t) => t.amount);
      return {
        id: `${item.categorySlug}/${item.itemSlug}`,
        categorySlug: item.categorySlug,
        itemSlug: item.itemSlug,
        name: item.name,
        status: item.status,
        currency: item.price.currency,
        lowestTierAmount: amounts.length > 0 ? Math.min(...amounts) : null,
        imageCount,
      } satisfies StudioItem;
    }),
  );
}

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
  // clears it, so the two fields can never disagree — EXCEPT when the item is
  // already sold and the target status is also sold (bulk "Mark sold" applied
  // to a mix of items, some already sold). Stamping today there would
  // overwrite the original sale date with no status change to show for it,
  // silently republishing expired listings once soldItemRetentionDays has
  // elapsed (lib/content/loader.ts's isSoldItemVisible). Mirrors the CLI's
  // idempotence guard in markSold.ts. Nothing would change on disk in that
  // case, so skip the write entirely rather than rewriting status to its
  // current value.
  const currentStatus = readItemField(text, "status");
  if (status === "sold" && currentStatus === "sold") {
    return;
  }

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

  // Normalise before validating: a macOS screenshot ("Screenshot 2026-07-30
  // at 10.00.00.png") or a browser-downloaded duplicate ("photo (1).jpg") is
  // exactly how a non-technical seller acquires photos, and neither is
  // malformed — they just fall outside the character allowlist. Sanitising
  // means the seller never has to rename anything themselves; writeImage's
  // wx collision loop below already handles the sanitised name colliding
  // with an existing file.
  const sanitized = sanitizeUploadFilename(filename);

  if (!isValidImageFilename(sanitized)) {
    // Two genuinely different problems get two different messages: an
    // unsupported extension is a format problem (the seller needs to
    // convert or re-export the photo); anything else survives sanitising
    // with no usable characters at all before the extension (e.g. "??.jpg",
    // "照片.jpg"), which is not a format problem and must not be reported as
    // one.
    //
    // The extension check runs against the ORIGINAL filename, not the
    // sanitised one: sanitising a name with no usable base characters
    // collapses it to just the extension (e.g. ".jpg"), and Node's
    // path.extname treats a string that is *only* an extension as a dotfile
    // with no extension at all (path.extname(".jpg") === "") — checking the
    // sanitised name there would misroute a perfectly good extension into
    // this branch and tell the seller their JPEG isn't a JPEG. The original
    // filename's base was never emptied by sanitising, so it doesn't have
    // this problem.
    const ext = path.extname(filename).slice(1).toLowerCase();
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new StudioError(
        400,
        `"${filename}" is not an image filename — use .jpg, .png, .webp or .gif`,
      );
    }
    throw new StudioError(
      400,
      `"${filename}" has no usable filename left after removing spaces and unsupported characters — rename it to start with a letter or digit`,
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
    throw new StudioError(400, `"${filename}" is not a JPEG, PNG, WebP or GIF`);
  }

  const dir = resolveItemDir(req.projectRoot, category, item);
  const written = await writeImage(dir, sanitized, bytes);

  return { status: 201, body: { file: written, files: await listImageFiles(dir) } };
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
  // hold if the allowlist is ever relaxed. `rel !== filename` alone is
  // tautological for a plain "../" payload: path.join normalizes it away
  // before path.relative re-derives it, so the two strings round-trip back to
  // equal. rel.startsWith("..") and path.isAbsolute(rel) are what actually
  // catch it — the same shape resolveItemDir uses above.
  const rel = path.relative(dir, filePath);
  if (rel !== filename || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new StudioError(400, "resolved path escapes the item folder");
  }

  try {
    await fsPromises.access(filePath);
  } catch {
    throw new StudioError(404, `no such image: ${filename}`);
  }

  return { status: 200, file: filePath, contentType: contentTypeFor(filename) };
}

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

  // No per-name allowlist check here on purpose: `order` must be able to
  // name a non-editable file (one listImageFiles reports but the allowlist
  // would reject) so it is never silently dropped from the folder's
  // accounting — reorderImages' own sameSet check, matched against a real
  // directory listing, is the actual gate, and it refuses (rather than
  // renames) any file the allowlist would reject. See studioImages.ts's
  // reorderImages doc comment.
  const dir = resolveItemDir(req.projectRoot, category, item);
  try {
    return { status: 200, body: { files: await reorderImages(dir, order) } };
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }
}

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

// /api/items/<category>/<item> — the bare item, no trailing segment. Anchored
// on $ so it can never swallow the /images routes above it.
const ITEM_ROUTE_RE = /^\/api\/items\/([^/]+)\/([^/]+)$/;

async function readItemJson(req: StudioRequest, category: string, item: string): Promise<{
  jsonPath: string;
  text: string;
}> {
  const dir = resolveItemDir(req.projectRoot, category, item);
  const jsonPath = path.join(dir, "item.json");
  try {
    return { jsonPath, text: await fsPromises.readFile(jsonPath, "utf-8") };
  } catch {
    throw new StudioError(404, `no such item: ${category}/${item}`);
  }
}

async function handleItemGet(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { text } = await readItemJson(req, category, item);
  return { status: 200, body: { fields: readItemForEdit(text) } };
}

// `value: z.unknown()` rather than a concrete type: itemFields.ts owns value
// validation, and it validates against the schema for THAT path. Duplicating a
// weaker check here would only produce a second, disagreeing answer.
const patchBodySchema = z.object({
  edits: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])).min(1),
        value: z.unknown(),
      }),
    )
    .min(1),
});

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rejects a PATCH batch whose net effect on `price.tiers` either indexes
 * beyond the array's true length, or leaves a newly-appended tier
 * incomplete. Two independent gaps in the first version of this check (fix
 * round 1, findings IMPORTANT 1 and IMPORTANT 2):
 *
 *  - IMPORTANT 2: bounds were checked against a snapshot of `tiers` taken
 *    once, before the batch, but a batch can also replace `price` or
 *    `price.tiers` wholesale — which changes the array's real length mid
 *    batch. A stale snapshot both false-rejects an edit landing inside an
 *    array the batch itself just grew, and — the more serious direction —
 *    false-*accepts* an edit the batch's own earlier edit just made
 *    genuinely out of range, which jsonc-parser's modify() then silently
 *    clamps into the wrong slot: the exact failure mode this check exists to
 *    stop, reopened by a different path to it.
 *  - IMPORTANT 1: checking only the index missed that a batch appending a
 *    tier via a SINGLE leaf edit (e.g. only `{path:["price","tiers",1,
 *    "amount"], value:35}`, no "label") lands `index === length` — a
 *    legitimate append position — while leaving the object it creates
 *    missing a required field. assertEditableValue validates that one
 *    leaf's own value (a plain, valid number) and has no way to see that the
 *    object it lands inside is incomplete; jsonc-parser writes it anyway.
 *
 * This walks the batch in the same order applyFieldEdits will apply it,
 * maintaining a plain-JS working copy of `tiers` — updated by every edit
 * that touches `price`, `price.tiers`, or `price.tiers[i]`, in order — so
 * bounds are always checked against what the array will actually be at that
 * point in the batch, not a stale snapshot. Once the whole batch has been
 * walked, every tier that was newly appended via one or more LEAF writes
 * (never a single whole-object write at `path.length === 3`, which
 * assertEditableValue already fully validates as a unit) is re-validated
 * against the exact schema a whole-object write would have had to satisfy.
 *
 * Only reached after every edit's own path/value pairing has already passed
 * assertEditableValue (see handleItemPatch): a non-integer or negative
 * "index" like `["price","tiers",1.5,...]` is therefore never seen here in
 * practice — resolveFieldSchema already refused it with its own, more
 * specific reason (fix round 1, finding MINOR 4). The isNonNegativeInteger
 * guard below is defense in depth, not the primary gate.
 */
function assertTierBatchIsWellFormed(text: string, edits: FieldEdit[]): void {
  const rawPrice = readItemField(text, "price") as { tiers?: unknown } | undefined;
  let tiers: unknown[] = Array.isArray(rawPrice?.tiers) ? [...rawPrice.tiers] : [];
  // Indices completed within this batch by at least one LEAF write — the
  // only ones whose completeness this batch could possibly have broken. A
  // whole-object write at path.length === 3 removes its index from this set
  // the moment it lands (see the `path.length === 3` branch below).
  const appendedByLeaf = new Set<number>();

  for (const edit of edits) {
    const [p0, p1, p2, p3] = edit.path;
    if (p0 !== "price") continue;

    if (edit.path.length === 1) {
      // Whole "price" replaced: re-derive tiers from the new value entirely,
      // discarding whatever this batch had built up for it so far.
      const nextTiers = (edit.value as { tiers?: unknown } | null | undefined)?.tiers;
      tiers = Array.isArray(nextTiers) ? [...nextTiers] : [];
      appendedByLeaf.clear();
      continue;
    }
    if (p1 !== "tiers") continue;

    if (edit.path.length === 2) {
      // Whole "price.tiers" replaced.
      tiers = Array.isArray(edit.value) ? [...(edit.value as unknown[])] : [];
      appendedByLeaf.clear();
      continue;
    }
    if (!isNonNegativeInteger(p2)) continue;

    if (p2 > tiers.length) {
      throw new StudioError(
        400,
        `"price.tiers.${p2}" is out of range: the array currently has ${tiers.length} item(s) (append at index ${tiers.length} to add one)`,
      );
    }
    const isNewIndex = p2 === tiers.length;

    if (edit.path.length === 3) {
      // Whole-tier object write — already fully schema-checked elsewhere, so
      // it always leaves a complete tier at this index.
      tiers[p2] = edit.value;
      appendedByLeaf.delete(p2);
      continue;
    }

    if (edit.path.length === 4 && typeof p3 === "string") {
      if (isNewIndex) appendedByLeaf.add(p2);
      const base = isPlainRecord(tiers[p2]) ? { ...tiers[p2] } : {};
      base[p3] = edit.value;
      tiers[p2] = base;
    }
  }

  for (const idx of appendedByLeaf) {
    try {
      assertEditableValue(["price", "tiers", idx], tiers[idx]);
    } catch (err: unknown) {
      throw new StudioError(
        400,
        `"price.tiers.${idx}" is incomplete once this batch is applied: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

async function handleItemPatch(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { edits: parsedEdits } = parseJsonBody(req.body, patchBodySchema);
  // z.unknown() accepts `undefined`, so Zod infers `value` as an OPTIONAL
  // property on the parsed object — not present, versus FieldEdit's `value:
  // unknown`, which is always present (possibly holding `undefined`). Those
  // are different shapes to the type checker even though every parsed edit
  // already carries a `value` key at runtime (patchBodySchema's `.object()`
  // only omits it when the request itself omitted it, which is a legitimate
  // "set this field to undefined" edit, not a malformed one). This map is a
  // type-level normalisation, not a behavioural one.
  const edits: FieldEdit[] = parsedEdits.map((e) => ({ path: e.path, value: e.value }));
  const { jsonPath, text } = await readItemJson(req, category, item);

  // Each edit's own path/value pairing is checked first, so a genuinely
  // malformed edit (an unknown field, a non-integer array index, an invalid
  // value for its OWN path) is reported with assertEditableValue's specific
  // reason rather than being pre-empted by the batch-level tier check below
  // (fix round 1, finding MINOR 4).
  try {
    for (const edit of edits) assertEditableValue(edit.path, edit.value);
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }

  assertTierBatchIsWellFormed(text, edits);

  // applyFieldEdits re-validates every path and value (redundant with the
  // loop just above, but cheap, and keeps applyFieldEdits' own contract — "a
  // rejected batch leaves the file untouched" — true standing entirely on
  // its own) before touching the string, so a rejected batch never reaches
  // writeFile and the file on disk is unchanged, including the valid edits
  // that shared the batch.
  let next: string;
  try {
    next = applyFieldEdits(text, edits);
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }

  await fsPromises.writeFile(jsonPath, next, "utf-8");

  // Re-read rather than returning `next`: the response is the file, and if
  // anything about the write differed from what we computed the seller sees the
  // truth. Same single-source-of-truth rule the item table follows.
  return {
    status: 200,
    body: { fields: readItemForEdit(await fsPromises.readFile(jsonPath, "utf-8")) },
  };
}

const createItemBodySchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
});

async function handleItemCreate(req: StudioRequest): Promise<StudioResponse> {
  const { category, name } = parseJsonBody(req.body, createItemBodySchema);

  // resolveItemDir runs the slug allowlist AND the containment assertion, so
  // this is the same two-layer check every other write path uses.
  const dir = resolveItemDir(req.projectRoot, category, name);
  const jsonPath = path.join(dir, "item.json");

  try {
    await fsPromises.access(jsonPath);
    throw new StudioError(409, `${category}/${name} already exists`);
  } catch (err: unknown) {
    // access() rejects when the file is absent — that is the good path here.
    // A StudioError thrown in the try block above must not be swallowed by it.
    if (err instanceof StudioError) throw err;
  }

  // recursive: true also creates the category folder. `pnpm create-item`
  // requires an existing category, but studio must not: a seller with no
  // categories yet cannot create one anywhere else in this UI, which would make
  // the create button a dead end on a fresh site. No _category.json is written
  // — lib/content/loader.ts derives a display name from the slug when it is
  // absent, so the category is complete without one.
  await fsPromises.mkdir(dir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const displayName = name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const template = buildItemTemplate(
    displayName,
    today,
    siteConfig.measurementUnit,
    siteConfig.defaultPriceTiers,
  );

  // "wx" rather than a plain write: two create requests for the same slug can
  // interleave between the access() check above and here, and the loser must
  // not silently flatten the winner's file.
  try {
    await fsPromises.writeFile(jsonPath, renderItemTemplateJsonc(template), { flag: "wx" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new StudioError(409, `${category}/${name} already exists`);
    }
    throw err;
  }

  return { status: 201, body: { id: `${category}/${name}` } };
}

export async function handleStudioRequest(req: StudioRequest): Promise<StudioResponse> {
  const pathname = req.url.split("?")[0] ?? "";

  try {
    if (pathname === "/api/items") {
      if (req.method === "GET") {
        return { status: 200, body: { items: await listStudioItems(req.projectRoot) } };
      }
      if (req.method === "POST") {
        return await handleItemCreate(req);
      }
      return { status: 405, body: { error: "GET or POST only" } };
    }

    if (pathname === "/api/items/bulk-status") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      // `await`, not a bare return: a promise returned out of this try block
      // rejects after the block has exited, so StudioError would escape the
      // catch below instead of becoming its 400/404 response.
      return await handleBulkStatus(req);
    }

    // Matched against the raw, still-percent-encoded pathname on purpose: an
    // encoded "%2F" inside what should be a single filename segment must NOT
    // be mistaken for a literal "/" here, or a traversal payload could smuggle
    // itself in as an extra route segment that never reaches
    // isValidImageFilename below. Route matching decides segment boundaries;
    // decoding happens only after, on the segments this match already
    // isolated.
    const imageMatch = IMAGE_ROUTE_RE.exec(pathname);
    if (imageMatch !== null) {
      const [, categoryRaw, itemRaw, filenameRaw] = imageMatch;
      if (categoryRaw === undefined || itemRaw === undefined) {
        return { status: 400, body: { error: "malformed image route" } };
      }

      // Decode each segment individually, after the route match and before
      // any validation runs — never the other way around, or the allowlist
      // would inspect a different string than the one the filesystem
      // ultimately receives. A malformed escape sequence (e.g. a lone "%") is
      // itself a bad request, not a 500.
      let category: string;
      let item: string;
      let filename: string | undefined;
      try {
        category = decodeURIComponent(categoryRaw);
        item = decodeURIComponent(itemRaw);
        filename = filenameRaw === undefined ? undefined : decodeURIComponent(filenameRaw);
      } catch {
        return { status: 400, body: { error: "malformed URL encoding" } };
      }

      if (req.method === "GET") {
        return filename === undefined
          ? await handleImageList(req, category, item)
          : await handleImageGet(req, category, item, filename);
      }
      if (req.method === "POST" && filename === undefined) {
        return await handleImageUpload(req, category, item);
      }
      if (req.method === "POST" && filename === "reorder") {
        return await handleImageReorder(req, category, item);
      }
      if (req.method === "DELETE" && filename !== undefined) {
        return await handleImageDelete(req, category, item, filename);
      }
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }

    const itemMatch = ITEM_ROUTE_RE.exec(pathname);
    if (itemMatch !== null) {
      const [, categoryRaw, itemRaw] = itemMatch;
      if (categoryRaw === undefined || itemRaw === undefined) {
        return { status: 400, body: { error: "malformed item route" } };
      }

      // Decoded per segment after the route match, never before — the same
      // ordering the image routes use, and for the same reason: the allowlist
      // must inspect exactly the string the filesystem will receive.
      let category: string;
      let item: string;
      try {
        category = decodeURIComponent(categoryRaw);
        item = decodeURIComponent(itemRaw);
      } catch {
        return { status: 400, body: { error: "malformed URL encoding" } };
      }

      if (req.method === "GET") return await handleItemGet(req, category, item);
      if (req.method === "PATCH") return await handleItemPatch(req, category, item);
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }

    if (pathname === "/api/sync-images") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return handleSyncImages();
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
