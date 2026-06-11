/**
 * Common interface for all image storage providers.
 * Implemented by LocalAdapter, CloudflareR2Adapter, and VercelBlobAdapter.
 * The sync script instantiates the correct adapter based on siteConfig.imageStorage.provider.
 */
export interface ImageStorageAdapter {
  /**
   * Ensure the image at sourcePath is available for serving.
   * Returns the public URL to embed in the manifest, or "" to signal
   * "file unchanged — caller should keep the existing manifest URL" (Vercel Blob only).
   * @param sourcePath  Absolute path to the source image file on disk
   * @param manifestKey Relative key: "{categorySlug}/{itemSlug}/{filename}"
   * @param checksum    SHA-256 hex of the file (for incremental skip logic)
   * @param body        Optional pre-processed file bytes (e.g. with EXIF/GPS
   *                     metadata stripped via lib/images/stripMetadata.ts).
   *                     When provided, adapters use this instead of reading
   *                     sourcePath directly.
   */
  syncImage(
    sourcePath: string,
    manifestKey: string,
    checksum: string,
    body?: Buffer,
  ): Promise<string>;

  /**
   * Called once at the start of a run with the previously persisted checksum map.
   * The adapter uses this to skip unchanged files on the next syncImage call.
   */
  loadChecksums(saved: Record<string, string>): void;

  /**
   * Returns the updated checksum map to persist after the run completes.
   * Local provider always returns {} (uses mtime+size instead of checksums).
   */
  getUpdatedChecksums(): Record<string, string>;
}
