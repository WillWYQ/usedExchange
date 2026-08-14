import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import * as loaderModule from "@/lib/content/loader";
import { siteConfig } from "../../content/config";
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
import { getSyncRunner, resetSyncStateForTests, setSyncRunner, streamImageSync } from "./studioSync";

const run = promisify(execFile);

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

  it("includes tags and listedDate on every item", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(200);
    const body = asJson(res).body as { items: Array<Record<string, unknown>> };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(Array.isArray(item.tags)).toBe(true);
      // The loader fills a missing listed_date with the build date, so every
      // item that reaches studio carries a real YYYY-MM-DD string. Asserting
      // the string (not "string or null") is what pins that contract: if the
      // loader ever stops filling it, this test fails instead of silently
      // handing the client an unsortable value.
      expect(typeof item.listedDate).toBe("string");
      expect(item.listedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("returns defaultLocale and availableLocales on GET /api/items", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(200);
    const body = asJson(res).body as {
      items: unknown[];
      defaultLocale: unknown;
      availableLocales: unknown;
    };
    expect(typeof body.defaultLocale).toBe("string");
    expect(Array.isArray(body.availableLocales)).toBe(true);
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

describe("listStudioItems cover and localized names", () => {
  let coverSandbox: string;
  let originalLocales: string[];
  let originalDefault: string;

  beforeEach(async () => {
    coverSandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-cover-"));
    originalLocales = siteConfig.i18n.availableLocales.slice();
    originalDefault = siteConfig.i18n.defaultLocale;
    siteConfig.i18n.defaultLocale = "en";
    siteConfig.i18n.availableLocales = ["en", "zh"];
  });

  afterEach(async () => {
    siteConfig.i18n.defaultLocale = originalDefault;
    siteConfig.i18n.availableLocales = originalLocales;
    await fs.rm(coverSandbox, { recursive: true, force: true });
  });

  async function seedItemWithImages(
    id: string,
    itemJson: string,
    images: string[] = [],
  ): Promise<void> {
    const dir = path.join(coverSandbox, "content", "items", ...id.split("/"));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "item.json"), itemJson, "utf-8");
    for (const name of images) {
      await fs.writeFile(path.join(dir, name), Buffer.from([0xff, 0xd8, 0xff]));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mockItem(over: Record<string, unknown> = {}): any {
    return {
      categorySlug: "electronics",
      itemSlug: "desk-lamp",
      name: "Desk Lamp",
      nameZh: "台灯",
      status: "available",
      price: { currency: "USD", tiers: [{ amount: 20 }] },
      tags: [],
      listedDate: "2026-01-01",
      ...over,
    };
  }

  it("picks cover.* as the cover image when present", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([mockItem()]);
    try {
      await seedItemWithImages(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
        ["01-side.jpg", "cover.webp", "03-back.jpg"],
      );
      const items = await listStudioItems(coverSandbox);
      expect(items[0]?.coverImage).toBe("cover.webp");
      expect(items[0]?.localizedNames).toEqual({ en: "Desk Lamp", zh: "台灯" });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("falls back to the first image when there is no cover.*", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([mockItem()]);
    try {
      await seedItemWithImages(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
        ["01-front.jpg"],
      );
      const items = await listStudioItems(coverSandbox);
      expect(items[0]?.coverImage).toBe("01-front.jpg");
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("returns null coverImage when the item has no images", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([mockItem()]);
    try {
      await seedItemWithImages(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
      );
      const items = await listStudioItems(coverSandbox);
      expect(items[0]?.coverImage).toBeNull();
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("omits a locale whose translated name is empty or whitespace-only", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([mockItem({ nameZh: "   " })]);
    try {
      await seedItemWithImages(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
      );
      const items = await listStudioItems(coverSandbox);
      expect(items[0]?.localizedNames).toEqual({ en: "Desk Lamp" });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("falls through to the default name for a locale with no LOCALE_FIELD_MAP entry", async () => {
    siteConfig.i18n.availableLocales = ["en", "fr"];
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([mockItem()]);
    try {
      await seedItemWithImages(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
      );
      const items = await listStudioItems(coverSandbox);
      expect(items[0]?.localizedNames).toEqual({ en: "Desk Lamp" });
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
    expect(asJson(res).body).toMatchObject({ ok: 0, skipped: 1, failed: [] });
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

describe("bulk-status counts a no-op as skipped, not ok", () => {
  it("separates already-sold items from ones it actually wrote", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-bulk-"));
    const mk = async (slug: string, status: string, soldDate: string | null) => {
      const dir = path.join(root, "content", "items", "electronics", slug);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "item.json"),
        JSON.stringify({ name: slug, status, sold_date: soldDate }, null, 2) + "\n",
      );
    };
    await mk("already-sold", "sold", "2026-01-15");
    await mk("still-listed", "available", null);

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/bulk-status",
      body: Buffer.from(
        JSON.stringify({
          ids: ["electronics/already-sold", "electronics/still-listed"],
          status: "sold",
        }),
      ),
      projectRoot: root,
    });

    const body = asJson(res).body as { ok: number; skipped: number; failed: unknown[] };
    expect(body.ok).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toEqual([]);

    // The original sale date is intact — that is what "skipped" is protecting.
    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "already-sold", "item.json"),
      "utf-8",
    );
    expect(text).toContain("2026-01-15");
  });
});

// ── POST /api/items/bulk-apply-tiers ────────────────────────────────────────

let tiersSandbox: string;

async function seedTiersItem(id: string, json: string): Promise<void> {
  const dir = path.join(tiersSandbox, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), json);
}

async function seedTiersDefaults(scope: string, json: string): Promise<void> {
  const filePath =
    scope === "site"
      ? path.join(tiersSandbox, "content", "items", "_defaults.json")
      : path.join(tiersSandbox, "content", "items", scope, "_defaults.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json);
}

async function readTiersItem(id: string): Promise<string> {
  return fs.readFile(
    path.join(tiersSandbox, "content", "items", ...id.split("/"), "item.json"),
    "utf-8",
  );
}

function bulkApplyTiers(ids: string[]) {
  return handleStudioRequest({
    method: "POST",
    url: "/api/items/bulk-apply-tiers",
    body: Buffer.from(JSON.stringify({ ids })),
    projectRoot: tiersSandbox,
  });
}

describe("POST /api/items/bulk-apply-tiers", () => {
  beforeEach(async () => {
    tiersSandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-tiers-"));
  });

  afterEach(async () => {
    await fs.rm(tiersSandbox, { recursive: true, force: true });
  });

  const ITEM = `{
  "name": "Desk lamp",
  // options: available | pending | reserved | sold | draft
  "status": "available",
  "reserved_for": "alice@example.com"
}
`;

  const SITE_DEFAULTS = `{
  "price": {
    "tiers": [
      { "label": "Pickup", "miles_max": 5, "amount": 40 },
      { "label": "Shipping", "miles_min": 5, "amount": 55 }
    ]
  }
}
`;

  it("writes the site default tiers into selected items", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);

    const res = await bulkApplyTiers(["electronics/desk-lamp"]);

    expect(res.status).toBe(200);
    expect(asJson(res).body).toMatchObject({ ok: 1, skipped: 0, failed: [] });
    const text = await readTiersItem("electronics/desk-lamp");
    expect(text).toContain('"tiers"');
    expect(text).toContain('"label": "Pickup"');
    expect(text).toContain('"amount": 55');
  });

  it("preserves comments and reserved_for", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);
    await bulkApplyTiers(["electronics/desk-lamp"]);
    const text = await readTiersItem("electronics/desk-lamp");
    expect(text).toContain("// options: available | pending | reserved | sold | draft");
    expect(text).toContain('"reserved_for": "alice@example.com"');
  });

  it("lets category defaults override site defaults", async () => {
    await seedTiersItem("books/cs61a", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);
    await seedTiersDefaults(
      "books",
      `{
  "price": {
    "tiers": [{ "label": "Campus pickup", "miles_max": 2, "amount": 10 }]
  }
}
`,
    );

    await bulkApplyTiers(["books/cs61a"]);

    const text = await readTiersItem("books/cs61a");
    expect(text).toContain('"label": "Campus pickup"');
    expect(text).not.toContain('"label": "Pickup"');
  });

  it("skips items whose merged defaults have no tiers", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);

    const res = await bulkApplyTiers(["electronics/desk-lamp"]);

    expect(asJson(res).body).toMatchObject({ ok: 0, skipped: 1, failed: [] });
    expect(await readTiersItem("electronics/desk-lamp")).toBe(ITEM);
  });

  it("skips items whose tiers already match (idempotent, file untouched)", async () => {
    await seedTiersDefaults("site", SITE_DEFAULTS);
    await seedTiersItem(
      "electronics/desk-lamp",
      `{
  "name": "Desk lamp",
  "status": "available",
  "price": {
    "tiers": [
      { "label": "Pickup", "miles_max": 5, "amount": 40 },
      { "label": "Shipping", "miles_min": 5, "amount": 55 }
    ]
  }
}
`,
    );
    const before = await readTiersItem("electronics/desk-lamp");

    const res = await bulkApplyTiers(["electronics/desk-lamp"]);

    expect(asJson(res).body).toMatchObject({ ok: 0, skipped: 1, failed: [] });
    expect(await readTiersItem("electronics/desk-lamp")).toBe(before);
  });

  it("reports per-item failures without discarding successes", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);

    const res = await bulkApplyTiers(["electronics/desk-lamp", "books/missing"]);

    const body = asJson(res).body as { ok: number; failed: Array<{ id: string }> };
    expect(body.ok).toBe(1);
    expect(body.failed.map((f) => f.id)).toEqual(["books/missing"]);
  });

  it("rejects an empty id list", async () => {
    const res = await bulkApplyTiers([]);
    expect(res.status).toBe(400);
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
    expect(asJson(res).body).toEqual({
      files: [
        { name: "01-front.jpg", editable: true },
        { name: "02-Side.JPG", editable: true },
      ],
    });
  });

  it("lists a file the site will ship but studio cannot rename, marked not editable", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.jpg");
    // A file the seller placed by hand — spaces and parentheses are outside
    // studio's write allowlist, but the published site ships it regardless
    // (extension-only check), so studio must show it, just not let it be
    // renamed or deleted here.
    await seedImage("electronics/desk-lamp", "Screenshot 2026-07-30 at 10.00.00.png");

    const res = await get("/api/items/electronics/desk-lamp/images");

    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({
      files: [
        { name: "apple.jpg", editable: true },
        { name: "Screenshot 2026-07-30 at 10.00.00.png", editable: false },
      ],
    });
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
    expect(asJson(res).body).toEqual({
      file: "01-front.png",
      files: [{ name: "01-front.png", editable: true }],
    });
    const onDisk = await fs.readFile(
      path.join(sandbox, "content", "items", "electronics", "desk-lamp", "01-front.png"),
    );
    expect(onDisk).toEqual(PNG_BYTES);
  });

  it("sanitises a macOS-style filename with spaces and parentheses, and reports the stored name", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "photo (1).jpg", PNG_BYTES);

    expect(res.status).toBe(201);
    const body = asJson(res).body as {
      file: string;
      files: Array<{ name: string; editable: boolean }>;
    };
    // The seller never has to rename anything: the raw browser filename is
    // rejected by the allowlist, but studio normalises it instead of
    // bouncing the upload back with a confusing "not an image filename".
    expect(body.file).not.toBe("photo (1).jpg");
    expect(body.file).toMatch(/^[a-z0-9][a-z0-9._-]*\.jpg$/i);
    expect(body.files).toEqual([{ name: body.file, editable: true }]);
    const onDisk = await fs.readFile(
      path.join(sandbox, "content", "items", "electronics", "desk-lamp", body.file),
    );
    expect(onDisk).toEqual(PNG_BYTES);
  });

  it("still rejects an unsupported extension with the format message, after sanitising", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "notes (draft).txt", PNG_BYTES);

    expect(res.status).toBe(400);
    expect(asJson(res).body).toMatchObject({
      error: expect.stringContaining("use .jpg, .png, .webp or .gif"),
    });
  });

  it("sanitises a leading underscore and uploads successfully", async () => {
    // "_cover.jpg" has a perfectly usable base ("cover") and a valid
    // extension; only the leading underscore ever made it invalid. Must not
    // be told to fix a "format" that was never broken.
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "_cover.jpg", PNG_BYTES);

    expect(res.status).toBe(201);
    expect(asJson(res).body).toEqual({
      file: "cover.jpg",
      files: [{ name: "cover.jpg", editable: true }],
    });
  });

  it("reports the character/empty-base message, not the format message, for a CJK filename that sanitises to an empty base", async () => {
    // Regression: the extension check used to run against the *sanitised*
    // name. "照片.jpg" sanitises to ".jpg" (empty base), and
    // path.extname(".jpg") === "" — Node treats a string that is only an
    // extension as a dotfile with none — so the old check misrouted a
    // perfectly valid .jpg extension into the format-message branch and
    // told the seller their JPEG wasn't one.
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "照片.jpg", PNG_BYTES);

    expect(res.status).toBe(400);
    const body = asJson(res).body as { error: string };
    expect(body.error).not.toContain("use .jpg, .png, .webp or .gif");
    expect(body.error).toContain("照片.jpg");
  });

  it("reports the character/empty-base message, not the format message, for a filename that sanitises to nothing but punctuation", async () => {
    await seedItem("electronics/desk-lamp");

    const res = await postImage("electronics/desk-lamp", "??.jpg", PNG_BYTES);

    expect(res.status).toBe(400);
    const body = asJson(res).body as { error: string };
    expect(body.error).not.toContain("use .jpg, .png, .webp or .gif");
    expect(body.error).toContain("??.jpg");
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
    expect(asJson(res).body).toEqual({ files: [{ name: "02-side.png", editable: true }] });
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
    expect(asJson(res).body).toEqual({
      files: [
        { name: "01-banana.png", editable: true },
        { name: "02-apple.png", editable: true },
      ],
    });
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

  it("400s and names the file when a reorder would move a non-editable image", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    await seedImage("electronics/desk-lamp", "banana.png");
    // Not writable by studio (a space), but still present and still shipped
    // by the site — the route must not 400 it out of the order up front
    // (that would make it impossible to ever include), only refuse the
    // whole reorder if it would actually have to move.
    await seedImage("electronics/desk-lamp", "cherry pie.png");

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      body: Buffer.from(
        JSON.stringify({ order: ["cherry pie.png", "apple.png", "banana.png"] }),
      ),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(400);
    expect(asJson(res).body).toMatchObject({
      error: expect.stringContaining("cherry pie.png"),
    });
    // Nothing renamed.
    expect(
      (
        await fs.readdir(
          path.join(sandbox, "content", "items", "electronics", "desk-lamp"),
        )
      ).sort(),
    ).toEqual(["apple.png", "banana.png", "cherry pie.png", "item.json"]);
  });

  it("reorders editable images around a non-editable one that stays at the position it will actually occupy (the end)", async () => {
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    await seedImage("electronics/desk-lamp", "banana.png");
    await seedImage("electronics/desk-lamp", "cherry pie.png");

    // Current alphabetical order: apple, banana, cherry pie — "cherry
    // pie.png" stays at index 2, the one slot renumbering the two editable
    // files around it can never take away (numeric prefixes always sort
    // ahead of a name starting with a letter), so this is allowed.
    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      body: Buffer.from(
        JSON.stringify({ order: ["banana.png", "apple.png", "cherry pie.png"] }),
      ),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({
      files: [
        { name: "01-banana.png", editable: true },
        { name: "02-apple.png", editable: true },
        { name: "cherry pie.png", editable: false },
      ],
    });
  });

  it("400s and names the file when a reorder leaves its index unchanged but renumbering its neighbours would still move it", async () => {
    // Regression: comparing only the non-editable file's pre-rename index
    // against its requested index misses that renumbering the editable
    // files around it moves it too, once a numeric prefix outranks its
    // unprefixed, letter-led name in the sort.
    await seedItem("electronics/desk-lamp");
    await seedImage("electronics/desk-lamp", "apple.png");
    // Non-editable (a space) and, alphabetically, the middle of the three.
    await seedImage("electronics/desk-lamp", "banana pie.png");
    await seedImage("electronics/desk-lamp", "cherry.png");

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/items/electronics/desk-lamp/images/reorder",
      // Same relative order as the current listing — "banana pie.png"
      // keeps its index (1) — which is exactly what a pre-rename-only
      // check would have accepted.
      body: Buffer.from(
        JSON.stringify({ order: ["apple.png", "banana pie.png", "cherry.png"] }),
      ),
      projectRoot: sandbox,
    });

    expect(res.status).toBe(400);
    expect(asJson(res).body).toMatchObject({
      error: expect.stringContaining("banana pie.png"),
    });
    // Nothing renamed.
    expect(
      (
        await fs.readdir(
          path.join(sandbox, "content", "items", "electronics", "desk-lamp"),
        )
      ).sort(),
    ).toEqual(["apple.png", "banana pie.png", "cherry.png", "item.json"]);
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

// Renamed from the brief's `ITEM_JSON` — that name is already a top-level
// const above (used by the bulk-status and image-route describe blocks with a
// different shape), and both live in the same module scope.
const PATCH_ITEM_JSON = `{
  "name": "Desk lamp",
  "status": "draft", // options: "available" | "pending" | "reserved" | "sold" | "draft"
  "quantity": 1,
  "reserved_for": "alice@example.com",
  "price": { "currency": "USD", "tiers": [{ "label": "Pickup", "amount": 20 }] }
}
`;

async function makeTempProject(itemJson: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-patch-"));
  const dir = path.join(root, "content", "items", "electronics", "desk-lamp");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), itemJson, "utf-8");
  return root;
}

