# UsedExchange — Scripts & Tooling Reference

**Version:** 1.2
**Date:** 2026-09-07
**Package version:** 1.7.1 (see `package.json`)

> Complete reference for every npm script, standalone CLI, and support module in the repository. For architecture and data flow see [ARCHITECTURE.md](ARCHITECTURE.md); for the full design specification see [DESIGN.md](DESIGN.md); for non-technical seller operations see [../SETUP_GUIDE.md](../SETUP_GUIDE.md).
>
> 🇨🇳 Chinese version: [SCRIPTS_zh.md](SCRIPTS_zh.md)

---

## Overview

- All CLIs live in `scripts/`, are executed with **tsx** (Node.js — no browser APIs), and are production tooling, not dev-only helpers.
- The root `package.json` defines **31 npm scripts**; `new` is an exact alias of `create-item`, and three scripts (`upload-images`, `dev`, `prebuild`) are thin wrappers over the three modes of `scripts/sync-images.ts`.
- **Sellers only ever edit files under `content/` by hand.** The CLIs below read and write `content/` *on your behalf* — you never need to open `app/`, `lib/`, or `scripts/` yourself.
- `workers/shipping-rate-proxy/` and `workers/contact-form-proxy/` are **independently deployed** Cloudflare Worker packages, each with its own `package.json`; both are excluded from the root tsconfig / ESLint / Vitest scope.
- `lib/generated/image-manifest.json` is **committed to git** (Iron Rule 5). Scripts write it; CI reads it and needs no CDN credentials.

---

## npm Scripts

### Seller workflow

| Script | Runs | Purpose |
|---|---|---|
| `pnpm upload-images` | `tsx scripts/sync-images.ts --mode upload` | Upload new/changed photos to the CDN, strip EXIF/GPS, write the committed image manifest |
| `pnpm configure-image-cors` | `tsx scripts/configure-image-cors.ts` | One-time: add a GET CORS rule for the site's `baseUrl` to the R2 bucket (`cloudflare-r2` provider only), needed for the item flyer button's photos. No-op for other providers; prints the manual dashboard steps if the R2 token lacks bucket-settings permission |
| `pnpm create-item <category>/<name>` | `tsx scripts/create-item.ts` | Scaffold a 36-field draft `item.json`, applying site/category `_defaults.json` first |
| `pnpm new <category>/<name>` | `tsx scripts/create-item.ts` | Exact alias of `create-item` |
| `pnpm create-template [category]` | `tsx scripts/create-template.ts` | Write a fully-commented `_template.json` sellers can copy |
| `pnpm mark-sold <category>/<item>` | `tsx scripts/mark-sold.ts` | Set `status="sold"` + `sold_date=today`, preserving JSONC comments |
| `pnpm mark-available <category>/<item>` | `tsx scripts/mark-available.ts` | Reset `status="available"` and clear `sold_date`, preserving JSONC comments |
| `pnpm duplicate <category>/<item> <category>/<new-item>` | `tsx scripts/duplicate.ts` | Copy an item folder (item.json + photos) to a new item, resetting it to a fresh `draft` |
| `pnpm inventory` | `tsx scripts/inventory.ts` | Print a Markdown table of every item (all statuses): name, category, status, lowest price, days listed |
| `pnpm stale-check [--days <n>]` | `tsx scripts/stale-check.ts` | List `available` items listed for more than N days (default 60) |
| `pnpm audit-listings` | `tsx scripts/audit-listings.ts` | Report non-sold items missing recommended fields (photos, description, tags, shipping weight/dimensions, price tiers) |
| `pnpm export-csv` | `tsx scripts/export-csv.ts` | Export every item (all statuses) as a flat CSV for the seller's own record-keeping (prompts before overwriting) |
| `pnpm semester-end` | `tsx scripts/semester-end.ts` | Interactive end-of-semester cleanup: review stale listings (mark sold / reduce price / leave as-is), sync photos, suggest a commit message |
| `pnpm setup-check` | `tsx scripts/setup-check.ts` | Print the setup checklist: what is still missing and the command or pane for each step. Exits 1 while core steps remain |
| `pnpm fb-export` | `tsx scripts/export-facebook.ts` | Interactive Facebook Marketplace CSV export |
| `pnpm push` | `git add content lib/generated/image-manifest.json && git commit -m 'chore: update listings' && git push` | Commit + push seller content and the image manifest |
| `pnpm studio [--port <n>]` | `tsx scripts/studio.ts` | Local-only (127.0.0.1) browser GUI for managing `content/` — editing, photos, CDN sync, git publish |

### Developer / maintenance

| Script | Runs | Purpose |
|---|---|---|
| `pnpm setup-ui` | `bash scripts/setup-ui.sh` | One-time installer of all 27 supported Aceternity UI components |
| `pnpm update-site [tag] [--list] [--skip-verify]` | `tsx scripts/update-site.ts` | Pull a tagged upstream template release into a downstream site without touching `content/` |
| `pnpm migrate-config` | `tsx scripts/migrate-config.ts` | Splice new optional config fields (with defaults) into `content/config.ts` after a template upgrade |
| `pnpm bump` | `tsx scripts/bump-version.ts` | Interactive version bump + CI wait + git tag + GitHub release (upstream only) |

### Build pipeline

| Script | Runs | Purpose |
|---|---|---|
| `pnpm dev` | `tsx scripts/sync-images.ts --mode dev-sync && next dev --turbo` | Copy photos + contact files into `public/` for local serving, then start the Next.js dev server (Turbopack) |
| `pnpm prebuild` | `tsx scripts/check-config.ts && tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts` | Pre-build gate: config guard → image check/copy → search index (runs automatically before `build`) |
| `pnpm build` | `next build` | Static production build → `out/` (prebuild runs first, automatically) |
| `pnpm postbuild` | `tsx scripts/postbuild.ts` | Generate `sitemap.xml` + `robots.txt` if `siteConfig.sitemap.enabled` (runs automatically after `build`) |

