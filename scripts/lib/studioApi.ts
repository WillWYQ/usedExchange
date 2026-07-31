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
import { loadAllItemsRaw } from "../../lib/content/loader";
import { isValidSlug } from "../../lib/utils/slug";
import { applyFieldEdits, readItemField } from "./itemEdit";
import { contentTypeFor, isValidImageFilename, listImageFiles } from "./studioImages";

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

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

export async function handleStudioRequest(req: StudioRequest): Promise<StudioResponse> {
  const pathname = req.url.split("?")[0] ?? "";

  try {
    if (pathname === "/api/items") {
      if (req.method !== "GET") {
        return { status: 405, body: { error: "GET only" } };
      }
      return { status: 200, body: { items: await listStudioItems(req.projectRoot) } };
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
      return { status: 405, body: { error: `method not allowed: ${req.method}` } };
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
