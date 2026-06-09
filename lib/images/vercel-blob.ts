import { readFile } from "fs/promises";
import type { ImageStorageAdapter } from "./adapter";

// Minimal inline type for the @vercel/blob put() call.
// Avoids a compile-time hard dependency on the package.
type BlobPutFn = (
  pathname: string,
  body: Buffer,
  options: { access: "public"; addRandomSuffix: false },
) => Promise<{ url: string }>;

function requireToken(): string {
  const token = process.env["BLOB_READ_WRITE_TOKEN"];
  if (!token) {
    throw new Error(
      `[vercel-blob] Missing BLOB_READ_WRITE_TOKEN environment variable.\n` +
        `Generate one at: Vercel Dashboard → Storage → Blob → <store> → Settings\n` +
        `Then add it to your .env.local file.`,
    );
  }
  return token;
}

/**
 * Vercel Blob image adapter (alternate provider for Vercel deployments).
 * Install the SDK before use: pnpm add -D @vercel/blob
 * Requires BLOB_READ_WRITE_TOKEN in the environment.
 *
 * Unlike the R2 adapter, the public URL is determined by the Vercel Blob SDK
 * on first upload and is not reconstructible from credentials alone.
 * When a file is unchanged (checksum match), this adapter returns "" to signal
 * the sync script to preserve the existing manifest URL for that key.
 */
export class VercelBlobAdapter implements ImageStorageAdapter {
  private checksums: Record<string, string> = {};
  private updated: Record<string, string> = {};

  constructor() {
    requireToken();
  }

  loadChecksums(saved: Record<string, string>): void {
    this.checksums = { ...saved };
    this.updated = { ...saved };
  }

  getUpdatedChecksums(): Record<string, string> {
    // Return a copy so callers can't mutate the adapter's internal state.
    return { ...this.updated };
  }

  async syncImage(
    sourcePath: string,
    manifestKey: string,
    checksum: string,
  ): Promise<string> {
    // Return "" to signal "unchanged — caller preserves existing manifest URL"
    if (this.checksums[manifestKey] === checksum) {
      return "";
    }

    // Widen the module specifier from a string literal to `string` so TypeScript
    // does not attempt static module resolution (package is an optional dependency).
    const pkgName = "@vercel/blob" as string;
    const mod = (await import(pkgName).catch(() => {
      throw new Error(
        `[vercel-blob] @vercel/blob is not installed.\n` +
          `Install it with: pnpm add -D @vercel/blob`,
      );
    })) as unknown as { put: BlobPutFn };

    const body = await readFile(sourcePath);
    const result = await mod.put(manifestKey, body, {
      access: "public",
      addRandomSuffix: false,
    });

    this.updated[manifestKey] = checksum;
    return result.url;
  }
}
