import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { stripImageMetadata } from "./stripMetadata";

/** Builds a tiny JPEG with EXIF orientation + GPS coordinates embedded. */
async function buildJpegWithExifGps(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 4, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();

  return sharp(base)
    .withMetadata({
      orientation: 6, // 90° CW — swaps width/height once applied
      // sharp's `Exif` type only declares IFD0-3, but libvips also accepts a
      // "GPS" directory at runtime — cast to bypass the incomplete typing.
      exif: {
        IFD0: { Software: "test" },
        GPS: {
          GPSLatitude: "37/1 30/1 0/1",
          GPSLatitudeRef: "N",
          GPSLongitude: "122/1 25/1 0/1",
          GPSLongitudeRef: "W",
        },
      } as sharp.Exif,
    })
    .jpeg()
    .toBuffer();
}

describe("stripImageMetadata", () => {
  it("removes EXIF (including GPS) from a JPEG and applies orientation before dropping it", async () => {
    const input = await buildJpegWithExifGps();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);

    const output = await stripImageMetadata(input, "jpg");
    const after = await sharp(output).metadata();

    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // Orientation 6 rotates the 4x2 source to 2x4 before the tag is dropped.
    expect(after.width).toBe(before.height);
    expect(after.height).toBe(before.width);
  });

  it("removes EXIF from PNG and WebP", async () => {
    const base = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .withMetadata({ exif: { IFD0: { Software: "test" } } });

    const png = await base.clone().png().toBuffer();
    const strippedPng = await stripImageMetadata(png, "png");
    expect((await sharp(strippedPng).metadata()).exif).toBeUndefined();

    const webp = await base.clone().webp().toBuffer();
    const strippedWebp = await stripImageMetadata(webp, "webp");
    expect((await sharp(strippedWebp).metadata()).exif).toBeUndefined();
  });

  it("passes GIF through unchanged (GIF has no EXIF and animated frames must be preserved)", async () => {
    const input = Buffer.from("GIF89a-fake-gif-bytes");
    const output = await stripImageMetadata(input, "gif");
    expect(output).toBe(input);
  });

  it("passes through unchanged for unrecognised extensions", async () => {
    const input = Buffer.from("not-an-image");
    const output = await stripImageMetadata(input, "bmp");
    expect(output).toBe(input);
  });
});
