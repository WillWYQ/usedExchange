# UsedExchange — Updating Your Site to a New Version

> ← [Back to README.md](../README.md) · 🇨🇳 Chinese version: [UPDATE_GUIDE_zh.md](UPDATE_GUIDE_zh.md)

This guide explains how to pull new code improvements (new UI, bug fixes, new features)
from the original UsedExchange template into **your own copy** of the site —
without losing your listings, photos, or `content/config.ts`.

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

The steps below are automated by `scripts/update-site.ts`. From your project root:

```bash
pnpm update-site --list   # see available versions (adds the upstream remote on first run)
pnpm update-site          # update to the latest tagged release
pnpm update-site v1.2.0   # update to a specific tagged release
```

This fetches tags from the upstream template repo, copies over the same file list
as "Step 2" below (never `content/`), restores your `lib/generated/image-manifest.json`,
then runs `pnpm install`, `pnpm type-check`, and `pnpm build` to verify the result.
Pass `--skip-verify` to skip that last step.

The script aborts if your working tree has uncommitted changes, and never commits
or pushes for you — review `git status` / `git diff`, then commit and push yourself
(see "Step 4" below).

The rest of this guide explains what the script does, in case you want to run the
steps by hand or something needs manual fixing.

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
  README.md README_zh.md SETUP_GUIDE.md \
  app components components.json hooks lib public scripts docs \
  eslint.config.mjs next-env.d.ts next-sitemap.config.js next.config.ts \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  postcss.config.mjs prettier.config.js tsconfig.json vitest.config.ts
```

Note what's **deliberately excluded**: `content/` (your listings, config, photos
metadata). This command never touches it.

### Restore your image manifest

The command above includes `lib/`, which also contains your seller-specific
`lib/generated/image-manifest.json` (Iron Rule #5 — this file stays in git, but it's
*yours*, not the template's). Restore your version immediately after:

```bash
git checkout HEAD -- lib/generated/image-manifest.json
```

---

## Step 3 — Reinstall dependencies and verify

New versions sometimes add dependencies or change scripts:

```bash
pnpm install
pnpm type-check
pnpm build
```

If `pnpm build` succeeds, your site builds correctly with the new code.

---

## Step 4 — Commit and push

```bash
git add -A
git commit -m "chore: update site code to v1.2.0"
git push
```

GitHub Actions will build and deploy automatically, same as any listing update.

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

Your `content/` folder is never part of this process, so your listings and config
are safe either way.
