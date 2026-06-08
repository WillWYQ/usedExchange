/**
 * scripts/sync-images.ts — Image synchronisation pipeline
 *
 * Three modes (pass via --mode flag):
 *   upload       pnpm upload-images   — upload new/changed photos to CDN, write manifest
 *   dev-sync     pnpm dev             — copy photos to public/items/ for local serving
 *   build-check  pnpm build prebuild  — verify manifest exists (cloud) or copy files (local)
 */

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";
import { siteConfig } from "@/content/config";
import type { ImageStorageAdapter } from "@/lib/images/adapter";
import { copyIfChanged } from "@/lib/images/local";

// ── Paths ─────────────────────────────────────────────────────────────────────

const CWD = process.cwd();
const CONTENT_ITEMS = path.join(CWD, "content", "items");
const CONTENT_CONTACT = path.join(CWD, "content", "contact");
const PUBLIC_ITEMS = path.join(CWD, "public", "items");
const PUBLIC_CONTACT = path.join(CWD, "public", "contact");
const MANIFEST_PATH = path.join(CWD, "lib", "generated", "image-manifest.json");
const CHECKSUMS_PATH = path.join(CWD, ".image-cache", "checksums.json");
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

// ── Env loading ───────────────────────────────────────────────────────────────
// tsx does not load .env.local automatically; parse it before reading process.env.

function loadDotEnvLocal(): void {
  const envPath = path.join(CWD, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    // Remove optional surrounding quotes from value
    const value = line.slice(eqIdx + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const modeIdx = args.indexOf("--mode");
const mode = modeIdx !== -1 ? args[modeIdx + 1] : undefined;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once. CDN PUTs are
 * network-latency bound (R2/S3 handle concurrent writes fine), so serializing
 * them — as a plain `for…of` loop would — turns an upload of N photos into N
 * sequential round-trips. Bounded concurrency keeps memory predictable while
 * cutting wall-clock time roughly by `limit`x.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Scan a directory tree for image files; returns [{sourcePath, manifestKey}]. */
async function scanImages(
  root: string,
): Promise<Array<{ sourcePath: string; manifestKey: string }>> {
  const results: Array<{ sourcePath: string; manifestKey: string }> = [];

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
        const manifestKey = path.relative(root, fullPath).replace(/\\/g, "/");
        results.push({ sourcePath: fullPath, manifestKey });
      }
    }
  }

  await walk(root);
  return results;
}

/** Copy all files from content/contact/ → public/contact/. Returns count copied. */
async function copyContactFiles(): Promise<number> {
  if (!fs.existsSync(CONTENT_CONTACT)) return 0;
  await fsPromises.mkdir(PUBLIC_CONTACT, { recursive: true });
  let count = 0;
  const entries = await fsPromises.readdir(CONTENT_CONTACT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await fsPromises.copyFile(
      path.join(CONTENT_CONTACT, entry.name),
      path.join(PUBLIC_CONTACT, entry.name),
    );
    count++;
  }
  return count;
}

/** Instantiate the correct adapter for the configured provider. Throws on missing env vars. */
async function createAdapter(): Promise<ImageStorageAdapter> {
  const provider = siteConfig.imageStorage.provider;
  if (provider === "cloudflare-r2") {
    const { CloudflareR2Adapter } = await import("@/lib/images/cloudflare-r2");
    return new CloudflareR2Adapter();
  }
  if (provider === "vercel-blob") {
    const { VercelBlobAdapter } = await import("@/lib/images/vercel-blob");
    return new VercelBlobAdapter();
  }
  // Default: local
  const { LocalAdapter } = await import("@/lib/images/local");
  return new LocalAdapter();
}

// ── Photo quality checks ──────────────────────────────────────────────────────

async function tryGetImageWidth(sourcePath: string): Promise<number | null> {
  try {
    // sharp is an optional dependency; if not installed, width check is skipped silently.
    // Install with: pnpm add -D sharp
    const sharpPkg = "sharp" as string;
    const sharp = (await import(sharpPkg)) as unknown as {
      default: (p: string) => { metadata(): Promise<{ width?: number }> };
    };
    const meta = await sharp.default(sourcePath).metadata();
    return meta.width ?? null;
  } catch {
    return null;
  }
}

