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
import crypto from "crypto";
import fsPromises from "fs/promises";
import os from "os";
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
import { readContactPlatforms, writeContactPlatformQrImage } from "./contactPlatforms";
import {
  DEFAULTS_FILENAME,
  loadMergedDefaults,
  mergeDefaultsIntoTemplate,
  readDefaultsFile,
  validateDefaults,
} from "./itemDefaults";
import {
  generateCatalogPdf,
  generateFlyerPdf,
  type PdfExportOptions,
  type PdfExportProgress,
} from "./pdfCatalog/generate";
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
import { streamProgressAsSse } from "./sseProgress";
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
  type ImageKind,
} from "./studioImages";
import {
  countCategoryItems,
  listCategorySlugs,
  readCategoryMeta,
  writeCategoryMeta,
  type CategoryMetaInput,
} from "./studioCategories";
import { SsrfError, fetchUrlSafely } from "./ssrfGuard";
import { extractImportCandidates, type ImportCandidate } from "./urlImport";
import { renderWithHeadlessBrowser } from "./headlessImport";
import {
  deleteContactImage,
  isValidContactImageFilename,
  resolveContactDir,
} from "./studioContact";

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
export type FileResponse = {
  status: number;
  file: string;
  contentType: string;
  /**
   * Called once this file's bytes have been fully sent to the client — e.g.
   * to release a token-redeemed temp file exactly once, only after delivery
   * is confirmed rather than at request-routing time. Omitted by routes that
   * serve persistent content (photos, contact images, the flyer export) —
   * those must never be deleted out from under the seller.
   */
  onSent?: () => void;
};
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
  description: string;
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
        description: item.description,
      } satisfies StudioItem;
    }),
  );
}

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
  // above), which would silently ignore a sandboxed projectRoot in tests.
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
  // .min(0): categoryJsonSchema's nullableNumber (lib/content/schema.ts) silently
  // reads any negative sort_order back as null, so a negative value here would
  // write successfully and then vanish on the very next read. Rejecting it at
  // the door is clearer than a value that appears to save and then disappears.
  sort_order: z.number().int().min(0).nullable().optional(),
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

// ── Import from URL ───────────────────────────────────────────────────────
// Two separate server round trips, matching the two-step seller flow: fetch
// the page and show candidates (no filesystem write, no category/item
// needed yet), then — once the seller has picked photos and the item exists
// — download and write only the chosen ones. Both legs go through
// scripts/lib/ssrfGuard.ts's fetchUrlSafely for every network request this
// feature makes; nothing here calls fetch/http directly.

// The page fetch only ever needs to read a few KB of <head> metadata in
// practice, but a generous cap keeps real-world pages (large inline JSON,
// hydration payloads) working; the image cap matches a typical high-res
// product photo with headroom.
const IMPORT_PAGE_FETCH_TIMEOUT_MS = 10_000;
const IMPORT_PAGE_MAX_BYTES = 8 * 1024 * 1024;
// Headless rendering is inherently slower than a plain fetch (cold
// navigation + JS execution + a settle wait) -- more generous than the
// plain-fetch timeout, but still bounded so a pathological page can't
// hang a preview request indefinitely.
const IMPORT_HEADLESS_TIMEOUT_MS = 20_000;
const IMPORT_IMAGE_FETCH_TIMEOUT_MS = 15_000;
const IMPORT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
// Bounds one request's worth of sequential downloads — this endpoint is a
// local seller's own tool, not a public API, so a modest cap (rather than a
// queue/concurrency system) is enough to keep one accidental "select all" on
// a huge gallery page from taking minutes.
//
// Exported because the Studio SPA has to refuse an over-cap selection BEFORE
// it creates the item: this endpoint is the second of two round trips, so a
// rejection here leaves a real, empty item behind. NewItemDialog.tsx cannot
// import from this module (it is Node-side), so it mirrors the number as
// MAX_IMPORT_PHOTOS_PER_BATCH and studioApi.test.ts fails if the two drift.
export const IMPORT_MAX_URLS_PER_REQUEST = 24;

