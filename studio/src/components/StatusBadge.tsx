const KNOWN_STATUSES = new Set(["available", "pending", "reserved", "sold", "draft"]);

// Pill badge per status; an unknown on-disk status renders as draft-coloured
// text rather than crashing or disappearing — same raw-show philosophy as the
// edit form's off-list values.
export function StatusBadge({ status }: { status: string }) {
  const cls = KNOWN_STATUSES.has(status) ? `badge badge-${status}` : "badge badge-draft";
  return <span className={cls}>{status}</span>;
}
