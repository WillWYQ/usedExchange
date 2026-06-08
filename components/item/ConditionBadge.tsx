import type { Condition } from "@/lib/content/types";
import { clsx } from "clsx";

// Text label is always rendered — colour alone is never the sole differentiator (a11y).
const CONDITION_CONFIG: Record<Condition, { label: string; classes: string }> = {
  new: {
    label: "New",
    classes: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  "like-new": {
    label: "Like New",
    classes: "bg-cyan-500/15 text-cyan-700 ring-cyan-500/30 dark:text-cyan-300",
  },
  good: {
    label: "Good",
    classes: "bg-accent/15 text-accent ring-accent/30",
  },
  fair: {
    label: "Fair",
    classes: "bg-orange-500/15 text-orange-700 ring-orange-500/30 dark:text-orange-300",
  },
  "for-parts": {
    label: "For Parts",
    classes: "bg-accent-soft/20 text-[#a8584a] ring-accent-soft/40 dark:text-accent-soft",
  },
};

type ConditionBadgeProps = {
  condition: Condition;
  className?: string;
};

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  const config = CONDITION_CONFIG[condition] ?? {
    label: condition,
    classes: "bg-foreground/10 text-foreground/50 ring-foreground/20",
  };
  const { label, classes } = config;
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
