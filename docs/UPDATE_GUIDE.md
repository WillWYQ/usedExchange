# UsedExchange — Updating Your Site to a New Version

> ← [Back to README.md](../README.md) · 🇨🇳 Chinese version: [UPDATE_GUIDE_zh.md](UPDATE_GUIDE_zh.md)

**Version:** 1.1  
**Date:** 2026-08-02

This guide explains how to pull new code improvements (new UI, bug fixes, new features)
from the original UsedExchange template into **your own copy** of the site —
without losing your listings or photos. Your existing values in `content/config.ts`
are preserved as-is; the only change the updater may make inside `content/` is
*appending* brand-new optional fields (see "Config migration" below).

---

## Why this isn't a normal `git pull`

The `release` branch of the original repo is **regenerated and force-pushed every time
a new version is tagged** (`v1.0.0`, `v1.1.0`, …). It is not an append-only history.

This means:

- ❌ **Don't use GitHub's "Sync fork" button.** Because the upstream `release` branch's
  history is rewritten on every release, GitHub may offer to **discard your commits**
  to "sync" — which would delete your listings and config.
- ❌ **Don't run a plain `git merge upstream/release`** for the same reason — it can
  produce a wall of conflicts unrelated to anything you actually changed.
- ✅ **Do** fetch the new release as a tag, and **selectively copy only the app-code
  files** into your repo, leaving `content/` (and your image manifest) untouched.

Recall Iron Rule #1: you only ever edit files inside `content/`. Every other file is
template code, so it's always safe to overwrite with the latest version.

---

## Quick start: `pnpm update-site`

