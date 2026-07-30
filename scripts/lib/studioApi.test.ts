import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import * as loaderModule from "@/lib/content/loader";
import {
  handleStudioRequest,
  resolveItemDir,
  StudioError,
  listStudioItems,
  isFileResponse,
  isSseResponse,
  type JsonResponse,
} from "./studioApi";

// All routes exercised in this file return the JSON variant of StudioResponse;
// this narrows the union so `.body` type-checks without re-asserting at every
// call site.
function asJson(res: Awaited<ReturnType<typeof handleStudioRequest>>): JsonResponse {
  return res as JsonResponse;
}

const PROJECT_ROOT = process.cwd();

describe("resolveItemDir", () => {
  it("resolves a valid category/item pair inside content/items", () => {
    const dir = resolveItemDir(PROJECT_ROOT, "electronics", "desk-lamp");
    expect(dir).toBe(path.join(PROJECT_ROOT, "content", "items", "electronics", "desk-lamp"));
  });

  it("rejects path traversal in the category", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "..", "desk-lamp")).toThrow(StudioError);
  });

  it("rejects path traversal in the item name", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "electronics", "../../etc")).toThrow(StudioError);
  });

  it("rejects uppercase and spaces", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "Electronics", "desk lamp")).toThrow(StudioError);
  });

  it("rejects an absolute path", () => {
    expect(() => resolveItemDir(PROJECT_ROOT, "electronics", "/etc/passwd")).toThrow(StudioError);
  });
});

describe("handleStudioRequest", () => {
  it("returns items for GET /api/items", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(200);
    const body = asJson(res).body as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("404s an unknown route", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/nope",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(404);
  });

  it("405s a wrong method on a known route", async () => {
    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(405);
  });
});

describe("listStudioItems resilience to invalid slugs", () => {
  it("returns all items even if one has an invalid slug", async () => {
    // Mock the loader to return both a valid item and an item with invalid slug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockItems: any[] = [
      {
        categorySlug: "electronics",
        itemSlug: "desk-lamp",
        name: "Desk Lamp",
        status: "active",
        price: { currency: "USD", tiers: [{ amount: 50 }] },
      },
      {
        categorySlug: "electronics",
        itemSlug: "Old Sofa", // Invalid slug (uppercase and space)
        name: "Old Sofa",
        status: "active",
        price: { currency: "USD", tiers: [{ amount: 100 }] },
      },
    ];

    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue(mockItems);

    try {
      const items = await listStudioItems(PROJECT_ROOT);

      // Should return both items despite one having an invalid slug
      expect(items).toHaveLength(2);
      expect(items).toBeDefined();
      if (items[0]) {
        expect(items[0].itemSlug).toBe("desk-lamp");
        expect(items[0].imageCount).toBeGreaterThanOrEqual(0); // Valid item, might have images
      }
      if (items[1]) {
        expect(items[1].itemSlug).toBe("Old Sofa");
        expect(items[1].imageCount).toBe(0); // Invalid slug item should have 0 images
      }
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });
});

const ITEM_JSON = `{
  "name": "Desk lamp",
  // options: available | pending | reserved | sold | draft
  "status": "available",
  "sold_date": null,
  "reserved_for": "alice@example.com"
}
`;

let sandbox: string;

async function seedItem(id: string): Promise<void> {
  const dir = path.join(sandbox, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), ITEM_JSON);
}

async function readItemJson(id: string): Promise<string> {
  return fs.readFile(path.join(sandbox, "content", "items", ...id.split("/"), "item.json"), "utf-8");
}

function bulkStatus(ids: string[], status: string) {
  return handleStudioRequest({
    method: "POST",
    url: "/api/items/bulk-status",
    body: Buffer.from(JSON.stringify({ ids, status })),
    projectRoot: sandbox,
  });
}

