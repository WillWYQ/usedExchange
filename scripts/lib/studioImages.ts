// Filesystem operations on an item's photo folder. No HTTP, no printing — the
// route layer in studioApi.ts owns status codes and the middleware owns the
// wire. Every function here takes an already-resolved directory: containment
// against content/items/ is resolveItemDir's job, and doing it twice in two
// places is how the two copies drift apart.

import fsPromises from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import crypto from "crypto";

// Photo names are not slugs: they carry an extension, and cameras produce
// names like IMG_2043.JPEG. Dots, dashes and underscores are allowed after the
// first character; "/" and a leading "." are not, which is what keeps "../" and
// dotfiles out. The extension list matches lib/content/loader.ts's IMAGE_EXT.
export const IMAGE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp|gif)$/i;

// The extensions studio (and the published site) will treat as a photo.
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

export function isValidImageFilename(name: string): boolean {
  // No separate "!name.includes('..')" clause: the regex already forbids "/"
  // and requires the first character to be alphanumeric, so no string it
  // accepts can ever be the traversal segment "..". A bolted-on "..' check
  // has only one further effect — rejecting an ordinary filename like
  // "photo..jpg" that happens to contain two dots in a row, which is not a
  // traversal payload, just an unlucky camera/export name.
  return IMAGE_FILENAME_RE.test(name);
}

/**
 * Best-effort normalisation of a browser-supplied filename so an ordinary
 * seller upload — a macOS screenshot with spaces, a browser download with a
 * "(1)" collision suffix — lands with a name studio can list, delete, and
 * reorder, with no rename the seller has to perform by hand: replace spaces
 * and anything outside the allowlist with a hyphen, collapse runs of
 * hyphens, and strip a leading dot or hyphen (the allowlist forbids both as
 * a first character). The extension is left untouched.
 *
 * Never throws and never guarantees a valid result — a name with no usable
 * characters before the extension (e.g. "???.jpg") sanitises to just the
 * extension. The caller re-validates the result with isValidImageFilename
 * and reports whatever is still wrong.
 */