The steps below are automated by `scripts/update-site.ts`. Run it from your project
root (it checks for `content/config.ts` and aborts if you're in the wrong directory):

```bash
pnpm update-site --list   # see available versions (adds the upstream remote on first run)
pnpm update-site          # update to the latest tagged release
pnpm update-site v1.2.0   # update to a specific tagged release
```

(`v1.2.0` is just an example tag — use the newest one printed by
`pnpm update-site --list`; currently `v1.4.2`.)

In order, the script then:

1. Fetches tags from the upstream template repo (adding the `upstream` remote
   automatically if it's missing), and aborts with a hint to run `--list` if the
   tag you asked for doesn't exist.
2. Copies over the same file list as "Step 2" below (never `content/`). Entries
   that don't exist in the target tag — e.g. `studio/` when updating to an older
   tag that predates it — are skipped with a warning.
3. Restores your `lib/generated/image-manifest.json` (only if the file exists
   locally; a failed restore degrades to a warning you should check manually).
4. Runs the config migration (see "Config migration" below), appending any new
   optional fields to your `content/config.ts`. This **always runs** —
   `--skip-verify` does not skip it.
5. Unless you pass `--skip-verify`, deletes the stale `.next/` build cache, then
   runs `pnpm install`, `pnpm type-check`, and `pnpm build` to verify the result.
6. Stages everything (`git add -A`) and commits it itself as
   `chore: update site code to <tag>` — or prints "No changes to commit" if
   nothing changed.

Up front, the script aborts if your working tree has uncommitted changes (the
`--list` command skips this check). It never pushes: when it finishes, it prints
`git push` for you to run — that push is also what triggers the deploy (see
"Step 4" below).

The rest of this guide explains what the script does, in case you want to run the
steps by hand or something needs manual fixing. "Step 4"'s commit command is only
needed on that manual path — the script commits for you.

---

## One-time setup: add the upstream remote

This works whether your site started as a **fork** or via **"Use this template"**
(the latter has no link back to the original repo by default).

```bash
git remote add upstream https://github.com/WillWYQ/usedExchange.git
git fetch upstream --tags
```

If `upstream` already exists, just run the `fetch` command.

---

## Step 1 — See what's available

```bash
git fetch upstream --tags
git tag -l | sort -V
```

Pick the latest tag (e.g. `v1.2.0`). You can browse what changed in that release on
GitHub: `https://github.com/WillWYQ/usedExchange/releases`.

---

## Step 2 — Copy the updated app code into your repo

Run this from the root of your project, replacing `v1.2.0` with the tag you picked:

```bash
git checkout v1.2.0 -- \
  .claude .github \
  .env.example .gitignore LICENSE \
  README.md README_zh.md SETUP_GUIDE.md SETUP_GUIDE_zh.md \
  app components components.json hooks lib public scripts studio docs \
  eslint.config.mjs next-env.d.ts next-sitemap.config.js next.config.ts \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  postcss.config.mjs prettier.config.js tsconfig.json vitest.config.ts
```

Note what's **deliberately excluded**: `content/` (your listings, config, photos
metadata). This command never touches it — when you run the script, the *only*
change it may make inside `content/` is appending new optional fields to
`content/config.ts` (see "Config migration" below).

This file list is mechanically kept in sync with the script's `TEMPLATE_PATHS`
array by a test (`scripts/update-site.test.ts`), so the manual command and the
script can never silently diverge.

### Restore your image manifest

The command above includes `lib/`, which also contains your seller-specific
`lib/generated/image-manifest.json` (Iron Rule #5 — this file stays in git, but it's
*yours*, not the template's). Restore your version immediately after:

```bash
git checkout HEAD -- lib/generated/image-manifest.json
```

---

## Config migration (runs automatically)

After the checkout and the manifest restore, `pnpm update-site` runs the same
logic as the standalone `pnpm migrate-config` command (`scripts/migrate-config.ts`).
New template versions occasionally introduce *optional* config fields; the
migration appends any that your `content/config.ts` is missing, using the safe
defaults declared in `scripts/lib/configDefaults.ts` (currently the
`priceFilterStrategy` price-filter option, inserted after the `itemCard:` line,
and the `filterPriceBucketAll` / `filterPriceIncludesOutliers` UI strings,
inserted after `filterPrice:`).

- **Additive only.** It never overwrites, reorders, or removes anything already
  in your config — a field that's already present is left completely alone.
- Each entry is inserted right after a related anchor line. If the anchor can't
  be found in your config, that entry is skipped with a warning instead of
  failing the update.
- Injected fields are TypeScript-optional with runtime `??` defaults
  (Iron Rule #8), so your site keeps building even before the migration runs.
- Your listings, photos, and every existing config value are untouched. If you
  see an unexpected diff in `content/config.ts` after an update, it came from
  this migration — don't revert it.

There is no `--migrate-config` flag on `update-site`: the migration always runs.
You can also run it on its own at any time:

```bash
pnpm migrate-config
```

If you're following the manual steps, run it right after restoring your image
manifest and before verifying the build.

---

## Step 3 — Reinstall dependencies and verify

New versions sometimes add dependencies or change scripts:

```bash
pnpm install
pnpm type-check
pnpm build
```

If `pnpm build` succeeds, your site builds correctly with the new code.

Before running these commands, the script deletes any stale `.next/` build cache;
if you run them by hand and see odd caching behavior, `rm -rf .next` first.
(`--skip-verify` skips the cache cleanup and these three commands — install,
type-check, and build — but never the config migration.)

---

## Step 4 — Commit and push

If you ran `pnpm update-site`, the commit is already done: the script staged
(`git add -A`) and committed the changes itself as
`chore: update site code to <tag>`. All that's left is:

```bash
git push
```

The commands below are only needed if you ran Steps 1–3 by hand:

```bash
git add -A
git commit -m "chore: update site code to v1.2.0"
git push
```

Either way, push to your **`release`** branch — that's the working branch a site
created from this template uses, and the deploy workflow
(`.github/workflows/deploy.yml`) publishes on pushes to it (it can also be
triggered manually, or by the template release workflow). GitHub Actions will
then build and deploy automatically, same as any listing update.

---

## If something goes wrong

Before you commit, you can revert any file back to your previous version:

```bash
git checkout HEAD -- <path/to/file>
```

After committing, you can always revert the whole update commit:

```bash
git revert HEAD
```

Your listings and photos are never part of this process. The only `content/`
file an update can change is `content/config.ts`, and only by appending new
optional fields — so reverting an update is always safe.
