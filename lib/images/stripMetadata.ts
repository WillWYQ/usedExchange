import sharp from "sharp";

const STRIPPABLE_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

/**
 * Re-encodes an image with all EXIF/IPTC/XMP metadata removed — including
 * GPS coordinates, which phone cameras commonly embed and which would
 * otherwise leak the seller's location to anyone who downloads the photo.
 *
 * `.rotate()` with no arguments reads the EXIF Orientation tag, physically
 * rotates the pixel data to match, then drops the tag — so the image still
 * displays right-side-up everywhere even after the tag is gone. Re-encoding
 * without calling `.withMetadata()` strips everything else by default.
 *
 * GIF (and any unrecognised extension) is returned unchanged: GIF has no
 * EXIF segment to begin with, and re-encoding an animated GIF through sharp
 * would collapse it to a single frame.
 */
export async function stripImageMetadata(input: Buffer, ext: string): Promise<Buffer> {
  const normalizedExt = ext.toLowerCase();
  if (!STRIPPABLE_EXT.has(normalizedExt)) {
    return input;
  }

  const image = sharp(input, { failOn: "none" }).rotate();

  switch (normalizedExt) {
    case "png":
      return image.png().toBuffer();
    case "webp":
      return image.webp().toBuffer();
    default:
      return image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }
}
