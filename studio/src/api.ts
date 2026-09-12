// Type-only import: studioApi.ts pulls in the content loader and node:fs, which
// must never reach the browser bundle. `import type` is erased at compile time,
// so this shares the types without shipping the module.
import type { ConfigField, ConfigFieldKind } from "../../scripts/lib/configEdit";
import type {
  ReadinessAction,
  ReadinessItem,
  ReadinessReport,
} from "../../scripts/lib/siteReadiness";
import type { CategoryMetaInput } from "../../scripts/lib/studioCategories";
import type { ContactPlatformSummary } from "../../scripts/lib/contactPlatforms";
import type {
  BulkStatusResult,
  BulkTiersResult,
  CategorySummary,
  ImageEntry,
  ImportImagesResult,
  StudioItem,
} from "../../scripts/lib/studioApi";
import type { PdfExportOptions, PdfExportProgress } from "../../scripts/lib/pdfCatalog/generate";

export type { BulkStatusResult, BulkTiersResult, CategoryMetaInput, CategorySummary, ConfigField, ConfigFieldKind, ContactPlatformSummary, ImageEntry, ImportImagesResult, PdfExportOptions, PdfExportProgress, ReadinessAction, ReadinessItem, ReadinessReport, StudioItem };

// Every response body is read defensively rather than trusting res.json() to
// succeed: the CSRF guard and Vite itself can answer a rejected request with
// a text/plain body (Vite's own dev-server error pages are not JSON either).
// Calling res.json() unconditionally, before checking res.ok, turns that
// into an opaque "Unexpected token '<'…" parse error instead of a message
// the seller can act on. Parsing first and checking status after doesn't fix
// that — the parse itself is what throws — so the parse has to be wrapped.
async function readJsonBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(body: Record<string, unknown> | null, fallback: string): string {
  return typeof body?.error === "string" ? body.error : fallback;
}

export async function fetchItems(): Promise<{
  items: StudioItem[];
  defaultLocale: string;
  availableLocales: string[];
  studioTranslations: Record<string, Record<string, string>>;
}> {
  const res = await fetch("/api/items");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `GET /api/items failed with ${res.status} ${res.statusText}`));
  }
  // A 200 with no parseable `items` array is not "no items" — it's a
  // malformed response (a wiring bug, or a body that parsed as JSON but
  // wasn't the shape we expect). Falling back to [] here would render as an
  // empty table with no error, which looks identical to a seller's first
  // run with zero listings and gives no signal that anything is wrong.
  if (
    !Array.isArray(body?.items) ||
    typeof body?.defaultLocale !== "string" ||
    !Array.isArray(body?.availableLocales)
  ) {
    throw new Error(
      `GET /api/items returned an unreadable response (${res.status} ${res.statusText})`,
    );
  }
  return {
    items: body.items as StudioItem[],
    defaultLocale: body.defaultLocale as string,
    availableLocales: body.availableLocales as string[],
    // Lenient read: an older server without the field answers no overrides,
    // and the client falls back to its built-in dictionaries.
    studioTranslations:
      (body.studioTranslations as Record<string, Record<string, string>> | undefined) ?? {},
  };
}

export async function bulkStatus(ids: string[], status: string): Promise<BulkStatusResult> {
  const res = await fetch("/api/items/bulk-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids, status }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `bulk status failed with ${res.status} ${res.statusText}`));
  }
  if (body === null) {
    throw new Error(`bulk status returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return body as unknown as BulkStatusResult;
}

export async function applyDefaultTiers(ids: string[]): Promise<BulkTiersResult> {
  const res = await fetch("/api/items/bulk-apply-tiers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `bulk apply tiers failed with ${res.status} ${res.statusText}`));
  }
  if (body === null) {
    throw new Error(`bulk apply tiers returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return body as unknown as BulkTiersResult;
}

export async function fetchImages(id: string): Promise<ImageEntry[]> {
  const res = await fetch(`/api/items/${id}/images`);
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `listing images failed with ${res.status} ${res.statusText}`));
  }
  return (body?.files as ImageEntry[] | undefined) ?? [];
}

