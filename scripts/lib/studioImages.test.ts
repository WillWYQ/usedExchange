import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  deleteImage,
  isValidImageFilename,
  listImageFiles,
  reorderImages,
  sniffImageType,
  writeImage,
} from "./studioImages";

// Real headers, not invented bytes — a sniffer that passes on fabricated input
// proves nothing.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPG = Buffer.from("ffd8ffe000104a4649460001", "hex");
const GIF = Buffer.from("474946383961" + "0100010080", "hex");
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from("24000000", "hex"),
  Buffer.from("WEBPVP8 "),
]);

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-images-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("isValidImageFilename", () => {
  it("accepts ordinary photo names", () => {
    expect(isValidImageFilename("01-front.jpg")).toBe(true);
    expect(isValidImageFilename("IMG_2043.JPEG")).toBe(true);
    expect(isValidImageFilename("side.webp")).toBe(true);
  });

  it("rejects traversal and separators", () => {
    expect(isValidImageFilename("../secret.jpg")).toBe(false);
    expect(isValidImageFilename("a/b.jpg")).toBe(false);
    expect(isValidImageFilename("..")).toBe(false);
  });

  it("rejects a leading dot", () => {
    expect(isValidImageFilename(".hidden.jpg")).toBe(false);
  });

  it("rejects non-image extensions", () => {
    expect(isValidImageFilename("notes.txt")).toBe(false);
    expect(isValidImageFilename("item.json")).toBe(false);
  });
});

describe("sniffImageType", () => {
  it("identifies each accepted format from its header", () => {
    expect(sniffImageType(PNG)).toBe("png");
    expect(sniffImageType(JPG)).toBe("jpg");
    expect(sniffImageType(GIF)).toBe("gif");
    expect(sniffImageType(WEBP)).toBe("webp");
  });

  it("returns null for a file that is not an image", () => {
    expect(sniffImageType(Buffer.from("<!doctype html><html></html>"))).toBeNull();
  });

  it("returns null for a truncated header", () => {
    expect(sniffImageType(Buffer.from("89", "hex"))).toBeNull();
  });
});

describe("listImageFiles", () => {
  it("lists images case-insensitively sorted, matching the site loader", async () => {
    for (const name of ["02-Side.JPG", "01-front.jpg", "10-back.png", "notes.txt"]) {
      await fs.writeFile(path.join(dir, name), PNG);
    }
    expect(await listImageFiles(dir)).toEqual(["01-front.jpg", "02-Side.JPG", "10-back.png"]);
  });

  it("returns an empty list for a directory that does not exist", async () => {
    expect(await listImageFiles(path.join(dir, "nope"))).toEqual([]);
  });

  it("excludes directories, even ones with an image-like name", async () => {
    // A directory literally named "cover.jpg" would previously slip through
    // readdir() without withFileTypes and be listed as if it were a photo,
    // disagreeing with countImages (which already filters on isFile()) and
    // producing a FileResponse the middleware can't stream (EISDIR on read).
    await fs.mkdir(path.join(dir, "cover.jpg"));
    await fs.writeFile(path.join(dir, "01-front.jpg"), PNG);
    expect(await listImageFiles(dir)).toEqual(["01-front.jpg"]);
  });
});

describe("writeImage", () => {
  it("writes the bytes under the given name", async () => {
    const written = await writeImage(dir, "01-front.png", PNG);
    expect(written).toBe("01-front.png");
    expect(await fs.readFile(path.join(dir, "01-front.png"))).toEqual(PNG);
  });

  it("does not overwrite an existing photo", async () => {
    await writeImage(dir, "01-front.png", PNG);
    const second = await writeImage(dir, "01-front.png", JPG);

    expect(second).not.toBe("01-front.png");
    expect(second).toMatch(/^01-front-\d+\.png$/);
    // The original is untouched — a seller who drags the same filename twice
    // must not silently lose the first photo.
    expect(await fs.readFile(path.join(dir, "01-front.png"))).toEqual(PNG);
    expect(await fs.readFile(path.join(dir, second))).toEqual(JPG);
  });

  it("creates the item folder when it does not exist yet", async () => {
    const fresh = path.join(dir, "new-item");
    await writeImage(fresh, "01-front.png", PNG);
    expect(await fs.readFile(path.join(fresh, "01-front.png"))).toEqual(PNG);
  });
});

describe("deleteImage", () => {
  it("removes the file and returns what is left", async () => {
    await writeImage(dir, "01-front.png", PNG);
    await writeImage(dir, "02-side.png", PNG);

    expect(await deleteImage(dir, "01-front.png")).toEqual(["02-side.png"]);
  });

  it("throws when the file is not there", async () => {
    await expect(deleteImage(dir, "ghost.png")).rejects.toThrow(/ghost\.png/);
  });
});

describe("reorderImages", () => {
  it("renames files so the loader's alphabetical sort matches the requested order", async () => {
    await writeImage(dir, "apple.png", PNG);
    await writeImage(dir, "banana.png", PNG);
    await writeImage(dir, "cherry.png", PNG);

    const files = await reorderImages(dir, ["cherry.png", "apple.png", "banana.png"]);

    expect(files).toEqual(["01-cherry.png", "02-apple.png", "03-banana.png"]);
    // listImageFiles sorts the same way the site does, so this IS the order
    // the published page will show.
    expect(await listImageFiles(dir)).toEqual(files);
  });

  it("strips an existing numeric prefix instead of stacking a second one", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    const files = await reorderImages(dir, ["02-banana.png", "01-apple.png"]);

    expect(files).toEqual(["01-banana.png", "02-apple.png"]);
  });

  it("survives an order that swaps two names into each other's slots", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    // A naive one-pass rename would hit EEXIST here: 02-banana -> 01-banana
    // while 01-apple still occupies its own slot in the same numbering space.
    const files = await reorderImages(dir, ["02-banana.png", "01-apple.png"]);

    expect(files).toEqual(["01-banana.png", "02-apple.png"]);
    expect(await fs.readdir(dir)).toHaveLength(2);
  });

  it("rejects an order that does not name exactly the files present", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    await expect(reorderImages(dir, ["01-apple.png"])).rejects.toThrow(/every image/);
    await expect(
      reorderImages(dir, ["01-apple.png", "02-banana.png", "ghost.png"]),
    ).rejects.toThrow(/every image/);
  });

  it("pads to two digits so ten or more photos still sort correctly", async () => {
    const names = Array.from({ length: 11 }, (_, i) => `photo${i}.png`);
    for (const name of names) await writeImage(dir, name, PNG);

    const files = await reorderImages(dir, names);

    expect(files[0]).toBe("01-photo0.png");
    expect(files[9]).toBe("10-photo9.png");
    expect(await listImageFiles(dir)).toEqual(files);
  });
});
