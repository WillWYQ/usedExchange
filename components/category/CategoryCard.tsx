import Link from "next/link";
import type { Category } from "@/lib/content/types";

type CategoryCardProps = {
  category: Category;
};

export function CategoryCard({ category }: CategoryCardProps) {
  const countLabel =
    category.availableItemCount === 0
      ? "No items available"
      : `${category.availableItemCount} available`;

  return (
    <Link
      href={`/${category.slug}`}
      className="group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-xl bg-white/5 p-4 ring-1 ring-white/10 transition-all duration-200 hover:bg-white/10 hover:ring-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {/* Cover image (blurred background) */}
      {category.coverImage && (
        <div
          className="absolute inset-0 scale-105 bg-cover bg-center opacity-20 transition-opacity duration-300 group-hover:opacity-30"
          style={{
            backgroundImage: `url("${category.coverImage
              .replace(/\\/g, "\\\\")
              .replace(/"/g, "%22")
              .replace(/\)/g, "%29")}")`,
          }}
          aria-hidden="true"
        />
      )}

      {/* Bottom-to-top gradient so text stays readable */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10">
        {category.icon && (
          <span className="mb-1 block text-2xl leading-none" aria-hidden="true">
            {category.icon}
          </span>
        )}
        <h3 className="font-semibold text-white">{category.displayName}</h3>
        <p className="mt-0.5 text-xs text-white/60">{countLabel}</p>
      </div>
    </Link>
  );
}
