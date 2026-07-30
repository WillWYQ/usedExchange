import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { ImageStorageAdapter } from "@/lib/images/adapter";
import { scanImages, syncImagesToCdn } from "./imageSync";

let root: string;

// A 1x1 PNG — real bytes, so stripImageMetadata (sharp) can decode it.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function writeImage(relPath: string): Promise<void> {
  const full = path.join(root, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, PNG_1X1);
}

class FakeAdapter implements ImageStorageAdapter {
  public calls: string[] = [];
  constructor(private failOn: Set<string> = new Set()) {}
  async syncImage(_src: string, manifestKey: string): Promise<string> {
    this.calls.push(manifestKey);
    if (this.failOn.has(manifestKey)) throw new Error("boom");
    return `https://cdn.example.com/${manifestKey}`;
  }
  loadChecksums(): void {}
  getUpdatedChecksums(): Record<string, string> {
    return {};
  }
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-imagesync-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("scanImages", () => {
  it("returns forward-slash manifest keys relative to the root", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const found = await scanImages(root);
    expect(found.map((f) => f.manifestKey)).toEqual(["electronics/desk-lamp/01-front.png"]);
  });

  it("skips underscore-prefixed directories and non-image files", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("_drafts/hidden/01-front.png");
    await fs.writeFile(path.join(root, "electronics", "desk-lamp", "notes.txt"), "hi");
    const keys = (await scanImages(root)).map((f) => f.manifestKey);
    expect(keys).toEqual(["electronics/desk-lamp/01-front.png"]);
  });
});

describe("syncImagesToCdn", () => {
  it("writes a manifest entry per image and reports counts", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("books/cs61a/01-cover.png");

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.total).toBe(2);
    expect(result.uploaded).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.manifest["books/cs61a/01-cover.png"]).toBe(
      "https://cdn.example.com/books/cs61a/01-cover.png",
    );
  });

  it("isolates a single file failure and still writes the manifest", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("books/cs61a/01-cover.png");

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(new Set(["books/cs61a/01-cover.png"])),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.uploaded).toBe(1);
    expect(result.failures).toEqual([{ manifestKey: "books/cs61a/01-cover.png", error: "boom" }]);
    // The successful file is still persisted — a failed sibling must not discard it.
    const written = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf-8"));
    expect(written["electronics/desk-lamp/01-front.png"]).toBeTruthy();
    // Never write an empty URL for a file that has never uploaded successfully.
    expect(written["books/cs61a/01-cover.png"]).toBeUndefined();
  });

  it("purges manifest entries whose files are gone", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const manifestPath = path.join(root, "manifest.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ "books/deleted/01-cover.png": "https://cdn.example.com/old.png" }),
    );

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath,
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.purged).toBe(1);
    expect(result.manifest["books/deleted/01-cover.png"]).toBeUndefined();
  });

  it("reports progress for every file", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const events: string[] = [];

    await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
      onProgress: (p) => events.push(p.type),
    });

    expect(events).toEqual(["scanned", "file"]);
  });
});
