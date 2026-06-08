type QuantityBadgeProps = {
  quantity: number;
};

// Renders nothing when quantity is 1 (the default, not noteworthy).
export function QuantityBadge({ quantity }: QuantityBadgeProps) {
  if (quantity <= 1) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-500/30 dark:text-violet-300">
      {quantity} available
    </span>
  );
}