### Test & lint

| Script | Runs | Purpose |
|---|---|---|
| `pnpm type-check` | `tsc --noEmit` | TypeScript type-check without emitting; also used by `update-site`'s verify step |
| `pnpm lint` | `eslint . --max-warnings 0` | ESLint over the repo, zero-warning tolerance |
| `pnpm format` | `prettier --write .` | Prettier-format the whole repo in place |
| `pnpm test` | `vitest run` | Run the Vitest suite once (36 test files / ~585 tests, incl. all `scripts/lib/*.test.ts`) |
| `pnpm test:watch` | `vitest` | Vitest watch mode |
| `pnpm test:coverage` | `vitest run --coverage` | Vitest with a v8 coverage report (writes `coverage/`) |

---

## CLI Entry Files (`scripts/*.ts` + `setup-ui.sh`)

### `studio.ts` — Seller Studio launcher

- **Command:** `pnpm studio [--port <n>]` (or `tsx scripts/studio.ts [--port <n>]`)
- **Args:** `--port <n>` — integer **1024–65535**, default **5174** (`DEFAULT_PORT`, `strictPort=false` so Vite falls back to the next free port).
- **Purpose:** Validates prerequisites (fails fast with "run `pnpm install`" if `vite` is not installed, or "run `pnpm update-site`" if `studio/vite.config.ts` is missing), loads `.env.local`, registers the CDN sync runner, and boots the Studio Vite dev server bound to **127.0.0.1 only**.
- **Env vars:** `.env.local` (auto-loaded); `CF_R2_*` or `BLOB_READ_WRITE_TOKEN` — only needed when a CDN sync is triggered. The image adapter is constructed *per sync run*, so missing CDN credentials surface as an SSE error event, not a startup failure.
- **Touches:** reads `studio/vite.config.ts`; reads/writes `content/items/**/item.json` and item photo dirs (via `scripts/lib/studioApi.ts`, `itemEdit.ts`, `itemFields.ts`, `studioImages.ts`); git status/add/commit/push limited to `content/` + `lib/generated/image-manifest.json` (`studioGit.ts` — mirrors `pnpm push`, never uses `git add -A`); CDN sync writes `lib/generated/image-manifest.json` and `.image-cache/checksums.json` (`studioSync.ts` — one-run-at-a-time mutex, SSE progress).
- **API surface** (routed in `scripts/lib/studioApi.ts`): `GET /api/items`, `POST /api/items`, `POST /api/items/bulk-status`, `GET|PATCH /api/items/<cat>/<item>`, `GET /api/items/<cat>/<item>/images`, `GET …/images/<filename>` (file serve, `no-store`), `POST …/images` (base64 upload), `POST …/images/reorder`, `POST …/images/import` (download from seller-picked URLs, SSRF-safe — see below), `DELETE …/images/<filename>`, `POST /api/import-url/preview` (SSRF-safe fetch + name/photo-candidate extraction, no filesystem write), `POST /api/sync-images` (SSE progress/done/error), `GET /api/changes`, `POST /api/publish` (409 while a sync runs). Non-GET/HEAD requests pass `studio/csrfGuard.ts` (`Content-Type: application/json` required → 415; `Origin` must equal the server's own origin → 403).
- **Import from URL** (`scripts/lib/ssrfGuard.ts` + `scripts/lib/urlImport.ts`): the seller pastes a product-page URL; the server fetches it and every subsequently-picked photo through `fetchUrlSafely`, which resolves and validates every DNS answer against loopback/private/link-local/multicast ranges (including the `169.254.169.254` cloud metadata address) before pinning the actual connection to the validated address, and re-validates on every redirect hop. Downloaded photos are sniffed from bytes (never trusting the URL extension or remote `Content-Type`) before joining the normal `writeImage` pipeline.

> **Catalog PDF export** (Seller Studio's "Export PDF" button) and **URL-import's deep-import fallback** (for JavaScript-rendered product pages the fast fetch can't read) both render via headless Chromium, sharing the same one-time setup: `npx playwright install chromium`. Skipping this step doesn't break either feature — PDF export shows a clear error, and URL-import silently falls back to its fast-path-only behavior with a hint pointing at this same command.

### `sync-images.ts` — unified image pipeline

- **Command:** `tsx scripts/sync-images.ts --mode <upload|dev-sync|build-check>` (exits 1 if `--mode` is missing or invalid).
- **Modes:**
  - `upload` (= `pnpm upload-images`) — upload new/changed photos to the configured CDN (Cloudflare R2 / Vercel Blob / local), strip EXIF/GPS metadata, write `lib/generated/image-manifest.json` (git-tracked) and `.image-cache/checksums.json` (sha256 cache, gitignored), copy `content/contact/*` → `public/contact/*`, print advisory quality warnings (>8 MB file, <800 px width, missing `cover.*`, item folders with no images). Per-file failures do **not** discard the batch; the script exits 1 at the end if any failed — re-run to retry.
  - `dev-sync` (= `pnpm dev`, before `next dev`) — copy item photos `content/items/` → `public/items/` (mtime+size comparison via `copyIfChanged`) and contact files → `public/contact/`. Skips the image copy if `content/items/` is missing, but still copies contact files.
  - `build-check` (= part of `pnpm prebuild`) — always copies `content/contact/` → `public/contact/`; for `provider=local` copies item photos → `public/items/`; for cloud providers only checks that `lib/generated/image-manifest.json` exists (warns, does not fail, if missing).
- **Env vars:** `.env.local`; when `provider=cloudflare-r2`: `CF_R2_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET`, `CF_R2_PUBLIC_URL`; when `provider=vercel-blob`: `BLOB_READ_WRITE_TOKEN`.
- **Touches:** `content/items/**`, `content/contact/*`, `public/items/**`, `public/contact/**`, `lib/generated/image-manifest.json`, `.image-cache/checksums.json`.

### `create-item.ts` — item scaffolder

- **Command:** `pnpm create-item <category>/<name>` (alias: `pnpm new`).
- **Args:** exactly one positional `<category>/<name>`; both parts must be non-empty kebab-case, validated by `isValidSlug` **before any filesystem access** (path-traversal guard, shared with `generateStaticParams`). The category folder must already exist; the item folder must not.
- **Purpose:** writes `content/items/<category>/<name>/item.json` from the 36-field draft template (`status: "draft"`, today's date, the site's measurement unit and default price tiers). Opens the new file in `$EDITOR` if set (`spawnSync` with an argument array — no shell interpolation).
- Applies the two-tier defaults (`content/items/_defaults.json` + the category's own) via
  `scripts/lib/itemDefaults.ts` before writing; a broken defaults file aborts with the file and
  field named.
- **Env vars:** `EDITOR` (optional).
- **Touches:** reads `content/config.ts` (`measurementUnit`, `defaultPriceTiers`); writes the new `item.json`.

### `create-template.ts` — template writer

- **Command:** `pnpm create-template [category]`.
- **Args:** optional positional `[category]` — with it, writes `content/items/<category>/_template.json` (category dir must exist); without it, writes `content/items/_template.json`.
- **Env vars:** none.
- **Touches:** reads `content/config.ts`; writes the `_template.json` scaffold (fully commented; `reserved_for` excluded — internal-only field, never rendered).

### `mark-sold.ts` — sold marker

- **Command:** `pnpm mark-sold <category>/<item>`.
- **Args:** exactly one positional `<category>/<item>`, kebab-case validated before fs access.
- **Purpose:** sets `status="sold"` and `sold_date=today` via surgical JSONC edits (`jsonc-parser` `modify`/`applyEdits` — never a parse/stringify round trip, so `// options:` comments and the private `reserved_for` field survive intact). No-op with exit 0 ("already marked as sold") if status is already `sold`.
- **Env vars:** none.
- **Touches:** reads/writes `content/items/<category>/<item>/item.json`.

### `mark-available.ts` — available marker

- **Command:** `pnpm mark-available <category>/<item>`.
- **Args:** exactly one positional `<category>/<item>`, kebab-case validated before fs access.
- **Purpose:** sets `status="available"` and clears `sold_date` to `null` via the same surgical JSONC edits `mark-sold` uses. Resets status from **any** other state (sold, pending, reserved, draft) — not only `sold` — since re-listing a draft or un-reserving a pending item are both legitimate uses. No-op with exit 0 if status is already `available`.
- **Env vars:** none.
- **Touches:** reads/writes `content/items/<category>/<item>/item.json`.

### `duplicate.ts` — item duplicator

- **Command:** `pnpm duplicate <category>/<item> <category>/<new-item>`.
- **Args:** two positional `<category>/<item>` slugs (source, destination), all four parts kebab-case validated before fs access. Destination category must already exist; destination item must not.
- **Purpose:** copies the source item's whole folder (item.json + every photo file) to the destination, then resets the copy's listing-lifecycle fields: `status` → `"draft"`, `listed_date` → today, `sold_date` → `null`, `price_reduced` → `false`, `previous_lowest_price` / `min_acceptable_offer` → `null` (matching `scripts/lib/itemTemplate.ts`'s fresh-item defaults). The private `reserved_for` field (Iron Rule 4) is stripped from the copy outright if present, rather than carried forward.
- **Env vars:** none.
- **Touches:** reads `content/items/<category>/<item>/`; writes `content/items/<category>/<new-item>/` (folder copy + item.json edit).

### `inventory.ts` — inventory report

- **Command:** `pnpm inventory`.
- **Purpose:** prints a Markdown table of every item (all statuses — not just `available`) to stdout: name, category, status, lowest resolved price (same "lowest tier" strategy `fb-export` defaults to), and days listed (raw whole-day count). Read-only.
- **Env vars:** none.
- **Touches:** reads `content/items` via `loadAllItemsRaw`; no writes.

### `stale-check.ts` — stale listing report

- **Command:** `pnpm stale-check [--days <n>]`.
- **Args:** optional `--days <n>`, a non-negative number; default **60**.
- **Purpose:** lists `available` items listed for more than N days, longest-listed first, with their current lowest price. Shares `findStaleItems()` (`scripts/lib/staleItems.ts`) with `pnpm semester-end` so the two commands can never disagree about which items qualify. Read-only.
- **Env vars:** none.
- **Touches:** reads `content/items` via `loadAllItemsRaw`; no writes.

### `audit-listings.ts` — recommended-field audit

- **Command:** `pnpm audit-listings`.
- **Purpose:** reports non-sold items missing "recommended" (schema-optional but valuable) fields: no photos at all, empty description, no tags, an open-ended shipping price tier with no weight/dimensions set, or no price tiers at all. See `scripts/lib/auditListings.ts`'s header comment for the exact, adjustable criteria list. Read-only.
- **Env vars:** none.
- **Touches:** reads `content/items` via `loadAllItemsRaw`; no writes.

### `export-csv.ts` — record-keeping CSV export

- **Command:** `pnpm export-csv`.
- **Purpose:** exports every item (all statuses) as a flat CSV for the seller's own bookkeeping — name, category, status, condition, lowest price, currency, negotiable, brand, model, quantity, listed/sold dates, and semicolon-joined tags. **Not** the Facebook Marketplace format (that's `pnpm fb-export`, a different tool/output). Prompts (via `scripts/lib/cliPrompt.ts`) before overwriting an existing output file.
- **Env vars:** none.
- **Touches:** reads `content/items` via `loadAllItemsRaw`; writes `exports/listings.csv`.

### `semester-end.ts` — end-of-semester batch cleanup

- **Command:** `pnpm semester-end` (fully interactive).
- **Flow:** prints every `available` item listed for more than 60 days (shared `findStaleItems()` — same threshold and ordering as `stale-check`); for each, prompts **[s]old / [r]educe price / [l]eave as-is** (default). "Sold" applies `applyMarkSold`; "reduce price" prompts for a new amount and rewrites the lowest-amount price tier via the same comment-preserving `applyFieldEdits` path every other script here uses (`scripts/lib/reducePrice.ts`). If anything changed, runs `pnpm upload-images` (safe — a content sync, not a git operation) and prints a suggested commit message (`"chore: end-of-semester listing cleanup"`) plus the exact `git`/`pnpm push` commands to publish it. **Never** runs `git commit`/`git push` itself — publishing stays a seller-triggered action.
- **Env vars:** none.
- **Touches:** reads/writes `content/items/**/item.json` for items the seller acts on; invokes `pnpm upload-images` as a subprocess when anything changed.

### `export-facebook.ts` — Facebook Marketplace export

- **Command:** `pnpm fb-export` (fully interactive).
- **Flow:**
  - **Step 0** (only if `exports/.export-history.json` exists): `[s]` skip already-exported items (default) · `[v]` view previous runs then decide · `[n]` export everything.
  - **Step 1 — selection:** `[a]` all · `[N]` category number · `[m]` manual pick (numbers / ranges / `all`).
  - **Step 2 — price strategy:** `[1]` lowest tier (default) · `[2]` highest · `[3]` pickup (miles-limited tiers; shown only if any exist) · `[4]` shipping (open-ended tiers; shown only if any exist) · `[5]` average of lowest & highest.
  - Exports `available` / `pending` / `reserved` items in **50-item batches** (≤150-char titles, ≤5000-char descriptions, ≤10 `PHOTO` columns with CDN URLs). Warns about items with no CDN photos — run `pnpm upload-images` first.
- **Env vars:** none.
- **Touches:** reads `content/items` via `loadAllItemsRaw` (incl. local photo dirs for the manual-upload copy); writes `exports/facebook-marketplace.csv` or `exports/facebook-marketplace-<N>.csv`, `exports/facebook-marketplace-photos/NNN_category-item/`, `exports/.export-history.json` (gitignored run history).

### `update-site.ts` — template updater (downstream sites)

- **Command:** `pnpm update-site [tag] [--list] [--skip-verify]`.
- **Args:** no args = latest `vX.Y.Z` tag; `[tag]` = a specific tag; `--list` = print available versions and exit (skips the clean-tree check); `--skip-verify` = skip `pnpm install` / type-check / build.
- **Purpose:** checks out `TEMPLATE_PATHS` from the upstream tag (`WillWYQ/usedExchange`) — `.claude`, `.github`, `.env.example`, `.gitignore`, `LICENSE`, `README(_zh).md`, `SETUP_GUIDE.md`, `app`, `components`, `components.json`, `hooks`, `lib`, `public`, `scripts`, `studio`, `docs`, and the root config files (`eslint.config.mjs`, `next-env.d.ts`, `next-sitemap.config.js`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `prettier.config.js`, `tsconfig.json`, `vitest.config.ts`) — **never touching `content/`**. Requires a clean working tree; auto-adds the `upstream` remote if missing; **restores `lib/generated/image-manifest.json` from HEAD** after the broad checkout (Iron Rule 5); deletes stale `.next/`; runs `migrate-config`; verifies; commits `chore: update site code to <tag>` if anything changed, then tells you to `git push`.
- **Env vars:** none.
- **Touches:** git checkout of the paths above; restores the image manifest; migrates `content/config.ts`; may delete `.next/`.

### `migrate-config.ts` — config migration

- **Command:** `pnpm migrate-config` (also invoked programmatically by `update-site` after checkout — guarded by an `argv[1]` `endsWith` check so importing the module does not auto-run it).
- **Purpose:** scans `content/config.ts` for config fields missing after a template upgrade and splices them in with defaults from the `CONFIG_DEFAULTS` registry in `scripts/lib/configDefaults.ts` (currently covers the price-filter UI settings, the sold-archive display limit, Google Analytics, the contact-form notifications/scheduling config plus its enquiry-form and schedule-viewing UI strings, tag/course filter strings, and PDF export/contact UI strings). **Additive only** — never removes or modifies existing values. Consistent with Iron Rule 8, every injected field is TypeScript-optional with a runtime default at its consumption site, so downstream configs that skip migration still pass type-check. Skips (with a warning) any entry whose anchor line (`afterKey`) is not found; prints added field names or "config is up to date".
- **Env vars:** none.
- **Touches:** reads/writes `content/config.ts`; reads `scripts/lib/configDefaults.ts`.

### `check-config.ts` — prebuild config guard

- **Command:** `tsx scripts/check-config.ts` (runs in `prebuild`; exits 1 on failure).
- **Purpose:** fails the build if `siteConfig.baseUrl` still contains the placeholder domain, or if any `availableLocales` locale is missing from `i18n.translations` or lacks any of the 73 required `UIStrings` keys (with default-locale fallback). Prevents the silent-SEO footgun where `new URL("https://your-domain.com")` succeeds and canonical/OG/JSON-LD URLs ship pointing at the placeholder.
- **Env vars:** none.
- **Touches:** reads `content/config.ts` (via `@/content/config`) and `lib/utils/templateStatus.ts` (`PLACEHOLDER_DOMAIN`).

### `build-search-index.ts` — search index builder

- **Command:** `tsx scripts/build-search-index.ts` (runs in `prebuild`; exits 1 on fatal error).
- **Purpose:** builds the Fuse.js search index from all items (`buildSearchIndex()` in `lib/search/index.ts`) and writes `public/search-index.json` (gitignored; fetched client-side at runtime).
- **Env vars:** none.
- **Touches:** reads `content/items` (through the search-index builder); writes `public/search-index.json`.

### `postbuild.ts` — sitemap generator

- **Command:** `tsx scripts/postbuild.ts` (auto-runs after `build`).
- **Purpose:** runs `npx next-sitemap --config next-sitemap.config.js` to generate `sitemap.xml` + `robots.txt` into `./out` (next-sitemap `outDir`) if `siteConfig.sitemap.enabled`; otherwise prints "sitemap disabled — skipping". Exits 1 if next-sitemap fails.
- **Env vars:** `NEXT_PUBLIC_SITE_URL` (read by `next-sitemap.config.js`; falls back to `https://your-domain.com`).
- **Touches:** reads `content/config.ts` (`sitemap.enabled`) and `next-sitemap.config.js`; writes sitemap/robots into `./out`.

### `bump-version.ts` — release tool (upstream only)

- **Command:** `pnpm bump` (fully interactive).
- **Flow:** Step 1 — bump type: `[0]` keep · `[1]` patch (default) · `[2]` minor · `[3]` major. Step 2 — release title suffix (required; release titled `v<ver> — <title>`). Step 3 — shows commits since the last tag. Step 4 — multi-line Markdown release notes (an empty line ends input; required). Confirm y/n. Bumps `package.json`, commits, pushes, waits for CI (`ci.yml` via `gh`, 10-minute timeout, 15-second poll), then tags `v<ver>`, pushes the tag, and creates the `gh release`. Aborts if tag `v<ver>` already exists. On CI failure the tag is **not** created — fix the build and re-run choosing "keep".
- **Env vars:** an authenticated `gh` CLI (`GH_TOKEN` env or a prior `gh auth login`).
- **Touches:** reads/writes `package.json` (`version`); git commit/tag/push; GitHub API via `gh` (run list, release create).

### `setup-ui.sh` — Aceternity component installer

- **Command:** `pnpm setup-ui` (runs `bash scripts/setup-ui.sh`).
- **Purpose:** one-time installer of all **27** supported Aceternity UI components into `components/ui/` — 27 sequential `npx shadcn@latest add @aceternity/<component> -y` calls under `set -e` (13 background, 3 item-grid, 4 gallery, 7 item-card components). Run once per repo; commit the generated `components/ui/` files afterwards.
- **Args / env vars:** none.
- **Touches:** writes `components/ui/` (via the shadcn CLI); shadcn may also touch `components.json` / `package.json`.

### Test files among the scripts

`scripts/update-site.test.ts`, `scripts/studioFields.test.ts`, plus `scripts/lib/*.test.ts` (`imageSync`, `itemEdit`, `itemFields`, `itemTemplate`, `markSold`, `markAvailable`, `duplicateItem`, `itemAge`, `staleItems`, `inventory`, `auditListings`, `csv`, `exportCsv`, `reducePrice`, `r2Cors`, `studioApi`, `studioGit`, `studioImages`, `studioSync`) — all executed by the root `test` / `test:watch` / `test:coverage` scripts.

---

## `scripts/lib/` Support Modules

Not standalone runnables — imported by the CLIs above. Each has a colocated `*.test.ts` (where listed) run by `pnpm test`.

| Module | Purpose |
|---|---|
| `loadEnv.ts` | `.env.local` parser (`loadDotEnvLocal`); existing `process.env` values always win. Shared by `sync-images` + `studio` (tsx does not auto-load `.env.local`). |
| `imageSync.ts` ⭐ | Pure CDN pipeline: sha256 checksums, `scanImages` (skips `_`-prefixed dirs), `syncImagesToCdn` (`UPLOAD_CONCURRENCY=8`, per-file failure isolation, EXIF stripping, progress callbacks). Drives both `pnpm upload-images` and Seller Studio's sync. |
| `r2Cors.ts` | Pure merge logic for `configure-image-cors`: `buildMergedCorsRules(existingRules, baseUrl)` appends a GET-only rule for `baseUrl` without touching unrelated existing rules, reporting `alreadyPresent` if one already covers it. Reuses the AWS SDK's own `CORSRule` type so it can't drift from what Get/PutBucketCorsCommand accept. |
| `itemTemplate.ts` | 36-field `item.json` scaffold (`buildItemTemplate` / `renderItemTemplateJsonc`, injects `// options:` comments) shared by `create-item`, `create-template`, and Studio item creation. Excludes `reserved_for` (private — never rendered, Iron Rule 4). |
| `itemEdit.ts` | Surgical JSONC field edits via `jsonc-parser` (`applyFieldEdits`, `readItemField`, `readItemForEdit`) — comments and `reserved_for` survive every write. Used by `mark-sold` and Studio. |
| `itemFields.ts` | The strict Zod allowlist of browser-writable field paths (`resolveFieldSchema(path)` is the single authority — prototype-pollution-safe own-key lookup; plus `assertEditableValue`, `pickEditableFields`). No `.catch`/`.default`/`.preprocess`, so a `safeParse` failure is a hard rejection; drift tests assert key-set parity with `itemJsonSchema`. |
| `markSold.ts` | `applyMarkSold(text, today)`: status → `sold` + `sold_date`; returns `null` if already sold. |
| `markAvailable.ts` | `applyMarkAvailable(text)`: status → `available` + `sold_date` → `null`; returns `null` if already available. Used by `mark-available`. |
| `duplicateItem.ts` | `applyDuplicateEdits(text, today)`: resets `status`/`listed_date`/`sold_date`/`price_reduced`/`previous_lowest_price`/`min_acceptable_offer` on a copied item.json and strips a private `reserved_for` if present. Used by `duplicate`. |
| `itemAge.ts` | `daysListed(listedDate, now?)`: whole-day age math shared by `inventory`, `stale-check`, and `semester-end` so "days listed" never disagrees across scripts. |
| `staleItems.ts` | `findStaleItems(items, thresholdDays?, now?)` / `DEFAULT_STALE_DAYS` (60): `available` items past the threshold, longest-listed first. Shared by `stale-check` and `semester-end`. |
| `inventory.ts` | `buildInventoryTable(items, now?)`: pure Markdown-table builder for `pnpm inventory` (name/category/status/lowest price/days listed). |
| `auditListings.ts` | `auditItem` / `auditListings` / `formatAuditReport`: the recommended-field criteria and report text for `pnpm audit-listings`; criteria list documented in the file's header comment. |
| `csv.ts` | `csvCell` / `toCsvString`: shared RFC-4180-ish CSV escaping, used by both `fb-export` and `export-csv` (extracted from `export-facebook.ts` so neither reimplements quoting rules). |
| `exportCsv.ts` | `buildExportCsvRows(items)` / `EXPORT_CSV_HEADERS`: the record-keeping CSV row builder for `pnpm export-csv` (distinct from `fb-export`'s Facebook-specific columns). |
| `reducePrice.ts` | `findLowestTierIndex(tiers)` / `applyReducePrice(text, newAmount)`: rewrites an item's lowest-amount price tier via `applyFieldEdits`; returns `null` when there are no tiers to reduce. Used by `semester-end`'s "reduce price" action. |
| `fbCategoryMap.ts` | Ordered regex → `"Top//Sub//Leaf"` Facebook category rules used by `fb-export` (49 ordered regex rules, plus 11 slug-level fallbacks). |
| `exportHistory.ts` | Reads/appends `exports/.export-history.json` (gitignored) backing `fb-export`'s Step 0 skip logic. |
| `configDefaults.ts` | Declarative registry (`key` / `afterKey` / `lines`) of injectable config fields used by `migrate-config` + `update-site` — currently covers price-filter UI settings, the sold-archive display limit, Google Analytics, contact-form notifications/scheduling config plus its enquiry-form and schedule-viewing UI strings, tag/course filter strings, and PDF export/contact UI strings. |
| `studioApi.ts` | Framework-agnostic HTTP handler for Studio: Zod-validated requests, slug allowlist + resolved-path containment against `content/items/`, JSON / file / SSE response variants, `StudioError` → status-coded JSON. Route regexes match the raw percent-encoded path; segments are decoded individually only after the match (traversal-safe). |
| `studioGit.ts` | `readChanges` / `publishChanges` + `GitError`: git status/commit/push restricted to `PUBLISHABLE_PATHS = [content, lib/generated/image-manifest.json]` — mirrors `pnpm push`, **never `git add -A`** (protects `.env.local`); `execFile` with argument arrays only (no shell); commit message via stdin (`-F -`), `MAX_MESSAGE_LENGTH=500`; `-c core.quotepath=false -z` so CJK/space filenames parse; handles detached HEAD (refuse), unborn branches, bare repos, and stranded-commit retries. |
| `studioImages.ts` | Photo upload/delete/reorder filesystem ops: `IMAGE_EXTENSIONS` = jpg\|jpeg\|png\|webp\|gif, filename normalisation (`sanitizeUploadFilename`, `IMAGE_FILENAME_RE` allowlist), magic-byte content sniffing (`sniffImageType`), collision-safe writes. |
| `studioSync.ts` | One-at-a-time CDN sync wrapper delivering SSE progress (`streamImageSync`); lock state lives on `globalThis` (shared across the tsx and Vite-bundled module copies) and is released when the work settles, not when the client disconnects. |
| `ssrfGuard.ts` | Generic SSRF-safe URL fetcher (`fetchUrlSafely`) used by both import-from-URL routes: scheme allowlist, DNS-resolve-then-validate-then-pin-the-connection (closes the DNS-rebinding TOCTOU gap), per-hop redirect re-validation, request timeout, and a streamed response-body size cap. No knowledge of Studio's routing or filesystem conventions — a standalone network primitive. |
| `urlImport.ts` | Pure HTML text-processing layer (`extractImportCandidates`): given already-fetched HTML and its page URL, guesses an item name (JSON-LD `Product.name` → `og:title` → `twitter:title` → `<title>` → first `<h1>`) and a filtered, deduped list of candidate photo URLs (JSON-LD `image` → `og:image` → `<img>`/`srcset` → `<link rel=preload as=image>`, junk/tracking-pixel filtering). Regex/string-based, not a DOM parser; never throws on malformed input. |

---

## `workers/shipping-rate-proxy/`

### What it is

A Cloudflare Worker that proxies shipping-rate requests from the static site's `ShippingEstimator` to **Shippo** or **EasyPost** and returns the cheapest rate: `{ amount, currency, carrier, service, estimatedDays }` (502 on provider failure / no rates). POST-only endpoint (OPTIONS handled for CORS preflight, otherwise 405); validates the request body (`destinationZip`, `destinationCountry`, `weight`, `dimensions`); converts kg → lb (Shippo) or → oz (EasyPost) and cm → inches (rounded up). Consumed client-side by `components/pricing/useShippingRate.ts` → `components/item/ShippingEstimator.tsx`, only when `siteConfig.shipping` is enabled, the item has weight/dimensions, and the resolved tier is the open-ended shipping tier.

### Why it exists

The site is a fully static export — carrier API keys must **never** ship in the browser bundle. The Worker keeps the key server-side and CORS-locks to exactly one `ALLOWED_ORIGIN` (which must equal `siteConfig.baseUrl`). See [DESIGN.md §21](DESIGN.md).

### Deploy & dev

Independent project with its own `package.json` (name `shipping-rate-proxy`, `compatibility_date = 2026-01-01`):

```bash
cd workers/shipping-rate-proxy
pnpm install

# 1. Plain vars — edit wrangler.toml [vars]:
#      SHIPPING_PROVIDER = "shippo" | "easypost"
#      ALLOWED_ORIGIN    = exact siteConfig.baseUrl (no trailing slash)
#      ORIGIN_ZIP / ORIGIN_COUNTRY  (siteConfig.shipping.origin)

# 2. Local dev:
cp .dev.vars.example .dev.vars   # put the test carrier key here (gitignored)
pnpm dev                          # wrangler dev

# 3. Deploy:
pnpm wrangler login               # once
pnpm wrangler secret put SHIPPO_API_KEY   # or EASYPOST_API_KEY — never in wrangler.toml
pnpm deploy                       # wrangler deploy → prints the workers.dev URL

# 4. Put the printed URL in content/config.ts → shipping.proxyUrl
#    (or run the /setup-shipping skill)
pnpm type-check                   # optional: tsc --noEmit for the worker package
```

Worker npm scripts (run from `workers/shipping-rate-proxy/`): `dev` (`wrangler dev`), `deploy` (`wrangler deploy`), `type-check` (`tsc --noEmit`).

---

## `workers/contact-form-proxy/`

### What it is

A Cloudflare Worker that relays buyer enquiries from the item detail page's `EnquiryForm.tsx` to the seller via **Discord**, **Telegram**, or **email** (Resend) — without exposing the seller's contact details directly. POST-only endpoint validating `itemCategory`, `itemSlug`, `itemName`, `buyerName`, `buyerContact`, `message` (≤2000 chars), an optional `offerAmount`, and a `honeypot` field: a non-empty honeypot is silently treated as spam and dropped, but the Worker still returns the same `200 { "ok": true }` as a real success so a bot can't tell its submission was rejected. `ALLOWED_ORIGIN` is checked server-side against the request's `Origin` header — a basic access gate, not a cryptographic guarantee. No persistent storage and no rate limiting/CAPTCHA by design (see the Worker's README for the recommended infra-level next steps — Cloudflare Turnstile, WAF rate-limiting rules — if spam becomes an issue). Consumed client-side only when `siteConfig.notifications.enabled` is `true`.

### Why it exists

The site is a fully static export — notification-delivery secrets (a Discord webhook URL, Telegram bot token, or Resend API key) must **never** ship in the browser bundle. The Worker keeps the secret server-side and CORS-locks to exactly one `ALLOWED_ORIGIN`, the same reasoning as `workers/shipping-rate-proxy/`. See [FEATURES_ROADMAP.md §3.1](FEATURES_ROADMAP.md).

### Deploy & dev

Independent project with its own `package.json` (name `contact-form-proxy`, `compatibility_date = 2026-01-01`); see [../workers/contact-form-proxy/README.md](../workers/contact-form-proxy/README.md) for the full walkthrough:

```bash
cd workers/contact-form-proxy
pnpm install

# 1. Plain vars — edit wrangler.toml [vars]:
#      NOTIFICATION_PROVIDER = "discord" | "telegram" | "email"
#      ALLOWED_ORIGIN         = exact siteConfig.baseUrl (no trailing slash)
#      SITE_BASE_URL          = same as ALLOWED_ORIGIN (links back to the item page)
#      TELEGRAM_CHAT_ID                                  (telegram only)
#      NOTIFICATION_EMAIL_TO / NOTIFICATION_EMAIL_FROM   (email only)

# 2. Local dev:
cp .dev.vars.example .dev.vars   # put the test provider's secret here (gitignored)
pnpm dev                          # wrangler dev

# 3. Deploy:
pnpm wrangler login               # once
pnpm wrangler secret put DISCORD_WEBHOOK_URL   # or TELEGRAM_BOT_TOKEN / RESEND_API_KEY
pnpm deploy                       # wrangler deploy → prints the workers.dev URL

# 4. Put the printed URL in content/config.ts → notifications.proxyUrl, set enabled: true
#    (or run the /setup-contact-form skill)
pnpm type-check                   # optional: tsc --noEmit for the worker package
```

Worker npm scripts (run from `workers/contact-form-proxy/`): `dev` (`wrangler dev`), `deploy` (`wrangler deploy`), `type-check` (`tsc --noEmit`).

---

## Environment Variable Reference

### Local machine (gitignored `.env.local`)

Parsed into `process.env` by `scripts/lib/loadEnv.ts` (existing env values always win). CI needs **none** of these — it builds from the committed `lib/generated/image-manifest.json`.

| Variable | Used by | Required when | Notes |
|---|---|---|---|
| `CF_R2_ACCOUNT_ID` | `lib/images/cloudflare-r2.ts` | `imageStorage.provider = "cloudflare-r2"` | Cloudflare Account ID for the R2 S3 client; consumed by `pnpm upload-images` and Studio's sync |
| `CF_R2_ACCESS_KEY_ID` | same | same | R2 API token access key ID (Object Read & Write, bucket-scoped) |
| `CF_R2_SECRET_ACCESS_KEY` | same | same | R2 API token secret access key |
| `CF_R2_BUCKET` | same | same | Name of the R2 bucket photos are uploaded to |
| `CF_R2_PUBLIC_URL` | same | same | Public base URL of the bucket (custom subdomain or r2.dev); used to build the CDN URLs stored in the manifest |
| `BLOB_READ_WRITE_TOKEN` | `lib/images/vercel-blob.ts` | `imageStorage.provider = "vercel-blob"` | Also set in Vercel Dashboard env vars for Vercel-hosted builds |
| `EDITOR` | `scripts/create-item.ts` | never (optional) | Opens the newly created `item.json` via `spawnSync` (no shell interpolation) |
| `NEXT_PUBLIC_SITE_URL` | `next-sitemap.config.js` (via `postbuild.ts`) | never (optional) | Production URL for sitemap + OG tags; fallback `https://your-domain.com`. The one documented exception: set as a **GitHub Actions Variable** (not a secret) for CI builds; optionally also in `.env.local` |

### Release tooling

| Variable | Used by | Notes |
|---|---|---|
| `GH_TOKEN` / `gh auth` | `scripts/bump-version.ts` | Shells out to `gh` (run list, release create); requires an authenticated `gh` CLI (`GH_TOKEN` or prior `gh auth login`). Not read directly from `process.env` in `scripts/`. |

### Worker (`workers/shipping-rate-proxy`)

| Variable | Kind | Where | Notes |
|---|---|---|---|
| `SHIPPING_PROVIDER` | plain var | `wrangler.toml [vars]` | `"shippo"` (default) or `"easypost"` — selects the carrier API |
| `ALLOWED_ORIGIN` | plain var | `wrangler.toml [vars]` | The only Origin allowed by CORS; must exactly match `siteConfig.baseUrl` (no trailing slash) |
| `ORIGIN_ZIP` | plain var | `wrangler.toml [vars]` | Parcel origin ZIP (`siteConfig.shipping.origin.zip`), sent as `address_from` |
| `ORIGIN_COUNTRY` | plain var | `wrangler.toml [vars]` | Parcel origin country code (e.g. `US`) |
| `SHIPPO_API_KEY` | **secret** | `wrangler secret put` (local: `.dev.vars`) | Shippo token, sent in the `Authorization: ShippoToken` header when provider = `shippo` |
| `EASYPOST_API_KEY` | **secret** | `wrangler secret put` (local: `.dev.vars`) | EasyPost key, base64'd into a Basic auth header when provider = `easypost` |

### Worker (`workers/contact-form-proxy`)

| Variable | Kind | Where | Notes |
|---|---|---|---|
| `NOTIFICATION_PROVIDER` | plain var | `wrangler.toml [vars]` | `"discord"` (default) \| `"telegram"` \| `"email"` — selects the notification channel |
| `ALLOWED_ORIGIN` | plain var | `wrangler.toml [vars]` | The only Origin allowed by CORS; must exactly match `siteConfig.baseUrl` (no trailing slash) |
| `SITE_BASE_URL` | plain var | `wrangler.toml [vars]` | Used to build the "view live listing" link in the notification message (the Worker can't import `content/config.ts`) |
| `TELEGRAM_CHAT_ID` | plain var | `wrangler.toml [vars]` | Chat/channel id to post into; only meaningful when provider = `telegram` |
| `NOTIFICATION_EMAIL_TO` | plain var | `wrangler.toml [vars]` | Seller's inbox address; only used when provider = `email` |
| `NOTIFICATION_EMAIL_FROM` | plain var | `wrangler.toml [vars]` | Must be on a domain verified with Resend; only used when provider = `email` |
| `DISCORD_WEBHOOK_URL` | **secret** | `wrangler secret put` (local: `.dev.vars`) | Discord webhook URL, required when provider = `discord` |
| `TELEGRAM_BOT_TOKEN` | **secret** | `wrangler secret put` (local: `.dev.vars`) | Telegram bot token, required when provider = `telegram` |
| `RESEND_API_KEY` | **secret** | `wrangler secret put` (local: `.dev.vars`) | Resend API key, required when provider = `email` |

---

## Security Notes

- **Path traversal:** `create-item`, `mark-sold`, `mark-available`, and `duplicate` (both slugs) validate kebab-case slugs (`isValidSlug`, shared with `generateStaticParams`) *before* any filesystem access. Studio route regexes match raw percent-encoded paths and decode segments individually only after the match; all file serving is containment-verified against `content/items/`.
- **Shell safety:** `create-item` uses `spawnSync` argument arrays (never shell interpolation) for `$EDITOR`; `studioGit` uses `execFile`-only with argument arrays.
- **Publish safety:** Studio binds **127.0.0.1 only** and its git publish never uses `git add -A` — it stages only `content/` + `lib/generated/image-manifest.json`, so `.env.local` (with CDN credentials) can never ride along.
- **Template updates:** `update-site` requires a clean working tree and restores the seller-owned image manifest after checkout.
- **Credentials:** carrier API keys stay server-side in the Worker (secrets via `wrangler secret put`; never in `wrangler.toml`); R2/Blob credentials live only in gitignored `.env.local` on the seller's machine.
- **Privacy:** `reserved_for` is private buyer info — it is excluded from the item template, denied by the Studio field allowlist, and never rendered on any public page.

---

## Cross-References

| Topic | Document |
|---|---|
| Architecture, data flow, module APIs | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Full `item.json` schema (36 top-level fields; 37 counting the private `reserved_for`) | [DESIGN.md §5](DESIGN.md) |
| `content/config.ts` full template | [DESIGN.md §13](DESIGN.md) |
| Shipping calculator integration | [DESIGN.md §21](DESIGN.md), [../workers/shipping-rate-proxy/README.md](../workers/shipping-rate-proxy/README.md) |
| Contact form / enquiry relay integration | [FEATURES_ROADMAP.md §3.1](FEATURES_ROADMAP.md), [../workers/contact-form-proxy/README.md](../workers/contact-form-proxy/README.md) |
| CDN setup walkthrough | [setup_instruction.md](setup_instruction.md) |
| Updating a downstream site | [UPDATE_GUIDE.md](UPDATE_GUIDE.md) |
| Deployment checklist (GitHub Pages + R2) | [TECH_REQUIREMENTS.md §19](TECH_REQUIREMENTS.md) |
| Testing strategy | [TECH_REQUIREMENTS.md §25](TECH_REQUIREMENTS.md) |
| Seller operations guide | [../SETUP_GUIDE.md](../SETUP_GUIDE.md) |
| Environment variable setup file | [../.env.example](../.env.example) |
