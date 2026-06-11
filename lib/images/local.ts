import { mkdir, stat, copyFile, writeFile } from "fs/promises";
import path from "path";
import type { ImageStorageAdapter } from "./adapter";

const PUBLIC_ITEMS = path.join(process.cwd(), "public", "items");

/**
 * Copy sourcePath → destPath using mtime+size incremental skip logic.
 * Single source of truth for "should we recopy this file?" — shared by
 * LocalAdapter.syncImage and the dev-sync / build-check modes in
 * scripts/sync-images.ts so the three paths can never drift out of sync again.
 *
 * Uses STRICT equality on mtime (not `<=`) so that a same-size file restored
 * from backup (which gets an older mtime than the stale public/ copy) is still
 * recopied rather than silently skipped.
 */
export async function copyIfChanged(
  sourcePath: string,
  destPath: string,
): Promise<{ copied: boolean }> {
  await mkdir(path.dirname(destPath), { recursive: true });

  try {
    const [src, dst] = await Promise.all([stat(sourcePath), stat(destPath)]);
    if (src.size === dst.size && src.mtimeMs === dst.mtimeMs) {
      return { copied: false };
    }
  } catch {
    // destPath does not exist yet — fall through to copy
  }

  await copyFile(sourcePath, destPath);
  return { copied: true };
}

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
    body?: Buffer,
  ): Promise<string> {
    const destPath = path.join(PUBLIC_ITEMS, manifestKey);
    if (body) {
      await mkdir(path.dirname(destPath), { recursive: true });
      await writeFile(destPath, body);
    } else {
      await copyIfChanged(sourcePath, destPath);
    }
    return `/items/${manifestKey}`;
  }
}