async function runQualityChecks(
  images: Array<{ sourcePath: string; manifestKey: string }>,
): Promise<string[]> {
  const warnings: string[] = [];

  // Group filenames by item folder (category/item)
  const byItem = new Map<string, string[]>();
  for (const { manifestKey } of images) {
    const parts = manifestKey.split("/");
    if (parts.length < 3) continue;
    const itemKey = `${parts[0]}/${parts[1]}`;
    const filename = parts[parts.length - 1] ?? "";
    if (!byItem.has(itemKey)) byItem.set(itemKey, []);
    byItem.get(itemKey)!.push(filename);
  }

  // Per-image checks — batched so the sharp metadata reads (one dynamic
  // import + decode per image) don't serialize across hundreds of photos.
  const QUALITY_CHECK_CONCURRENCY = 8;
  const perImageWarnings = await mapWithConcurrency(images, QUALITY_CHECK_CONCURRENCY, async ({ sourcePath, manifestKey }) => {
    const localWarnings: string[] = [];
    const filename = path.basename(sourcePath);
    const stat = fs.statSync(sourcePath);

    if (stat.size > 8 * 1024 * 1024) {
      localWarnings.push(
        `${filename} is large (${(stat.size / (1024 * 1024)).toFixed(1)} MB); consider resizing before upload`,
      );
    }

    const width = await tryGetImageWidth(sourcePath);
    if (width !== null && width < 800) {
      localWarnings.push(
        `${filename} in ${path.dirname(manifestKey)} may appear blurry (width: ${width}px < 800px)`,
      );
    }
    return localWarnings;
  });
  for (const localWarnings of perImageWarnings) warnings.push(...localWarnings);

  // Per-item folder checks
  for (const [itemKey, filenames] of byItem) {
    const hasCover = filenames.some((f) => /^cover\./i.test(f));
    if (!hasCover) {
      warnings.push(
        `No cover.* found in ${itemKey}; first alphabetical image will be used as thumbnail`,
      );
    }
  }

  // Check for item folders with no images at all
  if (fs.existsSync(CONTENT_ITEMS)) {
    const categories = await fsPromises.readdir(CONTENT_ITEMS, { withFileTypes: true });
    for (const catEntry of categories) {
      if (!catEntry.isDirectory() || catEntry.name.startsWith("_")) continue;
      const catPath = path.join(CONTENT_ITEMS, catEntry.name);
      const items = await fsPromises.readdir(catPath, { withFileTypes: true });
      for (const itemEntry of items) {
        if (!itemEntry.isDirectory() || itemEntry.name.startsWith("_")) continue;
        const itemKey = `${catEntry.name}/${itemEntry.name}`;
        if (!byItem.has(itemKey)) {
          warnings.push(`No images found for ${itemKey}`);
        }
      }
    }
  }

  return warnings;
}

// ── Backup reminder ───────────────────────────────────────────────────────────

