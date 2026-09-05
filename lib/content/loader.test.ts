import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";
import type { Dirent } from "fs";

// loader.ts does `import fs from "fs/promises"` (default import) and
// `import { siteConfig } from "@/content/config"` — both mocked before import
// so the loader module resolves the mocks (vi.mock is hoisted above imports).
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();

vi.mock("fs/promises", () => ({
  default: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
}));

// Mutable so each test can flip soldItemRetentionDays without re-mocking.
const mockSiteConfig = {
  currency: "USD",
  recentlyListedCount: 6,
  soldItemRetentionDays: 3,
};
vi.mock("@/content/config", () => ({ siteConfig: mockSiteConfig }));

const { loadItemsByCategory, loadSoldItems, loadItem, loadTagIndex } =
  await import("./loader");

const CONTENT_ROOT = path.join(process.cwd(), "content", "items");
const MANIFEST_PATH = path.join(
  process.cwd(),
  "lib",
  "generated",
  "image-manifest.json",
);

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function dirent(name: string, isDir: boolean): Dirent<string> {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  } as unknown as Dirent<string>;
}

// Single fixture category ("electronics") with five items spanning every
// isItemVisible / isSoldItemVisible boundary: available, draft, sold-recent,
// sold-long-ago, and sold-with-a-future-dated soldDate (the FIX Bug 1 case —
// a future sold_date must never be treated as "within retention").
const ITEM_FIXTURES: Record<string, Record<string, unknown>> = {
  laptop: {
    name: "Laptop",
    description: "d",
    status: "available",
    // Private buyer field — must be stripped by the schema, never surfaced.
    reserved_for: "buyer@example.com",
  },
  "draft-thing": { name: "Draft Thing", description: "d", status: "draft" },
  "old-phone": {
    name: "Old Phone",
    description: "d",
    status: "sold",
    sold_date: isoDaysAgo(1),
  },
  "ancient-radio": {
    name: "Ancient Radio",
    description: "d",
    status: "sold",
    sold_date: isoDaysAgo(100),
  },
  "future-item": {
    name: "Future Item",
    description: "d",
    status: "sold",
    sold_date: isoDaysAgo(-5),
  },
};

const ITEM_SLUGS = Object.keys(ITEM_FIXTURES);

