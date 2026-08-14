import { IconLayoutGrid, IconList } from "@tabler/icons-react";
import type { Filters, SortKey, StatusFilter } from "../filtering";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

// Order matters: the working set first, then the individual states in the
// order an item moves through them, with the archive and the escape hatch last.
// Labels come from the i18n dictionary: `filter.status.${key}`.
const TABS: Array<{ key: StatusFilter }> = [
  { key: "active" },
  { key: "available" },
  { key: "reserved" },
  { key: "pending" },
  { key: "draft" },
  { key: "sold" },
  { key: "all" },
];

const SORTS: Array<{ key: SortKey; labelKey: StudioKey }> = [
  { key: "name-asc", labelKey: "filter.sort.nameAsc" },
  { key: "price-asc", labelKey: "filter.sort.priceAsc" },
  { key: "price-desc", labelKey: "filter.sort.priceDesc" },
  { key: "date-desc", labelKey: "filter.sort.newest" },
  { key: "date-asc", labelKey: "filter.sort.oldest" },
];

export function FilterBar({
  filters,
  counts,
  categories,
  resultCount,
  onChange,
  busy,
  viewMode,
  onViewModeChange,
  allSelected,
  onToggleAll,
}: {
  filters: Filters;
  counts: Record<StatusFilter, number>;
  categories: string[];
  resultCount: number;
  onChange: (next: Filters) => void;
  // While a bulk action is in flight, a filter change would be cleared by
  // changeFilters and then resurrected by the request's post-await writes
  // (setSelectedIds/setExemptIds), letting a later action reach rows the
  // seller can no longer see. Disabling input here is the simple guard.
  busy?: boolean;
  viewMode: "table" | "cards";
  onViewModeChange: (mode: "table" | "cards") => void;
  // Table view already has a select-all checkbox in its own header row;
  // this one is what makes bulk selection possible in cards view too,
  // where there's no shared header row to put a checkbox in.
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
}) {
  const { t } = useStudioT();
  const searching = filters.query.trim() !== "";

  return (
    <section className="filter-bar" aria-label={t("filter.ariaLabel")}>
      <div className="filter-tabs" role="tablist" aria-label={t("filter.statusAria")}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filters.status === tab.key}
            className={filters.status === tab.key ? "tab tab-active" : "tab"}
            disabled={busy}
            onClick={() => onChange({ ...filters, status: tab.key })}
          >
            {t(`filter.status.${tab.key}`)} <span className="tab-count">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div className="filter-controls">
        <input
          type="search"
          className="filter-search"
          value={filters.query}
          aria-label={t("filter.search.ariaLabel")}
          placeholder={t("filter.search.placeholder")}
          disabled={busy}
          // Typing never rewrites the sort. "relevance" is the automatic
          // setting — it means "best match" while a query runs and "the order
          // the loader gave us" when none does — so a search already gets
          // ranked results without touching this field, and a seller who
          // picked a real sort keeps it across every later search.
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />

        <label className="filter-field">
          <span className="filter-label">{t("filter.category.label")}</span>
          <select
            value={filters.category}
            disabled={busy}
            onChange={(e) => onChange({ ...filters, category: e.target.value })}
          >
            <option value="all">{t("filter.category.all")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span className="filter-label">{t("filter.sort.label")}</span>
          <select
            value={filters.sort}
            disabled={busy}
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
          >
            {/* Always rendered so `value="relevance"` always has a matching
                option — it is the default sort. Only the label changes: with a
                query it ranks by match quality, without one it is the order
                the item list arrived in. */}
            <option value="relevance">
              {searching ? t("filter.sort.bestMatch") : t("filter.sort.default")}
            </option>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </label>

        {viewMode === "cards" && (
          <label className="filter-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={busy || resultCount === 0}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label={t("itemList.selectAll")}
            />
            <span className="filter-label">{t("filter.selectAll")}</span>
          </label>
        )}

        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={
              viewMode === "table" ? "view-toggle-btn view-toggle-active" : "view-toggle-btn"
            }
            aria-pressed={viewMode === "table"}
            aria-label={t("filter.viewModeTable")}
            onClick={() => onViewModeChange("table")}
          >
            <IconList size={18} />
          </button>
          <button
            type="button"
            className={
              viewMode === "cards" ? "view-toggle-btn view-toggle-active" : "view-toggle-btn"
            }
            aria-pressed={viewMode === "cards"}
            aria-label={t("filter.viewModeCards")}
            onClick={() => onViewModeChange("cards")}
          >
            <IconLayoutGrid size={18} />
          </button>
        </div>

        <span className="filter-count" role="status">
          {t(resultCount === 1 ? "filter.itemCount" : "filter.itemCount.plural", {
            count: resultCount,
          })}
        </span>
      </div>
    </section>
  );
}
