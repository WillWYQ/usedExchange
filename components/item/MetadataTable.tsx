"use client";

import type { Item } from "@/lib/content/types";
import { useT } from "@/components/i18n/useT";

type MetadataTableProps = {
  item: Item;
};

type Row = {
  label: string;
  value: string | null;
  href?: string; // renders as an external link when set
};

function formatDimensions(item: Item): string | null {
  if (!item.dimensions) return null;
  const { length, width, height, unit } = item.dimensions;
  return `${length} × ${width} × ${height} ${unit}`;
}

function formatWeight(item: Item): string | null {
  if (!item.weight) return null;
  return `${item.weight.value} ${item.weight.unit}`;
}

export function MetadataTable({ item }: MetadataTableProps) {
  const t = useT();
  const rows: Row[] = [
    { label: t.brand, value: item.brand || null },
    { label: t.model, value: item.model || null },
    {
      label: t.age,
      value:
        item.ageYears != null
          ? `~${item.ageYears} year${item.ageYears !== 1 ? "s" : ""}`
          : null,
    },
    { label: t.color, value: item.color || null },
    { label: t.dimensions, value: formatDimensions(item) },
    { label: t.weight, value: formatWeight(item) },
    {
      label: t.originalSource,
      value: item.originalSource || null,
      href: item.originalLink || undefined,
    },
    {
      label: t.originalPrice,
      value:
        item.originalPrice != null
          ? `$${item.originalPrice.toFixed(2)}`
          : null,
    },
  ];

  const visibleRows = rows.filter((r): r is Row & { value: string } => r.value !== null);
  if (visibleRows.length === 0) return null;

  return (
    <dl className="divide-y divide-foreground/10">
      {visibleRows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
        >
          <dt className="shrink-0 text-foreground/50">{row.label}</dt>
          <dd className="text-right text-foreground/90">
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              >
                {row.value}
              </a>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
