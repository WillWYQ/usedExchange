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