export async function uploadImage(id: string, file: File): Promise<ImageEntry[]> {
  const contentBase64 = await fileToBase64(file);
  const res = await fetch(`/api/items/${id}/images`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentBase64 }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `upload failed with ${res.status} ${res.statusText}`));
  }
  return (body?.files as ImageEntry[] | undefined) ?? [];
}

export async function deleteImage(id: string, filename: string): Promise<ImageEntry[]> {
  const res = await fetch(`/api/items/${id}/images/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `delete failed with ${res.status} ${res.statusText}`));
  }
  return (body?.files as ImageEntry[] | undefined) ?? [];
}

export async function reorderImages(id: string, order: string[]): Promise<ImageEntry[]> {
  const res = await fetch(`/api/items/${id}/images/reorder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `reorder failed with ${res.status} ${res.statusText}`));
  }
  return (body?.files as ImageEntry[] | undefined) ?? [];
}

/**
 * Downloads server-side and writes into the item's folder, going through the
 * same sniff/sanitize/write pipeline as a manual upload — see
 * scripts/lib/studioApi.ts's handleImageImport. Never rejects on a per-URL
 * failure (a dead link, a non-image response): those come back in `failed`
 * so the seller sees exactly which photos didn't make it rather than losing
 * the whole batch to one bad URL.
 */
