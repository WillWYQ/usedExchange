import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  countCategoryItems,
  listCategorySlugs,
  readCategoryMeta,
  sparsifyCategoryMeta,
  writeCategoryMeta,
} from "./studioCategories";

let itemsRoot: string;

beforeEach(async () => {
  itemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studio-categories-"));
});

afterEach(async () => {
  await fs.rm(itemsRoot, { recursive: true, force: true });
});

describe("listCategorySlugs", () => {
  it("returns an empty array when the directory doesn't exist", async () => {
    expect(await listCategorySlugs(path.join(itemsRoot, "missing"))).toEqual([]);
  });

  it("lists only valid-slug directories, sorted", async () => {
    await fs.mkdir(path.join(itemsRoot, "electronics"));
    await fs.mkdir(path.join(itemsRoot, "books"));
    await fs.mkdir(path.join(itemsRoot, "_template"));
    await fs.writeFile(path.join(itemsRoot, "_defaults.json"), "{}");
    expect(await listCategorySlugs(itemsRoot)).toEqual(["books", "electronics"]);
  });
});

describe("readCategoryMeta", () => {
  it("returns all-default metadata when _category.json is absent", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    expect(await readCategoryMeta(dir)).toEqual({
      display_name: "",
      description: "",
      icon: "",
      sort_order: null,
    });
  });

  it("returns all-default metadata when _category.json fails to parse", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "_category.json"), "not json at all {{{");
    expect(await readCategoryMeta(dir)).toEqual({
      display_name: "",
      description: "",
      icon: "",
      sort_order: null,
    });
  });

  it("reads a sparse _category.json, JSONC comments included", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "_category.json"),
      '{\n  // seller comment\n  "icon": "📱",\n  "sort_order": 2,\n}\n',
    );
    expect(await readCategoryMeta(dir)).toEqual({
      display_name: "",
      description: "",
      icon: "📱",
      sort_order: 2,
    });
  });
});

describe("countCategoryItems", () => {
  it("returns 0 for a category with no subfolders", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    expect(await countCategoryItems(dir)).toBe(0);
  });

  it("counts only subfolders containing item.json", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(path.join(dir, "phone"), { recursive: true });
    await fs.writeFile(path.join(dir, "phone", "item.json"), "{}");
    await fs.mkdir(path.join(dir, "empty-folder"), { recursive: true });
    expect(await countCategoryItems(dir)).toBe(1);
  });
});

describe("sparsifyCategoryMeta", () => {
  it("drops fields equal to their default", () => {
    expect(
      sparsifyCategoryMeta({ display_name: "", description: "", icon: "", sort_order: null }),
    ).toEqual({});
  });

  it("keeps only the fields that differ from default", () => {
    expect(
      sparsifyCategoryMeta({ display_name: "Electronics", description: "", icon: "📱", sort_order: null }),
    ).toEqual({ display_name: "Electronics", icon: "📱" });
  });
});

describe("writeCategoryMeta", () => {
  it("writes a sparse file for non-default metadata", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await writeCategoryMeta(dir, { display_name: "Electronics", sort_order: 1 });
    const written = JSON.parse(await fs.readFile(path.join(dir, "_category.json"), "utf-8"));
    expect(written).toEqual({ display_name: "Electronics", sort_order: 1 });
  });

  it("deletes an existing file when the new metadata is all-default", async () => {
    const dir = path.join(itemsRoot, "electronics");
    await fs.mkdir(dir);
    await writeCategoryMeta(dir, { display_name: "Electronics" });
    await writeCategoryMeta(dir, {});
    await expect(fs.access(path.join(dir, "_category.json"))).rejects.toThrow();
  });
});
