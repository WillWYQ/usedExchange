import { loadAllItemsRaw } from "@/lib/content/loader";

export type SearchIndexEntry = {
  name: string;
  description: string;
  brand: string;
  model: string;
  tags: string[];
  course: string;
  isbn: string;
  edition: string;
  categorySlug: string;
  itemSlug: string;
  coverImage: string | null;
};

/**
 * Builds the fuse.js search index from all publicly visible, non-sold items.
 * Called by scripts/build-search-index.ts during the prebuild step.
 * The caller writes the result to public/search-index.json.
 *
 * FIX Perf 1: the previous implementation called loadCategories() (which
 * internally loads all items to compute availableItemCount and coverImage) and
 * then called loadItemsByCategory() again for each category — an O(2n) item
 * parse on every build.  loadAllItemsRaw() performs a single concurrent pass
 * across all category directories with no redundant I/O.
 *
 * Filter logic (equivalent to the previous behaviour):
 *   - draft items are excluded (never public)
 *   - sold items are excluded (they have a separate /sold archive)
 *   - available, pending, and reserved items are included
 */
export async function buildSearchIndex(): Promise<SearchIndexEntry[]> {
  const items = await loadAllItemsRaw();

  return items
    .filter((item) => item.status !== "draft" && item.status !== "sold")
    .map((item) => ({
      name: item.name,
      description: item.description,
      brand: item.brand,
      model: item.model,
      tags: item.tags,
      course: item.course,
      isbn: item.isbn,
      edition: item.edition,
      categorySlug: item.categorySlug,
      itemSlug: item.itemSlug,
      coverImage: item.coverImage,
    }));
}