describe("POST /api/items/bulk-status", () => {
  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it("marks several items sold and stamps sold_date", async () => {
    await seedItem("electronics/desk-lamp");
    await seedItem("books/cs61a");

    const res = await bulkStatus(["electronics/desk-lamp", "books/cs61a"], "sold");

    expect(res.status).toBe(200);
    expect(asJson(res).body).toMatchObject({ ok: 2, failed: [] });
    const text = await readItemJson("books/cs61a");
    expect(text).toContain('"status": "sold"');
    expect(text).toMatch(/"sold_date": "\d{4}-\d{2}-\d{2}"/);
  });

  it("preserves comments and reserved_for", async () => {
    await seedItem("electronics/desk-lamp");
    await bulkStatus(["electronics/desk-lamp"], "sold");
    const text = await readItemJson("electronics/desk-lamp");
    expect(text).toContain("// options: available | pending | reserved | sold | draft");
    expect(text).toContain('"reserved_for": "alice@example.com"');
  });

  it("clears sold_date when moving off sold", async () => {
    await seedItem("electronics/desk-lamp");
    await bulkStatus(["electronics/desk-lamp"], "sold");
    await bulkStatus(["electronics/desk-lamp"], "available");
    const text = await readItemJson("electronics/desk-lamp");
    expect(text).toContain('"sold_date": null');
  });

  it("does not restamp sold_date when an already-sold item is bulk-marked sold again", async () => {
    const dir = path.join(sandbox, "content", "items", "electronics", "desk-lamp");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "item.json"),
      `{
  "name": "Desk lamp",
  "status": "sold",
  "sold_date": "2026-01-15",
  "reserved_for": "alice@example.com"
}
`,
    );

    const res = await bulkStatus(["electronics/desk-lamp"], "sold");

    expect(res.status).toBe(200);
    expect(asJson(res).body).toMatchObject({ ok: 1, failed: [] });
    const text = await readItemJson("electronics/desk-lamp");
    expect(text).toContain('"sold_date": "2026-01-15"');
    expect(text).toContain('"status": "sold"');
  });

  it("still stamps today when a fresh (non-sold) item transitions to sold", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await bulkStatus(["electronics/desk-lamp"], "sold");
    expect(res.status).toBe(200);
    expect(asJson(res).body).toMatchObject({ ok: 1, failed: [] });
    const text = await readItemJson("electronics/desk-lamp");
    expect(text).toMatch(/"sold_date": "\d{4}-\d{2}-\d{2}"/);
    expect(text).not.toContain('"sold_date": null');
  });

  it("reports per-item failures without discarding successes", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await bulkStatus(["electronics/desk-lamp", "books/missing"], "sold");

    expect(res.status).toBe(200);
    const body = asJson(res).body as { ok: number; failed: Array<{ id: string; error: string }> };
    expect(body.ok).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]?.id).toBe("books/missing");
    // Asserts the failure is genuinely "no such item" (ENOENT reading item.json),
    // not some unrelated bug that happens to also produce ok:0 for this id.
    expect(body.failed[0]?.error).toMatch(/ENOENT/);
    expect(await readItemJson("electronics/desk-lamp")).toContain('"status": "sold"');
  });

  it("rejects an unknown status without touching any file", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await bulkStatus(["electronics/desk-lamp"], "liquidated");
    expect(res.status).toBe(400);
    expect(await readItemJson("electronics/desk-lamp")).toContain('"status": "available"');
  });

  it("rejects a traversal id", async () => {
    const res = await bulkStatus(["../../etc/passwd"], "sold");
    const body = asJson(res).body as { ok: number; failed: Array<{ id: string; error: string }> };
    expect(body.ok).toBe(0);
    expect(body.failed[0]?.id).toBe("../../etc/passwd");
    // Asserts the write was refused by the path-containment layer specifically,
    // not merely failed for some other reason (e.g. ENOENT on the traversal
    // target) that would pass even with resolveItemDir's guards deleted.
    expect(body.failed[0]?.error).toMatch(/kebab-case|escapes content\/items/);
  });
});

describe("response variants", () => {
  it("recognises a JSON response", () => {
    const res = { status: 200, body: { ok: true } };
    expect(isFileResponse(res)).toBe(false);
    expect(isSseResponse(res)).toBe(false);
  });

  it("recognises a file response", () => {
    const res = { status: 200, file: "/tmp/a.jpg", contentType: "image/jpeg" };
    expect(isFileResponse(res)).toBe(true);
    expect(isSseResponse(res)).toBe(false);
  });

  it("recognises an SSE response", () => {
    const events = (async function* () {
      yield { event: "ping", data: null };
    })();
    const res = { status: 200, events };
    expect(isSseResponse(res)).toBe(true);
    expect(isFileResponse(res)).toBe(false);
  });
});
