// Type-only import: studioApi.ts pulls in the content loader and node:fs, which
// must never reach the browser bundle. `import type` is erased at compile time,
// so this shares the types without shipping the module.
import type { BulkStatusResult, StudioItem } from "../../scripts/lib/studioApi";

export type { BulkStatusResult, StudioItem };

export async function fetchItems(): Promise<StudioItem[]> {
  const res = await fetch("/api/items");
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `GET /api/items failed with ${res.status}`);
  }
  const body = (await res.json()) as { items: StudioItem[] };
  return body.items;
}

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
