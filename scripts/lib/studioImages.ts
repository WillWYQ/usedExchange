// Filesystem operations on an item's photo folder. No HTTP, no printing — the
// route layer in studioApi.ts owns status codes and the middleware owns the
// wire. Every function here takes an already-resolved directory: containment
// against content/items/ is resolveItemDir's job, and doing it twice in two
// places is how the two copies drift apart.

import fsPromises from "fs/promises";
import type { Dirent } from "fs";
import path from "path";

// Photo names are not slugs: they carry an extension, and cameras produce
// names like IMG_2043.JPEG. Dots, dashes and underscores are allowed after the
// first character; "/" and a leading "." are not, which is what keeps "../" and
// dotfiles out. The extension list matches lib/content/loader.ts's IMAGE_EXT.
export const IMAGE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp|gif)$/i;

export function isValidImageFilename(name: string): boolean {
  return IMAGE_FILENAME_RE.test(name) && !name.includes("..");
}

export type ImageKind = "jpg" | "png" | "webp" | "gif";

/**
 * Identify an image by its header bytes. The extension is attacker-chosen even
 * when it passes isValidImageFilename, so the bytes are what decide whether a
 * file is written into content/.
 */
export function sniffImageType(bytes: Buffer): ImageKind | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "png";
  }
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("hex") === "ffd8ff") {
    return "jpg";
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Image filenames in the order the published site will show them.
 * lib/content/loader.ts:50-56 sorts case-insensitively with localeCompare, so
 * studio must sort identically or the seller's preview lies about the order.
 */
export async function listImageFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    // withFileTypes so a directory that happens to be named like an image
    // (e.g. "cover.jpg") is excluded rather than listed — matching
    // studioApi.ts's countImages, which already filters on isFile().
    entries = await fsPromises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && isValidImageFilename(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Content-type for an image filename, for the file response variant. */
export function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Write photo bytes into an item folder without ever clobbering an existing
 * file: a seller who drops two photos that happen to share a camera filename
 * must end up with both. Returns the filename actually used.
 */
export async function writeImage(
  dir: string,
  filename: string,
  bytes: Buffer,
): Promise<string> {
  await fsPromises.mkdir(dir, { recursive: true });

  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);

  let candidate = filename;
  let suffix = 1;
  for (;;) {
    try {
      // wx fails if the path exists, which makes the check and the write one
      // atomic step — a stat-then-write pair can lose a race with itself.
      await fsPromises.writeFile(path.join(dir, candidate), bytes, { flag: "wx" });
      return candidate;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      candidate = `${base}-${suffix}${ext}`;
      suffix++;
    }
  }
}

const NUMERIC_PREFIX_RE = /^\d+-/;

export async function deleteImage(dir: string, filename: string): Promise<string[]> {
  try {
    await fsPromises.unlink(path.join(dir, filename));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`no such image: ${filename}`);
    }
    throw err;
  }
  return listImageFiles(dir);
}

/**
 * Persist a display order by renaming files to `NN-<name>`.
 *
 * Order has to live in the filenames: the site build has no per-item ordering
 * field, and lib/content/loader.ts derives item.images by sorting filenames.
 *
 * The renames run in two passes through temporary names. A single pass would
 * collide whenever the new numbering reuses a slot the old numbering still
 * holds — reversing two photos is enough to trigger it.
 */
export async function reorderImages(dir: string, order: string[]): Promise<string[]> {
  const present = await listImageFiles(dir);

  const sameSet =
    order.length === present.length && new Set(order).size === order.length &&
    order.every((name) => present.includes(name));
  if (!sameSet) {
    throw new Error(
      `the order must name every image in the folder exactly once (folder has ${present.length}: ${present.join(", ")})`,
    );
  }

  const width = Math.max(2, String(order.length).length);
  const targets = order.map((name, i) => {
    const stripped = name.replace(NUMERIC_PREFIX_RE, "");
    return `${String(i + 1).padStart(width, "0")}-${stripped}`;
  });

  // Pass 1: park everything under names that cannot collide with a target.
  const parked = order.map((_, i) => `.studio-reorder-${i}.tmp`);
  for (let i = 0; i < order.length; i++) {
    await fsPromises.rename(path.join(dir, order[i]!), path.join(dir, parked[i]!));
  }

  // Pass 2: move them into place.
  for (let i = 0; i < parked.length; i++) {
    await fsPromises.rename(path.join(dir, parked[i]!), path.join(dir, targets[i]!));
  }

  return listImageFiles(dir);
}
