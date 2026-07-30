import { describe, expect, it, vi } from "vitest";
import path from "path";
import * as loaderModule from "@/lib/content/loader";
import { handleStudioRequest, resolveItemDir, StudioError, listStudioItems } from "./studioApi";

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
    const body = res.body as { items: unknown[] };
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
