// Seller Studio's HTTP surface, deliberately independent of any server
// framework: it takes a plain request description and returns a status plus a
// JSON-serialisable body, so it can be driven by the Vite middleware in
// studio/vite.config.ts and by Vitest without a running server.
//
// Every filesystem path derived from browser input passes two checks: the shared
// kebab-case slug allowlist (lib/utils/slug.ts) and a resolved-path containment
// assertion against content/items/. Both layers, because the allowlist may be
// relaxed later.

import { execFile } from "child_process";
import fsPromises from "fs/promises";
import path from "path";
import { promisify } from "util";
import { z } from "zod";
// Relative, not "@/…": this module is imported from studio/vite.config.ts, and
// Vite's config bundler does not resolve the "@/" alias (it only applies inside
// the dev server that this very config file produces). An unresolved "@/"
// import here isn't just cosmetic — it makes Vite treat the module as external
// and skip bundling it, so correctness would depend on tsx's tsconfig-paths
// hook resolving it at runtime, an undeclared and untested resolution chain.
import { siteConfig } from "../../content/config";
import { loadAllItemsRaw } from "../../lib/content/loader";
import type { Item } from "../../lib/content/types";
import { pickCoverFilename } from "../../lib/utils/coverImage";
import { LOCALE_FIELD_MAP } from "../../lib/utils/i18n";
import { isValidSlug } from "../../lib/utils/slug";
import { applyFieldEdits, readItemField, readItemForEdit, type FieldEdit } from "./itemEdit";
import { buildItemTemplate, renderItemTemplateJsonc } from "./itemTemplate";
import {
  readConfig,
  validateConfigValue,
  writeConfigValue,
  type ConfigField,
} from "./configEdit";
import {
  DEFAULTS_FILENAME,
  loadMergedDefaults,
  mergeDefaultsIntoTemplate,
  readDefaultsFile,
  validateDefaults,
} from "./itemDefaults";
import { buildReadinessReport } from "./siteReadiness";
// assertEditableValue, directly: handleItemPatch needs to validate a
// COMPOSED tier object (built up from several leaf edits in the same batch)
// against the exact schema a whole-tier write would have to satisfy, and
// that schema — along with the "is this even a legal index" grammar — is
// itemFields.ts's alone to own. Re-deriving either here would be a second,
// disagreeing answer the moment itemFields.ts's grammar changes.
import { assertEditableValue } from "./itemFields";
import { GitError, publishChanges, readChanges } from "./studioGit";
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
  /** First image filename, or null if the item has no images. */
  coverImage: string | null;
  /** locale -> display name; defaultLocale is always included. */
  localizedNames: Record<string, string>;
  /** Seller-authored tags, used by studio's client-side search. */
  tags: string[];
  /**
   * YYYY-MM-DD for sorting. In practice always a string: the content loader
   * fills a missing `listed_date` with the build date before studio sees the
   * item (lib/content/loader.ts), so "no date" never reaches the client. The
   * type stays nullable because the client's date sort shares its comparator
   * with the price sort, where null is genuinely reachable.
   */
  listedDate: string | null;
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

/** One readdir, shared by the table's Photo/count column and the image pane's
 * grid: they must agree on both the count and the cover, or the seller sees
 * numbers and thumbnails that disagree with what they can see and manage. */
async function readImageState(
  dir: string,
): Promise<{ imageCount: number; coverImage: string | null }> {
  const files = await listImageFiles(dir);
  return {
    imageCount: files.length,
    coverImage: pickCoverFilename(files.map((f) => f.name)),
  };
}

function localizedNameFor(item: Item, locale: string): string | undefined {
  if (locale === siteConfig.i18n.defaultLocale) return item.name;
  const fieldMap = LOCALE_FIELD_MAP[locale];
  if (fieldMap === undefined) return undefined;
  const value = item[fieldMap.name];
  return typeof value === "string" ? value : undefined;
}

