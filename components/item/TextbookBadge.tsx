import { IconBook } from "@tabler/icons-react";

type TextbookBadgeProps = {
  course: string;
  edition: string;
  isbn: string;
  semesterListed: string;
};

// Renders nothing when neither isbn nor course is present.
export function TextbookBadge({
  course,
  edition,
  isbn,
  semesterListed,
}: TextbookBadgeProps) {
  if (!isbn && !course) return null;

  const label = [course, edition].filter(Boolean).join(" · ");
  const bookfinderUrl = isbn
    ? `https://bookfinder.com/search/?isbn=${encodeURIComponent(isbn)}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {label && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
          <IconBook size={13} />
          {label}
        </span>
      )}

      {semesterListed && (
        <span className="text-xs text-foreground/40">{semesterListed}</span>
      )}

      {bookfinderUrl && (
        <a
          href={bookfinderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
        >
          Compare prices →
        </a>
      )}
    </div>
  );
}
