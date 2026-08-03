import { useCallback, useEffect, useState } from "react";
import { bulkStatus, fetchItems, type StudioItem } from "./api";
import { BulkToolbar } from "./panes/BulkToolbar";
import { DefaultsPane } from "./panes/DefaultsPane";
import { Drawer } from "./panes/Drawer";
import { ItemList } from "./panes/ItemList";
import { NewItemDialog } from "./panes/NewItemDialog";
import { PublishPane } from "./panes/PublishPane";
import { SyncBar } from "./panes/SyncBar";

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [justStampedIds, setJustStampedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  // Bumped after every item write and every sync so the publish pane re-reads
  // the working tree. The pane holds the file list; the header needs only the
  // count, which the pane reports back up (null = not a git repo → hide it).
  const [changesToken, setChangesToken] = useState(0);
  const [changeCount, setChangeCount] = useState<number | null>(null);
  const bumpChanges = useCallback(() => setChangesToken((t) => t + 1), []);

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
      bumpChanges();
      if (result.failed.length > 0) {
        setError(
          `${result.failed.length} of ${ids.length} items could not be updated: ` +
            result.failed.map((f) => `${f.id} (${f.error})`).join(", "),
        );
      }
      if (result.failed.length === 0 && result.skipped > 0) {
        setError(
          `${result.ok} updated, ${result.skipped} already ${status} (left unchanged so the ` +
            `original date is preserved).`,
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
        <span className="counts">
          content/ · {items.length} items
          {changeCount !== null && changeCount > 0 && <> · {changeCount} uncommitted</>}
        </span>
        <button type="button" onClick={() => setShowDefaults(true)}>
          Defaults
        </button>
        <button type="button" onClick={() => setShowNewItem(true)}>
          New item
        </button>
        <SyncBar
          onFinished={() => {
            void refresh();
            bumpChanges();
          }}
        />
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
      <PublishPane refreshToken={changesToken} onChanges={setChangeCount} />
      <BulkToolbar
        count={selectedIds.size}
        busy={busy}
        onApply={(status) => void apply(status)}
        onClear={() => setSelectedIds(new Set())}
      />
      {openItemId !== null && (() => {
        const openItem = items.find((i) => i.id === openItemId);
        return openItem === undefined ? null : (
          <Drawer
            key={openItem.id}
            item={openItem}
            onClose={() => setOpenItemId(null)}
            onChanged={() => {
              // A bulk stamp from inside the drawer (or any item write) is an
              // uncommitted change too — the count must move with it.
              void refresh();
              bumpChanges();
            }}
          />
        );
      })()}
      {showNewItem && (
        <NewItemDialog
          categories={[...new Set(items.map((i) => i.categorySlug))].sort()}
          onCancel={() => setShowNewItem(false)}
          onCreated={(id) => {
            setShowNewItem(false);
            // Refresh first so the drawer has a row to open for the new item,
            // then land the seller straight in its editor.
            void refresh().then(() => setOpenItemId(id));
            bumpChanges();
          }}
        />
      )}
      {showDefaults && (
        <DefaultsPane
          categories={[...new Set(items.map((i) => i.categorySlug))].sort()}
          onClose={() => setShowDefaults(false)}
          onSaved={bumpChanges}
        />
      )}
    </>
  );
}