function buildLocalizedNames(item: Item): Record<string, string> {
  const result: Record<string, string> = {};
  for (const locale of siteConfig.i18n.availableLocales) {
    const value = localizedNameFor(item, locale);
    if (typeof value === "string" && value.trim() !== "") {
      result[locale] = value;
    }
  }
  return result;
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
      let coverImage: string | null = null;
      try {
        const dir = resolveItemDir(projectRoot, item.categorySlug, item.itemSlug);
        ({ imageCount, coverImage } = await readImageState(dir));
      } catch {
        // Item's directory cannot be resolved (e.g., invalid slug in folder name).
        // Still return the item with imageCount: 0 and no cover so the seller
        // can see the malformed folder and fix it, rather than hiding the list.
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
        coverImage,
        localizedNames: buildLocalizedNames(item),
        // Defensive: the loader's schema defaults tags to [], but a hand-edited
        // file that parsed oddly must not hand the client a non-array to iterate.
        tags: Array.isArray(item.tags) ? item.tags : [],
        listedDate: typeof item.listedDate === "string" ? item.listedDate : null,
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
  /** Items already in the target state — nothing was written for them. */
  skipped: number;
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
): Promise<"written" | "skipped"> {
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
    return "skipped";
  }

  const next = applyFieldEdits(text, [
    { path: ["status"], value: status },
    { path: ["sold_date"], value: status === "sold" ? today : null },
  ]);

  await fsPromises.writeFile(jsonPath, next, "utf-8");
  return "written";
}