export function sanitizeUploadFilename(filename: string): string {
  const ext = path.extname(filename);
  let base = filename.slice(0, filename.length - ext.length);
  base = base.replace(/[^a-zA-Z0-9._-]/g, "-");
  base = base.replace(/-{2,}/g, "-");
  base = base.replace(/^[.-]+/, "");
  return `${base}${ext}`;
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
 * One file the published site will ship for this item. `editable` narrows
 * that down to studio's write allowlist (isValidImageFilename): a photo the
 * seller placed by hand with a name outside it — spaces, parentheses — is
 * still `name`d here (matching content/loader.ts and the site build exactly,
 * see SHIPPED_IMAGE_EXT_RE below), but studio will refuse to rename or
 * delete it. Listing broadly and writing narrowly is deliberate: see the
 * comments on reorderImages and studioApi.ts's handleImageUpload.
 */
export type ImageEntry = { name: string; editable: boolean };

// The listing predicate matches lib/content/loader.ts's IMAGE_EXT exactly
// (extension only, no character allowlist): a file the site will publish
// must appear in studio's listing even when studio cannot write to it. This
// is deliberately looser than IMAGE_FILENAME_RE above — see ImageEntry.
const SHIPPED_IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/i;

/**
 * Every image filename in the folder, in the order the published site will
 * show them. lib/content/loader.ts sorts case-insensitively with
 * localeCompare at :183 and :197 (readdir order, then the manifest-key
 * fallback used when no local files are present), so studio must sort
 * identically or the seller's preview lies about the order.
 */
export async function listImageFiles(dir: string): Promise<ImageEntry[]> {
  let entries: Dirent[];
  try {
    // withFileTypes so a directory that happens to be named like an image
    // (e.g. "cover.jpg") is excluded rather than listed — matching
    // studioApi.ts's countImages, which calls this same function.
    entries = await fsPromises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && SHIPPED_IMAGE_EXT_RE.test(entry.name))
    .map((entry) => ({ name: entry.name, editable: isValidImageFilename(entry.name) }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
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

// Matches only reorderImages' own parked names, never a real photo:
// isValidImageFilename already rejects a leading "." for any filename, so
// this pattern and that allowlist can never both match the same string.
const TEMP_NAME_RE = /^\.studio-reorder-.*\.tmp$/;

// Captures the original filename a parked entry was renamed from. The run id
// is always a UUID (crypto.randomUUID()), fixed-format, which is what lets
// this regex tell "run id" and "embedded original name" apart even though
// both may themselves contain hyphens.
const TEMP_NAME_CAPTURE_RE =
  /^\.studio-reorder-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)\.tmp$/i;

/**
 * If a previous reorderImages call died between its two rename passes (see
 * that function's doc comment), its parked files are still sitting on disk
 * under a leading-dot temp name — invisible to listImageFiles, so the seller
 * would see every photo of the item vanish with nothing in the pane and no
 * path back. The parked name embeds the original filename, so recovery is
 * just renaming each one back before the requested reorder proceeds.
 *
 * Refuses (leaving the wreckage in place, changing nothing) only when
 * recovery itself cannot proceed safely: a parked name that cannot be parsed
 * (predates this recovery scheme), or restoring one would overwrite a file
 * that already exists.
 */
async function recoverInterruptedReorder(dir: string): Promise<void> {
  let rawEntries: string[];
  try {
    rawEntries = await fsPromises.readdir(dir);
  } catch {
    return;
  }
  const leftovers = rawEntries.filter((name) => TEMP_NAME_RE.test(name));
  if (leftovers.length === 0) return;

  const nonLeftover = new Set(rawEntries.filter((name) => !TEMP_NAME_RE.test(name)));
  const recoverable: Array<{ parked: string; original: string }> = [];
  for (const parked of leftovers) {
    const original = TEMP_NAME_CAPTURE_RE.exec(parked)?.[1];
    if (original === undefined) {
      throw new Error(
        `found a leftover file from an interrupted reorder that studio cannot identify: "${parked}" ` +
          `— open the item's folder in Finder, work out what it should be named, and rename or remove it before reordering again`,
      );
    }
    if (nonLeftover.has(original) || recoverable.some((r) => r.original === original)) {
      throw new Error(
        `found a leftover file from an interrupted reorder ("${parked}") but cannot restore it automatically ` +
          `because "${original}" already exists in the folder — open it in Finder, resolve the conflict, and try again`,
      );
    }
    recoverable.push({ parked, original });
  }

  for (const { parked, original } of recoverable) {
    try {
      await fsPromises.rename(path.join(dir, parked), path.join(dir, original));
    } catch (err: unknown) {
      throw new Error(
        `found leftover file(s) from an interrupted reorder and could not restore "${parked}" to "${original}": ` +
          `${err instanceof Error ? err.message : String(err)} — this folder needs manual attention in Finder`,
      );
    }
  }
}

export async function deleteImage(dir: string, filename: string): Promise<ImageEntry[]> {
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
 * `order` must name every file listImageFiles returns — editable and
 * non-editable alike — exactly once, so a non-conforming file the seller
 * placed by hand is never silently dropped from the folder's accounting.
 * Studio still refuses to rename such a file (that would write a name the
 * allowlist itself would reject — the safety boundary), so if the requested
 * order does not leave it exactly where it already sits, the whole operation
 * is refused rather than moving it.
 *
 * The renames run in two passes through temporary names. A single pass is
 * unsafe whenever two files strip to the same base name — e.g. "01-photo.jpg"
 * and "02-photo.jpg" both strip to "photo.jpg". `fs.rename` overwrites an
 * existing destination silently on POSIX (no EEXIST, no error), so renaming
 * one source straight to its final target can clobber the other file before
 * it has had its own turn to move, destroying it with no error raised.
 * Parking every source under a temp name first, then moving all of them into
 * place, means no target name is ever occupied by a file that still needs to
 * be read.
 *
 * The temp names carry a random per-call id (so a second reorder can never
 * collide with wreckage left behind by an interrupted one) and the original
 * filename (so an interrupted run can be recovered automatically — see
 * recoverInterruptedReorder — rather than leaving the seller with photos
 * that have vanished and a temp name with no way to map it back).
 */
export async function reorderImages(dir: string, order: string[]): Promise<ImageEntry[]> {
  await recoverInterruptedReorder(dir);

  const present = await listImageFiles(dir);
  const presentNames = present.map((e) => e.name);

  const sameSet =
    order.length === presentNames.length &&
    new Set(order).size === order.length &&
    order.every((name) => presentNames.includes(name));
  if (!sameSet) {
    throw new Error(
      `the order must name every image in the folder exactly once (folder has ${presentNames.length}: ${presentNames.join(", ")})`,
    );
  }

  for (const entry of present) {
    if (entry.editable) continue;
    if (presentNames.indexOf(entry.name) !== order.indexOf(entry.name)) {
      throw new Error(
        `"${entry.name}" must be renamed to letters, digits, and hyphens before studio can reorder it — ` +
          `rename it in Finder (or your file manager) and try again`,
      );
    }
  }

  const width = Math.max(2, String(order.length).length);
  const targets = order.map((name, i) => {
    const stripped = name.replace(NUMERIC_PREFIX_RE, "");
    return `${String(i + 1).padStart(width, "0")}-${stripped}`;
  });

  const editableByName = new Map(present.map((e) => [e.name, e.editable]));
  const renamable = order
    .map((name, i) => ({ name, target: targets[i]! }))
    .filter(({ name }) => editableByName.get(name) === true);

  // Pass 1: park everything under names that cannot collide with a target or
  // with another run's leftovers.
  const runId = crypto.randomUUID();
  const parked = renamable.map(({ name }) => ({
    name,
    parkedName: `.studio-reorder-${runId}-${name}.tmp`,
  }));
  for (const { name, parkedName } of parked) {
    await fsPromises.rename(path.join(dir, name), path.join(dir, parkedName));
  }

  // Pass 2: move them into place.
  for (let i = 0; i < parked.length; i++) {
    await fsPromises.rename(path.join(dir, parked[i]!.parkedName), path.join(dir, renamable[i]!.target));
  }

  return listImageFiles(dir);
}
