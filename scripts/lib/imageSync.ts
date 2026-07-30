// Pure image-sync logic, extracted from scripts/sync-images.ts so both the CLI
// (pnpm upload-images) and Seller Studio can drive the same pipeline. This module
// never prints and never calls process.exit: it returns a structured result and
// reports progress through an optional callback. Printing, advisory quality
// checks, contact-file copying, and exit codes stay in scripts/sync-images.ts.

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { ImageStorageAdapter } from "@/lib/images/adapter";
import { stripImageMetadata } from "@/lib/images/stripMetadata";
import { mapWithConcurrency } from "@/lib/utils/concurrency";

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;
const UPLOAD_CONCURRENCY = 8;

export type ScannedImage = { sourcePath: string; manifestKey: string };

export type ImageSyncProgress =
  | { type: "scanned"; total: number }
  | { type: "file"; manifestKey: string; index: number; total: number; uploaded: boolean }
  | { type: "file-failed"; manifestKey: string; index: number; total: number; error: string };

export type ImageSyncResult = {
  total: number;
  uploaded: number;
  skipped: number;
  stripped: number;
  purged: number;
  manifest: Record<string, string>;
  // The scan result is returned so callers that need the file list (the CLI's
  // advisory quality checks) don't walk the content tree a second time.
  images: ScannedImage[];
  failures: Array<{ manifestKey: string; error: string }>;
};

export type ImageSyncOptions = {
  adapter: ImageStorageAdapter;
  contentItemsDir: string;
  manifestPath: string;
  checksumsPath: string;
  onProgress?: (progress: ImageSyncProgress) => void;
};

export function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

export async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Scan a directory tree for image files; underscore-prefixed dirs are skipped. */
export async function scanImages(root: string): Promise<ScannedImage[]> {
  const results: ScannedImage[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith("_")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (IMAGE_EXT.test(entry.name)) {
        results.push({
          sourcePath: fullPath,
          manifestKey: path.relative(root, fullPath).replace(/\\/g, "/"),
        });
      }
    }
  }

  await walk(root);
  results.sort((a, b) => a.manifestKey.localeCompare(b.manifestKey));
  return results;
}

type SyncOutcome = {
  manifestKey: string;
  manifestUrl: string;
  uploaded: boolean;
  stripped: boolean;
  error?: string;
};

export async function syncImagesToCdn(options: ImageSyncOptions): Promise<ImageSyncResult> {
  const { adapter, contentItemsDir, manifestPath, checksumsPath, onProgress } = options;

  const savedChecksums = await loadJson<Record<string, string>>(checksumsPath, {});
  adapter.loadChecksums(savedChecksums);

  const existingManifest = await loadJson<Record<string, string>>(manifestPath, {});
  const images = await scanImages(contentItemsDir);
  onProgress?.({ type: "scanned", total: images.length });

  let completed = 0;

  // Each worker returns its outcome rather than mutating shared state, so
  // concurrent closures cannot race. Per-file failures are isolated: one
  // unreadable photo or transient CDN error must never discard the whole batch.
  const outcomes = await mapWithConcurrency(
    images,
    UPLOAD_CONCURRENCY,
    async ({ sourcePath, manifestKey }): Promise<SyncOutcome> => {
      try {
        const checksum = await sha256(sourcePath);
        const isNewOrChanged = savedChecksums[manifestKey] !== checksum;

        let body: Buffer | undefined;
        let stripped = false;
        if (isNewOrChanged) {
          const original = await fsPromises.readFile(sourcePath);
          const ext = path.extname(sourcePath).slice(1);
          body = await stripImageMetadata(original, ext);
          stripped = ext.toLowerCase() !== "gif";
        }

        const url = await adapter.syncImage(sourcePath, manifestKey, checksum, body);

        completed++;
        // "" is the Vercel Blob skip signal: unchanged, keep the existing URL.
        const resolvedUrl = url === "" ? (existingManifest[manifestKey] ?? "") : url;
        const uploaded = url !== "" && isNewOrChanged;
        onProgress?.({
          type: "file",
          manifestKey,
          index: completed,
          total: images.length,
          uploaded,
        });
        return {
          manifestKey,
          manifestUrl: resolvedUrl,
          uploaded,
          stripped: uploaded ? stripped : false,
        };
      } catch (err: unknown) {
        completed++;
        const error = err instanceof Error ? err.message : String(err);
        onProgress?.({
          type: "file-failed",
          manifestKey,
          index: completed,
          total: images.length,
          error,
        });
        return {
          manifestKey,
          manifestUrl: existingManifest[manifestKey] ?? "",
          uploaded: false,
          stripped: false,
          error,
        };
      }
    },
  );

  const manifest: Record<string, string> = {};
  let uploaded = 0;
  let skipped = 0;
  let stripped = 0;
  const failures: Array<{ manifestKey: string; error: string }> = [];

  for (const outcome of outcomes) {
    if (outcome.error !== undefined) {
      failures.push({ manifestKey: outcome.manifestKey, error: outcome.error });
      // Keep an entry only if a prior good URL was preserved — never write an
      // empty URL for a file that has never uploaded successfully.
      if (outcome.manifestUrl) manifest[outcome.manifestKey] = outcome.manifestUrl;
      continue;
    }
    manifest[outcome.manifestKey] = outcome.manifestUrl;
    if (outcome.uploaded) uploaded++;
    else skipped++;
    if (outcome.stripped) stripped++;
  }

  const activeKeys = new Set(images.map((i) => i.manifestKey));
  const purged = Object.keys(existingManifest).filter((k) => !activeKeys.has(k)).length;

  await writeJson(manifestPath, manifest);
  await writeJson(checksumsPath, adapter.getUpdatedChecksums());

  return {
    total: images.length,
    uploaded,
    skipped,
    stripped,
    purged,
    manifest,
    images,
    failures,
  };
}
