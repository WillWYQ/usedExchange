import type { Category } from "@/lib/content/types";
import { CategoryCard } from "./CategoryCard";

type CategoryGridProps = {
  categories: Category[];
};

export function CategoryGrid({ categories }: CategoryGridProps) {
  if (categories.length === 0) {
    return (
      <p className="py-8 text-center text-foreground/40">
        No categories yet — add items to <code>content/items/</code> to get started.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((cat) => (
        <CategoryCard key={cat.slug} category={cat} />
      ))}
    </div>
  );
}
