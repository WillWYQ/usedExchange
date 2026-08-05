import type { Filters, SortKey, StatusFilter } from "../filtering";

// Order matters: the working set first, then the individual states in the
// order an item moves through them, with the archive and the escape hatch last.
const TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "available", label: "Available" },
  { key: "reserved", label: "Reserved" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Draft" },
  { key: "sold", label: "Sold" },
  { key: "all", label: "All" },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "name-asc", label: "Name A–Z" },
  { key: "price-asc", label: "Price low–high" },
  { key: "price-desc", label: "Price high–low" },
  { key: "date-desc", label: "Newest" },
  { key: "date-asc", label: "Oldest" },
];

export function FilterBar({
  filters,
  counts,
  categories,
  resultCount,
  onChange,
  busy,
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
}) {
  const searching = filters.query.trim() !== "";

  return (
    <section className="filter-bar" aria-label="Filter items">
      <div className="filter-tabs" role="tablist" aria-label="Item status">
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
            {tab.label} <span className="tab-count">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      <div className="filter-controls">
        <input
          type="search"
          className="filter-search"
          value={filters.query}
          aria-label="Search items by name, category, or tag"
          placeholder="Search name, category, tags"
          disabled={busy}
          // Typing never rewrites the sort. "relevance" is the automatic
          // setting — it means "best match" while a query runs and "the order
          // the loader gave us" when none does — so a search already gets
          // ranked results without touching this field, and a seller who
          // picked a real sort keeps it across every later search.
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />

        <label className="filter-field">
          <span className="filter-label">Category</span>
          <select
            value={filters.category}
            disabled={busy}
            onChange={(e) => onChange({ ...filters, category: e.target.value })}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span className="filter-label">Sort</span>
          <select
            value={filters.sort}
            disabled={busy}
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
          >
            {/* Always rendered so `value="relevance"` always has a matching
                option — it is the default sort. Only the label changes: with a
                query it ranks by match quality, without one it is the order
                the item list arrived in. */}
            <option value="relevance">{searching ? "Best match" : "Default order"}</option>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <span className="filter-count" role="status">
          {resultCount} {resultCount === 1 ? "item" : "items"}
        </span>
      </div>
    </section>
  );
}
