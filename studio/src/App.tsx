import { useCallback, useEffect, useState } from "react";
import { bulkStatus, fetchItems, type StudioItem } from "./api";
import { BulkToolbar } from "./panes/BulkToolbar";
import { ImagePane } from "./panes/ImagePane";
import { ItemList } from "./panes/ItemList";
import { SyncBar } from "./panes/SyncBar";

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [justStampedIds, setJustStampedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // Studio keeps no local copy of item state: after any write it re-reads the
  // full list, so the table can never drift from what is on disk.
  const refresh = useCallback(async () => {
    setItems(await fetchItems());
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(items.map((i) => i.id)) : new Set());
    },
    [items],
  );

  async function apply(status: string) {
    const ids = [...selectedIds];
    setBusy(true);
    setError(null);
    try {
      const result = await bulkStatus(ids, status);
      const failed = new Set(result.failed.map((f) => f.id));
      setFailedIds(failed);
      // Failed rows stay selected so the seller can retry them directly.
      setSelectedIds(failed);
      setJustStampedIds(
        status === "sold" ? new Set(ids.filter((id) => !failed.has(id))) : new Set(),
      );
      await refresh();
      if (result.failed.length > 0) {
        setError(
          `${result.failed.length} of ${ids.length} items could not be updated: ` +
            result.failed.map((f) => `${f.id} (${f.error})`).join(", "),
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="studio-head">
        <h1>Seller Studio</h1>
        <span className="counts">content/ · {items.length} items</span>
        <SyncBar onFinished={() => void refresh()} />
      </header>
      {error !== null && <p role="alert">{error}</p>}
      {error === null && items.length === 0 && (
        <p>No items yet. Run `pnpm create-item &lt;category&gt;/&lt;name&gt;` to add the first one.</p>
      )}
      {items.length > 0 && (
        <ItemList
          items={items}
          selectedIds={selectedIds}
          failedIds={failedIds}
          justStampedIds={justStampedIds}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onOpen={setOpenItemId}
        />
      )}
      <BulkToolbar
        count={selectedIds.size}
        busy={busy}
        onApply={(status) => void apply(status)}
        onClear={() => setSelectedIds(new Set())}
      />
      {openItemId !== null && (() => {
        const openItem = items.find((i) => i.id === openItemId);
        return openItem === undefined ? null : (
          <ImagePane
            key={openItem.id}
            item={openItem}
            onClose={() => setOpenItemId(null)}
            onChanged={() => void refresh()}
          />
        );
      })()}
    </>
  );
}
