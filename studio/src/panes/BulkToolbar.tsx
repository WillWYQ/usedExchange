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
  onClear,
}: {
  count: number;
  busy: boolean;
  onApply: (status: string) => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
      <span className="count">{count} selected</span>
      {ACTIONS.map((action) => (
        <button
          key={action.status}
          type="button"
          disabled={busy}
          onClick={() => onApply(action.status)}
        >
          {action.label}
        </button>
      ))}
      <button type="button" onClick={onClear} disabled={busy}>
        Clear selection
      </button>
    </div>
  );
}
