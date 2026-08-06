// Usage: pnpm setup-check
//
// Named setup-check, not doctor: `pnpm doctor` is a pnpm builtin that would
// shadow this script entirely — `pnpm doctor` silently runs pnpm's own
// environment check and never reaches package.json.
//
// Prints the setup checklist: what a site is still missing and where to go for
// each step. The same checklist studio shows in its Getting started panel —
// both read scripts/lib/siteReadiness.ts, so the two can never disagree.
//
// Exit code: 0 once every core step is done, 1 while any remains. It is a
// readiness check, so a non-zero exit can gate a script; it is deliberately not
// wired into prebuild, so it never blocks a build.

import {
  buildReadinessReport,
  type ReadinessAction,
  type ReadinessItem,
  type ReadinessConfig,
} from "./lib/siteReadiness";

/** The next step, rendered for a terminal reader. */
function actionLine(action: ReadinessAction): string {
  switch (action.kind) {
    case "command":
      return `→ Run: ${action.command}`;
    case "docs":
      return `→ See: ${action.doc}`;
    case "pane":
      return "→ In Studio: open the Config pane";
    case "studio":
      return "→ In Studio: use New item";
  }
}

const TITLE_WIDTH = 24;

function printItem(item: ReadinessItem): void {
  // The glyph never carries the meaning alone — the title and detail always
  // spell out the state in words.
  const glyph = item.done ? "✓" : "○";
  console.log(`  ${glyph} ${item.title.padEnd(TITLE_WIDTH)} ${item.detail}`);
  if (!item.done && item.action !== undefined) {
    console.log(`      ${actionLine(item.action)}`);
  }
}

async function loadConfig(): Promise<ReadinessConfig | null> {
  try {
    const mod = await import("@/content/config");
    return mod.siteConfig;
  } catch {
    // A config with a syntax error, a bad import, or a shape that no longer
    // matches: report that as the finding rather than crashing. This path is
    // exactly why buildReadinessReport accepts `config: ReadinessConfig | null`.
    return null;
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const report = await buildReadinessReport(process.cwd(), config, process.env);

  const core = report.items.filter((i) => i.tier === 1);
  const advanced = report.items.filter((i) => i.tier === 2);

  console.log("\nUsedExchange setup check\n");
  console.log(`Core — ${report.tier1Done} of ${report.tier1Total} done\n`);
  for (const item of core) printItem(item);

  if (advanced.length > 0) {
    console.log("\nAdvanced — optional\n");
    for (const item of advanced) printItem(item);
  }

  console.log("\nRun `pnpm studio` for the browser version of this checklist.\n");

  process.exit(report.allTier1Done ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
