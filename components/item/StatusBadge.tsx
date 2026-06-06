import type { Status } from "@/lib/content/types";
import { clsx } from "clsx";

// Text label is always rendered — colour alone is never the sole differentiator (a11y).
const STATUS_CONFIG: Record<Status, { label: string; classes: string }> = {
  available: {
    label: "Available",
    classes: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
  },
  pending: {
    label: "Pending",
    classes: "bg-yellow-500/20 text-yellow-300 ring-yellow-500/30",
  },
  reserved: {
    label: "Reserved",
    classes: "bg-blue-500/20 text-blue-300 ring-blue-500/30",
  },
  sold: {
    label: "Sold",
    classes: "bg-red-500/20 text-red-300 ring-red-500/30",
  },
  draft: {
    label: "Draft",
    classes: "bg-white/10 text-white/50 ring-white/20",
  },
};

type StatusBadgeProps = {
  status: Status;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    classes: "bg-white/10 text-white/50 ring-white/20",
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