describe("GET /api/items/:cat/:name", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  async function project(itemJson: string): Promise<string> {
    const root = await makeTempProject(itemJson);
    tempProjects.push(root);
    return root;
  }

  it("returns the editable fields", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/electronics/desk-lamp",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(200);
    const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
    expect(fields["name"]).toBe("Desk lamp");
    expect(fields["status"]).toBe("draft");
  });

  it("never returns reserved_for", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/electronics/desk-lamp",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    const body = JSON.stringify(asJson(res).body);
    expect(body).not.toContain("reserved_for");
    expect(body).not.toContain("alice@example.com");
  });

  it("404s for an item that does not exist", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/electronics/nope",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(404);
  });

  it("400s on a traversal payload", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/items/..%2F..%2Fetc/passwd",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/items/:cat/:name", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  async function project(itemJson: string): Promise<string> {
    const root = await makeTempProject(itemJson);
    tempProjects.push(root);
    return root;
  }

  function patch(root: string, edits: unknown, url = "/api/items/electronics/desk-lamp") {
    return handleStudioRequest({
      method: "PATCH",
      url,
      body: Buffer.from(JSON.stringify({ edits })),
      projectRoot: root,
    });
  }

  it("writes a changed field and preserves comments and reserved_for", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await patch(root, [{ path: ["name"], value: "Reading lamp" }]);
    expect(res.status).toBe(200);

    const onDisk = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(onDisk).toContain('"name": "Reading lamp"');
    expect(onDisk).toContain("// options:");
    expect(onDisk).toContain('"reserved_for": "alice@example.com"');
  });

  it("returns the re-read fields, not the request echo", async () => {
    // fix round 1, finding MINOR 5: asserting the value from the edit landed
    // in the response proves nothing about WHERE the response came from — a
    // handler that returned `readItemForEdit(next)` (the in-memory computed
    // text, never touching disk again) would pass that assertion too, since
    // `next` and the file's real bytes normally agree. Mocking writeFile so
    // what actually lands on disk DIFFERS from `next` closes that gap: only
    // a genuine second `readFile` of the file can produce this value.
    const root = await project(PATCH_ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const DIFFERENT_FROM_THE_EDIT = `{ "name": "Whatever actually landed on disk" }\n`;
    const originalWriteFile = fs.writeFile;

    const writeSpy = vi
      .spyOn(fs, "writeFile")
      .mockImplementation(async (target, _data, options) => {
        if (target === jsonPath) {
          return originalWriteFile(target, DIFFERENT_FROM_THE_EDIT, options);
        }
        return originalWriteFile(target, _data, options);
      });

    try {
      const res = await patch(root, [{ path: ["name"], value: "Reading lamp" }]);
      expect(res.status).toBe(200);
      const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
      // Neither "Reading lamp" (the request) nor "Desk lamp" (the original
      // on-disk value / what `next` would compute to) — only a real second
      // read of the file, after the mocked write above, produces this.
      expect(fields["name"]).toBe("Whatever actually landed on disk");
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("rejects an edit to reserved_for and leaves the file untouched", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const before = await fs.readFile(jsonPath, "utf-8");

    const res = await patch(root, [{ path: ["reserved_for"], value: "bob@example.com" }]);
    expect(res.status).toBe(400);
    expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
  });

  it("rejects an invalid value and leaves the file untouched", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const before = await fs.readFile(jsonPath, "utf-8");

    const res = await patch(root, [
      { path: ["name"], value: "Fine" },
      { path: ["status"], value: "liquidated" },
    ]);
    expect(res.status).toBe(400);
    // Not partially applied: the valid first edit must not land either.
    expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
  });

  it("rejects a malformed edits array", async () => {
    const root = await project(PATCH_ITEM_JSON);
    expect((await patch(root, "nope")).status).toBe(400);
    expect((await patch(root, [])).status).toBe(400);
    expect((await patch(root, [{ path: [], value: 1 }])).status).toBe(400);
  });

  it("405s on PUT", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await handleStudioRequest({
      method: "PUT",
      url: "/api/items/electronics/desk-lamp",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(405);
  });

  // Task 1 review, deferred here: assertEditableValue cannot see the document,
  // so an out-of-range tier index validates and jsonc-parser's modify() then
  // appends rather than erroring. Only this handler has the file in hand to
  // bound-check against.
  it("rejects an edit that indexes price.tiers beyond the array's current length", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const before = await fs.readFile(jsonPath, "utf-8");

    // PATCH_ITEM_JSON's price.tiers has exactly one entry (index 0), so index
    // 5 is well beyond it — an off-by-one in the UI, not a legitimate append.
    const res = await patch(root, [{ path: ["price", "tiers", 5, "amount"], value: 30 }]);
    expect(res.status).toBe(400);
    expect(asJson(res).body).toMatchObject({
      error: expect.stringContaining("price.tiers.5"),
    });
    expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
  });

  it("allows appending a new tier at exactly the array's current length", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await patch(root, [
      { path: ["price", "tiers", 1], value: { label: "Shipped", amount: 35 } },
    ]);
    expect(res.status).toBe(200);
    const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
    const tiers = (fields["price"] as { tiers: { label: string; amount: number }[] }).tiers;
    expect(tiers).toHaveLength(2);
    expect(tiers[1]).toMatchObject({ label: "Shipped", amount: 35 });
  });

  // fix round 1, finding IMPORTANT 1: `index === length` is only a legitimate
  // append when the batch actually completes the tier it creates. A single
  // leaf write landing at the append slot (a stale form editing "tier 2's
  // price" after another tab or the CLI removed a tier) must not silently
  // create a tier missing "label".
  it("rejects a single-leaf write that lands at the append index but leaves the new tier incomplete", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const jsonPath = path.join(root, "content", "items", "electronics", "desk-lamp", "item.json");
    const before = await fs.readFile(jsonPath, "utf-8");

    // PATCH_ITEM_JSON's price.tiers has one entry (index 0); index 1 is a
    // legal append position, but this batch only ever sets "amount" — no
    // "label" — for it.
    const res = await patch(root, [{ path: ["price", "tiers", 1, "amount"], value: 35 }]);
    expect(res.status).toBe(400);
    expect(asJson(res).body).toMatchObject({
      error: expect.stringContaining("price.tiers.1"),
    });
    // Not silently clamped onto an existing tier, and not written as a
    // half-formed object either: nothing on disk changed at all.
    expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
  });

  it("allows a legitimate multi-leaf append that together completes the new tier", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await patch(root, [
      { path: ["price", "tiers", 1, "label"], value: "Shipped" },
      { path: ["price", "tiers", 1, "amount"], value: 35 },
    ]);
    expect(res.status).toBe(200);
    const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
    const tiers = (fields["price"] as { tiers: { label: string; amount: number }[] }).tiers;
    expect(tiers).toHaveLength(2);
    expect(tiers[1]).toMatchObject({ label: "Shipped", amount: 35 });
  });

  // fix round 1, finding IMPORTANT 2: bounds must be evaluated against the
  // array as the batch itself leaves it, not a pre-batch snapshot — in both
  // directions.
  describe("tier bounds against a batch that also replaces price wholesale", () => {
    it("does not false-reject an index that the same batch's own wholesale replace just grew the array to cover", async () => {
      const root = await project(PATCH_ITEM_JSON);
      const res = await patch(root, [
        {
          path: ["price"],
          value: {
            currency: "USD",
            tiers: [
              { label: "Pickup", amount: 20 },
              { label: "Local delivery", amount: 30 },
              { label: "Shipped", amount: 40 },
            ],
          },
        },
        { path: ["price", "tiers", 2, "amount"], value: 99 },
      ]);
      expect(res.status).toBe(200);
      const fields = (asJson(res).body as { fields: Record<string, unknown> }).fields;
      const tiers = (fields["price"] as { tiers: { label: string; amount: number }[] }).tiers;
      expect(tiers).toHaveLength(3);
      expect(tiers[2]).toMatchObject({ label: "Shipped", amount: 99 });
    });

    it("does not false-accept — and silently clamp — an index the same batch's own wholesale replace just made out of range", async () => {
      const root = await project(PATCH_ITEM_JSON);
      const jsonPath = path.join(
        root,
        "content",
        "items",
        "electronics",
        "desk-lamp",
        "item.json",
      );
      const before = await fs.readFile(jsonPath, "utf-8");

      const res = await patch(root, [
        // Replaces price wholesale with no tiers at all.
        { path: ["price"], value: { currency: "USD" } },
        // Pre-batch, index 1 looked legal (the original array has length 1,
        // so 1 was the append slot). After the edit above, the array this
        // batch itself is building has length 0 — index 1 is genuinely out
        // of range now, and must be rejected, not clamped onto index 0.
        { path: ["price", "tiers", 1], value: { label: "X", amount: 9 } },
      ]);
      expect(res.status).toBe(400);
      expect(asJson(res).body).toMatchObject({
        error: expect.stringContaining("price.tiers.1"),
      });
      expect(await fs.readFile(jsonPath, "utf-8")).toBe(before);
    });
  });

  // fix round 1, finding MINOR 4: a non-integer index is rejected for being
  // an invalid path, not for being "out of range" — the bounds check must
  // not shadow assertEditableValue's own, more specific reason.
  it("reports a non-integer tier index as an invalid path, not an out-of-range one", async () => {
    const root = await project(PATCH_ITEM_JSON);
    const res = await patch(root, [{ path: ["price", "tiers", 1.5, "amount"], value: 30 }]);
    expect(res.status).toBe(400);
    const body = asJson(res).body as { error: string };
    expect(body.error).not.toMatch(/out of range/);
    expect(body.error).toMatch(/outside the item\.json schema/);
  });
});

