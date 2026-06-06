"use client";

export type SortKey = "date-desc" | "price-asc" | "price-desc" | "condition-asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date-desc", label: "Newest first" },
  { value: "price-asc", label: "Price: low → high" },
  { value: "price-desc", label: "Price: high → low" },
  { value: "condition-asc", label: "Condition: best first" },
];

type SortSelectProps = {
  value: SortKey;
  onChange: (value: SortKey) => void;
};

export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="sort-select"
        className="whitespace-nowrap text-xs text-white/50"
      >
        Sort by
      </label>
      <select
        id="sort-select"
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
