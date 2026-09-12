// Shared headless-Chromium launcher for every Studio feature that needs
// one (the catalog PDF export, and the URL-import headless-render
// fallback) — one Playwright dependency, one Chromium install, one
// lazy-import/friendly-error pattern instead of two. See
// docs/superpowers/specs/2026-09-08-studio-url-import-reliability-design.md §6.2/§7.

// Type-only: erased at compile time, so this does NOT make the
// `playwright` package a runtime dependency of this module — see
// launchChromiumOrError below for why that matters.
import type { Browser } from "playwright";

export type { Browser };

/**
 * Launches a fresh headless Chromium instance, or a friendly error if the
 * `playwright` package or its Chromium binary isn't installed. Stateless:
 * every call launches a brand-new browser. Callers that need to reuse one
 * browser across multiple operations (PDF export's own multi-render
 * passes; the URL-import headless fallback's warm-instance cache) are
 * responsible for holding onto the returned `Browser` and closing it.
 *
 * Dynamic import, not a static one: some callers load this module at
 * Studio boot time and must not crash on a site that skipped the optional
 * Chromium download. Missing *package* and missing Chromium *binary* both
 * land in this same catch and produce the same friendly typed error.
 */
export async function launchChromiumOrError(): Promise<{ browser: Browser } | { error: string }> {
  try {
    const { chromium } = await import("playwright");
    return { browser: await chromium.launch() };
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }
}
