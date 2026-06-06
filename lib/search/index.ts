import { loadCategories, loadItemsByCategory } from "@/lib/content/loader";

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
 */
export async function buildSearchIndex(): Promise<SearchIndexEntry[]> {
  const categories = await loadCategories();
  const entries: SearchIndexEntry[] = [];

  for (const cat of categories) {
    const items = await loadItemsByCategory(cat.slug);
    for (const item of items) {
      // Exclude sold items from the search index (they have a separate /sold archive)
      if (item.status === "sold") continue;
      entries.push({
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
      });
    }
  }

  return entries;
}
