"use client";

import { useId } from "react";
import { useT } from "@/components/i18n/useT";

export type SortKey = "date-desc" | "price-asc" | "price-desc" | "condition-asc";

type SortSelectProps = {
  value: SortKey;
  onChange: (value: SortKey) => void;
};

export function SortSelect({ value, onChange }: SortSelectProps) {
  const id = useId();
  const t = useT();

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: "date-desc", label: t.sortNewestFirst },
    { value: "price-asc", label: t.sortPriceLow },
    { value: "price-desc", label: t.sortPriceHigh },
    { value: "condition-asc", label: t.sortConditionBest },
  ];

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="whitespace-nowrap text-xs text-foreground/50"
      >
        {t.sortBy}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="rounded-md border-0 bg-foreground/5 px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface text-foreground">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