describe("POST /api/items", () => {
  // Tracked and removed in afterEach, same pattern makeTempProject/project use
  // above — each test mints its own tmpdir via emptyProject() and must not
  // leak it.
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  function create(root: string, body: unknown) {
    return handleStudioRequest({
      method: "POST",
      url: "/api/items",
      body: Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-create-"));
    await fs.mkdir(path.join(root, "content", "items"), { recursive: true });
    tempProjects.push(root);
    return root;
  }

  it("creates item.json from the template", async () => {
    const root = await emptyProject();
    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(201);
    expect((asJson(res).body as { id: string }).id).toBe("electronics/desk-lamp");

    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"status": "draft"');
    expect(text).toContain("// options:");
    // Iron Rule 4 — the scaffold never writes it.
    expect(text).not.toContain("reserved_for");
  });

  it("derives a display name from the slug", async () => {
    const root = await emptyProject();
    await create(root, { category: "electronics", name: "usb-c-hub" });
    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "usb-c-hub", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"name": "Usb C Hub"');
  });

  it("creates the category folder when it does not exist", async () => {
    const root = await emptyProject();
    expect((await create(root, { category: "garden", name: "hose" })).status).toBe(201);
    await expect(
      fs.stat(path.join(root, "content", "items", "garden")),
    ).resolves.toBeDefined();
  });

  it("409s rather than overwriting an existing item", async () => {
    const root = await emptyProject();
    await create(root, { category: "electronics", name: "desk-lamp" });
    const jsonPath = path.join(
      root, "content", "items", "electronics", "desk-lamp", "item.json",
    );
    await fs.writeFile(jsonPath, `{ "name": "Edited by hand" }`, "utf-8");

    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(409);
    expect(await fs.readFile(jsonPath, "utf-8")).toContain("Edited by hand");
  });

  it("400s on a non-slug category or name", async () => {
    const root = await emptyProject();
    expect((await create(root, { category: "Electronics", name: "x" })).status).toBe(400);
    expect((await create(root, { category: "e", name: "desk lamp" })).status).toBe(400);
    expect((await create(root, { category: "..", name: "x" })).status).toBe(400);
  });

  it("405s on DELETE /api/items", async () => {
    const root = await emptyProject();
    const res = await handleStudioRequest({
      method: "DELETE",
      url: "/api/items",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(405);
  });

  it("applies merged site and category defaults on create", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      JSON.stringify({ contact_note: "site note", no_lowball: true, price: { currency: "EUR" } }),
      "utf-8",
    );
    await fs.mkdir(path.join(root, "content", "items", "electronics"), { recursive: true });
    await fs.writeFile(
      path.join(root, "content", "items", "electronics", "_defaults.json"),
      JSON.stringify({ contact_note: "cat note", price: { negotiable: true } }),
      "utf-8",
    );

    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(201);

    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"contact_note": "cat note"'); // category wins
    expect(text).toContain('"no_lowball": true'); // site layer survives
    expect(text).toContain('"currency": "EUR"'); // deep-merged price leaf
    expect(text).toContain('"negotiable": true'); // deep-merged price leaf
    expect(text).toContain('"name": "Desk Lamp"'); // per-item fields stay fresh
    expect(text).toContain('"status": "draft"');
  });

  it("skips defaults when applyDefaults is false", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      JSON.stringify({ contact_note: "site note" }),
      "utf-8",
    );
    const res = await create(root, {
      category: "electronics",
      name: "desk-lamp",
      applyDefaults: false,
    });
    expect(res.status).toBe(201);
    const text = await fs.readFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      "utf-8",
    );
    expect(text).toContain('"contact_note": ""');
  });

  it("400s when a defaults file is invalid, naming the file", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      "{not json",
      "utf-8",
    );
    const res = await create(root, { category: "electronics", name: "desk-lamp" });
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain("_defaults.json");
  });
});

