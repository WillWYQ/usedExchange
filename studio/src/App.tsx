import { useCallback, useEffect, useMemo, useState } from "react";
import { applyDefaultTiers, bulkStatus, fetchCategories, fetchItems, type StudioItem } from "./api";
import {
  applyFiltersWithExemptions,
  countByStatus,
  DEFAULT_FILTERS,
  type Filters,
} from "./filtering";
import { Button } from "./components/Button";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { ThemeToggle } from "./components/ThemeToggle";
import { StudioI18nProvider, useStudioT } from "./i18n/StudioI18n";
import { BulkToolbar } from "./panes/BulkToolbar";
import { CategoriesPane } from "./panes/CategoriesPane";
import { ConfigPane } from "./panes/ConfigPane";
import { DefaultsPane } from "./panes/DefaultsPane";
import { Drawer } from "./panes/Drawer";
import { ExportPdfDialog } from "./panes/ExportPdfDialog";
import { GettingStarted } from "./panes/GettingStarted";
import { FilterBar } from "./panes/FilterBar";
import { ItemGrid } from "./panes/ItemGrid";
import { ItemList } from "./panes/ItemList";
import { NewItemDialog } from "./panes/NewItemDialog";
import { PublishPane } from "./panes/PublishPane";
import { SyncBar } from "./panes/SyncBar";

const VIEW_MODE_KEY = "usedexchange-studio-view-mode";
const LOCALE_KEY = "usedexchange-studio-locale";

function readViewMode(): "table" | "cards" {
  const raw = localStorage.getItem(VIEW_MODE_KEY);
  return raw === "cards" ? "cards" : "table";
}

function readDisplayLocale(defaultLocale: string): string {
  return localStorage.getItem(LOCALE_KEY) ?? defaultLocale;
}

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [availableLocales, setAvailableLocales] = useState<string[]>(["en"]);
  const [displayLocale, setDisplayLocale] = useState<string>(() => readDisplayLocale("en"));
  // Seller overrides for the built-in Studio dictionaries, loaded with the
  // items. Empty = the built-in EN/… dictionaries stand unchanged.
  const [studioTranslations, setStudioTranslations] = useState<
    Record<string, Record<string, string>>
  >({});
  // Sourced from the category folders themselves, not from items: a category
  // created with zero items must still be selectable and filterable
  // everywhere the seller can pick a category.
  const [categorySlugs, setCategorySlugs] = useState<string[]>([]);

  // Studio keeps no local copy of item state: after any write it re-reads the
  // full list, so the table can never drift from what is on disk.
  //
  // Deliberately has no dependency on displayLocale: if it did, changing the
  // display language would recreate this callback and re-trigger the mount
  // effect below, re-reading every item.json from disk on every language
  // switch. The functional setDisplayLocale update below corrects an
  // invalidated locale without refresh needing to know the current one.
  const refresh = useCallback(async () => {
    const [{ items, defaultLocale, availableLocales: al, studioTranslations: st }, categories] =
      await Promise.all([fetchItems(), fetchCategories()]);
    setItems(items);
    setAvailableLocales(al);
    setStudioTranslations(st);
    setDisplayLocale((prev) => (al.includes(prev) ? prev : defaultLocale));
    setCategorySlugs(categories.map((c) => c.slug).sort());
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, displayLocale);
  }, [displayLocale]);

  // A component cannot consume context from a provider it renders itself, so
  // App owns the data the provider needs (locale + overrides) and the chrome
  // that calls useStudioT() lives one level down in StudioChrome.
  return (
    <StudioI18nProvider locale={displayLocale} overrides={studioTranslations}>
      <StudioChrome
        items={items}
        error={error}
        setError={setError}
        availableLocales={availableLocales}
        displayLocale={displayLocale}
        setDisplayLocale={setDisplayLocale}
        refresh={refresh}
        categorySlugs={categorySlugs}
      />
    </StudioI18nProvider>
  );
}

