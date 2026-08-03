# UsedExchange — Scripts & Tooling Reference

**Version:** 1.0
**Date:** 2026-08-02
**Package version:** 1.4.2 (see `package.json`)

> Complete reference for every npm script, standalone CLI, and support module in the repository. For architecture and data flow see [ARCHITECTURE.md](ARCHITECTURE.md); for the full design specification see [DESIGN.md](DESIGN.md); for non-technical seller operations see [../SETUP_GUIDE.md](../SETUP_GUIDE.md).
>
> 🇨🇳 Chinese version: [SCRIPTS_zh.md](SCRIPTS_zh.md)

---

## Overview

- All CLIs live in `scripts/`, are executed with **tsx** (Node.js — no browser APIs), and are production tooling, not dev-only helpers.
- The root `package.json` defines **22 npm scripts**; `new` is an exact alias of `create-item`, and three scripts (`upload-images`, `dev`, `prebuild`) are thin wrappers over the three modes of `scripts/sync-images.ts`.
- **Sellers only ever edit files under `content/` by hand.** The CLIs below read and write `content/` *on your behalf* — you never need to open `app/`, `lib/`, or `scripts/` yourself.
- `workers/shipping-rate-proxy/` is an **independently deployed** Cloudflare Worker package with its own `package.json`; it is excluded from the root tsconfig / ESLint / Vitest scope.
- `lib/generated/image-manifest.json` is **committed to git** (Iron Rule 5). Scripts write it; CI reads it and needs no CDN credentials.

---

## npm Scripts

### Seller workflow