describe("defaults routes", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  async function emptyProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-defaults-"));
    await fs.mkdir(path.join(root, "content", "items"), { recursive: true });
    tempProjects.push(root);
    return root;
  }

  function req(root: string, method: string, url: string, body?: unknown) {
    return handleStudioRequest({
      method,
      url,
      body: body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  it("GET returns {} when no defaults file exists", async () => {
    const root = await emptyProject();
    const res = await req(root, "GET", "/api/defaults?scope=site");
    expect(res.status).toBe(200);
    expect(asJson(res).body).toEqual({});
  });

  it("PUT then GET round-trips site defaults", async () => {
    const root = await emptyProject();
    const put = await req(root, "PUT", "/api/defaults?scope=site", { contact_note: "WeChat: xxx" });
    expect(put.status).toBe(200);
    expect(
      await fs.readFile(path.join(root, "content", "items", "_defaults.json"), "utf-8"),
    ).toContain('"contact_note": "WeChat: xxx"');
    const get = await req(root, "GET", "/api/defaults?scope=site");
    expect(asJson(get).body).toEqual({ contact_note: "WeChat: xxx" });
  });

  it("PUT to a category scope creates the folder and file", async () => {
    const root = await emptyProject();
    const put = await req(root, "PUT", "/api/defaults?scope=electronics", { no_lowball: true });
    expect(put.status).toBe(200);
    expect(
      await fs.readFile(
        path.join(root, "content", "items", "electronics", "_defaults.json"),
        "utf-8",
      ),
    ).toContain('"no_lowball": true');
  });

  it("PUT with an empty object deletes the existing file", async () => {
    const root = await emptyProject();
    const filePath = path.join(root, "content", "items", "_defaults.json");
    await fs.writeFile(filePath, '{"no_lowball": true}', "utf-8");
    const put = await req(root, "PUT", "/api/defaults?scope=site", {});
    expect(put.status).toBe(200);
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it("400s a PUT of reserved_for, a per-item field, or a bad value", async () => {
    const root = await emptyProject();
    expect((await req(root, "PUT", "/api/defaults?scope=site", { reserved_for: "x" })).status).toBe(400);
    expect((await req(root, "PUT", "/api/defaults?scope=site", { name: "x" })).status).toBe(400);
    expect((await req(root, "PUT", "/api/defaults?scope=site", { no_lowball: "yes" })).status).toBe(400);
  });

  it("400s a missing or malformed scope", async () => {
    const root = await emptyProject();
    expect((await req(root, "GET", "/api/defaults")).status).toBe(400);
    expect((await req(root, "GET", "/api/defaults?scope=Electronics")).status).toBe(400);
    expect((await req(root, "GET", "/api/defaults?scope=..")).status).toBe(400);
  });

  it("400s GET when the file on disk is invalid, naming the field", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      JSON.stringify({ name: "X" }),
      "utf-8",
    );
    const res = await req(root, "GET", "/api/defaults?scope=site");
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain('"name"');
  });

  it("400s GET on a syntactically broken file, naming the file", async () => {
    const root = await emptyProject();
    await fs.writeFile(
      path.join(root, "content", "items", "_defaults.json"),
      "{not json",
      "utf-8",
    );
    const res = await req(root, "GET", "/api/defaults?scope=site");
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain("_defaults.json");
  });

  it("405s POST /api/defaults", async () => {
    const root = await emptyProject();
    expect((await req(root, "POST", "/api/defaults?scope=site", {})).status).toBe(405);
  });
});

describe("publish routes", () => {
  // Tracked and removed in afterEach, same pattern makeTempProject/project use
  // above — each test mints its own tmpdir via makeTempProject and must not
  // leak it.
  let tempProjects: string[] = [];

  async function project(itemJson: string): Promise<string> {
    const root = await makeTempProject(itemJson);
    tempProjects.push(root);
    return root;
  }

  // A real git repository with a bare `origin`, wired the same way
  // scripts/lib/studioGit.test.ts's makeRepo() is: this file has to prove the
  // route actually calls readChanges/publishChanges end to end, not just that
  // it returns SOME 200. (Fix round 1, finding 5: a handleChanges that
  // unconditionally threw 400, and a handlePublish that returned a hardcoded
  // {commit:"deadbeef",files:[]} without ever calling publishChanges, both
  // passed every test in this file before this helper existed.)
  async function makeGitProject(itemJson: string): Promise<string> {
    const root = await project(itemJson);
    const origin = path.join(root, "..", `${path.basename(root)}-origin.git`);
    tempProjects.push(origin);

    await run("git", ["init", "--bare", "--initial-branch=main", origin]);
    await run("git", ["init", "--initial-branch=main"], { cwd: root });
    await run("git", ["config", "user.email", "seller@example.com"], { cwd: root });
    await run("git", ["config", "user.name", "Seller"], { cwd: root });
    await run("git", ["config", "commit.gpgsign", "false"], { cwd: root });
    await fs.mkdir(path.join(root, "lib", "generated"), { recursive: true });
    await fs.writeFile(path.join(root, "lib", "generated", "image-manifest.json"), "{}\n");
    await run("git", ["add", "content", "lib"], { cwd: root });
    await run("git", ["commit", "-m", "initial"], { cwd: root });
    await run("git", ["remote", "add", "origin", origin], { cwd: root });
    await run("git", ["push", "-u", "origin", "main"], { cwd: root });

    return root;
  }

  afterEach(async () => {
    resetSyncStateForTests();
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  it("GET /api/changes 400s when the project root is not a git repository", async () => {
    const root = await project(ITEM_JSON);
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/changes",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toMatch(/not a git repository/);
  });

  it("GET /api/changes returns branch and files from a real repository", async () => {
    const root = await makeGitProject(ITEM_JSON);
    await fs.writeFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      ITEM_JSON.replace("Desk lamp", "Reading lamp"),
    );

    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/changes",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(200);
    const body = asJson(res).body as { branch: string; files: Array<{ path: string }> };
    expect(body.branch).toBe("main");
    expect(body.files.map((f) => f.path)).toEqual([
      "content/items/electronics/desk-lamp/item.json",
    ]);
  });

  it("POST /api/publish commits and pushes a real repository, returning what shipped", async () => {
    const root = await makeGitProject(ITEM_JSON);
    await fs.writeFile(
      path.join(root, "content", "items", "electronics", "desk-lamp", "item.json"),
      ITEM_JSON.replace("Desk lamp", "Reading lamp"),
    );

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/publish",
      body: Buffer.from(JSON.stringify({ message: "chore: rename the lamp" })),
      projectRoot: root,
    });
    expect(res.status).toBe(200);
    const body = asJson(res).body as { commit: string; files: Array<{ path: string }> };
    expect(body.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(body.files.map((f) => f.path)).toEqual([
      "content/items/electronics/desk-lamp/item.json",
    ]);

    // Proves the commit actually reached the remote, not just the local repo
    // — a hardcoded-return mutation would never touch git at all.
    const { stdout } = await run("git", ["log", "-1", "--pretty=%s", "origin/main"], {
      cwd: root,
    });
    expect(stdout.trim()).toBe("chore: rename the lamp");
  });

  it("POST /api/publish is refused while an image sync is running", async () => {
    const root = await project(ITEM_JSON);

    // Hold the mutex with a runner that emits one progress event and then
    // never settles, then confirm publish refuses. A commit taken mid-sync
    // would ship a half-written lib/generated/image-manifest.json.
    //
    // The runner must emit at least once before blocking: streamImageSync's
    // generator only resolves a `.next()` call by reaching a `yield`, and with
    // no progress event ever pushed it would sit forever on its internal
    // 50ms poll `await` (which does not resolve `.next()`) — hanging this
    // test, not exercising the 409. `running` is already true by the time
    // this first event is emitted; it flips synchronously at the top of
    // streamImageSync, before the runner is even invoked. Same shape
    // studioSync.test.ts uses for "genuinely still in flight" cases.
    setSyncRunner((onProgress) => {
      onProgress({ type: "scanned", total: 1 });
      return new Promise(() => {});
    });
    const stream = streamImageSync(getSyncRunner()!);
    await stream.next(); // yields the progress event; `running` is already true

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/publish",
      body: Buffer.from(JSON.stringify({ message: "chore: update listings" })),
      projectRoot: root,
    });
    expect(res.status).toBe(409);
    expect((asJson(res).body as { error: string }).error).toMatch(/sync/i);

    await stream.return(undefined);
  });

  it("405s on the wrong methods", async () => {
    const root = await project(ITEM_JSON);
    expect(
      (
        await handleStudioRequest({
          method: "POST", url: "/api/changes", body: Buffer.from("{}"), projectRoot: root,
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await handleStudioRequest({
          method: "GET", url: "/api/publish", body: Buffer.alloc(0), projectRoot: root,
        })
      ).status,
    ).toBe(405);
  });
});

// ── Config routes ────────────────────────────────────────────────────────────
// The fixture is a small hand-written config rather than the repo's real one:
// these tests must stay fast and hermetic, and the real file is already
// exercised by configEdit.test.ts.

const CONFIG_FIXTURE = `import type { SiteConfig } from "@/lib/config/types";

export const siteConfig: SiteConfig = {
  // ── Identity ─────────────────────────────────────────────
  name: "Test Store",
  tagline: "Nothing to see here.",

  // ── Deployment ───────────────────────────────────────────
  deploymentMode: "static", // "static" | "vercel"
  baseUrl: "https://example.com",

  // ── Seller location ──────────────────────────────────────
  location: {
    lat: 37.7749,
    lng: -122.4194,
    label: "San Francisco, CA",
  },

  // ── Content defaults ─────────────────────────────────────
  recentlyListedCount: 6,

  // ── Contact ──────────────────────────────────────────────
  contact: {
    platforms: ["email", "sms"],
  },
};
`;

const CONFIG_TYPES_FIXTURE = `export interface SiteConfig {
  name: string;
  tagline: string;
  deploymentMode: "static" | "vercel";
  baseUrl: string;
  location: { lat: number; lng: number; label: string };
  recentlyListedCount: number;
  contact: { platforms: string[] };
}
`;

describe("config routes", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  /**
   * A sandbox project with content/config.ts and lib/config/types.ts. No
   * tsconfig.json: the tsc gate is skipped in that case (asserted explicitly
   * below), which keeps these tests fast while the gate itself stays honest.
   */
  async function configProject(config = CONFIG_FIXTURE): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-config-"));
    tempProjects.push(root);
    await fs.mkdir(path.join(root, "content"), { recursive: true });
    await fs.mkdir(path.join(root, "lib", "config"), { recursive: true });
    await fs.writeFile(path.join(root, "content", "config.ts"), config, "utf-8");
    await fs.writeFile(path.join(root, "lib", "config", "types.ts"), CONFIG_TYPES_FIXTURE, "utf-8");
    return root;
  }

  const configPath = (root: string): string => path.join(root, "content", "config.ts");

  function req(root: string, method: string, body?: unknown) {
    return handleStudioRequest({
      method,
      url: "/api/config",
      body: body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)),
      projectRoot: root,
    });
  }

  it("GET returns the field list", async () => {
    const root = await configProject();
    const res = await req(root, "GET");
    expect(res.status).toBe(200);
    const fields = (asJson(res).body as { fields: Array<{ path: string }> }).fields;
    const paths = fields.map((f) => f.path);
    expect(paths).toContain("name");
    expect(paths).toContain("location.lat");
  });

  it("PUT writes a value, returns the new list, and changes exactly one line", async () => {
    const root = await configProject();
    const before = await fs.readFile(configPath(root), "utf-8");

    const res = await req(root, "PUT", { path: "recentlyListedCount", value: 9 });
    expect(res.status).toBe(200);

    const fields = (asJson(res).body as { fields: Array<{ path: string; value: unknown }> }).fields;
    expect(fields.find((f) => f.path === "recentlyListedCount")?.value).toBe(9);

    const after = await fs.readFile(configPath(root), "utf-8");
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    expect(afterLines.length).toBe(beforeLines.length);
    expect(afterLines.filter((l, i) => l !== beforeLines[i]).length).toBe(1);
    // Every comment survives the write.
    expect((after.match(/^\s*\/\//gm) ?? []).length).toBe((before.match(/^\s*\/\//gm) ?? []).length);
  });

  it("400s an illegal enum value and leaves the file byte-identical", async () => {
    const root = await configProject();
    const before = await fs.readFile(configPath(root), "utf-8");

    const res = await req(root, "PUT", { path: "deploymentMode", value: "netlify" });
    expect(res.status).toBe(400);

    expect(await fs.readFile(configPath(root), "utf-8")).toBe(before);
  });

  it("400s a write to an array field and leaves the file byte-identical", async () => {
    const root = await configProject();
    const before = await fs.readFile(configPath(root), "utf-8");

    const res = await req(root, "PUT", { path: "contact.platforms", value: "x" });
    expect(res.status).toBe(400);

    expect(await fs.readFile(configPath(root), "utf-8")).toBe(before);
  });

  it("400s a path that does not exist", async () => {
    const root = await configProject();
    const res = await req(root, "PUT", { path: "nope.nothing", value: 1 });
    expect(res.status).toBe(400);
  });

  it("400s an out-of-range latitude and leaves the file byte-identical", async () => {
    const root = await configProject();
    const before = await fs.readFile(configPath(root), "utf-8");

    const res = await req(root, "PUT", { path: "location.lat", value: 91 });
    expect(res.status).toBe(400);

    expect(await fs.readFile(configPath(root), "utf-8")).toBe(before);
  });

  it("400s when content/config.ts is missing, naming the file", async () => {
    const root = await configProject();
    await fs.rm(configPath(root));
    const res = await req(root, "GET");
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain("config.ts");
  });

  it("400s when the file has no siteConfig declaration", async () => {
    const root = await configProject("export const notTheConfig = { name: \"x\" };\n");
    const res = await req(root, "GET");
    expect(res.status).toBe(400);
    expect((asJson(res).body as { error: string }).error).toContain("siteConfig");
  });

  it("skips the tsc gate when the project has no tsconfig.json", async () => {
    // Documented, tested fallback: a sandbox has no tsconfig, so the gate is
    // skipped there. A silently absent gate would be dishonest — this test
    // pins that the skip is deliberate and that writes still succeed.
    const root = await configProject();
    expect(await fs.readdir(root)).not.toContain("tsconfig.json");
    const res = await req(root, "PUT", { path: "name", value: "Renamed" });
    expect(res.status).toBe(200);
    expect(await fs.readFile(configPath(root), "utf-8")).toContain('name: "Renamed"');
  });

  it("leaves no temp file behind after a successful write", async () => {
    const root = await configProject();
    await req(root, "PUT", { path: "name", value: "Renamed" });
    const entries = await fs.readdir(path.join(root, "content"));
    expect(entries).toEqual(["config.ts"]);
  });

  it("leaves no temp file behind after a rejected write", async () => {
    const root = await configProject();
    await req(root, "PUT", { path: "deploymentMode", value: "netlify" });
    const entries = await fs.readdir(path.join(root, "content"));
    expect(entries).toEqual(["config.ts"]);
  });

  it("405s POST /api/config", async () => {
    const root = await configProject();
    const res = await req(root, "POST", {});
    expect(res.status).toBe(405);
  });
});

// ── Readiness route ──────────────────────────────────────────────────────────

describe("readiness route", () => {
  let tempProjects: string[] = [];

  afterEach(async () => {
    await Promise.all(tempProjects.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempProjects = [];
  });

  async function readinessProject(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-readiness-"));
    tempProjects.push(root);
    return root;
  }

  it("GET returns a tiered report", async () => {
    const root = await readinessProject();
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/readiness",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    expect(res.status).toBe(200);
    const report = (
      asJson(res).body as {
        report: { items: Array<{ id: string; tier: number }>; tier1Total: number };
      }
    ).report;
    expect(report.items.map((i) => i.id)).toContain("identity");
    expect(report.items.map((i) => i.id)).toContain("aceternity");
    expect(report.tier1Total).toBe(6);
  });

  it("reports the sandbox's own state, not the real repo's", async () => {
    // projectRoot must be honoured: an empty sandbox has no items, even though
    // the repo this test runs in has several.
    const root = await readinessProject();
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/readiness",
      body: Buffer.alloc(0),
      projectRoot: root,
    });
    const report = (
      asJson(res).body as { report: { items: Array<{ id: string; done: boolean }> } }
    ).report;
    expect(report.items.find((i) => i.id === "first-item")?.done).toBe(false);
  });

  it("405s a POST", async () => {
    const root = await readinessProject();
    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/readiness",
      body: Buffer.from("{}"),
      projectRoot: root,
    });
    expect(res.status).toBe(405);
  });
});

