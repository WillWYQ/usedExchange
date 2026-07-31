import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import {
  deleteImage,
  isValidImageFilename,
  listImageFiles,
  reorderImages,
  sanitizeUploadFilename,
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

// Most of these tests only care about names, not the editable flag — every
// name they seed is already allowlist-valid, so this documents that instead
// of repeating `{ name, editable: true }` at every call site.
function editableEntries(names: string[]): Array<{ name: string; editable: boolean }> {
  return names.map((name) => ({ name, editable: true }));
}

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

  it("accepts a legitimate double dot that is not a traversal segment", () => {
    // The regex alone (no bolted-on "!name.includes('..')") is what decides
    // this: "photo..jpg" is an ordinary filename, not "../" — the leading
    // character requirement and the ban on "/" already close the actual
    // traversal hole, as the "rejects traversal and separators" case above
    // confirms.
    expect(isValidImageFilename("photo..jpg")).toBe(true);
  });
});

describe("sanitizeUploadFilename", () => {
  it("replaces spaces and disallowed characters with a hyphen and collapses runs", () => {
    expect(sanitizeUploadFilename("photo (1).jpg")).toBe("photo-1-.jpg");
  });

  it("strips a leading dot or hyphen but keeps the extension", () => {
    expect(sanitizeUploadFilename("-cover.png")).toBe("cover.png");
    expect(sanitizeUploadFilename("..secret.png")).toBe("secret.png");
  });

  it("leaves an already-valid name untouched", () => {
    expect(sanitizeUploadFilename("01-front.jpg")).toBe("01-front.jpg");
  });

  it("produces a name that passes isValidImageFilename for a macOS screenshot", () => {
    const sanitized = sanitizeUploadFilename("Screenshot 2026-07-30 at 10.00.00.png");
    expect(isValidImageFilename(sanitized)).toBe(true);
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
    expect(await listImageFiles(dir)).toEqual(
      editableEntries(["01-front.jpg", "02-Side.JPG", "10-back.png"]),
    );
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
    expect(await listImageFiles(dir)).toEqual(editableEntries(["01-front.jpg"]));
  });

  it("lists a file the site will ship but studio cannot rename, marked not editable", async () => {
    // A seller-placed file with characters outside studio's write allowlist
    // (spaces) still has the right extension, so the published site ships
    // it (lib/content/loader.ts's IMAGE_EXT is extension-only). Studio must
    // show it too, or the pane's count silently disagrees with the site.
    await writeImage(dir, "apple.jpg", JPG);
    await fs.writeFile(path.join(dir, "Screenshot 2026-07-30 at 10.00.00.png"), PNG);

    expect(await listImageFiles(dir)).toEqual([
      { name: "apple.jpg", editable: true },
      { name: "Screenshot 2026-07-30 at 10.00.00.png", editable: false },
    ]);
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

    expect(await deleteImage(dir, "01-front.png")).toEqual(editableEntries(["02-side.png"]));
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

    expect(files).toEqual(editableEntries(["01-cherry.png", "02-apple.png", "03-banana.png"]));
    // listImageFiles sorts the same way the site does, so this IS the order
    // the published page will show.
    expect(await listImageFiles(dir)).toEqual(files);
  });

  it("strips an existing numeric prefix instead of stacking a second one", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    const files = await reorderImages(dir, ["02-banana.png", "01-apple.png"]);

    expect(files).toEqual(editableEntries(["01-banana.png", "02-apple.png"]));
  });

  it("survives an order that swaps two names into each other's slots", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);

    // Just an ordering check, not a collision check: "apple" and "banana" are
    // different base names, so even a naive one-pass rename would produce the
    // same correct result here. The real collision hazard (same stripped base
    // name) is covered separately below.
    const files = await reorderImages(dir, ["02-banana.png", "01-apple.png"]);

    expect(files).toEqual(editableEntries(["01-banana.png", "02-apple.png"]));
    expect(await fs.readdir(dir)).toHaveLength(2);
  });

  it("keeps both files and their own bytes when two names strip to the same base", async () => {
    // "01-photo.jpg" and "02-photo.jpg" both strip to "photo.jpg". A naive
    // one-pass rename renames the first source straight to its final target —
    // here that target is the *other* file's current name — and fs.rename
    // overwrites an existing destination silently on POSIX (no EEXIST). That
    // clobbers the second file before it gets its own turn to move, losing it
    // with no error. The two-pass version must keep both.
    await writeImage(dir, "01-photo.jpg", JPG);
    await writeImage(dir, "02-photo.jpg", PNG);

    const files = await reorderImages(dir, ["02-photo.jpg", "01-photo.jpg"]);

    expect(files).toEqual(editableEntries(["01-photo.jpg", "02-photo.jpg"]));
    // order[0] ("02-photo.jpg", PNG bytes) becomes targets[0] ("01-photo.jpg");
    // order[1] ("01-photo.jpg", JPG bytes) becomes targets[1] ("02-photo.jpg").
    expect(await fs.readFile(path.join(dir, "01-photo.jpg"))).toEqual(PNG);
    expect(await fs.readFile(path.join(dir, "02-photo.jpg"))).toEqual(JPG);
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

    expect(files[0]).toEqual({ name: "01-photo0.png", editable: true });
    expect(files[9]).toEqual({ name: "10-photo9.png", editable: true });
    expect(await listImageFiles(dir)).toEqual(files);
  });

  describe("a non-editable file present in the folder", () => {
    it("is included in the required order but never renamed", async () => {
      await writeImage(dir, "apple.png", PNG);
      await writeImage(dir, "banana.png", PNG);
      await fs.writeFile(path.join(dir, "cherry pie.png"), PNG);

      // Current alphabetical order is apple, banana, cherry pie — the
      // requested order leaves "cherry pie.png" at the same index (2), so
      // the reorder is allowed even though it cannot be renamed.
      const files = await reorderImages(dir, ["banana.png", "apple.png", "cherry pie.png"]);

      expect(files).toEqual([
        { name: "01-banana.png", editable: true },
        { name: "02-apple.png", editable: true },
        { name: "cherry pie.png", editable: false },
      ]);
      // Untouched on disk — no numeric prefix, no rename attempted.
      expect(await fs.readdir(dir)).toContain("cherry pie.png");
    });

    it("refuses the whole operation if the requested order would move it", async () => {
      await writeImage(dir, "apple.png", PNG);
      await writeImage(dir, "banana.png", PNG);
      await fs.writeFile(path.join(dir, "cherry pie.png"), PNG);

      // "cherry pie.png" currently sits at index 2 (alphabetical: apple,
      // banana, cherry pie); this order asks for it at index 0.
      await expect(
        reorderImages(dir, ["cherry pie.png", "apple.png", "banana.png"]),
      ).rejects.toThrow(/cherry pie\.png/);

      // Nothing moved: refusing must happen before any rename in this run.
      expect((await fs.readdir(dir)).sort()).toEqual([
        "apple.png",
        "banana.png",
        "cherry pie.png",
      ]);
    });

    it("omitting it from the order is still refused as an incomplete order, not silently dropped", async () => {
      await writeImage(dir, "apple.png", PNG);
      await fs.writeFile(path.join(dir, "cherry pie.png"), PNG);

      await expect(reorderImages(dir, ["apple.png"])).rejects.toThrow(/every image/);
    });
  });

  it("refuses to run when a leftover temp file cannot be identified", async () => {
    await writeImage(dir, "01-apple.png", PNG);
    await writeImage(dir, "02-banana.png", PNG);
    // Predates the recovery scheme: no embedded original filename to
    // recover to, so studio cannot safely rename it back on its own.
    await fs.writeFile(path.join(dir, ".studio-reorder-deadrun-0.tmp"), PNG);

    await expect(reorderImages(dir, ["02-banana.png", "01-apple.png"])).rejects.toThrow(
      /interrupted reorder/,
    );

    // Nothing moved: refusing must happen before any rename in this run.
    expect((await fs.readdir(dir)).sort()).toEqual([
      ".studio-reorder-deadrun-0.tmp",
      "01-apple.png",
      "02-banana.png",
    ]);
  });

  it("recovers files parked by an interrupted reorder, then completes the new one", async () => {
    await writeImage(dir, "banana.png", PNG);
    // Simulates a process that died between reorderImages' two passes on a
    // previous run: "apple.png" is parked under its embedded original name,
    // never having reached its target. listImageFiles can't see it (leading
    // dot), so before recovery the folder looks like it holds only one photo.
    const parkedName = `.studio-reorder-${crypto.randomUUID()}-apple.png.tmp`;
    await fs.writeFile(path.join(dir, parkedName), PNG);
    expect(await listImageFiles(dir)).toEqual(editableEntries(["banana.png"]));

    const files = await reorderImages(dir, ["apple.png", "banana.png"]);

    expect(files).toEqual(editableEntries(["01-apple.png", "02-banana.png"]));
    const onDisk = await fs.readdir(dir);
    expect(onDisk).not.toContain(parkedName);
    expect(onDisk.sort()).toEqual(["01-apple.png", "02-banana.png"]);
  });

  it("refuses to recover a leftover if its original name would collide with an existing file", async () => {
    await writeImage(dir, "apple.png", PNG);
    const parkedName = `.studio-reorder-${crypto.randomUUID()}-apple.png.tmp`;
    await fs.writeFile(path.join(dir, parkedName), JPG);

    await expect(reorderImages(dir, ["apple.png"])).rejects.toThrow(/interrupted reorder/);

    // Neither file touched — refusing must not lose either copy.
    expect(await fs.readFile(path.join(dir, "apple.png"))).toEqual(PNG);
    expect(await fs.readFile(path.join(dir, parkedName))).toEqual(JPG);
  });
});
