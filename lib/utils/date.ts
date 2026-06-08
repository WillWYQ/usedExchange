/**
 * Formats a YYYY-MM-DD date string as a human-readable relative label.
 * Returns "" for null, invalid, or future dates.
 * Pass `now` explicitly in tests to avoid time-sensitive failures.
 */
export function formatRelativeDate(
  isoDate: string | null,
  now: Date = new Date(),
): string {
  if (!isoDate) return "";

  const parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts || !parts[1] || !parts[2] || !parts[3]) return "";

  const itemDate = new Date(
    parseInt(parts[1], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[3], 10),
  );
  if (isNaN(itemDate.getTime())) return "";

  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const diffDays = Math.round(
    (todayMidnight.getTime() - itemDate.getTime()) / 86_400_000,
  );

  if (diffDays < 0) return "";
  if (diffDays === 0) return "Today";
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

/**
 * Formats a YYYY-MM-DD date string as an absolute, locale-stable label
 * (e.g. "June 5, 2026"). Returns "" for null/invalid input.
 *
 * Parses the date components explicitly — same technique as
 * formatRelativeDate — instead of `new Date(isoDate).toLocaleDateString()`,
 * which would be evaluated with whatever locale/timezone the *renderer*
 * happens to have. For a value rendered in a Server Component during static
 * export, that's the CI runner's locale/timezone (not the visitor's), which
 * can shift a date-only string by a day or format it inconsistently across
 * builds. Call this from a server component for a deterministic result, or
 * pair it with a client component (see SoldDateLabel) if you want the
 * visitor's own locale.
 */
export function formatAbsoluteDate(isoDate: string | null): string {
  if (!isoDate) return "";

  const parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts || !parts[1] || !parts[2] || !parts[3]) return "";

  const date = new Date(
    parseInt(parts[1], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[3], 10),
  );
  if (isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}