function importFetchErrorMessage(err: unknown): string {
  // SsrfError and Node's own network errors both produce a message that is
  // safe (and useful) to show the seller as-is: Studio is a local, single-
  // seller tool, and the "attacker" this guard defends against is the
  // REMOTE page redirecting the fetch somewhere internal — not the seller
  // reading their own tool's error output. Naming the disallowed address
  // back to them is a feature (it explains why an import failed), not a
  // leak across a trust boundary that doesn't exist here.
  return err instanceof Error ? err.message : String(err);
}

function originOnly(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

const importUrlPreviewBodySchema = z.object({ url: z.string().min(1) });

async function handleImportUrlPreview(req: StudioRequest): Promise<StudioResponse> {
  const { url } = parseJsonBody(req.body, importUrlPreviewBodySchema);

  let fetched: Awaited<ReturnType<typeof fetchUrlSafely>> | null = null;
  try {
    fetched = await fetchUrlSafely(url, {
      timeoutMs: IMPORT_PAGE_FETCH_TIMEOUT_MS,
      maxBytes: IMPORT_PAGE_MAX_BYTES,
    });
  } catch (err: unknown) {
    // Two very different failures arrive here, and they must not share an
    // outcome.
    //
    // An SsrfError is a VERDICT: the guard resolved the address and refused
    // it (a private/link-local/loopback target, a malformed URL, a
    // non-http(s) scheme, too many redirects, an oversized body). Falling
    // through to Tier 2 would hand an address the guard has already rejected
    // a second, differently-implemented chance at being fetched. It stays a
    // hard 400 — see the regression guards in studioApi.test.ts.
    if (err instanceof SsrfError) {
      throw new StudioError(400, `could not fetch that page: ${importFetchErrorMessage(err)}`);
    }
    // Anything else is TRANSPORT-class — a timeout, a reset socket, a TLS
    // handshake failure. Tier 2 carries a longer timeout budget and a real
    // browser stack, and a plain-fetch timeout on a heavy JS-rendered
    // marketplace is precisely the case this fallback exists for, so this is
    // treated exactly like "Tier 1 succeeded but found zero images": keep
    // `fetched` null and let the Tier 2 attempt below run.
    //
    // Note that a typo'd domain does NOT land here: checkHostnameAllowed
    // turns a DNS failure into `allowed: false`, so it is already an
    // SsrfError and still hard-fails above with a readable message.
    fetched = null;
  }

  // Empty rather than absent when Tier 1 never produced anything, so the
  // shape below is identical on both paths.
  let tier1: ImportCandidate = { name: null, images: [] };
  // The page Tier 2 renders. With no successful fetch there is no finalUrl to
  // prefer, so the seller's own URL stands in; the headless path re-validates
  // whatever it is given from scratch (ssrfSafeProxy.ts pins and checks every
  // hop it makes), so this is never a way around the guard.
  let renderUrl = url;

  if (fetched !== null) {
    // A content-type that plainly isn't a web page (a direct image/PDF/binary
    // link) has nothing for extractImportCandidates to parse — report empty
    // rather than decoding arbitrary bytes as text. A missing content-type is
    // treated as HTML: many small/misconfigured sites omit it. This is a
    // confident "not a webpage" answer, not a failure, so it returns
    // immediately and never reaches Tier 2.
    if (fetched.contentType !== "" && !fetched.contentType.includes("html") && !fetched.contentType.includes("text")) {
      return { status: 200, body: { name: null, images: [], usedHeadlessFallback: false, headlessFailureReason: null } };
    }

    const html = fetched.bytes.toString("utf-8");
    tier1 = extractImportCandidates(html, fetched.finalUrl);

    if (tier1.images.length > 0) {
      return {
        status: 200,
        body: { ...tier1, usedHeadlessFallback: false, headlessFailureReason: null },
      };
    }
    renderUrl = fetched.finalUrl;
  }

  const rendered = await renderWithHeadlessBrowser(renderUrl, { timeoutMs: IMPORT_HEADLESS_TIMEOUT_MS });
  if (!rendered.available) {
    return {
      status: 200,
      body: { ...tier1, usedHeadlessFallback: true, headlessFailureReason: rendered.reason },
    };
  }

  const tier2 = extractImportCandidates(rendered.html, rendered.finalUrl);
  return {
    status: 200,
    body: { ...tier2, usedHeadlessFallback: true, headlessFailureReason: null },
  };
}

const importImagesBodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(IMPORT_MAX_URLS_PER_REQUEST),
  sourceUrl: z.string().min(1).optional(),
});

