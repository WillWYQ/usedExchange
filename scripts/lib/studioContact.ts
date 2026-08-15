// Pure filesystem operations on content/contact/. No HTTP, no StudioError —
// studioApi.ts owns status codes. Upload reuses studioImages.ts's
// sanitizeUploadFilename/sniffImageType/writeImage directly: they already
// take a plain `dir` argument and carry no item-specific coupling, so QR
// images need no second copy of that logic, only a stricter (PNG-only)
// filename gate.

import fsPromises from "fs/promises";
import path from "path";

export const CONTACT_IMAGE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.png$/i;

export function isValidContactImageFilename(name: string): boolean {
  return CONTACT_IMAGE_FILENAME_RE.test(name);
}

export function resolveContactDir(projectRoot: string): string {
  return path.join(projectRoot, "content", "contact");
}

/** Returns false rather than throwing when the file is already gone, so the
 * route layer can turn that into a 404 without a try/catch of its own. */
export async function deleteContactImage(dir: string, filename: string): Promise<boolean> {
  try {
    await fsPromises.rm(path.join(dir, filename));
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