beforeEach(() => {
  mockSiteConfig.soldItemRetentionDays = 3;
  mockReaddir.mockReset();
  mockReadFile.mockReset();

  mockReaddir.mockImplementation(async (dir: string) => {
    if (dir === CONTENT_ROOT) {
      return [dirent("electronics", true)];
    }
    if (dir === path.join(CONTENT_ROOT, "electronics")) {
      return ITEM_SLUGS.map((slug) => dirent(slug, true));
    }
    // Per-item image directory listing — no images in this fixture.
    return [];
  });

  mockReadFile.mockImplementation(async (file: string) => {
    if (file === MANIFEST_PATH) {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    for (const slug of ITEM_SLUGS) {
      if (file === path.join(CONTENT_ROOT, "electronics", slug, "item.json")) {
        return JSON.stringify(ITEM_FIXTURES[slug]);
      }
    }
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  });
});

describe("loadItemsByCategory — isItemVisible boundaries", () => {
  it("excludes drafts and sold items past the retention window; includes available and recently sold", async () => {
    const items = await loadItemsByCategory("electronics");
    const slugs = items.map((i) => i.itemSlug).sort();

    expect(slugs).toEqual(["laptop", "old-phone"]);
  });

  it("never returns draft items regardless of retention setting", async () => {
    mockSiteConfig.soldItemRetentionDays = 0; // "keep forever"
    const items = await loadItemsByCategory("electronics");
    expect(items.some((i) => i.itemSlug === "draft-thing")).toBe(false);
  });

  it("treats retention === 0 as 'keep forever' — even very old sold items remain visible", async () => {
    mockSiteConfig.soldItemRetentionDays = 0;
    const items = await loadItemsByCategory("electronics");
    const slugs = items.map((i) => i.itemSlug);
    expect(slugs).toContain("ancient-radio");
    expect(slugs).toContain("old-phone");
  });

  it("treats retention < 0 as 'hide immediately' — no sold item is visible, even one sold today", async () => {
    mockSiteConfig.soldItemRetentionDays = -1;
    const items = await loadItemsByCategory("electronics");
    const slugs = items.map((i) => i.itemSlug);
    expect(slugs).not.toContain("old-phone");
    expect(slugs).not.toContain("ancient-radio");
    expect(slugs).toEqual(["laptop"]);
  });

  it("hides sold items with a future-dated soldDate regardless of retention (FIX Bug 1)", async () => {
    // Retention of 30 would normally cover a soldDate "5 days ago", but
    // future-item's soldDate is 5 days in the future — daysDiff is negative,
    // and the explicit `daysDiff >= 0` guard must hide it.
    mockSiteConfig.soldItemRetentionDays = 30;
    const items = await loadItemsByCategory("electronics");
    expect(items.some((i) => i.itemSlug === "future-item")).toBe(false);
  });
});

describe("reserved_for — private field never surfaces on a loaded Item", () => {
  it("strips reserved_for from the parsed Item", async () => {
    const items = await loadItemsByCategory("electronics");
    const laptop = items.find((i) => i.itemSlug === "laptop");
    expect(laptop).toBeDefined();
    const serialized = JSON.stringify(laptop);
    expect(serialized).not.toContain("reserved_for");
    expect(serialized).not.toContain("buyer@example.com");
  });
});

describe("loadItem — applies the visibility filter (FIX L1)", () => {
  it("returns an available item", async () => {
    const item = await loadItem("electronics", "laptop");
    expect(item?.itemSlug).toBe("laptop");
  });

  it("returns null for a draft item", async () => {
    const item = await loadItem("electronics", "draft-thing");
    expect(item).toBeNull();
  });

  it("returns null for a sold item past its retention window", async () => {
    mockSiteConfig.soldItemRetentionDays = 3;
    const item = await loadItem("electronics", "ancient-radio");
    expect(item).toBeNull();
  });
});

describe("isSoldItemVisible — sold item with no sold_date (FIX L3)", () => {
  it("stays visible instead of expiring against listedDate", async () => {
    // Re-mock a single-item category: status sold, listed long ago, NO sold_date.
    // Old behaviour expired it against listedDate and hid it; it must now show.
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === CONTENT_ROOT) return [dirent("electronics", true)];
      if (dir === path.join(CONTENT_ROOT, "electronics")) {
        return [dirent("sold-no-date", true)];
      }
      return [];
    });
    mockReadFile.mockImplementation(async (file: string) => {
      if (file === MANIFEST_PATH) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      if (
        file ===
        path.join(CONTENT_ROOT, "electronics", "sold-no-date", "item.json")
      ) {
        return JSON.stringify({
          name: "Sold No Date",
          description: "d",
          status: "sold",
          listed_date: isoDaysAgo(100),
        });
      }
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    mockSiteConfig.soldItemRetentionDays = 3;
    const items = await loadItemsByCategory("electronics");
    expect(items.map((i) => i.itemSlug)).toEqual(["sold-no-date"]);
  });
});

describe("loader — item.json is JSONC-tolerant", () => {
  it("parses an item.json with // comments and a trailing comma", async () => {
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === CONTENT_ROOT) return [dirent("electronics", true)];
      if (dir === path.join(CONTENT_ROOT, "electronics")) {
        return [dirent("commented-item", true)];
      }
      return [];
    });
    mockReadFile.mockImplementation(async (file: string) => {
      if (file === MANIFEST_PATH) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      if (
        file ===
        path.join(CONTENT_ROOT, "electronics", "commented-item", "item.json")
      ) {
        return `{
          // condition options: "new" | "like-new" | "good" | "fair" | "for-parts"
          "name": "Commented Item",
          "description": "d",
          "status": "available",
          "condition": "good", // trailing comma below is also allowed
        }`;
      }
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    const item = await loadItem("electronics", "commented-item");
    expect(item?.itemSlug).toBe("commented-item");
    expect(item?.name).toBe("Commented Item");
  });
});

