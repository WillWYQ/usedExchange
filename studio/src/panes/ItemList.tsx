import type { StudioItem } from "../api";

function formatPrice(item: StudioItem): string {
  if (item.lowestTierAmount === null) return "—";
  return `${item.currency || "$"}${item.lowestTierAmount.toFixed(2)}`;
}

function StatusCell({ status }: { status: string }) {
  if (status === "sold") return <span className="status-sold">sold</span>;
  if (status === "pending") return <span className="status-pending">pending</span>;
  return <span>{status}</span>;
}

export function ItemList({ items }: { items: StudioItem[] }) {
  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Category</th>
          <th scope="col">Status</th>
          <th scope="col">Price</th>
          <th scope="col">Images</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.name}</td>
            <td className="data">{item.categorySlug}</td>
            <td>
              <StatusCell status={item.status} />
            </td>
            <td className="data">{formatPrice(item)}</td>
            <td className="data">{item.imageCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
