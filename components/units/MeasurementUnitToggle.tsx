"use client";

import { useEffect, useState } from "react";
import { useMeasurementUnit } from "./useMeasurementUnit";

// Renders a "cm / in" pill toggle that lets visitors switch between metric and
// imperial. Returns a placeholder while unmounted to avoid a hydration mismatch
// (the resolved unit is only known client-side after localStorage is read).
export function MeasurementUnitToggle() {
  const { unit, setUnit } = useMeasurementUnit();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className="block h-10 w-[4.5rem]" aria-hidden="true" />;
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Unit system">
      {(["metric", "imperial"] as const).map((sys) => (
        <button
          key={sys}
          type="button"
          onClick={() => setUnit(sys)}
          aria-pressed={unit === sys}
          className={[
            "flex h-10 min-w-10 items-center justify-center rounded-lg px-2.5 text-xs font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            unit === sys
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground",
          ].join(" ")}
        >
          {sys === "metric" ? "cm" : "in"}
        </button>
      ))}
    </div>
  );
}
