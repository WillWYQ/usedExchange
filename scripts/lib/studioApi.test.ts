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
import { listImageFiles } from "./studioImages";
import { setSyncRunner } from "./studioSync";

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

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

async function seedImage(id: string, filename: string): Promise<void> {
  const dir = path.join(sandbox, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), PNG_BYTES);
}

function get(url: string) {
  return handleStudioRequest({
    method: "GET",
    url,
    body: Buffer.alloc(0),
    projectRoot: sandbox,
  });
}

describe("GET image routes", () => {
  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it("lists an item's images in loader order", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "02-Side.JPG");
    await seedImage("electronics/desk-lamp", "01-front.jpg");

    const res = await get("/api/items/electronics/desk-lamp/images");

    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({ files: ["01-front.jpg", "02-Side.JPG"] });
  });

  it("serves one image as a file response", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "01-front.jpg");

    const res = await get("/api/items/electronics/desk-lamp/images/01-front.jpg");

    expect(res.status).toBe(200);
    expect(isFileResponse(res)).toBe(true);
    if (isFileResponse(res)) {
      expect(res.contentType).toBe("image/jpeg");
      expect(res.file.endsWith("01-front.jpg")).toBe(true);
    }
  });

  it("404s an image that is not there", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await get("/api/items/electronics/desk-lamp/images/missing.jpg");
    expect(res.status).toBe(404);
  });

  it("rejects a traversal filename", async () => {
    // Asserts *which* layer refused, not just the status: a bare 400 would
    // still pass with the containment guard in handleImageGet deleted (see
    // that function's comment on why `rel !== filename` alone is
    // tautological for a plain "../" payload). Mirrors the discipline in
    // resolveItemDir's own traversal tests above (asserting
    // /kebab-case|escapes content\/items/).
    //
    // There is no second case here exercising the containment layer directly:
    // IMAGE_FILENAME_RE requires the first character to be alphanumeric and
    // forbids "/" anywhere, so any string that satisfies the allowlist is
    // necessarily a single path component that is never exactly ".." — on
    // POSIX, path.join/path.relative can only resolve outside `dir` via a
    // literal ".." path *segment*, which no allowlist-passing filename can
    // form. Verified empirically (see task-2-report.md, fix round 1) rather
    // than assumed.
    await seedItem("electronics/desk-lamp");
    const res = await get("/api/items/electronics/desk-lamp/images/..%2Fitem.json");
    expect(res.status).toBe(400);
    expect(asJson(res).body).toMatchObject({
      error: expect.stringContaining("not an image filename"),
    });
  });

  it("rejects a bad category slug", async () => {
    const res = await get("/api/items/Electronics/desk-lamp/images");
    expect(res.status).toBe(400);
  });

  it("405s a POST-less method on the image collection", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await handleStudioRequest({
      method: "PUT",
      url: "/api/items/electronics/desk-lamp/images",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });
    expect(res.status).toBe(405);
  });
});

function postImage(id: string, filename: string, bytes: Buffer) {
  return handleStudioRequest({
    method: "POST",
    url: `/api/items/${id}/images`,
    body: Buffer.from(
      JSON.stringify({ filename, contentBase64: bytes.toString("base64") }),
    ),
    projectRoot: sandbox,
  });
}

describe("POST image upload", () => {
  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it("writes the photo and returns the new listing", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "01-front.png", PNG_BYTES);

    expect(res.status).toBe(201);
    expect(asJson(res).body).toEqual({ file: "01-front.png", files: ["01-front.png"] });
    const onDisk = await fs.readFile(
      path.join(sandbox, "content", "items", "electronics", "desk-lamp", "01-front.png"),
    );
    expect(onDisk).toEqual(PNG_BYTES);
  });

  it("rejects a file whose bytes are not an image, whatever the extension says", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage(
      "electronics/desk-lamp",
      "evil.jpg",
      Buffer.from("<!doctype html><script>alert(1)</script>"),
    );

    expect(res.status).toBe(400);
    expect(await listImageFiles(
      path.join(sandbox, "content", "items", "electronics", "desk-lamp"),
    )).toEqual([]);
  });

  it("rejects a traversal filename", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await postImage("electronics/desk-lamp", "../item.json", PNG_BYTES);
    expect(res.status).toBe(400);
  });

  it("rejects an empty upload", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await postImage("electronics/desk-lamp", "01-front.png", Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it("keeps both photos when the filename collides", async () => {
    await seedItem("electronics/desk-lamp");
    await postImage("electronics/desk-lamp", "01-front.png", PNG_BYTES);

    const res = await postImage("electronics/desk-lamp", "01-front.png", PNG_BYTES);

    expect(res.status).toBe(201);
    const body = asJson(res).body as { file: string; files: string[] };
    expect(body.file).toBe("01-front-1.png");
    expect(body.files).toHaveLength(2);
  });
});

describe("DELETE and reorder image routes", () => {
  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  });

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it("deletes one image and returns the rest", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "01-front.png");
    await seedImage("electronics/desk-lamp", "02-side.png");

    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items/electronics/desk-lamp/images/01-front.png",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({ files: ["02-side.png"] });
  });

  it("404s deleting an image that is not there", async () => {
    await seedItem("electronics/desk-lamp");
    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items/electronics/desk-lamp/images/ghost.png",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });
    expect(res.status).toBe(404);
  });

  it("reorders by renaming with numeric prefixes", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    await seedImage("electronics/desk-lamp", "banana.png");

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      body: Buffer.from(JSON.stringify({ order: ["banana.png", "apple.png"] })),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({ files: ["01-banana.png", "02-apple.png"] });
  });

  it("400s a reorder that does not name every image", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    await seedImage("electronics/desk-lamp", "banana.png");

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      body: Buffer.from(JSON.stringify({ order: ["apple.png"] })),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(400);
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

describe("POST /api/sync-images", () => {
  afterEach(() => {
    setSyncRunner(null);
  });

  function post() {
    return handleStudioRequest({
      method: "POST",
      url: "/api/sync-images",
      body: Buffer.from("{}"),
      projectRoot: sandbox,
    });
  }

  it("405s a GET", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/sync-images",
      body: Buffer.alloc(0),
      projectRoot: sandbox,
    });
    expect(res.status).toBe(405);
  });

  it("503s when no runner is registered", async () => {
    const res = await post();
    expect(res.status).toBe(503);
  });

  it("returns an SSE response once a runner is registered", async () => {
    setSyncRunner(async () => ({
      total: 0,
      uploaded: 0,
      skipped: 0,
      stripped: 0,
      purged: 0,
      manifest: {},
      images: [],
      failures: [],
    }));

    const res = await post();

    expect(res.status).toBe(200);
    expect(isSseResponse(res)).toBe(true);
    // Drain it so the mutex is released before the next test.
    if (isSseResponse(res)) {
      for await (const _evt of res.events) {
        // consume
      }
    }
  });
});
