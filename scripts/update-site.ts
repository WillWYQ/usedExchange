// Usage: pnpm update-site [tag] [--list] [--skip-verify]
//
// Automates docs/UPDATE_GUIDE.md (docs/UPDATE_GUIDE_zh.md): pulls a tagged
// release of the UsedExchange template into this repo without touching
// content/. See that guide for the manual steps this script replaces.
//
//   pnpm update-site            update to the latest tagged release
//   pnpm update-site v1.2.0     update to a specific tagged release
//   pnpm update-site --list     show available versions and exit
//   pnpm update-site --skip-verify
//                                skip `pnpm install` / type-check / build

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const UPSTREAM_REMOTE = "upstream";
const UPSTREAM_URL = "https://github.com/WillWYQ/usedExchange.git";

// Paths copied from the template on every update — keep in sync with
// "Step 2" of docs/UPDATE_GUIDE.md / docs/UPDATE_GUIDE_zh.md.
// content/ is deliberately absent: that's the seller's data.
const TEMPLATE_PATHS = [
  ".claude",
  ".github",
  ".env.example",
  ".gitignore",
  "LICENSE",
  "README.md",
  "README_zh.md",
  "SETUP_GUIDE.md",
  "app",
  "components",
  "components.json",
  "hooks",
  "lib",
  "public",
  "scripts",
  "docs",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next-sitemap.config.js",
  "next.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.mjs",
  "prettier.config.js",
  "tsconfig.json",
  "vitest.config.ts",
];

// Seller-owned despite living under lib/ (Iron Rule #5) — restored after the
// broad checkout above pulls in the template's copy of lib/.
const IMAGE_MANIFEST = "lib/generated/image-manifest.json";

function git(args: string[], opts: { silent?: boolean } = {}): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    stdio: opts.silent ? ["ignore", "pipe", "pipe"] : ["inherit", "pipe", "inherit"],
  }).trim();
}

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function parseSemver(tag: string): [number, number, number] | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function existsInTag(tag: string, relPath: string): boolean {
  try {
    git(["cat-file", "-e", `${tag}:${relPath}`], { silent: true });
    return true;
  } catch {
    return false;
  }
}

function ensureRepoRoot(): void {
  if (!fs.existsSync(path.join(process.cwd(), "content", "config.ts"))) {
    console.error("Error: run this from the project root (content/config.ts not found).");
    process.exit(1);
  }
}

function ensureCleanWorkingTree(): void {
  const status = git(["status", "--porcelain"], { silent: true });
  if (status) {
    console.error(
      "Error: you have uncommitted changes.\n" +
        "  Commit or stash them first, so this update can be undone with `git revert` if needed:\n\n" +
        status,
    );
    process.exit(1);
  }
}

function ensureUpstreamRemote(): void {
  try {
    git(["remote", "get-url", UPSTREAM_REMOTE], { silent: true });
  } catch {
    console.log(`[update-site] Adding '${UPSTREAM_REMOTE}' remote -> ${UPSTREAM_URL}`);
    git(["remote", "add", UPSTREAM_REMOTE, UPSTREAM_URL]);
  }
}

function fetchTags(): string[] {
  console.log(`[update-site] Fetching tags from '${UPSTREAM_REMOTE}'...`);
  git(["fetch", UPSTREAM_REMOTE, "--tags"]);

  return git(["tag", "-l"], { silent: true })
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => parseSemver(t) !== null)
    .sort((a, b) => compareSemver(parseSemver(a)!, parseSemver(b)!));
}

function main(): void {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const skipVerify = args.includes("--skip-verify");
  const requestedTag = args.find((a) => !a.startsWith("--"));

  ensureRepoRoot();
  if (!listOnly) ensureCleanWorkingTree();

  ensureUpstreamRemote();
  const tags = fetchTags();

  if (tags.length === 0) {
    console.error(`[update-site] No version tags (vX.Y.Z) found on '${UPSTREAM_REMOTE}'.`);
    process.exit(1);
  }

  const latest = tags[tags.length - 1]!;

  if (listOnly) {
    console.log("\nAvailable versions (oldest -> newest):");
    for (const tag of tags) console.log(`  ${tag}`);
    console.log(`\nLatest: ${latest}`);
    return;
  }

  const targetTag = requestedTag ?? latest;
  if (!tags.includes(targetTag)) {
    console.error(
      `[update-site] Tag '${targetTag}' not found on '${UPSTREAM_REMOTE}'.\n` +
        `  Run 'pnpm update-site --list' to see available versions.`,
    );
    process.exit(1);
  }

  const pathsToCheckout = TEMPLATE_PATHS.filter((p) => {
    const exists = existsInTag(targetTag, p);
    if (!exists) console.warn(`[update-site] '${p}' not in ${targetTag}, skipping.`);
    return exists;
  });

  console.log(`\n[update-site] Updating site code to ${targetTag}. content/ is not touched.\n`);
  run("git", ["checkout", targetTag, "--", ...pathsToCheckout]);

  if (fs.existsSync(path.join(process.cwd(), IMAGE_MANIFEST))) {
    try {
      git(["checkout", "HEAD", "--", IMAGE_MANIFEST]);
    } catch {
      console.warn(`[update-site] Could not restore ${IMAGE_MANIFEST} — check it manually.`);
    }
  }

  if (!skipVerify) {
    console.log("\n[update-site] Reinstalling dependencies...");
    run("pnpm", ["install"]);

    console.log("\n[update-site] Type-checking...");
    run("pnpm", ["type-check"]);

    console.log("\n[update-site] Building...");
    run("pnpm", ["build"]);
  }

  console.log(`\n[update-site] Done. Review the changes (git status / git diff), then:`);
  console.log(`  git add -A`);
  console.log(`  git commit -m "chore: update site code to ${targetTag}"`);
  console.log(`  git push`);
  console.log(`\nTo undo a single file before committing:`);
  console.log(`  git checkout HEAD -- <path/to/file>`);
}

main();
