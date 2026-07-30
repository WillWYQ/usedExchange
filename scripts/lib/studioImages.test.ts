import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { isValidImageFilename, listImageFiles, sniffImageType } from "./studioImages";

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
});