/**
 * Forces the written filename's extension to match the SNIFFED image type,
 * never whatever extension (if any) the URL happened to carry — a page can
 * serve a real JPEG from a path with no extension, or from one with an
 * unrelated one (a CMS asset route, a query-string-only image endpoint), and
 * sniffImageType's verdict is the only one this pipeline trusts anywhere
 * (see studioImages.ts). This also guarantees isValidImageFilename passes:
 * `kind` is always one of IMAGE_EXTENSIONS, so the only way this can fail is
 * an empty usable base name, which the "imported-photo" fallback covers.
 */
function deriveImportedFilename(sourceUrl: string, kind: ImageKind): string {
  let base = "";
  try {
    base = path.basename(new URL(sourceUrl).pathname);
  } catch {
    base = "";
  }
  if (base === "" || base === "/") base = "imported-photo";
  const withExt = /\.[a-z0-9]+$/i.test(base)
    ? base.replace(/\.[a-z0-9]+$/i, `.${kind}`)
    : `${base}.${kind}`;
  const sanitized = sanitizeUploadFilename(withExt);
  return isValidImageFilename(sanitized) ? sanitized : `imported-photo.${kind}`;
}

// Keyed by ImageKind (studioImages.ts), which spells the JPEG variant "jpg" —
// matching sniffImageType's own return value, not the "jpeg" MIME subtype.
const IMAGE_MIME_TYPES: Record<ImageKind, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const importThumbnailBodySchema = z.object({
  url: z.string().min(1),
  sourceUrl: z.string().min(1).optional(),
});

// Backstop for a thumbnail request whose response never finishes sending --
// the seller's browser can drop the connection before studio/vite.config.ts's
// file-response branch reaches "finish" (the new-item dialog gets closed,
// the seller navigates away, or a newer thumbnail fetch supersedes this one
// while it's still in flight), in which case the FileResponse's onSent below
// never runs and the temp file would otherwise sit in os.tmpdir() forever.
// Same concept and order of magnitude as registerPdfExport's own TTL timer
// (PDF_EXPORT_TTL_MS, further down this file): long enough that a normal
// sub-second fetch-and-serve never comes close to it, short enough to bound
// worst-case accumulation across a long-running Studio session. Unlike that
// PDF-export path, there's no token registry here -- this route is a single
// fetch-then-serve request, not a generate/redeem pair, so the timer only
// ever needs to unlink one already-known file.
export const IMPORT_THUMBNAIL_TEMP_FILE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches one candidate image server-side (through the same SSRF-guarded,
 * sniffed pipeline a real import uses) and serves it back as a FileResponse
 * so the picker UI can show a real preview instead of a broken-image icon on
 * hotlink-protected sites. StudioResponse has no in-memory-buffer variant
 * (see its own comment above) -- this reuses the temp-file + onSent-cleanup
 * pattern the catalog PDF download path established, simplified to one
 * round trip since there is no separate generate/download step here.
 */
