import type { Status } from "@/lib/content/types";
import { clsx } from "clsx";

// Text label is always rendered — colour alone is never the sole differentiator (a11y).
const STATUS_CONFIG: Record<Status, { label: string; classes: string }> = {
  available: {
    label: "Available",
    classes: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  pending: {
    label: "Pending",
    classes: "bg-yellow-500/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-300",
  },
  reserved: {
    label: "Reserved",
    classes: "bg-accent/15 text-accent ring-accent/30",
  },
  sold: {
    label: "Sold",
    classes: "bg-accent-soft/20 text-[#a8584a] ring-accent-soft/40 dark:text-accent-soft",
  },
  draft: {
    label: "Draft",
    classes: "bg-foreground/10 text-foreground/50 ring-foreground/20",
  },
};

type StatusBadgeProps = {
  status: Status;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
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
