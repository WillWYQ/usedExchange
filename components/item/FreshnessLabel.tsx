"use client";

import { useState, useEffect } from "react";
import { formatRelativeDate } from "@/lib/utils/date";
import { useT } from "@/components/i18n/useT";

type FreshnessLabelProps = {
  listedDate: string; // ISO 8601
};

// Renders nothing server-side (useState(null) → null before hydration).
// On mount, computes the label against the visitor's live browser clock so the
// date is never stale from deploy time. See TECH_REQUIREMENTS.md §22.11.
export function FreshnessLabel({ listedDate }: FreshnessLabelProps) {
  const t = useT();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatRelativeDate(listedDate));
  }, [listedDate]);

  if (!label) return null;

  return (
    <span className="text-xs text-foreground/40">
      {t.listed} {label}
    </span>
  );
}
