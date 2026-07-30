// Type-only import: studioApi.ts pulls in the content loader and node:fs, which
// must never reach the browser bundle. `import type` is erased at compile time,
// so this shares the types without shipping the module.
import type { StudioItem } from "../../scripts/lib/studioApi";

export type { StudioItem };

export async function fetchItems(): Promise<StudioItem[]> {
  const res = await fetch("/api/items");
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `GET /api/items failed with ${res.status}`);
  }
  const body = (await res.json()) as { items: StudioItem[] };
  return body.items;
}
