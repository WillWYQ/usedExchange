import { Button } from "../components/Button";

// Actions keep the same name from button to result: "Mark sold" produces rows
// that read "sold". One job per control.
const ACTIONS: Array<{ label: string; status: string }> = [
  { label: "Mark sold", status: "sold" },
  { label: "Mark pending", status: "pending" },
  { label: "Mark available", status: "available" },
  { label: "Move to draft", status: "draft" },
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
  if (count === 0) return null;

  return (
    <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
      <span className="count">{count} selected</span>
      {ACTIONS.map((action) => (
        <Button key={action.status} disabled={busy} onClick={() => onApply(action.status)}>
          {action.label}
        </Button>
      ))}
      <Button disabled={busy} onClick={onApplyTiers}>
        Apply default tiers
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={busy}>
        Clear selection
      </Button>
    </div>
  );
}