describe("POST /api/export-pdf", () => {
  it("returns 400 with a clear message when there are no eligible items", async () => {
    // Each spy is captured and explicitly restored in `finally` — this file has
    // no global afterEach mock reset, so a leaked mock would leak into whichever
    // test runs next (see the existing loadAllItemsRaw spies above for the pattern).
    const mockLoadAllItemsRaw = vi.spyOn(loaderModule, "loadAllItemsRaw").mockResolvedValue([]);
    const mockLoadCategories = vi.spyOn(loaderModule, "loadCategories").mockResolvedValue([]);

    try {
      const res = await handleStudioRequest({
        method: "POST",
        url: "/api/export-pdf",
        body: Buffer.from("{}"),
        projectRoot: PROJECT_ROOT,
      });

      expect(res.status).toBe(400);
      expect(asJson(res).body).toEqual({ error: "No public-visible items to export." });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
      mockLoadCategories.mockRestore();
    }
  });

  it("returns a PDF file response for the real local catalog", async () => {
    const { chromium } = await import("playwright");
    let chromiumAvailable = true;
    try {
      const browser = await chromium.launch();
      await browser.close();
    } catch {
      chromiumAvailable = false;
    }
    if (!chromiumAvailable) {
      console.warn("Skipping: Chromium not installed. Run `npx playwright install chromium`.");
      return;
    }

    const res = await handleStudioRequest({
      method: "POST",
      url: "/api/export-pdf",
      body: Buffer.from("{}"),
      projectRoot: PROJECT_ROOT,
    });

    expect(res.status).toBe(200);
    expect(isFileResponse(res)).toBe(true);
    if (isFileResponse(res)) {
      expect(res.contentType).toBe("application/pdf");
      expect(res.file.endsWith(".pdf")).toBe(true);
    }
  });

  it("rejects non-POST methods", async () => {
    const res = await handleStudioRequest({
      method: "GET",
      url: "/api/export-pdf",
      body: Buffer.alloc(0),
      projectRoot: PROJECT_ROOT,
    });
    expect(res.status).toBe(405);
  });
});