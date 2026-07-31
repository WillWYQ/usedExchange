// Type-only import: studioApi.ts pulls in the content loader and node:fs, which
// must never reach the browser bundle. `import type` is erased at compile time,
// so this shares the types without shipping the module.
import type { BulkStatusResult, ImageEntry, StudioItem } from "../../scripts/lib/studioApi";

export type { BulkStatusResult, ImageEntry, StudioItem };

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

export async function fetchItems(): Promise<StudioItem[]> {
  const res = await fetch("/api/items");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `GET /api/items failed with ${res.status} ${res.statusText}`));
  }
  return (body?.items as StudioItem[] | undefined) ?? [];
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
