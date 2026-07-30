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

type FakeCall = { manifestKey: string; checksum: string; body?: Buffer };

class FakeAdapter implements ImageStorageAdapter {
  public calls: FakeCall[] = [];
  constructor(private failOn: Set<string> = new Set()) {}
  async syncImage(
    _src: string,
    manifestKey: string,
    checksum: string,
    body?: Buffer,
  ): Promise<string> {
    this.calls.push({ manifestKey, checksum, body });
    if (this.failOn.has(manifestKey)) throw new Error("boom");
    return `https://cdn.example.com/${manifestKey}`;
  }
  loadChecksums(): void {}
  getUpdatedChecksums(): Record<string, string> {
    return {};
  }
}

/** Simulates the Vercel Blob "unchanged" signal: returns "" for one manifest key. */
class SkipSignalAdapter implements ImageStorageAdapter {
  constructor(private skipKey: string) {}
  async syncImage(_src: string, manifestKey: string): Promise<string> {
    if (manifestKey === this.skipKey) return "";
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
  it("writes a manifest entry per image, reports counts, and passes the checksum + stripped body to the adapter", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("books/cs61a/01-cover.png");

    const adapter = new FakeAdapter();
    const result = await syncImagesToCdn({
      adapter,
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.total).toBe(2);
    expect(result.uploaded).toBe(2);
    expect(result.stripped).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.manifest["books/cs61a/01-cover.png"]).toBe(
      "https://cdn.example.com/books/cs61a/01-cover.png",
    );

    // The checksum and metadata-stripped body must actually reach the adapter —
    // a regression in the strip-then-upload wiring would leave these undefined
    // or unchanged from the raw file bytes, and would pass green otherwise.
    const call = adapter.calls.find((c) => c.manifestKey === "books/cs61a/01-cover.png");
    expect(call?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(call?.body).toBeDefined();
    expect(call?.body?.equals(PNG_1X1)).toBe(false);
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

  it("preserves a prior good URL in the written manifest when a previously-uploaded file fails", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const manifestPath = path.join(root, "manifest.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        "electronics/desk-lamp/01-front.png": "https://cdn.example.com/prior-good-url.png",
      }),
    );

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(new Set(["electronics/desk-lamp/01-front.png"])),
      contentItemsDir: root,
      manifestPath,
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.failures).toEqual([
      { manifestKey: "electronics/desk-lamp/01-front.png", error: "boom" },
    ]);
    // Not just the returned object — the file actually written to disk must
    // keep the previously-good URL for a file that fails on this run.
    const written = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(written["electronics/desk-lamp/01-front.png"]).toBe(
      "https://cdn.example.com/prior-good-url.png",
    );
  });

  it("preserves the existing manifest URL and counts a skip when the adapter signals no change", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    const manifestPath = path.join(root, "manifest.json");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        "electronics/desk-lamp/01-front.png": "https://cdn.example.com/existing-url.png",
      }),
    );

    const result = await syncImagesToCdn({
      adapter: new SkipSignalAdapter("electronics/desk-lamp/01-front.png"),
      contentItemsDir: root,
      manifestPath,
      checksumsPath: path.join(root, "checksums.json"),
    });

    expect(result.skipped).toBe(1);
    expect(result.uploaded).toBe(0);
    expect(result.manifest["electronics/desk-lamp/01-front.png"]).toBe(
      "https://cdn.example.com/existing-url.png",
    );
    const written = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(written["electronics/desk-lamp/01-front.png"]).toBe(
      "https://cdn.example.com/existing-url.png",
    );
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

  it("keeps a complete manifest with no failures even when onProgress always throws", async () => {
    await writeImage("electronics/desk-lamp/01-front.png");
    await writeImage("books/cs61a/01-cover.png");

    const result = await syncImagesToCdn({
      adapter: new FakeAdapter(),
      contentItemsDir: root,
      manifestPath: path.join(root, "manifest.json"),
      checksumsPath: path.join(root, "checksums.json"),
      onProgress: () => {
        throw new Error("progress sink closed");
      },
    });

    expect(result.failures).toEqual([]);
    expect(result.uploaded).toBe(2);
    expect(result.manifest["electronics/desk-lamp/01-front.png"]).toBeTruthy();
    expect(result.manifest["books/cs61a/01-cover.png"]).toBeTruthy();
  });
});
