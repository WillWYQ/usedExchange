import type { Condition } from "@/lib/content/types";
import { clsx } from "clsx";

// Text label is always rendered — colour alone is never the sole differentiator (a11y).
const CONDITION_CONFIG: Record<Condition, { label: string; classes: string }> = {
  new: {
    label: "New",
    classes: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
  },
  "like-new": {
    label: "Like New",
    classes: "bg-cyan-500/20 text-cyan-300 ring-cyan-500/30",
  },
  good: {
    label: "Good",
    classes: "bg-blue-500/20 text-blue-300 ring-blue-500/30",
  },
  fair: {
    label: "Fair",
    classes: "bg-orange-500/20 text-orange-300 ring-orange-500/30",
  },
  "for-parts": {
    label: "For Parts",
    classes: "bg-red-500/20 text-red-300 ring-red-500/30",
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