function StudioChrome({
  items,
  error,
  setError,
  availableLocales,
  displayLocale,
  setDisplayLocale,
  refresh,
  categorySlugs,
}: {
  items: StudioItem[];
  error: string | null;
  setError: (error: string | null) => void;
  availableLocales: string[];
  displayLocale: string;
  setDisplayLocale: (locale: string) => void;
  refresh: () => Promise<void>;
  categorySlugs: string[];
}) {
  const { t } = useStudioT();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [justStampedIds, setJustStampedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showExportPdf, setShowExportPdf] = useState(false);
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
  const bumpChanges = useCallback(() => setChangesToken((token) => token + 1), []);
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => readViewMode());

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const counts = useMemo(() => countByStatus(items), [items]);

  const categories = categorySlugs;

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

  async function applyTiers() {
    const ids = [...selectedIds];
    setBusy(true);
    setError(null);
    try {
      const result = await applyDefaultTiers(ids);
      const failed = new Set(result.failed.map((f) => f.id));
      setFailedIds(failed);
      // Failed rows stay selected so the seller can retry them directly.
      setSelectedIds(failed);
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
          `${result.ok} updated, ${result.skipped} skipped (no default tiers for their ` +
            `category, or already matching).`,
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
        <h1>{t("app.title")}</h1>
        <span className="counts">
          {t("app.itemCount", { count: items.length })}
          {changeCount !== null && changeCount > 0 && (
            <> · {t("app.uncommitted", { count: changeCount })}</>
          )}
        </span>
        <div className="head-actions">
          <LocaleSwitcher
            availableLocales={availableLocales}
            value={displayLocale}
            onChange={setDisplayLocale}
          />
          <ThemeToggle />
          <SyncBar
            onFinished={() => {
              void refresh();
              bumpChanges();
            }}
          />
          <Button onClick={() => setShowConfig(true)}>
            {t("header.config")}
          </Button>
          <Button onClick={() => setShowGuide((v) => !v)}>
            {t("header.setup")}
          </Button>
          <Button onClick={() => setShowDefaults(true)}>
            {t("header.defaults")}
          </Button>
          <Button onClick={() => setShowCategories(true)}>
            {t("header.categories")}
          </Button>
          <Button onClick={() => setShowExportPdf(true)}>
            {t("header.exportPdf")}
          </Button>
          <Button variant="primary" onClick={() => setShowNewItem(true)}>
            {t("header.newItem")}
          </Button>
        </div>
      </header>
      <PublishPane refreshToken={changesToken} onChanges={setChangeCount} />
      {error !== null && (
        <p role="alert" className="alert-error page-error">
          {error}
        </p>
      )}
      {error === null && items.length === 0 && (
        <div className="empty-state">
          <p>{t("emptyState.noItems")}</p>
          <p>
            {t("emptyState.useNewItem")}
            <strong>New item</strong>
            {t("emptyState.useNewItemSuffix")}
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
          allSelected={
            visibleItems.length > 0 && visibleItems.every((i) => selectedIds.has(i.id))
          }
          onToggleAll={toggleAll}
        />
      )}
      {items.length > 0 && visibleItems.length === 0 && (
        <div className="empty-state">
          <p>{t("emptyState.noMatch")}</p>
          <Button onClick={() => changeFilters(DEFAULT_FILTERS)}>
            {t("emptyState.clearFilters")}
          </Button>
        </div>
      )}
      {visibleItems.length > 0 && viewMode === "table" && (
        <ItemList
          items={visibleItems}
          selectedIds={selectedIds}
          failedIds={failedIds}
          justStampedIds={justStampedIds}
          displayLocale={displayLocale}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onOpen={setOpenItemId}
        />
      )}
      {visibleItems.length > 0 && viewMode === "cards" && (
        <ItemGrid
          items={visibleItems}
          selectedIds={selectedIds}
          displayLocale={displayLocale}
          onToggle={toggle}
          onOpen={setOpenItemId}
        />
      )}
      <BulkToolbar
        count={selectedIds.size}
        busy={busy}
        onApply={(status) => void apply(status)}
        onApplyTiers={() => void applyTiers()}
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
          onCategoryCreated={() => {
            setShowNewItem(false);
            void refresh();
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
      {showCategories && (
        <CategoriesPane
          onClose={() => setShowCategories(false)}
          onSaved={() => {
            void refresh();
          }}
        />
      )}
      {showExportPdf && <ExportPdfDialog items={items} onClose={() => setShowExportPdf(false)} />}
    </>
  );
}