function printBackupReminder(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ⚠️   BACKUP REMINDER                                         ║
║                                                              ║
║  Your item photos are NOT tracked by git.                    ║
║  Cloud storage (Vercel Blob / R2) is a delivery layer,       ║
║  NOT a backup — it can be accidentally wiped.                ║
║                                                              ║
║  Please ensure your  content/  folder is backed up to:       ║
║    • External hard drive or Time Machine                     ║
║    • iCloud Drive / Google Drive / Dropbox                   ║
║                                                              ║
║  Next steps:                                                 ║
║    git add lib/generated/image-manifest.json                 ║
║    git add content/**/*.json content/config.ts               ║
║    git commit -m "chore: update listings"                    ║
╚══════════════════════════════════════════════════════════════╝`);
}

// ── Mode: upload ──────────────────────────────────────────────────────────────

async function runUpload(): Promise<void> {
  // 1. Instantiate adapter — validates required env vars, throws on missing
  const adapter = await createAdapter();

  // 2. Load saved checksums (incremental skip cache)
  const savedChecksums = await loadJson<Record<string, string>>(CHECKSUMS_PATH, {});
  adapter.loadChecksums(savedChecksums);

  // 3. Load existing manifest — needed to preserve URLs for unchanged Vercel Blob files
  const existingManifest = await loadJson<Record<string, string>>(MANIFEST_PATH, {});

  // 4. Scan content/items/ for images
  if (!fs.existsSync(CONTENT_ITEMS)) {
    console.error("[upload-images] content/items/ not found — nothing to upload");
    process.exit(1);
  }

  const images = await scanImages(CONTENT_ITEMS);

  // 5. Upload/sync each image (bounded concurrency) and collect manifest URLs.
  // Each worker returns its outcome rather than mutating shared counters/objects
  // directly, so concurrent closures can't race on `newManifest`/`uploaded`/`skipped`.
  const UPLOAD_CONCURRENCY = 8;
  type SyncOutcome = { manifestKey: string; manifestUrl: string; uploaded: boolean };

  const outcomes = await mapWithConcurrency(images, UPLOAD_CONCURRENCY, async ({ sourcePath, manifestKey }) => {
    const checksum = await sha256(sourcePath);
    const url = await adapter.syncImage(sourcePath, manifestKey, checksum);

    if (url === "") {
      // Vercel Blob skip signal: file unchanged — preserve existing manifest URL
      return { manifestKey, manifestUrl: existingManifest[manifestKey] ?? "", uploaded: false } satisfies SyncOutcome;
    }
    if (savedChecksums[manifestKey] === checksum) {
      // Checksum match (R2 / local): file unchanged — URL reconstructed by adapter
      return { manifestKey, manifestUrl: url, uploaded: false } satisfies SyncOutcome;
    }
    // New or changed file
    return { manifestKey, manifestUrl: url, uploaded: true } satisfies SyncOutcome;
  });

  const newManifest: Record<string, string> = {};
  let uploaded = 0;
  let skipped = 0;
  for (const outcome of outcomes) {
    newManifest[outcome.manifestKey] = outcome.manifestUrl;
    if (outcome.uploaded) uploaded++;
    else skipped++;
  }

  // 6. Purge stale manifest entries (deleted item folders)
  const activeKeys = new Set(images.map((i) => i.manifestKey));
  const purged = Object.keys(existingManifest).filter((k) => !activeKeys.has(k)).length;

  // 7. Copy QR codes: content/contact/ → public/contact/
  await copyContactFiles();

  // 8. Write updated manifest (committed to git)
  await writeJson(MANIFEST_PATH, newManifest);

  // 9. Persist updated checksum cache (gitignored)
  await writeJson(CHECKSUMS_PATH, adapter.getUpdatedChecksums());

  // 10. Advisory quality checks (never blocks the upload)
  const warnings = await runQualityChecks(images);

  // 11. Summary
  const total = images.length;
  const provider = siteConfig.imageStorage.provider;
  console.log(
    `[upload-images] provider=${provider}  uploaded=${uploaded}  skipped=${skipped}  purged=${purged}  total=${total}  warnings=${warnings.length}`,
  );
  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`  ⚠️  ${w}`);
  }

  // 12. Backup reminder
  printBackupReminder();
}

// ── Mode: dev-sync ────────────────────────────────────────────────────────────

async function runDevSync(): Promise<void> {
  if (!fs.existsSync(CONTENT_ITEMS)) {
    console.log("[dev-sync] content/items/ not found — skipping image copy");
    await copyContactFiles();
    return;
  }

  const images = await scanImages(CONTENT_ITEMS);
  let copied = 0;
  let unchanged = 0;

  // Delegate to the same mtime+size comparison LocalAdapter uses (see
  // lib/images/local.ts#copyIfChanged) — this used to be reimplemented here
  // with a `<=` comparison that silently skipped backup-restored files with
  // an older mtime than the stale public/ copy. Sharing one implementation
  // means `pnpm dev` and `pnpm upload-images` can never diverge again.
  for (const { sourcePath, manifestKey } of images) {
    const destPath = path.join(PUBLIC_ITEMS, manifestKey);
    const { copied: didCopy } = await copyIfChanged(sourcePath, destPath);
    if (didCopy) copied++;
    else unchanged++;
  }

  const contactCount = await copyContactFiles();
  console.log(
    `[dev-sync] copied ${copied} images (${unchanged} unchanged) to public/items/, ${contactCount} contact files to public/contact/`,
  );
}

// ── Mode: build-check ─────────────────────────────────────────────────────────

async function runBuildCheck(): Promise<void> {
  const provider = siteConfig.imageStorage.provider;

  // QR codes are always copied: they're git-tracked and must be in public/ for Next.js
  const contactCount = await copyContactFiles();
  if (contactCount > 0) {
    console.log(`[build-check] copied ${contactCount} contact files to public/contact/`);
  }

  if (provider === "local") {
    // Local provider: photos may be present on seller's machine — copy them
    if (!fs.existsSync(CONTENT_ITEMS)) {
      console.log("[build-check] local provider — content/items/ not found, skipping image copy");
      return;
    }
    const images = await scanImages(CONTENT_ITEMS);
    let copied = 0;
    // Same shared mtime+size comparison as dev-sync — previously this branch
    // only checked file *existence*, so a changed-but-same-named file (e.g.
    // a replaced cover.jpg) would never get recopied during a build-check run.
    for (const { sourcePath, manifestKey } of images) {
      const destPath = path.join(PUBLIC_ITEMS, manifestKey);
      const { copied: didCopy } = await copyIfChanged(sourcePath, destPath);
      if (didCopy) copied++;
    }
    console.log(`[build-check] local provider — copied ${copied} images to public/items/`);
    return;
  }

  // Cloud provider (cloudflare-r2 | vercel-blob): photos are gitignored on CI
  // Check that the committed manifest is present
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = await loadJson<Record<string, string>>(MANIFEST_PATH, {});
    const count = Object.keys(manifest).length;
    console.log(`[build-check] manifest found (${count} entries) — skipping upload`);
  } else {
    console.warn(
      `[build-check] WARNING: lib/generated/image-manifest.json not found — ` +
        `item images will show as broken. Run "pnpm upload-images" on your local machine ` +
        `and commit the manifest before deploying.`,
    );
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!mode || !["upload", "dev-sync", "build-check"].includes(mode)) {
    console.error(
      "[sync-images] --mode argument is required: upload | dev-sync | build-check",
    );
    process.exit(1);
  }

  if (mode === "upload") await runUpload();
  else if (mode === "dev-sync") await runDevSync();
  else await runBuildCheck();
}

main().catch((err: unknown) => {
  console.error(
    "[sync-images] Fatal error:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
