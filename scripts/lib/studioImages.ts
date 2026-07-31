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
