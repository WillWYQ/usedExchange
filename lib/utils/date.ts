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
