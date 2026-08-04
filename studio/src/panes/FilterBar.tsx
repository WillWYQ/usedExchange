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
}: {
  filters: Filters;
  counts: Record<StatusFilter, number>;
  categories: string[];
  resultCount: number;
  onChange: (next: Filters) => void;
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
          onChange={(e) => {
            const query = e.target.value;
            // "Best match" only means something while a query is running, so
            // typing switches to it and clearing the box switches away — but
            // only when the seller had not picked a sort of their own, which
            // must survive the search that follows it.
            let sort: SortKey = filters.sort;
            if (query.trim() !== "" && filters.sort === "relevance") sort = "relevance";
            if (query.trim() === "" && filters.sort === "relevance") sort = "date-desc";
            onChange({ ...filters, query, sort });
          }}
        />

        <label className="filter-field">
          <span className="filter-label">Category</span>
          <select
            value={filters.category}
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
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
          >
            {searching && <option value="relevance">Best match</option>}
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
