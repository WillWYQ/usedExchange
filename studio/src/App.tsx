import { useEffect, useState } from "react";
import { fetchItems, type StudioItem } from "./api";
import { ItemList } from "./panes/ItemList";

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <>
      <header className="studio-head">
        <h1>Seller Studio</h1>
        <span className="counts">content/ · {items.length} items</span>
      </header>
      {/* An error tells the seller what happened and how to fix it. */}
      {error !== null && <p role="alert">Could not read content/: {error}</p>}
      {error === null && items.length === 0 && (
        <p>No items yet. Run `pnpm create-item &lt;category&gt;/&lt;name&gt;` to add the first one.</p>
      )}
      {items.length > 0 && <ItemList items={items} />}
    </>
  );
}