async function handleImportThumbnail(req: StudioRequest): Promise<StudioResponse> {
  const { url, sourceUrl } = parseJsonBody(req.body, importThumbnailBodySchema);
  const referer = sourceUrl ? originOnly(sourceUrl) : undefined;

  let fetched: Awaited<ReturnType<typeof fetchUrlSafely>>;
  try {
    fetched = await fetchUrlSafely(url, {
      timeoutMs: IMPORT_IMAGE_FETCH_TIMEOUT_MS,
      maxBytes: IMPORT_IMAGE_MAX_BYTES,
      referer,
    });
  } catch (err: unknown) {
    throw new StudioError(400, importFetchErrorMessage(err));
  }

  const kind = sniffImageType(fetched.bytes);
  if (kind === null) {
    throw new StudioError(400, "not a JPEG, PNG, WebP or GIF");
  }

  const tempPath = path.join(os.tmpdir(), `usedexchange-thumb-${crypto.randomUUID()}.${kind}`);
  await fsPromises.writeFile(tempPath, fetched.bytes);

  // .unref() so this timer alone can never keep the Node process alive --
  // it's a pure backstop, not something the process should wait around for.
  // Racing this against onSent below is intentional and safe: whichever
  // fires first deletes the file, and the other's unlink just fails quietly
  // (already gone) thanks to the shared .catch(() => {}) pattern.
  setTimeout(() => {
    fsPromises.unlink(tempPath).catch(() => {});
  }, IMPORT_THUMBNAIL_TEMP_FILE_TTL_MS).unref();

  return {
    status: 200,
    file: tempPath,
    contentType: IMAGE_MIME_TYPES[kind],
    onSent: () => {
      fsPromises.unlink(tempPath).catch(() => {
        // Best-effort cleanup -- a failed unlink here (already gone,
        // permissions) must not affect a response that's already been
        // fully sent to the seller's own browser.
      });
    },
  };
}

export type ImportImagesResult = {
  files: ImageEntry[];
  imported: number;
  failed: Array<{ url: string; error: string }>;
};

async function handleImageImport(
  req: StudioRequest,
  category: string,
  item: string,
): Promise<StudioResponse> {
  const { urls, sourceUrl } = parseJsonBody(req.body, importImagesBodySchema);
  const referer = sourceUrl ? originOnly(sourceUrl) : undefined;
  const dir = resolveItemDir(req.projectRoot, category, item);

  // Same failure philosophy as handleBulkStatus/handleBulkApplyTiers above:
  // one bad URL (dead link, a non-image response, a page that blocks
  // scraping) must not sink photos that DID download fine in the same
  // batch. Sequential, not concurrent — see IMPORT_MAX_URLS_PER_REQUEST's
  // comment.
  const failed: Array<{ url: string; error: string }> = [];
  let imported = 0;
  for (const url of urls) {
    try {
      const fetched = await fetchUrlSafely(url, {
        timeoutMs: IMPORT_IMAGE_FETCH_TIMEOUT_MS,
        maxBytes: IMPORT_IMAGE_MAX_BYTES,
        referer,
      });
      // The extension is whatever the URL happened to carry; the header
      // bytes are what decide — identical rule to handleImageUpload's own
      // sniffImageType check, just against a downloaded body instead of an
      // uploaded one.
      const kind = sniffImageType(fetched.bytes);
      if (kind === null) {
        failed.push({ url, error: "not a JPEG, PNG, WebP or GIF" });
        continue;
      }
      const filename = deriveImportedFilename(fetched.finalUrl, kind);
      await writeImage(dir, filename, fetched.bytes);
      imported++;
    } catch (err: unknown) {
      failed.push({ url, error: importFetchErrorMessage(err) });
    }
  }

  const result: ImportImagesResult = { files: await listImageFiles(dir), imported, failed };
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
const CATEGORY_ROUTE_RE = /^\/api\/categories\/([^/]+)$/;
const CONTACT_PLATFORM_ROUTE_RE = /^\/api\/contact-platforms\/(\d+)$/;
const CONTACT_IMAGE_ROUTE_RE = /^\/api\/contact\/images\/([^/]+)$/;
const EXPORT_PDF_DOWNLOAD_RE = /^\/api\/export-pdf\/download\/([^/]+)$/;

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
  const { fields, source } = await readConfigFields(req.projectRoot);
  return { status: 200, body: { fields, contactPlatforms: readContactPlatforms(source) } };
}