describe("loadTagIndex — single-pass tag index across categories", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();

    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === CONTENT_ROOT) {
        return [dirent("electronics", true), dirent("textbooks", true)];
      }
      if (dir === path.join(CONTENT_ROOT, "electronics")) {
        return [dirent("radio", true), dirent("draft-lamp", true), dirent("gadget", true)];
      }
      if (dir === path.join(CONTENT_ROOT, "textbooks")) {
        return [dirent("algo", true), dirent("calc", true)];
      }
      // Per-item image directory listing — no images in this fixture.
      return [];
    });

    const FILES: Record<string, unknown> = {
      [path.join(CONTENT_ROOT, "electronics", "radio", "item.json")]: {
        name: "Vintage Radio",
        description: "d",
        status: "available",
        tags: ["Vintage", "electronics"],
      },
      // Draft item — its "hidden-tag" must never produce a route, since the
      // item itself is never publicly visible.
      [path.join(CONTENT_ROOT, "electronics", "draft-lamp", "item.json")]: {
        name: "Draft Lamp",
        description: "d",
        status: "draft",
        tags: ["hidden-tag"],
      },
      // A CJK-only tag slugifies to "" — isValidSlug rejects it, so this
      // item's tag is dropped (with a warning) rather than routed.
      [path.join(CONTENT_ROOT, "electronics", "gadget", "item.json")]: {
        name: "Gadget",
        description: "d",
        status: "available",
        tags: ["商品"],
      },
      // Two differently-spelled tags in DIFFERENT categories that both
      // slugify to "cs-101" — a cross-category collision.
      [path.join(CONTENT_ROOT, "textbooks", "algo", "item.json")]: {
        name: "Algorithms Textbook",
        description: "d",
        status: "available",
        tags: ["CS 101"],
      },
      [path.join(CONTENT_ROOT, "textbooks", "calc", "item.json")]: {
        name: "Calculus Textbook",
        description: "d",
        status: "available",
        tags: ["cs-101"],
      },
    };

    mockReadFile.mockImplementation(async (file: string) => {
      if (file === MANIFEST_PATH) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      if (Object.prototype.hasOwnProperty.call(FILES, file)) {
        return JSON.stringify(FILES[file]);
      }
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
  });

  it("groups items across categories by slugified tag", async () => {
    const index = await loadTagIndex();

    const vintage = index.get("vintage");
    expect(vintage?.tag).toBe("Vintage");
    expect(vintage?.items.map((i) => i.itemSlug)).toEqual(["radio"]);

    const electronicsTag = index.get("electronics");
    expect(electronicsTag?.items.map((i) => i.itemSlug)).toEqual(["radio"]);
  });

  it("excludes a tag that only appears on a non-visible (draft) item", async () => {
    const index = await loadTagIndex();
    expect(index.has("hidden-tag")).toBe(false);
  });

  it("drops a tag whose slug is unsafe (CJK-only → empty slug), with a warning", async () => {
    const index = await loadTagIndex();
    for (const slug of index.keys()) expect(slug.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a safe route segment"),
    );
  });

  it("drops BOTH spellings when two distinct tags collide on the same slug", async () => {
    const index = await loadTagIndex();
    // Neither "CS 101" nor "cs-101" wins — both dropped rather than picking one.
    expect(index.has("cs-101")).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("collide"));
  });
});

describe("loadSoldItems — no retention filter, sorted by soldDate desc", () => {
  it("returns every sold item regardless of soldItemRetentionDays", async () => {
    mockSiteConfig.soldItemRetentionDays = 3;
    const items = await loadSoldItems();
    const slugs = items.map((i) => i.itemSlug).sort();
    expect(slugs).toEqual(["ancient-radio", "future-item", "old-phone"]);
  });

  it("sorts most-recently-sold first", async () => {
    const items = await loadSoldItems();
    expect(items[0]?.itemSlug).toBe("future-item"); // sold_date is in the future → most recent
    expect(items[items.length - 1]?.itemSlug).toBe("ancient-radio");
  });
});
