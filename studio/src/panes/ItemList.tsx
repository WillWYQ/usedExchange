import type { StudioItem } from "../api";

function formatPrice(item: StudioItem): string {
  if (item.lowestTierAmount === null) return "—";
  return `${item.currency || "$"}${item.lowestTierAmount.toFixed(2)}`;
}

function StatusCell({ status, pressed }: { status: string; pressed: boolean }) {
  if (status === "sold") {
    return <span className={pressed ? "stamp stamp-press" : "stamp"}>sold</span>;
  }
  if (status === "pending") return <span className="status-pending">pending</span>;
  return <span>{status}</span>;
}

export function ItemList({
  items,
  selectedIds,
  failedIds,
  justStampedIds,
  onToggle,
  onToggleAll,
}: {
  items: StudioItem[];
  selectedIds: Set<string>;
  failedIds: Set<string>;
  justStampedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label="Select all items"
            />
          </th>
          <th scope="col">Name</th>
          <th scope="col">Category</th>
          <th scope="col">Status</th>
          <th scope="col">Price</th>
          <th scope="col">Images</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className={failedIds.has(item.id) ? "failed" : undefined}>
            <td>
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => onToggle(item.id)}
                aria-label={`Select ${item.name}`}
              />
            </td>
            <td>{item.name}</td>
            <td className="data">{item.categorySlug}</td>
            <td>
              <StatusCell status={item.status} pressed={justStampedIds.has(item.id)} />
            </td>
            <td className="data">{formatPrice(item)}</td>
            <td className="data">{item.imageCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