/** Writes `next` over content/config.ts, gated by a full `tsc --noEmit` check
 * of the project with the candidate file in place. On failure the original
 * file is restored byte-for-byte and a StudioError carrying tsc's own output
 * is thrown; on success the temp/backup files are cleaned up. Shared by every
 * write path that touches content/config.ts, so "a write that would break
 * the build is discarded" holds uniformly, not just for scalar field edits. */
async function writeConfigSourceWithTypeCheckGate(
  req: StudioRequest,
  next: string,
  whatFailed: string,
): Promise<void> {
  const { config, tsconfig } = configPaths(req.projectRoot);
  const tempPath = path.join(path.dirname(config), ".config.ts.tmp");
  await fsPromises.writeFile(tempPath, next, "utf-8");

  let hasTsconfig = true;
  try {
    await fsPromises.access(tsconfig);
  } catch {
    hasTsconfig = false;
  }

  if (!hasTsconfig) {
    // No tsconfig.json (a test sandbox, or a project that does not type-check
    // at all): skip the gate rather than fail the write. Deliberate and
    // covered by a test — a silently absent gate would be dishonest.
    await fsPromises.rename(tempPath, config);
    return;
  }

  // The gate: type-check the project with the candidate config in place.
  // Swap it in, run tsc, and put the original back if anything fails — tsc
  // has to see the file at its real path for the check to mean anything.
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
    throw new StudioError(400, `type-check failed, so ${whatFailed} was not saved:\n${detail}`);
  }
}

async function handleConfigPut(req: StudioRequest): Promise<StudioResponse> {
  const { path: fieldPath, value } = parseJsonBody(req.body, configPutBodySchema);
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

  await writeConfigSourceWithTypeCheckGate(req, next, fieldPath);

  const { fields: after } = await readConfigFields(req.projectRoot);
  return { status: 200, body: { fields: after } };
}

const contactPlatformQrBodySchema = z.object({ qr_image: z.string().min(1) });

