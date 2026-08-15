// Pure filesystem operations on content/items/<slug>/_category.json. No HTTP,
// no StudioError — studioApi.ts owns status codes and path containment
// (resolveCategoryDir), the same split studioImages.ts and itemDefaults.ts
// use for item photos and item-field defaults.

import fsPromises from "fs/promises";
import path from "path";
import { categoryJsonSchema, type ParsedCategoryJson } from "../../lib/content/schema";
import { readJsonc } from "../../lib/content/loader";
import { isValidSlug } from "../../lib/utils/slug";

export type CategoryMetaInput = {
  display_name?: string;
  description?: string;
  icon?: string;
  sort_order?: number | null;
};

const CATEGORY_JSON_FILENAME = "_category.json";

/** Every content/items/ subdirectory whose name is itself a valid slug — this
 * naturally excludes _defaults.json, _template.json, and any `_`-prefixed
 * folder, since isValidSlug requires an alphanumeric first character. */
export async function listCategorySlugs(itemsRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await fsPromises.readdir(itemsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && isValidSlug(e.name))
    .map((e) => e.name)
    .sort();
}

/** Counts subfolders that contain an item.json, ignoring any stray directory
 * that doesn't (e.g. a manually-created scratch folder). A direct, isolated
 * directory read — not loadAllItemsRaw() — so this always respects the
 * `categoryDir` it's given rather than silently reading content/ from
 * process.cwd() the way loadAllItemsRaw() does. */
export async function countCategoryItems(categoryDir: string): Promise<number> {
  let entries;
  try {
    entries = await fsPromises.readdir(categoryDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  const checks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isValidSlug(entry.name))
      .map(async (entry) => {
        try {
          await fsPromises.access(path.join(categoryDir, entry.name, "item.json"));
          return true;
        } catch {
          return false; // Not an item folder — skip.
        }
      }),
  );
  return checks.filter(Boolean).length;
}

/** Falls back to all-default metadata on a missing or malformed file — the
 * same fallback lib/content/loader.ts's buildCategoriesFromItems already
 * applies, so Studio's read of a category never disagrees with the site
 * build's. */
export async function readCategoryMeta(dir: string): Promise<ParsedCategoryJson> {
  try {
    const raw = readJsonc(await fsPromises.readFile(path.join(dir, CATEGORY_JSON_FILENAME), "utf-8"));
    const parsed = categoryJsonSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  } catch {
    // No _category.json, or it doesn't parse — defaults stand.
  }
  return categoryJsonSchema.parse({});
}

/** Drops any field equal to categoryJsonSchema's default, matching how
 * _defaults.json stays sparse: only what the seller explicitly set appears
 * on disk. */
export function sparsifyCategoryMeta(meta: CategoryMetaInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (meta.display_name !== undefined && meta.display_name !== "") out.display_name = meta.display_name;
  if (meta.description !== undefined && meta.description !== "") out.description = meta.description;
  if (meta.icon !== undefined && meta.icon !== "") out.icon = meta.icon;
  if (meta.sort_order !== undefined && meta.sort_order !== null) out.sort_order = meta.sort_order;
  return out;
}

/** An all-default write deletes the file — "no _category.json" already means
 * "no metadata", so an empty file would be a second, redundant way to say
 * the same thing. Mirrors handleDefaultsPut's identical rule for
 * _defaults.json. */
export async function writeCategoryMeta(dir: string, meta: CategoryMetaInput): Promise<void> {
  const sparse = sparsifyCategoryMeta(meta);
  const filePath = path.join(dir, CATEGORY_JSON_FILENAME);
  if (Object.keys(sparse).length === 0) {
    await fsPromises.rm(filePath, { force: true });
    return;
  }
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(sparse, null, 2) + "\n", "utf-8");
}
