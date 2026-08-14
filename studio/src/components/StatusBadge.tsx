import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

const KNOWN_STATUSES = new Set(["available", "pending", "reserved", "sold", "draft"]);

// Pill badge per status; an unknown on-disk status renders as draft-coloured
// text rather than crashing or disappearing — same raw-show philosophy as the
// edit form's off-list values. Known statuses go through the UI dictionary;
// unknown ones keep their raw string instead of showing a missing key.
export function StatusBadge({ status }: { status: string }) {
  const { t } = useStudioT();
  const known = KNOWN_STATUSES.has(status);
  const cls = known ? `badge badge-${status}` : "badge badge-draft";
  return <span className={cls}>{known ? t(`statusBadge.${status}` as StudioKey) : status}</span>;
}
