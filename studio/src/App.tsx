import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkStatus, fetchItems, type StudioItem } from "./api";
import {
  applyFiltersWithExemptions,
  countByStatus,
  DEFAULT_FILTERS,
  type Filters,
} from "./filtering";
import { Button } from "./components/Button";
import { ThemeToggle } from "./components/ThemeToggle";
import { BulkToolbar } from "./panes/BulkToolbar";
import { ConfigPane } from "./panes/ConfigPane";
import { DefaultsPane } from "./panes/DefaultsPane";
import { Drawer } from "./panes/Drawer";
import { GettingStarted } from "./panes/GettingStarted";
import { FilterBar } from "./panes/FilterBar";
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
  const [showConfig, setShowConfig] = useState(false);
  // The checklist opens itself once, the first time a site reports as not
  // ready; after that it is the seller's to open and close from the header.
  const [showGuide, setShowGuide] = useState(false);
  const [guideAutoOpened, setGuideAutoOpened] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Rows the seller just acted on stay visible even when the change filters
  // them out (marking sold in the Active view). Otherwise the row vanishes
  // mid-animation and the only feedback for the action disappears with it.
  const [exemptIds, setExemptIds] = useState<Set<string>>(new Set());
  // Bumped after every item write and every sync so the publish pane re-reads
  // the working tree. The pane holds the file list; the header needs only the
  // count, which the pane reports back up (null = not a git repo → hide it).
  const [changesToken, setChangesToken] = useState(0);
  const [changeCount, setChangeCount] = useState<number | null>(null);
  const bumpChanges = useCallback(() => setChangesToken((t) => t + 1), []);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Studio keeps no local copy of item state: after any write it re-reads the
  // full list, so the table can never drift from what is on disk.
  const refresh = useCallback(async () => {
    setItems((await fetchItems()).items);
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  const counts = useMemo(() => countByStatus(items), [items]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.categorySlug))].sort(),
    [items],
  );

  const visibleItems = useMemo(
    () => applyFiltersWithExemptions(items, filters, exemptIds),
    [items, filters, exemptIds],
  );

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
      setSelectedIds(checked ? new Set(visibleItems.map((i) => i.id)) : new Set());
    },
    [visibleItems],
  );

  // Changing what is on screen invalidates a selection made against the old
  // view: a bulk action must never reach a row the seller can no longer see.
  const changeFilters = useCallback((next: Filters) => {
    setFilters(next);
    setSelectedIds(new Set());
    setExemptIds(new Set());
    setFailedIds(new Set());
  }, []);

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
      // Every row that actually changed keeps its place in the table until the
      // next filter change, whatever the new status is. Accumulated, not
      // replaced: two bulk actions in a row without an intervening filter
      // change must not make the first batch's rows disappear.
      setExemptIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) if (!failed.has(id)) next.add(id);
        return next;
      });
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
        <div className="head-actions">
          <ThemeToggle />
          <SyncBar
            onFinished={() => {
              void refresh();
              bumpChanges();
            }}
          />
          <Button onClick={() => setShowConfig(true)}>
            Config
          </Button>
          <Button onClick={() => setShowGuide((v) => !v)}>
            Setup
          </Button>
          <Button onClick={() => setShowDefaults(true)}>
            Defaults
          </Button>
          <Button variant="primary" onClick={() => setShowNewItem(true)}>
            New item
          </Button>
        </div>
      </header>
      {error !== null && (
        <p role="alert" className="alert-error page-error">
          {error}
        </p>
      )}
      {error === null && items.length === 0 && (
        <div className="empty-state">
          <p>No items yet.</p>
          <p>
            Use <strong>New item</strong> in the header to create your first listing.
          </p>
        </div>
      )}
      <GettingStarted
        open={showGuide}
        onToggle={() => setShowGuide((v) => !v)}
        onOpenConfig={() => setShowDefaults(true)}
        onNewItem={() => setShowNewItem(true)}
        onReport={(report) => {
          if (!guideAutoOpened && !report.allTier1Done) {
            setShowGuide(true);
            setGuideAutoOpened(true);
          }
        }}
      />
      {items.length > 0 && (
        <FilterBar
          filters={filters}
          counts={counts}
          categories={categories}
          resultCount={visibleItems.length}
          onChange={changeFilters}
          busy={busy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}
      {items.length > 0 && visibleItems.length === 0 && (
        <div className="empty-state">
          <p>No items match your filters.</p>
          <Button onClick={() => changeFilters(DEFAULT_FILTERS)}>Clear filters</Button>
        </div>
      )}
      {visibleItems.length > 0 && (
        <ItemList
          items={visibleItems}
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
          categories={categories}
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
          categories={categories}
          onClose={() => setShowDefaults(false)}
          onSaved={bumpChanges}
        />
      )}
      {showConfig && <ConfigPane onClose={() => setShowConfig(false)} />}
    </>
  );
}
