import { Button } from "../components/Button";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

// Actions keep the same name from button to result: "Mark sold" produces rows
// that read "sold". One job per control. Labels come from the i18n dictionary.
const ACTIONS: Array<{ labelKey: StudioKey; status: string }> = [
  { labelKey: "bulk.markSold", status: "sold" },
  { labelKey: "bulk.markPending", status: "pending" },
  { labelKey: "bulk.markAvailable", status: "available" },
  { labelKey: "bulk.moveToDraft", status: "draft" },
];

export function BulkToolbar({
  count,
  busy,
  onApply,
  onApplyTiers,
  onClear,
}: {
  count: number;
  busy: boolean;
  onApply: (status: string) => void;
  onApplyTiers: () => void;
  onClear: () => void;
}) {
  const { t } = useStudioT();

  if (count === 0) return null;

  return (
    <div className="bulk-toolbar" role="region" aria-label={t("bulk.ariaLabel")}>
      <span className="count">{t("bulk.selected", { count })}</span>
      {ACTIONS.map((action) => (
        <Button key={action.status} disabled={busy} onClick={() => onApply(action.status)}>
          {t(action.labelKey)}
        </Button>
      ))}
      <Button disabled={busy} onClick={onApplyTiers}>
        {t("bulk.applyDefaultTiers")}
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={busy}>
        {t("bulk.clearSelection")}
      </Button>
    </div>
  );
}