async function handleContactPlatformQrPut(req: StudioRequest, indexRaw: string): Promise<StudioResponse> {
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) {
    throw new StudioError(400, `invalid contact platform index: "${indexRaw}"`);
  }
  const { qr_image } = parseJsonBody(req.body, contactPlatformQrBodySchema);
  const { config } = configPaths(req.projectRoot);

  let source: string;
  try {
    source = await fsPromises.readFile(config, "utf-8");
  } catch (err: unknown) {
    throw new StudioError(400, `cannot read ${config}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let next: string;
  try {
    next = writeContactPlatformQrImage(source, index, qr_image);
  } catch (err: unknown) {
    throw new StudioError(400, err instanceof Error ? err.message : String(err));
  }

  await writeConfigSourceWithTypeCheckGate(req, next, `contact.platforms[${index}].qr_image`);

  const after = await fsPromises.readFile(config, "utf-8");
  return { status: 200, body: { contactPlatforms: readContactPlatforms(after) } };
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

const exportPdfBodySchema = z.object({
  locale: z.string(),
  priceStrategy: z.enum(["lowest", "highest", "pickup", "shipping", "average"]),
  categories: z.array(z.string()),
  statuses: z.array(z.enum(["available", "pending", "reserved", "sold", "draft"])),
});

// A catalog export's progress is streamed over SSE (see streamCatalogPdfExport
// below), but the finished PDF is still a file on disk — binary bytes cannot
// ride in the same event stream as JSON progress events. The token below is
// the handoff: the stream's final "done" event carries it, and a follow-up
// GET /api/export-pdf/download/:token redeems it for the file — released
// (map entry + temp file both deleted) once that download's bytes are
// confirmed sent, or by the TTL timer below if nothing ever redeems it; see
// registerPdfExport/peekPdfExport/releasePdfExport. Studio is a single local
// seller in one browser tab, so a plain module-level map is enough here —
// contrast with studioSync.ts's globalThis dance, which exists only because
// that module's state is written from a second, differently-bundled copy of
// the same file (see its own header comment).
export const PDF_EXPORT_TTL_MS = 5 * 60 * 1000;
const pendingPdfExports = new Map<string, { file: string; timer: NodeJS.Timeout }>();

function registerPdfExport(file: string): string {
  const token = crypto.randomBytes(16).toString("hex");
  // The TTL timer is the backstop for a token nobody ever redeems: it clears
  // the map entry AND unlinks the file, so an abandoned export doesn't leave
  // a PDF in os.tmpdir() forever. releasePdfExport below is the other path
  // to the same cleanup — every registered file is deleted exactly once, on
  // whichever of the two paths happens first.
  const timer = setTimeout(() => {
    pendingPdfExports.delete(token);
    fsPromises.unlink(file).catch(() => {});
  }, PDF_EXPORT_TTL_MS);
  pendingPdfExports.set(token, { file, timer });
  return token;
}

// Looks up a registered export without consuming it. Deletion is
// releasePdfExport's job alone, called only once the download route's
// stream has actually finished sending bytes (see FileResponse's onSent) —
// deleting eagerly here, at request-routing time, used to mean an
// interrupted download lost access to an already-finished PDF: the map
// entry vanished before a single byte reached the client.
function peekPdfExport(token: string): string | null {
  const entry = pendingPdfExports.get(token);
  return entry === undefined ? null : entry.file;
}

// The other half of registerPdfExport's TTL timer: whichever of the two
// runs first — a confirmed successful download, or the TTL expiring
// unredeemed — clears the timer and the map entry and unlinks the file.
// Safe to call more than once for the same token (e.g. the timer firing
// after this already ran): the second call finds no entry and is a no-op.
function releasePdfExport(token: string): void {
  const entry = pendingPdfExports.get(token);
  if (entry === undefined) return;
  clearTimeout(entry.timer);
  pendingPdfExports.delete(token);
  fsPromises.unlink(entry.file).catch(() => {});
}

type PdfExportSettled = { token: string } | { error: string } | { threw: string };

// Split out so the "error"/"threw" narrowing works cleanly — same reason
// studioSync.ts's toFinalEvent is its own function rather than inlined where
// `settled` is reassigned (see that file's comment). By the time this runs,
// a successful render has already been registered (see streamCatalogPdfExport
// below) — this only formats the outcome into an SSE event.
function toPdfExportEvent(state: PdfExportSettled): SseEvent {
  if ("threw" in state) {
    return { event: "error", data: { error: state.threw } };
  }
  if ("error" in state) {
    return { event: "error", data: { error: state.error } };
  }
  return { event: "done", data: { token: state.token } };
}

// Same buffer-and-poll shape as studioSync.ts's streamImageSync (shared via
// scripts/lib/sseProgress.ts's streamProgressAsSse) — progress arrives
// through a callback while generateCatalogPdf is in flight, but a generator
// can only yield when its consumer asks. No mutex here, unlike image sync —
// two concurrent catalog exports each write to their own temp dir and their
// own output file, so there is no shared state a second run could corrupt,
// just extra CPU/RAM if a seller starts two at once.
async function* streamCatalogPdfExport(options: PdfExportOptions): AsyncGenerator<SseEvent> {
  yield* streamProgressAsSse<PdfExportProgress, PdfExportSettled>(
    (onProgress) =>
      generateCatalogPdf(options, onProgress).then((result): PdfExportSettled =>
        // Registered here, as soon as the render settles, rather than in the
        // trailing "done" event below: studio/vite.config.ts calls
        // iterator.return?.() the instant the SSE consumer disconnects,
        // which ends this generator before that yield would ever run — but
        // generateCatalogPdf's own promise chain keeps rendering regardless
        // of whether anyone is still listening. Registering at settle time
        // means a PDF that finishes after the client gave up is still
        // reachable (until the TTL expires) instead of being permanently
        // orphaned on disk with no token.
        "error" in result ? result : { token: registerPdfExport(result.file) },
      ),
    (err): PdfExportSettled => ({ threw: err instanceof Error ? err.message : String(err) }),
    toPdfExportEvent,
  );
}

function handleExportPdf(req: StudioRequest): StudioResponse {
  const options: PdfExportOptions = parseJsonBody(req.body, exportPdfBodySchema);
  if (!siteConfig.i18n.availableLocales.includes(options.locale)) {
    throw new StudioError(400, `locale "${options.locale}" is not in siteConfig.i18n.availableLocales`);
  }
  return { status: 200, events: streamCatalogPdfExport(options) };
}

function handleExportPdfDownload(token: string): StudioResponse {
  const file = peekPdfExport(token);
  if (file === null) {
    throw new StudioError(404, "export not found or already downloaded");
  }
  return {
    status: 200,
    file,
    contentType: "application/pdf",
    onSent: () => releasePdfExport(token),
  };
}

/**
 * Test-only: registers `file` under a fresh token via the same
 * registerPdfExport path a real catalog export uses, so the download route's
 * single-use/TTL/cleanup behavior can be exercised without a working
 * Chromium install. Not used by production code.
 */
export function registerPdfExportForTests(file: string): string {
  return registerPdfExport(file);
}

const exportFlyerBodySchema = z.object({ id: z.string().min(1) });

async function handleExportFlyer(req: StudioRequest): Promise<StudioResponse> {
  const { id } = parseJsonBody(req.body, exportFlyerBodySchema);
  const result = await generateFlyerPdf(id);
  if ("error" in result) {
    return { status: 400, body: { error: result.error } };
  }
  return { status: 200, file: result.file, contentType: "application/pdf" };
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

    const contactPlatformMatch = CONTACT_PLATFORM_ROUTE_RE.exec(pathname);
    if (contactPlatformMatch !== null) {
      const [, indexRaw] = contactPlatformMatch;
      if (indexRaw === undefined) {
        return { status: 400, body: { error: "malformed contact platform route" } };
      }
      if (req.method === "PUT") return await handleContactPlatformQrPut(req, indexRaw);
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
    }

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

    if (pathname === "/api/import-url/preview") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handleImportUrlPreview(req);
    }

    // POST only, deliberately -- never a GET .../thumbnail?url=... . This
    // route's side effect is an outbound fetch of an attacker-influenced URL,
    // and checkStudioCsrf exempts GET/HEAD (reasoning that Vite's own
    // CORS/allowedHosts checks already cover reads, which is true for routes
    // that only read local content). A bare <img src="http://127.0.0.1:<port>
    // /api/import-url/thumbnail?url=..."> on any unrelated page the seller has
    // open in another tab would fire with no preflight and no CORS gate on
    // whether it fires at all -- reintroducing exactly the class of hole
    // csrfGuard.ts exists to close, via a different method. POST gets the
    // existing CSRF middleware for free, with no per-route code needed.
    if (pathname === "/api/import-url/thumbnail") {
      if (req.method !== "POST") return { status: 405, body: { error: "method not allowed" } };
      return await handleImportThumbnail(req);
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
      if (req.method === "POST" && filename === "import") {
        return await handleImageImport(req, category, item);
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

    if (pathname === "/api/export-pdf") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return handleExportPdf(req);
    }

    if (pathname === "/api/export-pdf/flyer") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      return await handleExportFlyer(req);
    }

    const exportDownloadMatch = EXPORT_PDF_DOWNLOAD_RE.exec(pathname);
    if (exportDownloadMatch !== null) {
      const [, tokenRaw] = exportDownloadMatch;
      if (tokenRaw === undefined) {
        return { status: 400, body: { error: "malformed export-pdf download route" } };
      }
      let token: string;
      try {
        token = decodeURIComponent(tokenRaw);
      } catch {
        return { status: 400, body: { error: "malformed URL encoding" } };
      }
      if (req.method !== "GET") {
        return { status: 405, body: { error: "GET only" } };
      }
      return handleExportPdfDownload(token);
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