export async function importImagesFromUrls(
  id: string,
  urls: string[],
  sourceUrl?: string,
): Promise<ImportImagesResult> {
  const res = await fetch(`/api/items/${id}/images/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sourceUrl ? { urls, sourceUrl } : { urls }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `importing photos failed with ${res.status} ${res.statusText}`));
  }
  return {
    files: (body?.files as ImageEntry[] | undefined) ?? [],
    imported: typeof body?.imported === "number" ? body.imported : 0,
    failed: Array.isArray(body?.failed) ? (body.failed as Array<{ url: string; error: string }>) : [],
  };
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

export type ItemFields = Record<string, unknown>;
export type FieldEdit = { path: (string | number)[]; value: unknown };

export async function fetchItemFields(id: string): Promise<ItemFields> {
  const res = await fetch(`/api/items/${id}`);
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `loading ${id} failed with ${res.status} ${res.statusText}`));
  }
  if (body === null || typeof body.fields !== "object" || body.fields === null) {
    throw new Error(`GET /api/items/${id} returned an unreadable response`);
  }
  return body.fields as ItemFields;
}

export async function patchItem(id: string, edits: FieldEdit[]): Promise<ItemFields> {
  const res = await fetch(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edits }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `saving ${id} failed with ${res.status} ${res.statusText}`));
  }
  return (body?.fields as ItemFields | undefined) ?? {};
}

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

export type ImportUrlPreview = {
  name: string | null;
  images: string[];
  usedHeadlessFallback: boolean;
  headlessFailureReason: "not-installed" | "navigation-failed" | null;
};

/**
 * Fetches a seller-supplied product page server-side (scripts/lib/ssrfGuard.ts
 * guards that fetch against internal/cloud-metadata addresses) and extracts a
 * candidate name and photo URLs (scripts/lib/urlImport.ts). Nothing is
 * downloaded or written yet — `images` are the REMOTE page's own URLs, which
 * this browser tab may load directly for the picker preview; only the URLs
 * the seller actually selects are later downloaded by importImagesFromUrls.
 */
export async function previewImportUrl(url: string): Promise<ImportUrlPreview> {
  const res = await fetch("/api/import-url/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `fetching that page failed with ${res.status} ${res.statusText}`));
  }
  return {
    name: typeof body?.name === "string" ? body.name : null,
    images: Array.isArray(body?.images) ? (body.images as string[]) : [],
    usedHeadlessFallback: body?.usedHeadlessFallback === true,
    headlessFailureReason:
      body?.headlessFailureReason === "not-installed" || body?.headlessFailureReason === "navigation-failed"
        ? body.headlessFailureReason
        : null,
  };
}

export async function fetchImportThumbnail(url: string, sourceUrl?: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/import-url/thumbnail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sourceUrl ? { url, sourceUrl } : { url }),
    signal,
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `fetching that thumbnail failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}

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
  // A 200 with an unreadable `file`/`path` must not fall through as if it
  // succeeded: the caller writes `path` straight into the qr_image draft, so
  // a silent `undefined` there would look like nothing happened while the
  // PNG had, in fact, already landed in content/contact/ on disk — the same
  // "looks identical to success" trap fetchItems's own comment describes.
  if (typeof body?.file !== "string" || typeof body?.path !== "string") {
    throw new Error(`POST /api/contact/images returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return { file: body.file, path: body.path };
}

export async function deleteContactImage(filename: string): Promise<void> {
  const res = await fetch(`/api/contact/images/${encodeURIComponent(filename)}`, { method: "DELETE" });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `deleting QR image failed with ${res.status} ${res.statusText}`));
  }
}

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

// One GET /api/config, both halves of the response: fetching `fields` and
// `contactPlatforms` through two separate client calls (each hitting this
// same endpoint on its own) would mean two HTTP round trips — and two
// server-side config.ts reads/parses — for data the server already returns
// together in one response.
export async function fetchConfig(): Promise<{ fields: ConfigField[]; contactPlatforms: ContactPlatformSummary[] }> {
  const res = await fetch("/api/config");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `loading site config failed with ${res.status} ${res.statusText}`));
  }
  if (!Array.isArray(body?.fields) || !Array.isArray(body?.contactPlatforms)) {
    throw new Error(`GET /api/config returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return { fields: body.fields as ConfigField[], contactPlatforms: body.contactPlatforms as ContactPlatformSummary[] };
}

export async function saveContactPlatformQrImage(index: number, qrImage: string): Promise<ContactPlatformSummary[]> {
  const res = await fetch(`/api/contact-platforms/${index}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qr_image: qrImage }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `saving contact.platforms[${index}].qr_image failed with ${res.status} ${res.statusText}`));
  }
  return (body?.contactPlatforms as ContactPlatformSummary[] | undefined) ?? [];
}

// Saving content/config.ts is the one thing PUT /api/config ever does, and
// that write makes Vite's own dev-server restart mid-request: vite.config.ts's
// plugin statically imports scripts/lib/studioApi.ts, which statically
// imports content/config.ts at module scope, so Vite's default "bundle"
// config loader treats content/config.ts as one of vite.config.ts's own
// "config dependencies" and fully restarts the server whenever that file
// changes on disk — dropping this very request's connection, even though the
// write already landed. A PUT here is idempotent (it sets an absolute
// {path, value}, never a delta), so retrying the identical request once the
// restart settles is safe. A validation rejection (e.g. a bad GA4 id) is a
// normal *resolved* response with res.ok === false and must never be
// retried — only an actual network-level failure (the dropped connection)
// rejects `fetch` itself, which is the only thing this catches.
//
// The real fix would swap in Vite's "native" config loader (it only tracks
// static imports, not this transitive restart-on-any-dependency-change
// behavior) — but that needs Node 22.15+/23.5+, which isn't guaranteed on a
// seller's machine, and it would also require reworking the ~7 call sites in
// scripts/lib/studioApi.ts that currently rely on this same restart to both
// refresh their stale module-scope `siteConfig` import and fail fast on a
// config parse error. Out of scope for now; see docs/ARCHITECTURE.md's
// Seller Studio section for the full write-up. This retry is the pragmatic
// stand-in until that architecture work happens.
const CONFIG_SAVE_RETRY_DELAYS_MS = [400, 800];

async function fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (attempt >= CONFIG_SAVE_RETRY_DELAYS_MS.length) throw err;
      const delay = CONFIG_SAVE_RETRY_DELAYS_MS[attempt];
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function saveConfigValue(
  path: string,
  value: string | number | boolean,
): Promise<ConfigField[]> {
  const res = await fetchWithRetry("/api/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, value }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `saving ${path} failed with ${res.status} ${res.statusText}`));
  }
  return (body?.fields as ConfigField[] | undefined) ?? [];
}

export async function fetchReadiness(): Promise<ReadinessReport> {
  const res = await fetch("/api/readiness");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(body, `loading setup status failed with ${res.status} ${res.statusText}`),
    );
  }
  if (body?.report === undefined) {
    throw new Error(
      `GET /api/readiness returned an unreadable response (${res.status} ${res.statusText})`,
    );
  }
  return body.report as ReadinessReport;
}

export type ChangedFile = { code: string; path: string };
export type Changes = {
  branch: string;
  files: ChangedFile[];
  /**
   * Local commits waiting to be pushed — a prior publish whose push failed.
   * The server reports 0 for out-of-band commits it would refuse to push.
   */
  unpushed: number;
};

export async function fetchChanges(): Promise<Changes> {
  const res = await fetch("/api/changes");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `reading changes failed with ${res.status} ${res.statusText}`));
  }
  return {
    branch: String(body?.branch ?? ""),
    files: (body?.files as ChangedFile[]) ?? [],
    unpushed: Number(body?.unpushed ?? 0),
  };
}

export async function publish(message: string): Promise<{ commit: string; files: ChangedFile[] }> {
  const res = await fetch("/api/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `publish failed with ${res.status} ${res.statusText}`));
  }
  return {
    commit: String(body?.commit ?? ""),
    files: (body?.files as ChangedFile[]) ?? [],
  };
}

export type PdfExportEvent =
  | { event: "progress"; data: PdfExportProgress }
  | { event: "done"; data: { token: string } }
  | { event: "error"; data: { error: string } };

/**
 * POSTs to /api/export-pdf and yields each server-sent progress event as it
 * arrives. The generated PDF itself never rides this stream (binary bytes
 * can't share a frame with JSON progress events) — the final "done" event
 * instead carries a token to redeem via downloadExportedPdf below.
 */
export async function* streamExportCatalogPdf(
  options: PdfExportOptions,
  signal?: AbortSignal,
): AsyncGenerator<PdfExportEvent> {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
    signal,
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `PDF export failed with ${res.status} ${res.statusText}`));
  }
  yield* parseSseStream<PdfExportEvent>(res);
}

/** Redeems a token from streamExportCatalogPdf's "done" event for the actual PDF bytes. */
export async function downloadExportedPdf(token: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`/api/export-pdf/download/${encodeURIComponent(token)}`, { signal });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `PDF download failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}

export async function exportItemFlyerPdf(id: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/export-pdf/flyer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
    signal,
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `Flyer export failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}

export type SyncEvent =
  | { event: "progress"; data: { type: string; total?: number; completed?: number; manifestKey?: string } }
  | {
      event: "done";
      data: {
        total: number;
        uploaded: number;
        skipped: number;
        failures: Array<{ manifestKey: string; error: string }>;
      };
    }
  | { event: "error"; data: { error: string } };

/** Parses a fetch Response's body as an SSE stream, yielding one event per frame. */
async function* parseSseStream<T>(res: Response): AsyncGenerator<T> {
  if (res.body === null) throw new Error("stream returned no body");

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
        } as T;
      }
      split = buffer.indexOf("\n\n");
    }
  }
}

/** POSTs to /api/sync-images and yields each server-sent event as it arrives. */
export async function* streamSync(): AsyncGenerator<SyncEvent> {
  const res = await fetch("/api/sync-images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `sync failed with ${res.status} ${res.statusText}`));
  }
  yield* parseSseStream<SyncEvent>(res);
}
