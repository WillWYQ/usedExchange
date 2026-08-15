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
import type { BulkStatusResult, BulkTiersResult, CategorySummary, ImageEntry, StudioItem } from "../../scripts/lib/studioApi";

export type { BulkStatusResult, BulkTiersResult, CategoryMetaInput, CategorySummary, ConfigField, ConfigFieldKind, ContactPlatformSummary, ImageEntry, ReadinessAction, ReadinessItem, ReadinessReport, StudioItem };

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

export async function saveConfigValue(
  path: string,
  value: string | number | boolean,
): Promise<ConfigField[]> {
  const res = await fetch("/api/config", {
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

export async function exportCatalogPdf(): Promise<Blob> {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `PDF export failed with ${res.status} ${res.statusText}`));
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
