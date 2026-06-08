import Link from "next/link";
import type { Category } from "@/lib/content/types";
import { AdaptiveImage } from "@/components/common/AdaptiveImage";

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
      className="group relative flex min-h-40 flex-col justify-end overflow-hidden rounded-xl bg-foreground/5 p-4 ring-1 ring-foreground/10 transition-all duration-200 hover:bg-foreground/10 hover:ring-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* Cover image (blurred background) */}
      {category.coverImage && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <AdaptiveImage
            src={category.coverImage}
            alt=""
            fill
            className="scale-105 object-cover opacity-20 transition-opacity duration-300 group-hover:opacity-30"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        </div>
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
        <h3 className="font-semibold text-foreground">{category.displayName}</h3>
        <p className="mt-0.5 text-xs text-foreground/60">{countLabel}</p>
      </div>
    </Link>
  );
}
