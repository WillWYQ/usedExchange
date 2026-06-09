"use client";

import type { Condition } from "@/lib/content/types";
import { clsx } from "clsx";
import { useT } from "@/components/i18n/useT";

// Colour classes are locale-independent; labels come from useT().
const CONDITION_CLASSES: Record<Condition, string> = {
  new: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  "like-new": "bg-cyan-500/15 text-cyan-700 ring-cyan-500/30 dark:text-cyan-300",
  good: "bg-accent/15 text-accent ring-accent/30",
  fair: "bg-orange-500/15 text-orange-700 ring-orange-500/30 dark:text-orange-300",
  "for-parts": "bg-accent-soft/20 text-[#a8584a] ring-accent-soft/40 dark:text-accent-soft",
};

type ConditionBadgeProps = {
  condition: Condition;
  className?: string;
};

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  const t = useT();
  const conditionLabels: Record<Condition, string> = {
    new: t.conditionNew,
    "like-new": t.conditionLikeNew,
    good: t.conditionGood,
    fair: t.conditionFair,
    "for-parts": t.conditionForParts,
  };
  const label = conditionLabels[condition] ?? condition;
  const classes =
    CONDITION_CLASSES[condition] ?? "bg-foreground/10 text-foreground/50 ring-foreground/20";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        classes,
        className,
      )}
    >
      {label}
    </span>
  );
}
