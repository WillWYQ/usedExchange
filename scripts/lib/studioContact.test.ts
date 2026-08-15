import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  deleteContactImage,
  isValidContactImageFilename,
  resolveContactDir,
} from "./studioContact";

describe("isValidContactImageFilename", () => {
  it("accepts a lowercase-first .png name", () => {
    expect(isValidContactImageFilename("wechat-qr.png")).toBe(true);
    expect(isValidContactImageFilename("qr1.PNG")).toBe(true);
  });

  it("rejects non-png extensions", () => {
    expect(isValidContactImageFilename("wechat-qr.jpg")).toBe(false);
    expect(isValidContactImageFilename("wechat-qr")).toBe(false);
  });

  it("rejects traversal and a leading dot", () => {
    expect(isValidContactImageFilename("../secret.png")).toBe(false);
    expect(isValidContactImageFilename(".hidden.png")).toBe(false);
  });
});

describe("resolveContactDir", () => {
  it("resolves to content/contact under the project root", () => {
    expect(resolveContactDir("/tmp/project")).toBe(path.join("/tmp/project", "content", "contact"));
  });
});

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-contact-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("deleteContactImage", () => {
  it("removes an existing file and returns true", async () => {
    await fs.writeFile(path.join(dir, "wechat-qr.png"), "x");
    expect(await deleteContactImage(dir, "wechat-qr.png")).toBe(true);
    await expect(fs.access(path.join(dir, "wechat-qr.png"))).rejects.toThrow();
  });

  it("returns false for a file that doesn't exist", async () => {
    expect(await deleteContactImage(dir, "missing.png")).toBe(false);
  });
});