async function handleBulkStatus(req: StudioRequest): Promise<StudioResponse> {
  const { ids, status } = parseJsonBody(req.body, bulkStatusBodySchema);
  const today = new Date().toISOString().slice(0, 10);

  // Each item is written independently and failures are reported per item. No
  // rollback: undoing half-written files can itself fail, and the successful
  // writes are work the seller does not want discarded. Matches the failure
  // philosophy in imageSync.ts.
  const result: BulkStatusResult = { ok: 0, skipped: 0, failed: [] };

  for (const id of ids) {
    try {
      // "skipped" is not a lesser "ok": reporting an untouched already-sold
      // item as updated tells the seller their sale date was re-stamped when
      // the whole point of the guard is that it was not.
      const outcome = await applyStatus(req.projectRoot, id, status, today);
      if (outcome === "skipped") result.skipped++;
      else result.ok++;
    } catch (err: unknown) {
      result.failed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { status: 200, body: result };
}

// ── Bulk apply default tiers ─────────────────────────────────────────────────
// Writes each selected item's price.tiers from its OWN category's merged
// defaults (site ← category) — the same tiers a new item of that category
// would receive. Items with no default tiers, or tiers already matching, are
// skipped; failures are per-item and never abort the batch (same philosophy
// as handleBulkStatus).

const bulkApplyTiersBodySchema = z.object({
  ids: z.array(z.string()).min(1),
});

export type BulkTiersResult = {
  ok: number;
  /** No default tiers for this item's merged scope, or tiers already match. */
  skipped: number;
  failed: Array<{ id: string; error: string }>;
};

// Tiers compare equal when their four fields match, whatever key order the
// on-disk JSON uses. Missing optional bounds read as null on both sides.
function canonicalTier(tier: Record<string, unknown>): string {
  return JSON.stringify([
    tier.label ?? "",
    tier.miles_min ?? null,
    tier.miles_max ?? null,
    tier.amount ?? 0,
  ]);
}

function sameTiers(current: unknown, next: unknown[]): boolean {
  if (!Array.isArray(current) || current.length !== next.length) return false;
  return current.every((tier, i) => {
    const other = next[i];
    return (
      isPlainRecord(tier) &&
      isPlainRecord(other) &&
      canonicalTier(tier) === canonicalTier(other)
    );
  });
}

async function applyDefaultTiersToItem(
  projectRoot: string,
  id: string,
  itemsRoot: string,
): Promise<"written" | "skipped"> {
  const slashIdx = id.indexOf("/");
  if (slashIdx === -1) {
    throw new StudioError(400, `id must be "<category>/<item>": got "${id}"`);
  }
  const category = id.slice(0, slashIdx);
  const dir = resolveItemDir(projectRoot, category, id.slice(slashIdx + 1));
  const jsonPath = path.join(dir, "item.json");
  const text = await fsPromises.readFile(jsonPath, "utf-8");

  // loadMergedDefaults validates both _defaults.json layers as it reads; a
  // hand-broken file surfaces here as a per-item failure naming the file.
  const merged = await loadMergedDefaults(itemsRoot, category);
  const price = merged["price"];
  const tiers = isPlainRecord(price) ? price["tiers"] : undefined;
  if (!Array.isArray(tiers) || tiers.length === 0) return "skipped";

  const currentPrice = readItemField(text, "price") as { tiers?: unknown } | undefined;
  if (sameTiers(currentPrice?.tiers, tiers)) return "skipped";

  // The edit form's own write path: field allowlist + strict tier schema are
  // re-checked here, and a rejected edit leaves the file untouched.
  const next = applyFieldEdits(text, [{ path: ["price", "tiers"], value: tiers }]);
  await fsPromises.writeFile(jsonPath, next, "utf-8");
  return "written";
}

async function handleBulkApplyTiers(req: StudioRequest): Promise<StudioResponse> {
  const { ids } = parseJsonBody(req.body, bulkApplyTiersBodySchema);
  const itemsRoot = path.join(req.projectRoot, "content", "items");
  const result: BulkTiersResult = { ok: 0, skipped: 0, failed: [] };

  for (const id of ids) {
    try {
      const outcome = await applyDefaultTiersToItem(req.projectRoot, id, itemsRoot);
      if (outcome === "skipped") result.skipped++;
      else result.ok++;
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
  applyDefaults: z.boolean().optional(),
});

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
  let defaults: Awaited<ReturnType<typeof readDefaultsFile>>;
  try {
    // One catch for both read and validate: a hand-broken file (syntax or
    // field) must surface in the pane as a 400 naming the file and field,
    // exactly as the create path reports it — a 500 would surface as an
    // opaque error page instead. (fs errors like EACCES becoming 400 is the
    // same trade-off the create path already makes.)
    defaults = await readDefaultsFile(filePath);
    validateDefaults(defaults);
  } catch (err: unknown) {
    throw new StudioError(
      400,
      err instanceof Error && err.message.startsWith("invalid defaults in")
        ? err.message
        : `invalid defaults in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
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

// ── Site config ──────────────────────────────────────────────────────────────

const runTsc = promisify(execFile);

const configPutBodySchema = z.object({
  path: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

function configPaths(projectRoot: string): { config: string; types: string; tsconfig: string } {
  return {
    config: path.join(projectRoot, "content", "config.ts"),
    types: path.join(projectRoot, "lib", "config", "types.ts"),
    tsconfig: path.join(projectRoot, "tsconfig.json"),
  };
}

/**
 * Reads both sources and parses them into the field list. Every failure —
 * missing file, unreadable file, no `siteConfig` declaration — becomes a 400
 * naming the file, so the pane can show the seller what to fix instead of
 * rendering an opaque error.
 */
async function readConfigFields(projectRoot: string): Promise<{ fields: ConfigField[]; source: string }> {
  const { config, types } = configPaths(projectRoot);
  let source: string;
  let typesSource: string;
  try {
    source = await fsPromises.readFile(config, "utf-8");
  } catch (err: unknown) {
    throw new StudioError(400, `cannot read ${config}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    typesSource = await fsPromises.readFile(types, "utf-8");
  } catch {
    // The types file only supplies enum options. Without it every enum
    // degrades to a plain string field, which is worse but still usable —
    // better than refusing to open the pane at all.
    typesSource = "";
  }
  try {
    return { fields: readConfig(source, typesSource), source };
  } catch (err: unknown) {
    throw new StudioError(400, `cannot parse ${config}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleConfigGet(req: StudioRequest): Promise<StudioResponse> {
  const { fields } = await readConfigFields(req.projectRoot);
  return { status: 200, body: { fields } };
}

async function handleConfigPut(req: StudioRequest): Promise<StudioResponse> {
  const { path: fieldPath, value } = parseJsonBody(req.body, configPutBodySchema);
  const { config, tsconfig } = configPaths(req.projectRoot);
  const { fields, source } = await readConfigFields(req.projectRoot);

  const field = fields.find((f) => f.path === fieldPath);
  if (field === undefined) {
    throw new StudioError(400, `Unknown config path: ${fieldPath}`);
  }

  let next: string;
  try {
    validateConfigValue(field, value);
    next = writeConfigValue(source, fieldPath, value);
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }

  // Write to a sibling temp file and only rename it over the real config once
  // tsc is happy. A failed gate must leave content/config.ts byte-identical,
  // so the original is never opened for writing at all — rename is atomic on
  // the same filesystem, so there is no window where the file is half-written.
  const tempPath = path.join(path.dirname(config), ".config.ts.tmp");
  await fsPromises.writeFile(tempPath, next, "utf-8");

  let hasTsconfig = true;
  try {
    await fsPromises.access(tsconfig);
  } catch {
    hasTsconfig = false;
  }

  if (hasTsconfig) {
    // The gate: type-check the project with the candidate config in place.
    // Swap it in, run tsc, and put the original back if anything fails —
    // tsc has to see the file at its real path for the check to mean anything.
    const backup = `${config}.studio-backup`;
    await fsPromises.rename(config, backup);
    try {
      await fsPromises.rename(tempPath, config);
      await runTsc("pnpm", ["exec", "tsc", "--noEmit"], { cwd: req.projectRoot });
      await fsPromises.rm(backup, { force: true });
    } catch (err: unknown) {
      // Restore the original and report the type errors verbatim.
      await fsPromises.rm(config, { force: true });
      await fsPromises.rename(backup, config);
      await fsPromises.rm(tempPath, { force: true });
      const detail =
        err !== null && typeof err === "object" && "stdout" in err
          ? String((err as { stdout: unknown }).stdout)
          : err instanceof Error
            ? err.message
            : String(err);
      throw new StudioError(400, `type-check failed, so ${fieldPath} was not saved:\n${detail}`);
    }
  } else {
    // No tsconfig.json (a test sandbox, or a project that does not type-check
    // at all): skip the gate rather than fail the write. Deliberate and
    // covered by a test — a silently absent gate would be dishonest.
    await fsPromises.rename(tempPath, config);
  }

  const { fields: after } = await readConfigFields(req.projectRoot);
  return { status: 200, body: { fields: after } };
}

// ── Setup readiness ──────────────────────────────────────────────────────────

async function handleReadinessGet(req: StudioRequest): Promise<StudioResponse> {
  // siteConfig is imported at module scope, so a config that fails to parse
  // stops the studio server before any route runs — the `config: null` branch
  // of buildReadinessReport is unreachable from here by construction. Only
  // `pnpm setup-check` can hit it, which is why that shell loads the config
  // defensively and this one does not.
  const report = await buildReadinessReport(req.projectRoot, siteConfig, process.env);
  return { status: 200, body: { report } };
}

async function handleItemCreate(req: StudioRequest): Promise<StudioResponse> {
  const { category, name, applyDefaults } = parseJsonBody(req.body, createItemBodySchema);

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
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new StudioError(409, `${category}/${name} already exists`);
    }
    throw err;
  }

  return { status: 201, body: { id: `${category}/${name}` } };
}

const publishBodySchema = z.object({
  message: z.string().min(1).max(500),
});

function asStudioError(err: unknown): never {
  if (err instanceof GitError) throw new StudioError(err.status, err.message);
  throw err;
}

async function handleChanges(req: StudioRequest): Promise<StudioResponse> {
  try {
    return { status: 200, body: await readChanges(req.projectRoot) };
  } catch (err: unknown) {
    asStudioError(err);
  }
}

async function handlePublish(req: StudioRequest): Promise<StudioResponse> {
  // An image sync writes lib/generated/image-manifest.json. Committing while
  // that is in flight ships a manifest that omits photos which were in fact
  // uploaded — broken images on the live site, with a green publish in studio.
  // A 409 is enough: the sync finishes in seconds to minutes and the seller can
  // simply publish after.
  if (isSyncRunning()) {
    throw new StudioError(
      409,
      "an image sync is still running — wait for it to finish, then publish",
    );
  }

  const { message } = parseJsonBody(req.body, publishBodySchema);
  try {
    return { status: 200, body: await publishChanges(req.projectRoot, message) };
  } catch (err: unknown) {
    asStudioError(err);
  }
}

export async function handleStudioRequest(req: StudioRequest): Promise<StudioResponse> {
  const pathname = req.url.split("?")[0] ?? "";

  try {
    if (pathname === "/api/items") {
      if (req.method === "GET") {
        return {
          status: 200,
          body: {
            items: await listStudioItems(req.projectRoot),
            defaultLocale: siteConfig.i18n.defaultLocale,
            availableLocales: siteConfig.i18n.availableLocales,
            // Optional per Iron Rule 8: absent config field → empty overrides,
            // and the studio client falls back to its built-in dictionaries.
            studioTranslations: siteConfig.studio?.translations ?? {},
          },
        };
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

    if (pathname === "/api/items/bulk-apply-tiers") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      // `await`, not a bare return — same reason as bulk-status above.
      return await handleBulkApplyTiers(req);
    }

    if (pathname === "/api/defaults") {
      if (req.method === "GET") return await handleDefaultsGet(req);
      if (req.method === "PUT") return await handleDefaultsPut(req);
      return { status: 405, body: { error: "GET or PUT only" } };
    }

    if (pathname === "/api/config") {
      if (req.method === "GET") return await handleConfigGet(req);
      if (req.method === "PUT") return await handleConfigPut(req);
      return { status: 405, body: { error: "GET or PUT only" } };
    }

    if (pathname === "/api/readiness") {
      if (req.method === "GET") return await handleReadinessGet(req);
      return { status: 405, body: { error: "GET only" } };
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

    if (pathname === "/api/changes") {
      if (req.method !== "GET") {
        return { status: 405, body: { error: "GET only" } };
      }
      return await handleChanges(req);
    }

    if (pathname === "/api/publish") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handlePublish(req);
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
