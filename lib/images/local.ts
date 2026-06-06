import fs from "fs";
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
    const destDir = path.dirname(destPath);

    fs.mkdirSync(destDir, { recursive: true });

    // Skip copy when mtime + size are unchanged (equivalent to checksum match, but faster)
    if (fs.existsSync(destPath)) {
      const src = fs.statSync(sourcePath);
      const dst = fs.statSync(destPath);
      if (src.size === dst.size && src.mtimeMs <= dst.mtimeMs) {
        return `/items/${manifestKey}`;
      }
    }

    fs.copyFileSync(sourcePath, destPath);
    return `/items/${manifestKey}`;
  }
}
