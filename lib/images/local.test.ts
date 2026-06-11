import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises before importing the adapter so the module resolves mocks.
const mockStat = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockCopyFile = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);

vi.mock("fs/promises", () => ({
  stat: mockStat,
  mkdir: mockMkdir,
  copyFile: mockCopyFile,
  writeFile: mockWriteFile,
}));

// Import after mock setup.
const { LocalAdapter } = await import("./local");

const KEY = "electronics/laptop/cover.jpg";
const SRC = `/content/items/${KEY}`;

describe("LocalAdapter.syncImage", () => {
  let adapter: InstanceType<typeof LocalAdapter>;

  beforeEach(() => {
    adapter = new LocalAdapter();
    vi.clearAllMocks();
  });

  it("returns the /items/ URL regardless of whether a copy was needed", async () => {
    mockStat.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const url = await adapter.syncImage(SRC, KEY, "sha256abc");
    expect(url).toBe(`/items/${KEY}`);
  });

  it("copies the file when dest does not exist", async () => {
    mockStat.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    await adapter.syncImage(SRC, KEY, "sha256abc");
    expect(mockCopyFile).toHaveBeenCalledOnce();
  });

  it("skips copy when size and mtime are identical", async () => {
    const sharedStat = { size: 1024, mtimeMs: 1_700_000_000 };
    mockStat.mockResolvedValue(sharedStat); // both src and dst return same stat
    await adapter.syncImage(SRC, KEY, "sha256abc");
    expect(mockCopyFile).not.toHaveBeenCalled();
  });

  it("copies when size differs even if mtime is the same", async () => {
    mockStat
      .mockResolvedValueOnce({ size: 2048, mtimeMs: 1_700_000_000 }) // src
      .mockResolvedValueOnce({ size: 1024, mtimeMs: 1_700_000_000 }); // dst
    await adapter.syncImage(SRC, KEY, "sha256abc");
    expect(mockCopyFile).toHaveBeenCalledOnce();
  });

  it("copies when mtime differs even if size is the same (same-size content change)", async () => {
    mockStat
      .mockResolvedValueOnce({ size: 1024, mtimeMs: 1_700_000_001 }) // src newer
      .mockResolvedValueOnce({ size: 1024, mtimeMs: 1_700_000_000 }); // dst older
    await adapter.syncImage(SRC, KEY, "sha256abc");
    expect(mockCopyFile).toHaveBeenCalledOnce();
  });

  it("copies when src has OLDER mtime but different size (backup-restore scenario — fixed by strict equality)", async () => {
    // Before the fix, `src.mtimeMs <= dst.mtimeMs` would skip this copy.
    // After the fix, strict equality means different mtime → copy.
    mockStat
      .mockResolvedValueOnce({ size: 999, mtimeMs: 1_699_000_000 }) // src older
      .mockResolvedValueOnce({ size: 999, mtimeMs: 1_700_000_000 }); // dst newer
    await adapter.syncImage(SRC, KEY, "sha256abc");
    expect(mockCopyFile).toHaveBeenCalledOnce();
  });

  it("writes the provided body buffer directly when given, without copying the source", async () => {
    const body = Buffer.from("stripped-bytes");
    const url = await adapter.syncImage(SRC, KEY, "sha256abc", body);
    expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), body);
    expect(mockCopyFile).not.toHaveBeenCalled();
    expect(mockStat).not.toHaveBeenCalled();
    expect(url).toBe(`/items/${KEY}`);
  });

  it("loadChecksums and getUpdatedChecksums are no-ops (local adapter uses mtime)", () => {
    adapter.loadChecksums({ "some/key.jpg": "abc" });
    expect(adapter.getUpdatedChecksums()).toEqual({});
  });
});
