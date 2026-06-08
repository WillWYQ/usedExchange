"use client";

import { useState, useEffect, useRef } from "react";
import { IconHelpCircle, IconX } from "@tabler/icons-react";

const CONDITIONS = [
  {
    label: "New",
    desc: "Unopened, unused. Original packaging intact.",
  },
  {
    label: "Like New",
    desc: "Used briefly. No visible wear. May be without original box.",
  },
  {
    label: "Good",
    desc: "Normal signs of use. Fully functional. Minor cosmetic marks.",
  },
  {
    label: "Fair",
    desc: "Visible wear or light damage. Works as expected.",
  },
  {
    label: "For Parts",
    desc: "Not fully functional. Sold as-is for repair or parts.",
  },
];

// Opens a tooltip/modal explaining each condition value.
// Closes on Escape; keyboard accessible.
export function ConditionGuide() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        e.target !== buttonRef.current
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Condition guide"
        aria-expanded={open}
        className="inline-flex items-center text-foreground/40 transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
      >
        <IconHelpCircle size={15} />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Condition guide"
          className="absolute left-0 top-7 z-50 w-64 rounded-xl border-0 bg-surface p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground/70">
              Condition Guide
            </span>
            <button
              onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
              aria-label="Close"
              className="rounded p-0.5 text-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
            >
              <IconX size={14} />
            </button>
          </div>

          <dl className="flex flex-col gap-2">
            {CONDITIONS.map(({ label, desc }) => (
              <div key={label}>
                <dt className="text-xs font-medium text-foreground/80">{label}</dt>
                <dd className="text-xs text-foreground/50">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </span>
  );
}
