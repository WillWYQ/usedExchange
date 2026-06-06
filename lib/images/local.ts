import { mkdir, stat, copyFile } from "fs/promises";
import path from "path";
import type { ImageStorageAdapter } from "./adapter";

const PUBLIC_ITEMS = path.join(process.cwd(), "public", "items");

/**
 * Local image adapter — copies files to public/items/ for local dev and self-hosted builds.
 * Uses mtime + size for incremental skip logic (faster than SHA-256 hashing).
 * Does not upload to any CDN; returned URLs are always local /items/{key} paths.
 */
export class LocalAdapter implements ImageStorageAdapter {
  // Local provider relies on mtime+size, not checksums; these are no-ops.
  loadChecksums(_saved: Record<string, string>): void {}
  getUpdatedChecksums(): Record<string, string> {
    return {};
  }

  async syncImage(
    sourcePath: string,
    manifestKey: string,
    _checksum: string,
  ): Promise<string> {
    const destPath = path.join(PUBLIC_ITEMS, manifestKey);
    await mkdir(path.dirname(destPath), { recursive: true });

    // Skip copy when size and mtime are identical — use strict equality so that
    // a same-size file restored from backup (older mtime) is still copied.
    try {
      const [src, dst] = await Promise.all([stat(sourcePath), stat(destPath)]);
      if (src.size === dst.size && src.mtimeMs === dst.mtimeMs) {
        return `/items/${manifestKey}`;
      }
    } catch {
      // destPath does not exist yet — fall through to copy
    }

    await copyFile(sourcePath, destPath);
    return `/items/${manifestKey}`;
  }
}
