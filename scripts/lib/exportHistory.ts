// scripts/lib/exportHistory.ts
// Reads and writes the export history file at exports/.export-history.json.
//
// Each call to `pnpm fb-export` that produces at least one CSV appends one
// ExportRun entry. The file is local machine state and is gitignored.

import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExportedItem = {
  /** Stable filesystem identity: "{categorySlug}/{itemSlug}" */
  slug: string;
  /** Display name at export time (stored for human-readable history view) */
  name: string;
  /** Resolved price at export time */
  price: number | null;
};

export type ExportRun = {
  /** ISO 8601 timestamp of this export run */
  exportedAt: string;
  /** Price strategy chosen by the user */
  priceStrategy: string;
  /** Total items exported in this run */
  itemCount: number;
  /** Relative paths to the CSV files written (e.g. ["exports/facebook-marketplace.csv"]) */
  files: string[];
  /** The items included in this run */
  items: ExportedItem[];
};

export type ExportHistory = {
  runs: ExportRun[];
};

// ── Paths ─────────────────────────────────────────────────────────────────────

const HISTORY_PATH = path.join(process.cwd(), "exports", ".export-history.json");

// ── Read ──────────────────────────────────────────────────────────────────────

/** Loads the history file. Returns { runs: [] } if the file does not exist yet. */
export async function loadHistory(): Promise<ExportHistory> {
  if (!existsSync(HISTORY_PATH)) return { runs: [] };
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as ExportHistory;
    // Defensive: ensure the shape is correct even if the file was hand-edited
    if (!Array.isArray(parsed?.runs)) return { runs: [] };
    return parsed;
  } catch {
    // Corrupted file — start fresh rather than crashing
    return { runs: [] };
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Returns the deduplicated set of item slugs that appear in ANY past run.
 * Used to pre-filter the item list when the user chooses to skip already-exported items.
 */
export function allExportedSlugs(history: ExportHistory): Set<string> {
  const slugs = new Set<string>();
  for (const run of history.runs) {
    for (const item of run.items) slugs.add(item.slug);
  }
  return slugs;
}

/** Returns the most recent run, or null when there are no past runs. */
export function lastRun(history: ExportHistory): ExportRun | null {
  return history.runs.length > 0 ? history.runs[history.runs.length - 1] : null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/** Appends a new run entry to the history file. Creates the file if absent. */
export async function appendRun(run: ExportRun): Promise<void> {
  const history = await loadHistory();
  history.runs.push(run);
  await fs.writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
}

// ── Formatting helpers (used by the CLI for display) ─────────────────────────

/** Formats an ISO timestamp as a short human-readable date+time string. */
export function formatRunDate(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}
