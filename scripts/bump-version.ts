// scripts/bump-version.ts
// Usage: pnpm bump
//
// Interactive CLI that bumps package.json version, commits, tags, pushes,
// and creates a GitHub release — matching the existing v{ver} — {title} format.
// Waits for CI to pass on the bump commit before tagging and releasing.

import fs from "fs/promises";
import path from "path";
import * as readline from "readline";
import { execSync } from "child_process";

const PKG_PATH = path.join(process.cwd(), "package.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (a) => resolve(a.trim())));
}

function section(title: string): void {
  const pad = Math.max(0, 46 - title.length);
  console.log(`\n── ${title} ${"─".repeat(pad)}`);
}

function run(cmd: string): string {
  return execSync(cmd, { cwd: process.cwd(), encoding: "utf-8" }).trim();
}

function runLive(cmd: string): void {
  execSync(cmd, { cwd: process.cwd(), stdio: "inherit" });
}

// ── Version arithmetic ────────────────────────────────────────────────────────

type BumpType = "keep" | "patch" | "minor" | "major";

function bump(version: string, type: BumpType): string {
  if (type === "keep") return version;
  const [major, minor, patch] = version.split(".").map(Number) as [number, number, number];
  if (type === "patch") return `${major}.${minor}.${(patch ?? 0) + 1}`;
  if (type === "minor") return `${major}.${(minor ?? 0) + 1}.0`;
  return `${(major ?? 0) + 1}.0.0`;
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function latestTag(): string | null {
  try {
    return run("git describe --tags --abbrev=0");
  } catch {
    return null;
  }
}

function commitsSinceTag(tag: string | null): string {
  try {
    const range = tag ? `${tag}..HEAD` : "HEAD";
    return run(`git log ${range} --oneline`);
  } catch {
    return "";
  }
}

function tagExists(tag: string): boolean {
  try {
    run(`git rev-parse ${tag}`);
    return true;
  } catch {
    return false;
  }
}

// ── Multi-line notes input ────────────────────────────────────────────────────

async function askNotes(): Promise<string> {
  console.log("  Enter release notes (Markdown). Empty line to finish.\n");
  const lines: string[] = [];
  while (true) {
    const line = await ask("  > ");
    if (line === "") break;
    lines.push(line);
  }
  return lines.join("\n");
}

// ── CI wait ───────────────────────────────────────────────────────────────────

interface GhRun {
  status: string;
  conclusion: string;
  number: number;
}

async function waitForCI(sha: string): Promise<boolean> {
  const MAX_WAIT_MS = 10 * 60 * 1000;
  const POLL_MS = 15_000;
  const deadline = Date.now() + MAX_WAIT_MS;

  console.log(`\n  Waiting for CI on ${sha.slice(0, 7)} (up to 10 min)…`);

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_MS));
    try {
      const raw = run(
        `gh run list --commit ${sha} --workflow ci.yml --json status,conclusion,number --limit 1`,
      );
      const runs = JSON.parse(raw) as GhRun[];
      const ciRun = runs[0];
      if (!ciRun) {
        console.log("  (no run yet, retrying…)");
        continue;
      }
      const { status, conclusion, number } = ciRun;
      console.log(`  CI run #${number}: ${status}${conclusion ? ` → ${conclusion}` : ""}`);
      if (status === "completed") return conclusion === "success";
    } catch {
      // gh or network not ready yet — keep polling
    }
  }
  console.error("  ✗ Timed out waiting for CI.");
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Version Bump & Release Tool           ║");
  console.log("╚══════════════════════════════════════════╝");

  // Read current version
  const pkg = JSON.parse(await fs.readFile(PKG_PATH, "utf-8")) as { version: string };
  const current = pkg.version;
  const tag = latestTag();

  console.log(`\n  Current version : ${current}`);
  if (tag) console.log(`  Last tag        : ${tag}`);

  // Step 1 — bump type
  section("Step 1 · Bump type");
  console.log(`  [0]  keep    ${current}  (create release for current version)`);
  console.log(`  [1]  patch   ${current} → ${bump(current, "patch")}  ← recommended`);
  console.log(`  [2]  minor   ${current} → ${bump(current, "minor")}`);
  console.log(`  [3]  major   ${current} → ${bump(current, "major")}`);

  const bumpChoice = (await ask("\nYour choice [1]: ")) || "1";
  const bumpMap: Record<string, BumpType> = { "0": "keep", "1": "patch", "2": "minor", "3": "major" };
  const bumpType: BumpType = bumpMap[bumpChoice] ?? "patch";
  const newVersion = bump(current, bumpType);

  console.log(`\n  New version: ${newVersion}`);

  // Step 2 — release title
  section("Step 2 · Release title");
  console.log(`  Format: v${newVersion} — <title>`);
  const titleSuffix = await ask(`  Title: `);
  if (!titleSuffix) {
    console.log("\n  Title is required. Aborting.");
    rl.close();
    return;
  }
  const fullTitle = `v${newVersion} — ${titleSuffix}`;

  // Step 3 — show recent commits as reference
  section("Step 3 · Commits since last tag");
  const commits = commitsSinceTag(tag);
  if (commits) {
    commits.split("\n").forEach((l) => console.log(`  ${l}`));
  } else {
    console.log("  (no commits since last tag)");
  }

  // Step 4 — release notes
  section("Step 4 · Release notes");
  const notes = await askNotes();
  if (!notes.trim()) {
    console.log("\n  Notes are empty. Aborting.");
    rl.close();
    return;
  }

  // Confirm
  section("Confirm");
  console.log(`  Version   : ${current} → ${newVersion}`);
  console.log(`  Tag       : v${newVersion}`);
  console.log(`  Title     : ${fullTitle}`);
  console.log(`\n  Notes:\n`);
  notes.split("\n").forEach((l) => console.log(`    ${l}`));

  const confirm = (await ask("\n  Proceed? [y/n]: ")).toLowerCase();
  if (confirm !== "y") {
    console.log("\n  Cancelled.\n");
    rl.close();
    return;
  }
  rl.close();

  // Check tag doesn't already exist
  if (tagExists(`v${newVersion}`)) {
    console.error(`\n  ✗ Tag v${newVersion} already exists. Aborting.\n`);
    process.exit(1);
  }

  // 1. Update package.json
  if (bumpType !== "keep") {
    pkg.version = newVersion;
    await fs.writeFile(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    console.log(`\n  ✓ package.json updated → ${newVersion}`);
  }

  // 2. Stage & commit
  run("git add package.json");
  run(`git commit -m "chore: bump to v${newVersion}"`);
  const headSha = run("git rev-parse HEAD");
  console.log(`  ✓ Committed  chore: bump to v${newVersion}  (${headSha.slice(0, 7)})`);

  // 3. Push commit — this triggers CI
  console.log("  Pushing commit…");
  runLive("git push");
  console.log("  ✓ Pushed");

  // 4. Wait for CI to pass before tagging and releasing
  const ciPassed = await waitForCI(headSha);
  if (!ciPassed) {
    console.error(
      `\n  ✗ CI did not pass. Tag v${newVersion} was NOT created.\n` +
        `  Fix the issue, then re-run pnpm bump (choose "keep" to skip the version bump).\n`,
    );
    process.exit(1);
  }
  console.log("  ✓ CI passed");

  // 5. Tag (only after CI is green)
  run(`git tag v${newVersion}`);
  console.log(`  ✓ Tagged     v${newVersion}`);

  // 6. Push tag
  console.log("  Pushing tag…");
  runLive(`git push origin v${newVersion}`);
  console.log("  ✓ Pushed tag");

  // 7. Create GitHub release
  console.log("  Creating GitHub release…");
  const escapedNotes = notes.replace(/'/g, "'\\''");
  runLive(
    `gh release create v${newVersion} --title '${fullTitle.replace(/'/g, "'\\''")}' --notes $'${escapedNotes}' --latest`,
  );

  console.log(`\n  ✅ Released v${newVersion} — ${titleSuffix}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