| Script | Runs | Purpose |
|---|---|---|
| `pnpm upload-images` | `tsx scripts/sync-images.ts --mode upload` | Upload new/changed photos to the CDN, strip EXIF/GPS, write the committed image manifest |
| `pnpm create-item <category>/<name>` | `tsx scripts/create-item.ts` | Scaffold a 36-field draft `item.json`, applying site/category `_defaults.json` first |
| `pnpm new <category>/<name>` | `tsx scripts/create-item.ts` | Exact alias of `create-item` |
| `pnpm create-template [category]` | `tsx scripts/create-template.ts` | Write a fully-commented `_template.json` sellers can copy |
| `pnpm mark-sold <category>/<item>` | `tsx scripts/mark-sold.ts` | Set `status="sold"` + `sold_date=today`, preserving JSONC comments |
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
- **API surface** (routed in `scripts/lib/studioApi.ts`): `GET /api/items`, `POST /api/items`, `POST /api/items/bulk-status`, `GET|PATCH /api/items/<cat>/<item>`, `GET /api/items/<cat>/<item>/images`, `GET …/images/<filename>` (file serve, `no-store`), `POST …/images` (base64 upload), `POST …/images/reorder`, `DELETE …/images/<filename>`, `POST /api/sync-images` (SSE progress/done/error), `GET /api/changes`, `POST /api/publish` (409 while a sync runs). Non-GET/HEAD requests pass `studio/csrfGuard.ts` (`Content-Type: application/json` required → 415; `Origin` must equal the server's own origin → 403).

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

### `export-facebook.ts` — Facebook Marketplace export

- **Command:** `pnpm fb-export` (fully interactive).
- **Flow:**
  - **Step 0** (only if `exports/.export-history.json` exists): `[s]` skip already-exported items (default) · `[v]` view previous runs then decide · `[n]` export everything.
  - **Step 1 — selection:** `[a]` all · `[N]` category number · `[m]` manual pick (numbers / ranges / `all`).
  - **Step 2 — price strategy:** `[1]` lowest tier (default) · `[2]` highest · `[3]` pickup (miles-limited tiers; shown only if any exist) · `[4]` shipping (open-ended tiers; shown only if any exist).
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
- **Purpose:** scans `content/config.ts` for config fields missing after a template upgrade and splices them in with defaults from the `CONFIG_DEFAULTS` registry in `scripts/lib/configDefaults.ts` (currently the `priceFilterStrategy` block plus the `filterPriceBucketAll` / `filterPriceIncludesOutliers` UIStrings keys). **Additive only** — never removes or modifies existing values. Consistent with Iron Rule 8, every injected field is TypeScript-optional with a runtime default at its consumption site, so downstream configs that skip migration still pass type-check. Skips (with a warning) any entry whose anchor line (`afterKey`) is not found; prints added field names or "config is up to date".
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

`scripts/update-site.test.ts`, `scripts/studioFields.test.ts`, plus `scripts/lib/*.test.ts` (`imageSync`, `itemEdit`, `itemFields`, `itemTemplate`, `markSold`, `studioApi`, `studioGit`, `studioImages`, `studioSync`) — all executed by the root `test` / `test:watch` / `test:coverage` scripts.

---

## `scripts/lib/` Support Modules

Not standalone runnables — imported by the CLIs above. Each has a colocated `*.test.ts` (where listed) run by `pnpm test`.

| Module | Purpose |
|---|---|
| `loadEnv.ts` | `.env.local` parser (`loadDotEnvLocal`); existing `process.env` values always win. Shared by `sync-images` + `studio` (tsx does not auto-load `.env.local`). |
| `imageSync.ts` ⭐ | Pure CDN pipeline: sha256 checksums, `scanImages` (skips `_`-prefixed dirs), `syncImagesToCdn` (`UPLOAD_CONCURRENCY=8`, per-file failure isolation, EXIF stripping, progress callbacks). Drives both `pnpm upload-images` and Seller Studio's sync. |
| `itemTemplate.ts` | 36-field `item.json` scaffold (`buildItemTemplate` / `renderItemTemplateJsonc`, injects `// options:` comments) shared by `create-item`, `create-template`, and Studio item creation. Excludes `reserved_for` (private — never rendered, Iron Rule 4). |
| `itemEdit.ts` | Surgical JSONC field edits via `jsonc-parser` (`applyFieldEdits`, `readItemField`, `readItemForEdit`) — comments and `reserved_for` survive every write. Used by `mark-sold` and Studio. |
| `itemFields.ts` | The strict Zod allowlist of browser-writable field paths (`resolveFieldSchema(path)` is the single authority — prototype-pollution-safe own-key lookup; plus `assertEditableValue`, `pickEditableFields`). No `.catch`/`.default`/`.preprocess`, so a `safeParse` failure is a hard rejection; drift tests assert key-set parity with `itemJsonSchema`. |
| `markSold.ts` | `applyMarkSold(text, today)`: status → `sold` + `sold_date`; returns `null` if already sold. |
| `fbCategoryMap.ts` | Ordered regex → `"Top//Sub//Leaf"` Facebook category rules used by `fb-export` (49 ordered regex rules, plus 11 slug-level fallbacks). |
| `exportHistory.ts` | Reads/appends `exports/.export-history.json` (gitignored) backing `fb-export`'s Step 0 skip logic. |
| `configDefaults.ts` | Declarative registry (`key` / `afterKey` / `lines`) of injectable config fields used by `migrate-config` + `update-site` — currently the `priceFilterStrategy` block plus the `filterPriceBucketAll` / `filterPriceIncludesOutliers` UIStrings keys. |
| `studioApi.ts` | Framework-agnostic HTTP handler for Studio: Zod-validated requests, slug allowlist + resolved-path containment against `content/items/`, JSON / file / SSE response variants, `StudioError` → status-coded JSON. Route regexes match the raw percent-encoded path; segments are decoded individually only after the match (traversal-safe). |
| `studioGit.ts` | `readChanges` / `publishChanges` + `GitError`: git status/commit/push restricted to `PUBLISHABLE_PATHS = [content, lib/generated/image-manifest.json]` — mirrors `pnpm push`, **never `git add -A`** (protects `.env.local`); `execFile` with argument arrays only (no shell); commit message via stdin (`-F -`), `MAX_MESSAGE_LENGTH=500`; `-c core.quotepath=false -z` so CJK/space filenames parse; handles detached HEAD (refuse), unborn branches, bare repos, and stranded-commit retries. |
| `studioImages.ts` | Photo upload/delete/reorder filesystem ops: `IMAGE_EXTENSIONS` = jpg\|jpeg\|png\|webp\|gif, filename normalisation (`sanitizeUploadFilename`, `IMAGE_FILENAME_RE` allowlist), magic-byte content sniffing (`sniffImageType`), collision-safe writes. |
| `studioSync.ts` | One-at-a-time CDN sync wrapper delivering SSE progress (`streamImageSync`); lock state lives on `globalThis` (shared across the tsx and Vite-bundled module copies) and is released when the work settles, not when the client disconnects. |

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

---

## Security Notes

- **Path traversal:** `create-item` and `mark-sold` validate kebab-case slugs (`isValidSlug`, shared with `generateStaticParams`) *before* any filesystem access. Studio route regexes match raw percent-encoded paths and decode segments individually only after the match; all file serving is containment-verified against `content/items/`.
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
| CDN setup walkthrough | [setup_instruction.md](setup_instruction.md) |
| Updating a downstream site | [UPDATE_GUIDE.md](UPDATE_GUIDE.md) |
| Deployment checklist (GitHub Pages + R2) | [TECH_REQUIREMENTS.md §19](TECH_REQUIREMENTS.md) |
| Testing strategy | [TECH_REQUIREMENTS.md §25](TECH_REQUIREMENTS.md) |
| Seller operations guide | [../SETUP_GUIDE.md](../SETUP_GUIDE.md) |
| Environment variable setup file | [../.env.example](../.env.example) |
