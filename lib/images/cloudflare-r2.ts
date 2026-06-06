import { readFile } from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ImageStorageAdapter } from "./adapter";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function resolveContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/**
 * Cloudflare R2 image adapter (primary recommended provider).
 * Uses AWS S3-compatible API. Compares SHA-256 checksums to skip unchanged files.
 * Requires CF_R2_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY,
 * CF_R2_BUCKET, and CF_R2_PUBLIC_URL in the environment.
 */
export class CloudflareR2Adapter implements ImageStorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private checksums: Record<string, string> = {};
  private updated: Record<string, string> = {};

  constructor() {
    const missing: string[] = [];

    const accountId = process.env["CF_R2_ACCOUNT_ID"];
    const accessKeyId = process.env["CF_R2_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["CF_R2_SECRET_ACCESS_KEY"];
    const bucket = process.env["CF_R2_BUCKET"];
    const publicUrl = process.env["CF_R2_PUBLIC_URL"];

    if (!accountId) missing.push("CF_R2_ACCOUNT_ID");
    if (!accessKeyId) missing.push("CF_R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("CF_R2_SECRET_ACCESS_KEY");
    if (!bucket) missing.push("CF_R2_BUCKET");
    if (!publicUrl) missing.push("CF_R2_PUBLIC_URL");

    if (missing.length > 0) {
      throw new Error(
        `[cloudflare-r2] Missing required environment variables:\n` +
          missing.map((v) => `  - ${v}`).join("\n") +
          `\n\nCopy .env.example to .env.local and fill in your R2 credentials.\n` +
          `See docs/setup_instruction.md for step-by-step setup.`,
      );
    }

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });

    this.bucket = bucket!;
    // Normalise: ensure https:// prefix and no trailing slash
    const rawUrl = publicUrl!.trim().replace(/\/$/, "");
    this.publicUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  }

  loadChecksums(saved: Record<string, string>): void {
    this.checksums = { ...saved };
    this.updated = { ...saved };
  }

  getUpdatedChecksums(): Record<string, string> {
    return this.updated;
  }

  async syncImage(
    sourcePath: string,
    manifestKey: string,
    checksum: string,
  ): Promise<string> {
    const cdnUrl = `${this.publicUrl}/${manifestKey}`;

    // Skip upload when checksum matches — file has not changed since last run
    if (this.checksums[manifestKey] === checksum) {
      return cdnUrl;
    }

    const body = await readFile(sourcePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: manifestKey,
        Body: body,
        ContentType: resolveContentType(sourcePath),
        // Cache-Control: aggressive caching since content-addressed by SHA-256
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    this.updated[manifestKey] = checksum;
    return cdnUrl;
  }

  /** Returns the full file path within the project for a given manifest key. */
  static resolveSourcePath(manifestKey: string): string {
    return path.join(process.cwd(), "content", "items", manifestKey);
  }
}
