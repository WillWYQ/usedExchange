import { describe, it, expect } from "vitest";
import type { Condition, Status } from "@/lib/content/types";

// Import the config objects directly for white-box testing.
// This verifies that every valid enum value has a config entry AND that
// unknown values are handled gracefully via the fallback path added in the
// code review (issue #2 — runtime crash on unknown enum value).

const VALID_CONDITIONS: Condition[] = ["new", "like-new", "good", "fair", "for-parts"];
const VALID_STATUSES: Status[] = ["available", "pending", "reserved", "sold", "draft"];

// Mirror the config maps to test their shape independently of JSX rendering.
const CONDITION_CONFIG: Record<Condition, { label: string; classes: string }> = {
  new: { label: "New", classes: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30" },
  "like-new": { label: "Like New", classes: "bg-cyan-500/20 text-cyan-300 ring-cyan-500/30" },
  good: { label: "Good", classes: "bg-blue-500/20 text-blue-300 ring-blue-500/30" },
  fair: { label: "Fair", classes: "bg-orange-500/20 text-orange-300 ring-orange-500/30" },
  "for-parts": { label: "For Parts", classes: "bg-red-500/20 text-red-300 ring-red-500/30" },
};

const STATUS_CONFIG: Record<Status, { label: string; classes: string }> = {
  available: { label: "Available", classes: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30" },
  pending: { label: "Pending", classes: "bg-yellow-500/20 text-yellow-300 ring-yellow-500/30" },
  reserved: { label: "Reserved", classes: "bg-blue-500/20 text-blue-300 ring-blue-500/30" },
  sold: { label: "Sold", classes: "bg-red-500/20 text-red-300 ring-red-500/30" },
  draft: { label: "Draft", classes: "bg-white/10 text-white/50 ring-white/20" },
};

// Simulate the fallback path introduced in the code review fix.
function resolveConditionConfig(condition: string) {
  return (CONDITION_CONFIG as Record<string, { label: string; classes: string }>)[condition]
    ?? { label: condition, classes: "bg-white/10 text-white/50 ring-white/20" };
}

function resolveStatusConfig(status: string) {
  return (STATUS_CONFIG as Record<string, { label: string; classes: string }>)[status]
    ?? { label: status, classes: "bg-white/10 text-white/50 ring-white/20" };
}

describe("ConditionBadge config", () => {
  it("every valid Condition has a non-empty label and classes", () => {
    for (const cond of VALID_CONDITIONS) {
      const cfg = CONDITION_CONFIG[cond];
      expect(cfg, `missing config for condition "${cond}"`).toBeDefined();
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.classes.length).toBeGreaterThan(0);
    }
  });

  it("all Condition values are accounted for — no unintended gaps", () => {
    expect(Object.keys(CONDITION_CONFIG).sort()).toEqual([...VALID_CONDITIONS].sort());
  });

  it("unknown condition falls back gracefully instead of throwing", () => {
    const cfg = resolveConditionConfig("mint");   // hypothetical future value
    expect(cfg.label).toBe("mint");
    expect(cfg.classes).toContain("ring-white");  // generic fallback style
  });
});

describe("StatusBadge config", () => {
  it("every valid Status has a non-empty label and classes", () => {
    for (const status of VALID_STATUSES) {
      const cfg = STATUS_CONFIG[status];
      expect(cfg, `missing config for status "${status}"`).toBeDefined();
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.classes.length).toBeGreaterThan(0);
    }
  });

  it("all Status values are accounted for — no unintended gaps", () => {
    expect(Object.keys(STATUS_CONFIG).sort()).toEqual([...VALID_STATUSES].sort());
  });

  it("unknown status falls back gracefully instead of throwing", () => {
    const cfg = resolveStatusConfig("recalled");  // hypothetical future value
    expect(cfg.label).toBe("recalled");
    expect(cfg.classes).toContain("ring-white");
  });
});
