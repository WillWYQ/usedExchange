# UsedExchange — Technical Requirements

**Version:** 0.9.1  
**Date:** 2026-06-01  
**Companion:** DESIGN.md v0.9.1

---

## 1. Runtime & Tooling Requirements

| Requirement | Minimum | Recommended |
|---|---|---|
| Node.js | 20 LTS | 22 LTS |
| pnpm | 9 | 9 |
| Git | 2.40 | latest |
| OS (dev) | macOS 13, Ubuntu 22.04, Windows 11 WSL2 | macOS 15+ |

---

## 2. npm Dependencies

### 2.1 Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | `^15.0.0` | Framework: routing, SSG, image optimisation |
| `react` | `^19.0.0` | UI runtime |
| `react-dom` | `^19.0.0` | DOM renderer |
| `zod` | `^3.23.0` | JSON schema validation with safe defaults |
| `react-markdown` | `^9.0.0` | Renders Markdown `description` field |
| `remark-gfm` | `^4.0.0` | GitHub-flavoured Markdown tables + strikethrough |
| `clsx` | `^2.1.0` | Conditional class merging |
| `tailwind-merge` | `^2.3.0` | Tailwind class deduplication (used in `cn()` util) |
| `fuse.js` | `^7.0.0` | Client-side full-text search; index built at build time |
| `@vercel/analytics` | `^1.3.0` | Vercel Analytics — no-op outside Vercel; enabled when `siteConfig.analytics.vercel: true` |
| `@vercel/speed-insights` | `^1.0.0` | Vercel Speed Insights — no-op outside Vercel; enabled when `siteConfig.analytics.speedInsights: true` |

### 2.2 Aceternity UI Peer Requirements

Aceternity components are installed individually via their CLI. The following packages are required by most components and must be present:

| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | `^11.0.0` | Animations used by Aceternity components |
| `@tabler/icons-react` | `^3.0.0` | Icon set used by contact platform buttons |

> Aceternity components are copied into `components/ui/` at install time. They are treated as source files — do not install Aceternity as a package dependency.
>
> Each UI slot adapter (`components/ui-adapters/`) only imports the Aceternity components the seller has explicitly installed and registered. Only install the components you actually configure. See DESIGN.md §18 for the full slot ↔ component registry and install commands.

### 2.3 Development Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.5.0` | Type checking |
| `@types/node` | `^20.0.0` | Node.js types for `fs`, `path` in loader/scripts |
| `@types/react` | `^19.0.0` | React types |
| `@types/react-dom` | `^19.0.0` | ReactDOM types |
| `tailwindcss` | `^4.0.0` | Utility CSS — v4, CSS-first; see §22.2 for setup |
| `@tailwindcss/postcss` | `^4.0.0` | PostCSS integration for Tailwind v4 (replaces the v3 `tailwindcss` PostCSS plugin) |
| `@tailwindcss/typography` | `^0.5.13` | Prose styles for Markdown descriptions; registered via `@plugin` in CSS (v4-compatible) |
| `eslint` | `^9.0.0` | Linting |
| `eslint-config-next` | `^15.0.0` | Next.js ESLint preset |
| `prettier` | `^3.3.0` | Code formatting |
| `prettier-plugin-tailwindcss` | `^0.6.0` | Sorts Tailwind classes automatically |
| `tsx` | `^4.15.0` | Runs `scripts/sync-images.ts` and other scripts without a separate compile step |
| `next-sitemap` | `^4.2.0` | Generates `sitemap.xml` + `robots.txt` in `postbuild` |

### 2.4 Image Storage Provider Dependencies

These are **conditionally required** based on `siteConfig.imageStorage.provider`. Install only the ones matching your chosen provider.

| Package | Version | Provider | Purpose |
|---|---|---|---|
| `@vercel/blob` | `^0.27.0` | `"vercel-blob"` | Upload images to Vercel Blob CDN via SDK |
| `@aws-sdk/client-s3` | `^3.600.0` | `"cloudflare-r2"` | Upload images to Cloudflare R2 (S3-compatible API) |

> These packages are **not** imported in any app code — only in `scripts/sync-images.ts` which runs at build time (Node.js). They should be listed as **devDependencies** since they are build-time-only tools.

Installation by provider:
```bash
# Cloudflare R2 (recommended — zero egress cost, works with GitHub Pages or any host)
pnpm add -D @aws-sdk/client-s3

# Vercel Blob (for Vercel deployments)
pnpm add -D @vercel/blob
```

### 2.5 Image Storage — Vercel devDependency Note

> ⚠️ `@vercel/blob`, `@aws-sdk/client-s3`, and `tsx` are listed as **devDependencies**. Vercel installs devDependencies by default during the build step. If you have customised the install command (e.g., `pnpm install --prod`), the `prebuild` script will fail. Ensure Vercel's install command does **not** skip devDependencies.

### 2.6 Optional / Future Dependencies

These are not installed in v1 but are the designated choices when the extension points in DESIGN.md §19 are implemented:

| Package | Feature | Extension point |
|---|---|---|
| `sharp` | Pre-upload image resizing/optimisation | Optional `preprocess` step in `scripts/sync-images.ts --mode upload` |

---

## 3. Environment Variables

All content configuration lives in `content/config.ts` (TypeScript, type-checked, inside the seller-managed `content/` folder). Only infrastructure secrets and deployment-specific overrides use `.env`.

### 3.1 Variables

| Variable | Required | When | Where to set |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | No | Always | `.env.local` (local) · GitHub Actions Variable · Vercel env vars. Overrides `siteConfig.baseUrl`; useful when the deploy URL differs from the configured base. Falls back to `siteConfig.baseUrl`. |
| `CF_R2_ACCOUNT_ID` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | `.env.local` only — never needed in CI. Cloudflare Dashboard → right sidebar. |
| `CF_R2_ACCESS_KEY_ID` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | `.env.local` only — never needed in CI. |
| `CF_R2_SECRET_ACCESS_KEY` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | `.env.local` only — never needed in CI. |
| `CF_R2_BUCKET` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | `.env.local` only — never needed in CI. |
| `CF_R2_PUBLIC_URL` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | `.env.local` only — never needed in CI. Public base URL for the bucket (custom domain or `r2.dev` URL). |
| `BLOB_READ_WRITE_TOKEN` | **Yes** | `imageStorage.provider === "vercel-blob"` | `.env.local` (local) · Vercel env vars. Generate in Vercel Dashboard → Storage → Blob → your store → Settings. |


The app **must build and serve correctly with zero `.env` file** when `imageStorage.provider === "local"`.

### 3.2 `.env.example`

```bash
# ── Site URL override (optional) ─────────────────────────────────────────────
# Overrides siteConfig.baseUrl. Set as a GitHub Actions Variable for production URL.
# NEXT_PUBLIC_SITE_URL=https://your-domain.com

# ── Cloudflare R2  (required when imageStorage.provider === "cloudflare-r2") ─
# LOCAL only — copy to .env.local; NEVER needed in GitHub Actions or CI.
# pnpm upload-images runs only on your machine.
# CF_R2_ACCOUNT_ID=
# CF_R2_ACCESS_KEY_ID=
# CF_R2_SECRET_ACCESS_KEY=
# CF_R2_BUCKET=usedexchange-images
# CF_R2_PUBLIC_URL=https://images.your-domain.com

# ── Vercel Blob  (required when imageStorage.provider === "vercel-blob") ──────
# Generate at: Vercel Dashboard → Storage → Blob → <store> → Settings
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### 3.3 Local development with cloud provider

When running `pnpm dev` locally, the sync script uses the `"local"` provider regardless of
`content/config.ts` — no cloud credentials are needed for development. To test cloud upload
locally, run `pnpm upload-images` (a dedicated script that respects the configured provider)
with credentials set in a local `.env.local` file.

---

## 4. next.config.ts Specification

```ts
import type { NextConfig } from "next";
import { siteConfig } from "./content/config";

// Build the list of allowed remote image hostname patterns for next/image.
// Only needed in "vercel" deploymentMode; static mode uses plain <img>.
const remotePatterns: NextConfig["images"]["remotePatterns"] = [];

if (siteConfig.imageStorage.provider === "vercel-blob") {
  // Vercel Blob public URLs: *.public.blob.vercel-storage.com
  remotePatterns.push({
    protocol: "https",
    hostname: "*.public.blob.vercel-storage.com",
  });
}

if (siteConfig.imageStorage.provider === "cloudflare-r2") {
  // Custom R2 public domain (e.g. images.your-domain.com or *.r2.dev)
  const r2Url = new URL(process.env.CF_R2_PUBLIC_URL ?? "https://example.com");
  remotePatterns.push({
    protocol: "https",
    hostname: r2Url.hostname,
  });
}

const nextConfig: NextConfig = {
  // Switch to full static export when deploymentMode is "static"
  ...(siteConfig.deploymentMode === "static" && { output: "export" }),

  images: {
    // Static mode: no server for image optimisation → use plain <img> via AdaptiveImage
    unoptimized: siteConfig.deploymentMode === "static",
    // Vercel mode: allow remote CDN hostnames for next/image
    remotePatterns,
  },

  // Disable x-powered-by header (minor security hardening)
  poweredByHeader: false,
};

export default nextConfig;
```

> `next.config.ts` reads `siteConfig` at build time (not in the browser bundle), so importing `content/config.ts` here is safe even though it's not a `NEXT_PUBLIC_*` variable.

---

## 5. TypeScript Configuration

`tsconfig.json` must include:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,    // catches array[i] = undefined
    "noImplicitOverride": true,
    "paths": {
      "@/*": ["./*"]                     // alias: @/content/config → ./content/config
    }
  },
  // "**/*.ts" already covers content/config.ts; the explicit entry below is
  // retained as documentation to make the inclusion of content/ intentional and visible.
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

> `.env.local` is covered by the existing `.env.*` pattern in `.gitignore`. No separate entry is needed, but do not add any credential files manually.

`noUncheckedIndexedAccess` is required — the loader indexes into arrays from directory reads, and this catches unsafe accesses at compile time.

---

## 6. Zod Schema Requirements

### 6.1 Parsing contract

- Use `schema.safeParse(raw)` everywhere. Never use `.parse()` (throws on bad input).
- On failure: log a warning with the item path + ZodError summary; return the item with all valid fields merged with defaults.
- On success: return the parsed, default-merged object.

### 6.2 Default merge helper

```ts
// lib/content/schema.ts

function withDefaults<T>(partial: Partial<T>, defaults: T): T {
  return { ...defaults, ...Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== null && v !== undefined)
  )} as T;
}
```

### 6.3 Schema validation strictness per field

| Field | Behaviour on invalid value |
|---|---|
| `name` (required) | If empty string or missing → item is skipped entirely; warning logged |
| `status` | If not a valid enum value → default `"available"` |
| `condition` | If not a valid enum value → default `"good"` |
| `price.tiers` | If not an array → treat as `[]` |
| Any number field | If absent → Zod default (`null` for most number fields; `1` for `quantity`). If present but NaN or non-numeric → `null`. If negative → `null`. Zero (`0`) is a valid value and is NOT converted to `null` (e.g., `age_years: 0` = brand new, `original_price: 0` = gifted). |
| `price.currency` | If absent → falls back to `siteConfig.currency`. Item-level `price.currency` takes precedence over site-level config. |
| Any URL field | If fails URL parse → `""` (not rendered) |
| `listed_date` / `sold_date` | Expected format: date-only `YYYY-MM-DD` (written by `pnpm mark-sold` and the AI skills). Full ISO timestamps (e.g. `2026-05-28T10:00:00Z`) are also accepted — parse the date portion only. Any other string → `null`. Sold retention: `null sold_date` → falls back to `listed_date` for the formula (consistent with DESIGN.md §5 field defaults). If `listed_date` is also null, the item is treated as "keep" (never expires). |

---

## 7. Image Sync Script — `scripts/sync-images.ts`

### Image Storage Adapter Interface

All three providers implement this interface. The script instantiates the correct one based on `siteConfig.imageStorage.provider`.

```ts
// lib/images/adapter.ts

export interface ImageStorageAdapter {
  /**
   * Ensure the image at `sourcePath` is available for serving.
   * Returns the public URL to embed in the manifest.
   * @param sourcePath   Absolute path to the source image file
   * @param manifestKey  Relative key: "{categorySlug}/{itemSlug}/{filename}"
   * @param checksum     SHA-256 hex of the file (for incremental skip logic)
   */
  syncImage(sourcePath: string, manifestKey: string, checksum: string): Promise<string>;

  /**
   * Called once at the start of a build run with the previously saved
   * checksum map. The adapter may use this to skip unchanged files.
   */
  loadChecksums(saved: Record<string, string>): void;

  /**
   * Returns the updated checksum map to persist after the run.
   */
  getUpdatedChecksums(): Record<string, string>;
}
```

### Provider Implementations

#### `local` (default for `pnpm dev`, always used when no cloud credentials exist)
- `syncImage()`: copies file from `content/items/` to `public/items/{manifestKey}`, returns `/items/{manifestKey}`
- Skips copy when `mtime + size` unchanged (equivalent to checksum match for speed)

#### `vercel-blob`
- `syncImage()`: compares SHA-256 to saved checksum; if changed, calls `@vercel/blob put(manifestKey, fileBuffer, { access: "public" })`; returns the returned `url`
- Requires `BLOB_READ_WRITE_TOKEN` in environment; throws descriptive error if absent

#### `cloudflare-r2`
- `syncImage()`: compares SHA-256; if changed, calls S3 `PutObjectCommand` to R2 endpoint; constructs public URL as `${CF_R2_PUBLIC_URL}/${manifestKey}`
- Requires all `CF_R2_*` env vars; throws descriptive error if any are absent

### Two Execution Modes

The script operates in two distinct modes controlled by the `--mode` flag:

| Mode | Triggered by | Image source | Uploads? | Writes manifest? | Prints backup reminder? |
|---|---|---|---|---|---|
| `upload` | `pnpm upload-images` (seller's machine) | `content/items/` (photos present locally) | Yes — to configured CDN provider | Yes — **committed to git** | **Yes** |
| `dev-sync` | `pnpm dev` (seller's machine) | `content/items/` (photos present locally) | No — copies to `public/items/` | No — uses local `/items/` paths | No |
| `build-check` | `pnpm build` / Vercel prebuild | No images (gitignored on Vercel runner) | No — manifest already committed | No — reads existing manifest | No |

All modes always copy `content/contact/**` → `public/contact/` as a final step (QR codes; git-tracked source, generated output).

### Script Execution Steps

#### `upload` mode (`pnpm upload-images`)

1. Verify required env vars for configured provider; print clear error and exit 1 if missing
2. Load `.image-cache/checksums.json` (create empty `{}` if missing)
3. Instantiate the selected adapter (`vercel-blob` or `cloudflare-r2`), pass saved checksums
4. Scan `content/items/**` for image files (regex: `/\.(jpg|jpeg|png|webp|gif)$/i`)
5. For each image: compute SHA-256; call `adapter.syncImage()` (skips unchanged); record CDN URL
6. **Purge stale entries**: remove any manifest key whose source file no longer exists in `content/items/`. This handles deleted item folders — stale CDN URLs are dropped from the manifest so the loader never references them.
7. Copy `content/contact/**` → `public/contact/`
8. Write `lib/generated/image-manifest.json` ← **this file must be committed to git**
9. Write updated `.image-cache/checksums.json`
10. **Photo quality check** (advisory warnings, never blocks upload):
    - Any image < 800px wide → warn "cover.jpg in {item} may appear blurry"
    - Any image > 8 MB → warn "{filename} is large; consider resizing before upload"
    - Item folder has images but none named `cover.*` → warn "No cover.* found in {item}; first alphabetical image used"
    - Item folder in content/items/ has no images at all → warn "No images found for {item}"
11. Print summary: `[upload-images] provider=vercel-blob  uploaded=12  skipped=47  purged=3  total=59  warnings=2`
12. Print **BACKUP REMINDER** (see below)
13. Exit code 1 on any unrecoverable error

> **Note on orphaned CDN blobs:** Purging a manifest entry removes the URL reference but does **not** delete the file from Vercel Blob or R2. Orphaned blobs accumulate silently. Cloud storage (Blob/R2) is cheap enough that this is acceptable for v1; a future `pnpm clean-storage` command can reconcile the manifest against the CDN bucket.

#### `dev-sync` mode (`pnpm dev`)

1. Check if `content/items/` exists; if not, log `[dev-sync] content/items/ not found — skipping image copy` and continue (graceful, no crash)
2. Scan `content/items/**` for image files
3. Copy each to `public/items/{same relative path}` (incremental: skip if `mtime + size` unchanged)
4. Copy `content/contact/**` → `public/contact/`
5. Log: `[dev-sync] copied N images to public/items/, M contact files to public/contact/` (or `0 images` if empty)
6. Do NOT upload to cloud. Do NOT write manifest.

#### `build-check` mode (`pnpm build` prebuild — runs on Vercel or locally)

1. Copy `content/contact/**` → `public/contact/` (git-tracked source, always present)
2. **Check provider:**
   - If `imageStorage.provider === "local"`:
     - Photos may be present locally (self-hosted static build on the seller's machine)
     - Act as `dev-sync`: copy `content/items/**` images → `public/items/`
     - Do NOT check or write a manifest
     - **Ignore any existing `lib/generated/image-manifest.json`** — the loader falls through to `/items/{key}` local paths when provider is `"local"`. A stale CDN manifest from a previous cloud provider must not be used.
     - Log: `[build-check] local provider — copied N images to public/items/`
     - Exit 0
   - If provider is `"vercel-blob"` or `"cloudflare-r2"`:
     - Photos are NOT present (gitignored on Vercel's runner)
     - Check if `lib/generated/image-manifest.json` exists
     - If exists: log `[build-check] manifest found (N entries) — skipping upload` and exit 0
     - If missing: log a **warning** (not error) `[build-check] WARNING: manifest not found — item images will show as broken`; exit 0 (graceful degradation; does not halt the build)

> **Why `local` provider gets special handling in `build-check`:** The `local` provider never writes a manifest — it always relies on files being present in `public/items/`. On a local machine, photos are present during `pnpm build`, so they must be copied. On Vercel, `local` provider is inappropriate (photos are gitignored); sellers using Vercel should use `vercel-blob` or `cloudflare-r2`.

### Backup Reminder Output

Printed to stdout after every successful `upload` run:

```
╔══════════════════════════════════════════════════════════════╗
║  ⚠️   BACKUP REMINDER                                         ║
║                                                              ║
║  Your item photos are NOT tracked by git.                    ║
║  Cloud storage (Vercel Blob / R2) is a delivery layer,       ║
║  NOT a backup — it can be accidentally wiped.                ║
║                                                              ║
║  Please ensure your  content/  folder is backed up to:       ║
║    • External hard drive or Time Machine                     ║
║    • iCloud Drive / Google Drive / Dropbox                   ║
║                                                              ║
║  Next steps:                                                 ║
║    git add lib/generated/image-manifest.json                 ║
║    git add content/**/*.json content/config.ts               ║
║    git commit -m "chore: update listings"                    ║
╚══════════════════════════════════════════════════════════════╝
```

### `package.json` scripts

```json
{
  "scripts": {
    "setup-ui":        "bash scripts/setup-ui.sh",
    "upload-images":   "tsx scripts/sync-images.ts --mode upload",
    "create-item":     "tsx scripts/create-item.ts",
    "create-template": "tsx scripts/create-template.ts",
    "new":             "tsx scripts/create-item.ts",
    "mark-sold":       "tsx scripts/mark-sold.ts",
    "prebuild":        "tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts",
    "build":           "next build",
    "postbuild":       "tsx scripts/postbuild.ts",
    "dev":             "tsx scripts/sync-images.ts --mode dev-sync && next dev --turbo",
    "type-check":      "tsc --noEmit",
    "lint":            "eslint . --max-warnings 0",
    "format":          "prettier --write ."
  }
}
```

| Script | When to run | Who runs it |
|---|---|---|
| `pnpm upload-images` | After adding, replacing, or deleting photos | Seller, on their machine |
| `pnpm mark-sold <cat>/<name>` | After an item sells — sets `status: "sold"` and `sold_date` | Seller, on their machine |
| `pnpm build` | Deploy to production — runs `prebuild` (image sync + search index) then `next build` then `postbuild` (sitemap) | GitHub Actions on push (or Vercel on the Vercel path); seller for local builds |
| `pnpm dev` | Local development preview — note: `public/search-index.json` is NOT rebuilt on `pnpm dev`; run `pnpm build` once first to populate it | Seller, on their machine |

> **`scripts/build-search-index.ts`** — called in the `prebuild` step (before `next build`). Imports `buildSearchIndex()` from `lib/search/index.ts`, writes the fuse.js search index to `public/search-index.json`, and exits 1 on error. Because it runs in `prebuild` (before `next build`), the index is ready when the `SearchBar` fetches it at runtime. `public/search-index.json` is gitignored — it is regenerated on every build.

> **`scripts/postbuild.ts`** — called in the `postbuild` step (after `next build`). Reads `siteConfig.sitemap.enabled`; if true, runs `next-sitemap` to generate `public/sitemap.xml` and `public/robots.txt`; if false, prints a skip message and exits 0. This is the canonical implementation of "the postbuild script checks this before running" from §22.7.

---

## 8. Content Loader API — `lib/content/loader.ts`

All functions are async (use `fs/promises`) and run only at build time (no browser bundle).

```ts
// Returns all valid categories in display order (see DESIGN.md §6 sort logic)
export async function loadCategories(): Promise<Category[]>

// Returns all items for a category, filtered by visibility rules
// (excludes draft; excludes sold past retention)
export async function loadItemsByCategory(categorySlug: string): Promise<Item[]>

// Returns a single item, or null if folder/item.json is missing or name is empty
export async function loadItem(
  categorySlug: string,
  itemSlug: string
): Promise<Item | null>

// Returns items for the home page "Recently Listed" strip ONLY.
// Applies MORE RESTRICTIVE filters than loadItemsByCategory():
//   - status === "available" ONLY (reserved, pending, sold, draft all excluded)
//   - excludes expired-sold items
// Results sorted by listedDate descending, limited to siteConfig.recentlyListedCount.
//
// ⚠️  Do NOT use this function for the /all page. The /all page aggregates
// loadItemsByCategory() across every category so it includes reserved, pending,
// and toggleable-sold items — the same set as any individual category page.
export async function loadAllItems(): Promise<Item[]>

// Returns ALL sold items for the /sold archive page.
// No retention filter — shows every item that ever had status "sold".
// Sorted by soldDate descending (falls back to listedDate if soldDate absent).
export async function loadSoldItems(): Promise<Item[]>

// Note: buildSearchIndex() is NOT part of loader.ts.
// It lives in lib/search/index.ts and is called by scripts/build-search-index.ts (prebuild).
// See §22.1 for the full specification and SearchIndexEntry type.
```

### Type definitions (abbreviated — see `lib/content/types.ts` for full definitions)

#### `Category`

```ts
export type Category = {
  slug: string;               // folder name under content/items/
  displayName: string;        // from _category.json display_name, or auto-capitalised slug
  description: string;        // from _category.json; default ""
  icon: string;               // emoji from _category.json; default ""
  sortOrder: number | null;   // from _category.json; null = sort alphabetically
  availableItemCount: number; // items with status "available"
  coverImage: string | null;  // first available item's cover image URL; null if none
};
```

#### `PriceTier` and `Price`

```ts
export type PriceTier = {
  label: string;
  miles_min?: number;   // absent = no lower bound (open start)
  miles_max?: number;   // absent = no upper bound (open-ended; matches Infinity distance)
  amount: number;
};

export type Price = {
  currency: string;
  tiers: PriceTier[];
  negotiable: boolean;
};
```

> `miles_max` is **absent** (key missing in JSON) for open-ended tiers — not a large number. A large number is NOT treated as open-ended by `resolveItemPrice`. See DESIGN.md §17.

#### `Item` (abbreviated — see `lib/content/types.ts` for full definition)

```ts
export type Item = {
  // Resolved slugs
  categorySlug: string;
  itemSlug: string;

  // From item.json (with defaults applied)
  name: string;
  description: string;
  condition: Condition;
  status: Status;
  price: Price;
  brand: string;
  model: string;
  quantity: number;
  tags: string[];
  listedDate: string;       // ISO 8601 string or build date
  soldDate: string | null;
  preferredPayment: string[];
  contactNote: string;
  originalSource: string;
  originalLink: string;
  originalPrice: number | null;
  dimensions: Dimensions | null;
  weight: Weight | null;
  color: string;
  metaDescription: string;  // auto-generated if empty in JSON

  // Resolved by loader (via image-manifest.json → CDN URL, or /items/... fallback)
  images: string[];         // CDN URLs (vercel-blob/r2) or /items/... local paths
  coverImage: string | null;
};
```

---

## 9. `AdaptiveImage` Component Specification

```tsx
// components/common/AdaptiveImage.tsx

type Props = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  priority?: boolean;
};
```

- When `siteConfig.deploymentMode === "vercel"`: renders `<Image>` from `next/image`
- When `siteConfig.deploymentMode === "static"`: renders `<img>` with identical props (no optimisation)
- This component is the only place where `next/image` is imported. All other components use `<AdaptiveImage>`.
- `fill` mode maps to `style={{ objectFit: 'cover' }}` in the `<img>` fallback

---

## 10. Contact Section Component Specification

### `ContactSection` (client component)

Props:
```ts
type ContactSectionProps = {
  item?: Item;                  // item context for geo-resolved price + pre-filled messages
                                // omit (or pass undefined) when used in footer
  preferredPayment: string[];   // item-level; pass [] from footer
  contactNote: string;          // item-level; pass "" from footer
  // platforms and seller location come from siteConfig — no need to pass separately
};
```

Behaviour:
- If `siteConfig.contact.reveal_behavior === "click"`: renders a "Show contact info" button; platforms revealed on click; state managed with `useState`
- If `reveal_behavior === "always"`: renders platforms immediately
- `preferredPayment` block is not rendered when the array is empty
- `contactNote` block is not rendered when the string is empty or whitespace-only
- **Footer usage:** Pass `preferredPayment={[]}` and `contactNote=""` (omit `item`). The component renders only the platform buttons with no payment or note blocks — no separate footer-specific component is needed.

**Geo-resolved price in pre-filled messages:**
When `item` is provided, `ContactSection` independently resolves the geo price for WhatsApp and email pre-fills:

1. Calls `useGeolocation()` + `useDistancePricing(siteConfig.location, geoState)` internally
2. Calls `resolveItemPrice(item.price, resolved)` → `resolvedPrice: PriceTier | null`
3. Passes `item` and `resolvedPrice` to each `PlatformButton` for use in `constructUrl`

Because `navigator.geolocation.getCurrentPosition` is called with `maximumAge: 300_000`, the browser returns the already-cached position instantly (no second prompt, no visible delay). `ContactSection` and `PricingSection` independently invoke the same geo hooks and both resolve from the same browser cache — two invocations, one underlying permission.

When `resolvedPrice` is `null` (empty `price.tiers`), the price token is omitted from the pre-fill message and only the item name is used.

### `PlatformButton`

- Link-based: `<a href={constructUrl(platform, item, resolvedPrice)} target="_blank" rel="noopener noreferrer">`
- QR-based: `<button onClick={() => setModalOpen(true)}>`

**`constructUrl` signature:**
```ts
function constructUrl(
  platform: Platform,
  item?: Item,
  resolvedPrice?: PriceTier | null
): string | null   // null → QR type (handled by QRModal, not a link)
```

**`constructUrl` — Discord special handling:**

Discord `value` can be either:
- A numeric user ID (17–19 digits; typically 18 per Discord Snowflake spec) → `https://discord.com/users/{value}` (direct message link)
- A server invite code (e.g. `abc123`) → `https://discord.gg/{value}` (server invite)

Detection: if `value` matches `/^\d{17,19}$/` treat as user ID; otherwise treat as server invite code. The 17–19 range intentionally covers the full Discord Snowflake ID spec rather than hard-coding 18.

### `QRModal` (client component)

- Uses Aceternity `Modal` or native `<dialog>` element
- Renders `<AdaptiveImage src={platform.qr_image} alt={platform.label + " QR Code"} />`
- Closes on backdrop click or Escape key

---

## 11. Routing & Static Generation

### `generateStaticParams` for `/[category]`

```ts
export async function generateStaticParams() {
  const categories = await loadCategories();
  return categories.map((c) => ({ category: c.slug }));
}
```

### `generateStaticParams` for `/[category]/[item]`

```ts
export async function generateStaticParams() {
  const categories = await loadCategories();
  const pairs = await Promise.all(
    categories.map(async (c) => {
      const items = await loadItemsByCategory(c.slug);
      return items.map((i) => ({ category: c.slug, item: i.itemSlug }));
    })
  );
  return pairs.flat();
}
```

- `draft` items are excluded from params (no page generated)
- `sold` items past retention are excluded from params (no page generated)
- `generateMetadata` reads the item and returns Open Graph + Twitter card tags including `og:image` (item `coverImage`)

---

## 12. Performance Requirements

| Metric | Target |
|---|---|
| Lighthouse Performance (mobile) | ≥ 80 |
| Lighthouse Accessibility | ≥ 90 |
| Largest Contentful Paint | < 2.5 s (Vercel mode) |
| Total Blocking Time | < 300 ms |
| JS bundle (first load) | < 150 KB gzipped |
| Image format | WebP preferred; JPEG/PNG accepted |
| Image size (cover) | Recommend ≤ 1200px wide; not enforced, just documented |

---

## 13. Browser Support

| Browser | Minimum version |
|---|---|
| Chrome | 109 |
| Safari | 16 |
| Firefox | 115 |
| Edge | 109 |
| Mobile Safari (iOS) | 16 |
| Samsung Internet | 21 |

No IE support. CSS Grid and `aspect-ratio` are used freely.

---

## 14. Accessibility Requirements

- All images must have non-empty `alt` text (item name as fallback minimum)
- All interactive elements (buttons, links) must have visible focus rings (Tailwind `focus-visible:ring`)
- Color contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text
- Modal (`QRModal`) must trap focus and restore focus on close
- Status and condition badges must not rely on color alone (include text label)
- Page `<title>` and `<meta name="description">` must be populated for every route

---

## 15. Security Requirements

| Concern | Mitigation |
|---|---|
| `reserved_for` field | Never rendered on any page; stripped in `Item` type by returning it only in internal loader type |
| External links | All `<a>` tags opening new tabs use `rel="noopener noreferrer"` |
| `original_link` rendering | Validated as URL by Zod before rendering; empty string if invalid |
| JSON parsing | Zod schema; raw `JSON.parse` errors caught and logged; item skipped |
| Path traversal | Image paths constructed from known slugs only; no user-supplied path segments at runtime |
| `meta_description` | Truncated to 160 chars; not rendered as HTML (plain text only) |
| `poweredByHeader: false` | Suppresses `X-Powered-By: Next.js` response header |

---

## 16. Linting & Formatting Rules

`.eslintrc` (extends `next/core-web-vitals`), additional rules:

```json
{
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error", "log"] }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "import/no-default-export": "off"
  },
  "overrides": [
    {
      "files": ["scripts/**/*.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

> The `scripts/` override disables `no-console` for build scripts entirely. The sync script uses `console.log` extensively for progress output — these are intentional, not debug statements.

`prettier.config.js`:

```js
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  plugins: ["prettier-plugin-tailwindcss"],
};
```

---

## 17. File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase `.tsx` | `ItemCard.tsx` |
| Hooks | camelCase with `use` prefix | `useFilters.ts` |
| Lib modules | camelCase `.ts` | `loader.ts`, `schema.ts` |
| Scripts | kebab-case `.ts` | `sync-images.ts` |
| Config files | kebab-case `.ts` | `content/config.ts`, `next.config.ts`, `tailwind.config.ts` |
| Content folders | kebab-case | `ikea-desk-lamp/`, `cast-iron-pan/` |
| Content JSON | fixed name | `item.json`, `_category.json` |

---

## 18. Git Conventions

### Branch strategy
- `main` — production; auto-deploys to Vercel on push
- `dev` — integration branch for multi-change work
- Feature branches: `feat/`, `fix/`, `chore/` prefixes

### Commit message format (Conventional Commits)
```
feat(item): add QR modal for WeChat contact
fix(loader): handle missing sold_date gracefully
chore(deps): upgrade next to 15.1.0
```

### `.gitignore` additions required
```
# ── Item photos (local + CDN only — NOT committed to git) ────────────────────
# Upload to CDN with: pnpm upload-images
# Keep a personal backup of your content/ folder (external drive / cloud backup).
# The manifest (lib/generated/image-manifest.json) IS committed — not these files.
content/items/**/*.jpg
content/items/**/*.jpeg
content/items/**/*.png
content/items/**/*.webp
content/items/**/*.gif
content/items/**/*.JPG
content/items/**/*.JPEG
content/items/**/*.PNG
content/items/**/*.WEBP
content/items/**/*.GIF

# ── Generated public asset copies (populated at build/dev time) ──────────────
public/items/
public/contact/
public/search-index.json

# ── Incremental upload cache (seller's machine only) ─────────────────────────
.image-cache/

# ── Next.js build output ──────────────────────────────────────────────────────
.next/
out/
```

> **Mixed-case extensions** (e.g. `.Jpg`, `.jPg`) are not covered by the patterns above. They are extremely rare in practice (cameras save `.jpg` or `.JPG`). If they appear, git will track them; `pnpm upload-images` still handles them (the scan regex uses the `/i` flag). Rename to lowercase before placing in `content/items/` if you want git to ignore them.

**What is intentionally NOT gitignored:**
- `content/**/*.json` — inventory metadata, always committed
- `content/config.ts` — site configuration, always committed
- `content/contact/` — QR code image sources (tiny, git-tracked; `public/contact/` is the generated copy)
- `lib/generated/image-manifest.json` — CDN URL map, committed after `pnpm upload-images`

> **`public/search-index.json` is gitignored** — it is generated by the prebuild step (`scripts/build-search-index.ts`) and written directly to `public/` so `SearchBar` can fetch it via HTTP at runtime. It is NOT stored in `lib/generated/`. See TECH_REQUIREMENTS.md §22.1 and IMPLEMENTATION_PLAN.md Phase 13.

---

## 19. Deployment Checklist

### GitHub Pages + Cloudflare R2 ✅ (recommended path)

> ⚠️ **R2 credentials are local-only.** `pnpm upload-images` runs on the seller's machine.
> GitHub Actions only runs `pnpm build` (build-check mode — reads committed manifest, no uploads).
> **No secrets are needed in GitHub Actions.**

**One-time setup (do once, then forget):**
- [ ] Run `pnpm setup-ui` → installs all Aceternity UI components → commit `components/ui/`
- [ ] Set `deploymentMode: "static"` and `imageStorage.provider: "cloudflare-r2"` in `content/config.ts`
- [ ] **Cloudflare: create R2 bucket**
  - Cloudflare Dashboard → R2 → Create bucket
  - Enable public access or attach a custom subdomain (e.g. `images.your-domain.com`)
  - Create R2 API token: **Object Read & Write** scoped to this bucket only
- [ ] **Configure CORS on the R2 bucket** — required so browsers can load images from your site:
  ```json
  [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
  ```
  Use `["*"]` during testing; restrict to your production domain before go-live.
- [ ] Copy `.env.example` → `.env.local` (project root); fill in `CF_R2_*` values
- [ ] **GitHub Pages: enable GitHub Actions deployment**
  - GitHub repo → Settings → Pages → Source: **GitHub Actions**
  - GitHub repo → Settings → Variables → Actions → add `NEXT_PUBLIC_SITE_URL = https://your-domain.com`
- [ ] Custom domain: GitHub repo → Settings → Pages → Custom domain → configure DNS CNAME
- [ ] Run `pnpm upload-images` at least once to create the initial `lib/generated/image-manifest.json`
  (creates `{}` if `content/items/` has no photos). Commit this file before first push.
- [ ] `git push` → GitHub Actions triggers → site live at your domain

**Adding or updating items (recurring seller workflow):**
1. - [ ] Create/edit item folder + `item.json` in `content/items/`
2. - [ ] Drop photos into the item folder
3. - [ ] Run `pnpm upload-images` → photos uploaded to R2, manifest updated
4. - [ ] Read and follow the printed **BACKUP REMINDER** — back up your `content/` folder
5. - [ ] `git add content/**/*.json lib/generated/image-manifest.json && git commit && git push`
6. - [ ] GitHub Actions auto-builds and deploys — no CDN interaction; just reads committed manifest

**Code-only changes (no photo edits):**
- [ ] Edit `content/**/*.json` or `content/config.ts` → `git commit && git push` → GitHub Actions builds immediately

> **Cloudflare R2 storage note:** Deleting an item purges its manifest entry but does NOT delete the blob from R2. Orphaned files accumulate silently. Manage via Cloudflare Dashboard → R2 → bucket browser. A future `pnpm clean-storage` command is planned.

---

### Vercel + Vercel Blob (alternative)

**One-time setup:**
- [ ] Run `pnpm setup-ui` → commit `components/ui/`
- [ ] Set `deploymentMode: "vercel"` and `imageStorage.provider: "vercel-blob"` in `content/config.ts`
- [ ] Connect GitHub repo to Vercel project; Vercel auto-deploys on push to `main`
- [ ] Vercel Dashboard → Storage → Create Blob store → copy `BLOB_READ_WRITE_TOKEN`
- [ ] Add `BLOB_READ_WRITE_TOKEN` to Vercel project Environment Variables (all environments)
- [ ] Add `NEXT_PUBLIC_SITE_URL` to Vercel Environment Variables
- [ ] Confirm `baseUrl` in `content/config.ts` matches production URL
- [ ] Custom domain: Vercel Dashboard → Domains
- [ ] Copy `.env.example` → `.env.local`; fill in `BLOB_READ_WRITE_TOKEN` for local uploads
- [ ] Run `pnpm upload-images` at least once → commit `lib/generated/image-manifest.json`

**Recurring workflow:** identical to GitHub Pages + R2 above (steps 1–6), substituting Vercel auto-deploy for GitHub Actions.

> **Vercel Blob note:** Blobs do not auto-expire. Orphaned blobs remain after `pnpm upload-images` purges manifest entries. Delete via Vercel Dashboard → Storage → Blob browser.

---

### Self-hosted static — local images (simple, no cloud storage)

- [ ] Set `deploymentMode: "static"` and `imageStorage.provider: "local"` in `content/config.ts`
- [ ] Run `pnpm build` on a machine where `content/items/` photos are present
- [ ] `out/` includes all images; deploy the entire `out/` to any static host
- [ ] No size constraint for self-hosted (server storage is cheap)

### Self-hosted static — with cloud images

- [ ] Set `deploymentMode: "static"` and desired provider in `content/config.ts`
- [ ] Run `pnpm upload-images` locally → images on CDN, manifest updated
- [ ] Run `pnpm build` → `out/` contains only HTML/CSS/JS (tiny); images on CDN
- [ ] Deploy `out/` to any static host

---

## 20. Geolocation & Distance Pricing — Technical Specification

See DESIGN.md §17 for the full architecture rationale. This section covers implementation details.

### Browser API

```ts
// Wrapped by useGeolocation() hook — never call directly in components
navigator.geolocation.getCurrentPosition(
  (pos) => { /* granted: pos.coords.lat, pos.coords.lng */ },
  (err) => { /* denied (err.code === 1) or unavailable (err.code === 2) or timeout (err.code === 3) */ },
  { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
);
```

- `enableHighAccuracy: false` — sufficient for distance-to-city precision; avoids slow GPS warm-up on mobile
- `timeout: 8000` — 8 s before falling back to highest price
- `maximumAge: 300_000` — reuse cached position for up to 5 minutes; avoids re-prompting on page navigation

### Haversine Distance Formula

```ts
// lib/utils/haversine.ts — pure function, zero dependencies
export function haversineInMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### `SiteConfig` — `location` field type

```ts
// lib/config/types.ts — addition
location: {
  lat: number;   // decimal degrees, WGS84
  lng: number;   // decimal degrees, WGS84
  label: string; // display string, e.g. "San Francisco, CA"
};
```

`location` is **required** in `SiteConfig`. If a seller leaves it unconfigured, `next build` must fail with a clear TypeScript error (enforced by the type being non-optional with no default).

### `LocationPriceBar` Component Specification

```tsx
// components/pricing/LocationPriceBar.tsx  — "use client"

type Props = {
  sellerLocation: { lat: number; lng: number; label: string };
  resolvedMiles: number | null;           // null = pending
  source: "detected" | "manual" | "fallback";
  onOverride: (miles: number | null) => void;  // null = clear manual override
};
```

**Rendered states:**

| Geo state / source | UI shown |
|---|---|
| `idle` | Identical to `pending` — the hook immediately transitions from `idle` → `pending` in the same `useEffect` call; `idle` should never be visibly distinct, but implementers must handle it to avoid a flash of unstyled content |
| `pending` | `"🔍 Detecting your location…"` with skeleton price placeholders |
| `granted`, source = `detected` | `"📍 ~{N} mi from {label} — prices shown for your distance"` + "Change" link |
| source = `manual` | `"📍 {N} mi (manually set)"` + "Reset to detected" link |
| source = `fallback` (denied/unavailable) | `"📍 Location unavailable — showing maximum prices"` + "Enter distance" link |

**"Change distance" control:**
- Clicking opens an inline number input (not a modal) in miles
- Accepts positive integers only; rejects non-numeric input inline
- Pressing Enter or clicking "Apply" calls `onOverride(enteredMiles)`
- "Reset" clears the override (`onOverride(null)`) and re-shows detected or fallback value

### `PricingTable` Component Specification

```tsx
// components/item/PricingTable.tsx
// Presentational component — has no hooks, no "use client" directive.
// Always rendered inside PricingSection (a client component) in practice,
// because it renders PricingTableToggle (a client component) as a child.
// The expand/collapse toggle is a separate client component: PricingTableToggle.tsx

type Props = {
  price: Price;
  resolvedTier: PriceTier | null;   // null → show "Contact for price"
  negotiable: boolean;
};
```

**Initial SSG state:** The static page shell (`app/[category]/[item]/page.tsx`) calls:
```ts
import { resolveItemPrice } from "@/lib/utils/pricing";
// resolveItemPrice is in lib/utils/pricing.ts — no "use client" → safe in server component
const initialResolvedTier = resolveItemPrice(item.price, { source: "fallback" });
```
Then passes `initialResolvedTier` as a prop to `PricingSection`:
```tsx
<PricingSection price={item.price} initialResolvedTier={initialResolvedTier} negotiable={item.price.negotiable} />
```
`PricingSection` uses `initialResolvedTier` as its `useState` initial value, ensuring the static HTML always shows the highest price tier — never a blank. After hydration and geo resolution, `PricingSection` re-renders with the correct tier.

**Rendering contract:**

1. If `resolvedTier` is `null`: render a single "Contact for price" row. No expand toggle.
2. Otherwise: render **one row** showing `resolvedTier.label` and `resolvedTier.amount` (with "OBO" if `negotiable`). Below it, render a `PricingTableToggle` client component.

**`PricingTableToggle` (client component wrapper):**

```tsx
// components/item/PricingTableToggle.tsx  — "use client"
// Receives all tiers + resolved tier index; manages open/closed state.
// Collapsed: shows only the "View all pricing tiers ▼" button.
// Expanded:  renders full tier list table; resolved tier row is visually accented
//            (e.g. Tailwind ring or bold text); button changes to "Hide ▲".
```

- Toggle state is local (`useState`); default = `false` (collapsed)
- The toggle is rendered on the item detail page only, never on item cards
- Keyboard accessible: toggle button responds to Enter and Space

### `useFilters.ts` — price range basis update

The price range slider state is a `[min, max]` tuple operating on **resolved prices**:

```ts
// The filter function applied to each item:
function pricePassesFilter(item: Item, resolved: ResolvedDistance, [min, max]: [number, number]): boolean {
  const tier = resolveItemPrice(item.price, resolved);
  if (tier === null) return true;   // no price defined → always show
  return tier.amount >= min && tier.amount <= max;
}
```

The slider's initial `max` is set to the highest resolved price across all items in the current category (recalculated when `resolveDistanceMi` changes). The slider is **hidden** when no items in the category have defined price tiers.

`resolveItemPrice` is imported from `lib/utils/pricing.ts` — see DESIGN.md §17.

### `"use client"` component list (updated)

| Component | Reason |
|---|---|
| `RecentlyListedSection` | Owns geo + distance state for home page |
| `ItemGrid` | Owns distance state for category page; re-renders on distance change |
| `PricingSection` | Owns geo + distance state for item detail page; wraps LocationPriceBar + PricingTable |
| `ItemGallery` | Photo carousel interaction |
| `LocationPriceBar` | Geolocation API + user input |
| `PricingTableToggle` | Expand/collapse state for tier list |
| `FilterBar` | Client-side filter state |
| `ContactSection` | Click-to-reveal toggle; also independently runs `useGeolocation` + `useDistancePricing` for geo-resolved price in pre-fill messages |
| `PlatformButton` | Receives `onClick` function prop (state setter from `ContactSection`) — function props are not serialisable across the server/client boundary |
| `QRModal` | Modal open/close state |
| `SortSelect` | Sort dropdown state (child of FilterBar; client for consistency) |
| `MakeOfferButton` | Offer form state; pre-fills contact platform message on submit |
| `ConditionGuide` | Tooltip / modal open-close state explaining each condition value |
| `SearchBar` | Loaded via `next/dynamic({ ssr: false })`; fuse.js query + results state |
| `ShareButton` | `navigator.share()` and `navigator.clipboard` — browser-only APIs |
| `RecentlyViewed` | `sessionStorage` read/write on mount — browser-only API |
| `FreshnessLabel` | Calculates relative date against `new Date()` (visitor's clock, not SSG build time); `useState`/`useEffect` prevents stale freshness text |
| `LocaleProvider` | Reads `localStorage.getItem("locale")` on mount; provides `{ locale, setLocale }` via React context — `localStorage` is browser-only |
| `LocaleSwitcher` | Calls `setLocale()` from `LocaleProvider` context on user interaction; conditionally rendered (hidden when `availableLocales.length ≤ 1`) |
| `ItemCard` | Localises its title via `useLocale()`; always rendered inside a client parent (`ItemGrid` / `RecentlyListedSection`) so the title switches with the locale |
| `LocalizedItemContent` | Item detail `<h1>` name + react-markdown description; reads `useLocale()` so both re-render on a locale switch (SSG still emits `defaultLocale`) |

> **`PricingTable` reclassification note:** `PricingTable` is NOT in this list. It was previously documented as a server component but was reclassified to a **presentational component** (no `"use client"`, no hooks). It renders `PricingTableToggle` (a client component) as a child, so in practice it always runs in a client subtree. The server-side page (`page.tsx`) calls `resolveItemPrice` as a pure function for the SSG initial render and passes the result as `initialResolvedTier` prop to `PricingSection`, not directly to `PricingTable`.

### Security & Privacy

| Concern | Mitigation |
|---|---|
| Visitor coordinates sent to server | **Impossible** — site is fully static; no server functions receive data |
| Coordinates persisted without consent | `useState` only in v1; cleared on page close. No `localStorage` or cookies. A `sessionStorage` cache is listed in DESIGN.md §19 Extensibility Register as a future opt-in — it must be gated behind user consent or an explicit config flag when implemented. |
| Seller coordinates exposed | Intentional and documented in DESIGN.md §17; seller should use a nearby landmark |
| HTTPS requirement for Geolocation API | Next.js on Vercel serves HTTPS by default; self-hosted must configure TLS |

---

## 21. UI Component Adapter Specification

See DESIGN.md §18 for the design rationale, slot tables, and the core principle (seller only touches `content/`). This section covers the setup script, TypeScript types, adapter props, and data normalisation specs.

---

### Setup Script — `scripts/setup-ui.sh`

Run once by a developer after initial clone. Installs all 27 supported Aceternity components (13 background + 3 grid + 4 gallery + 7 card). The resulting files in `components/ui/` must be committed to git — after that, sellers never run any install commands.

```bash
#!/usr/bin/env bash
# scripts/setup-ui.sh
# Run once: pnpm setup-ui
# Commits the results to git so sellers never need to run this.

set -e
echo "Installing all supported Aceternity UI components..."

# ── Background slot ───────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/aurora-background
npx shadcn@latest add @aceternity/background-beams-demo
npx shadcn@latest add @aceternity/background-beams-with-collision
npx shadcn@latest add @aceternity/background-gradient-animation
npx shadcn@latest add @aceternity/background-boxes-demo
npx shadcn@latest add @aceternity/wavy-background
npx shadcn@latest add @aceternity/vortex
npx shadcn@latest add @aceternity/shooting-stars-and-stars-background-demo
npx shadcn@latest add @aceternity/meteors
npx shadcn@latest add @aceternity/grid-background-demo
npx shadcn@latest add @aceternity/background-lines
npx shadcn@latest add @aceternity/spotlight
npx shadcn@latest add @aceternity/spotlight-new

# ── Item Grid slot ────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/bento-grid
npx shadcn@latest add @aceternity/layout-grid
npx shadcn@latest add @aceternity/focus-cards

# ── Gallery slot ──────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/apple-cards-carousel-demo
npx shadcn@latest add @aceternity/images-slider
npx shadcn@latest add @aceternity/carousel
npx shadcn@latest add @aceternity/parallax-scroll parallax-scroll-2

# ── Item Card slot ────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/card-hover-effect
npx shadcn@latest add @aceternity/card-spotlight
npx shadcn@latest add @aceternity/3d-card
npx shadcn@latest add @aceternity/evervault-card
npx shadcn@latest add @aceternity/wobble-card
npx shadcn@latest add @aceternity/direction-aware-hover
npx shadcn@latest add @aceternity/glare-card

echo "Done. Commit the components/ui/ files to git."
echo "Sellers can now use any ui.* option in content/config.ts without further setup."
```

Add to `package.json`:
```json
"setup-ui": "bash scripts/setup-ui.sh"
```

---

### TypeScript Types — `lib/ui/types.ts`

```ts
export type BackgroundOption =
  | "none"
  | "aurora"
  | "background-beams"
  | "background-beams-collision"
  | "background-gradient-animation"
  | "background-boxes"
  | "wavy"
  | "vortex"
  | "shooting-stars"
  | "meteors"
  | "grid-and-dot"
  | "background-lines"
  | "spotlight"
  | "spotlight-new";

export type ItemGridOption =
  | "simple"
  | "bento-grid"
  | "layout-grid"
  | "focus-cards";

export type GalleryOption =
  | "simple"
  | "apple-cards-carousel"
  | "images-slider"
  | "carousel"
  | "parallax-scroll";

export type ItemCardOption =
  | "simple"
  | "card-hover-effect"
  | "card-spotlight"
  | "3d-card"
  | "evervault-card"
  | "wobble-card"
  | "direction-aware-hover"
  | "glare-card";

export type UIConfig = {
  background: BackgroundOption;
  itemGrid:   ItemGridOption;
  gallery:    GalleryOption;
  itemCard:   ItemCardOption;
};
```

Added to `SiteConfig` in `lib/config/types.ts`:
```ts
import type { UIConfig } from "@/lib/ui/types";
export type SiteConfig = {
  // ... existing fields ...
  ui: UIConfig;
  i18n: I18nConfig;   // see §22.8 for full I18nConfig type
};
```

---

### Adapter Pattern — All Four Adapters

All adapters follow identical structure. They are **pre-wired with every supported option** and must not be edited by sellers. The full import list is committed after `pnpm setup-ui` runs.

```tsx
// ⚠️  DO NOT EDIT — change ui.* values in content/config.ts only
"use client";   // on adapters that wrap client-side Aceternity components

import { siteConfig } from "@/content/config";

// All components pre-installed via pnpm setup-ui and committed to components/ui/
import { AuroraBackground }             from "@/components/ui/aurora-background";
import { BackgroundBeams }              from "@/components/ui/background-beams";
// ... (all imports for the slot)

const COMPONENTS = {
  "aurora":            AuroraBackground,
  "background-beams":  BackgroundBeams,
  // ... all entries
} as const;

// The adapter reads config, selects component, normalises props, renders.
// Falls back to built-in simple/none implementation for "simple", "none", or unknown values.
```

---

### Adapter 1 — `BackgroundEffect.tsx`

**Props:** `{ children: React.ReactNode }`
**Placement:** `app/layout.tsx` wraps `{children}` with `<BackgroundEffect>`.

**Normalisation per component:**

| Component | Required wrapper shape |
|---|---|
| `AuroraBackground` | `<AuroraBackground className="min-h-screen">{children}</AuroraBackground>` |
| `BackgroundBeams` | `<BackgroundBeams>{children}</BackgroundBeams>` — full-screen by default |
| `WavyBackground` | `<WavyBackground className="flex flex-col">{children}</WavyBackground>` |
| `Vortex` | `<Vortex particleCount={200} rangeY={800} baseHue={220}>{children}</Vortex>` — sensible defaults |
| All others | `<Component>{children}</Component>` |

---

### Adapter 2 — `ItemGridAdapter.tsx`

```tsx
type Props = {
  items: Item[];
  resolved: ResolvedDistance;
  renderCard: (item: Item, index: number) => React.ReactNode;  // render prop
};
```

**Normalisation per component:**

| Component | Data mapping |
|---|---|
| `"simple"` | `<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">` + `renderCard()` calls |
| `"bento-grid"` | Maps items → `BentoGridItem[]`: `{ title: item.name, description: item.description, header: <img coverImage>, className: pattern (first item "md:col-span-2") }` |
| `"layout-grid"` | Maps items → `{ id, content: renderCard(), className, thumbnail: item.coverImage }` |
| `"focus-cards"` | Maps items → `{ title: item.name, src: item.coverImage ?? "" }`; `renderCard` overlaid via `absolute inset-0` |

---

### Adapter 3 — `GalleryAdapter.tsx`

```tsx
type Props = {
  images: string[];        // all image URLs
  coverImage: string | null;
  itemName: string;        // for alt text and carousel labels
};
```

**Normalisation per component:**

| Component | Data mapping |
|---|---|
| `"simple"` | Large main image + scrollable thumbnail strip; click thumbnail swaps main image |
| `"apple-cards-carousel"` | Maps images → `Card[]`: `{ category: itemName, title: "Photo N", src: url, content: <img> }` |
| `"images-slider"` | Passes `images` array directly |
| `"carousel"` | Wraps each image in `<CarouselItem><img /></CarouselItem>` |
| `"parallax-scroll"` | Splits images: even indices → first column, odd → second column |

---

### Adapter 4 — `ItemCardAdapter.tsx`

```tsx
type Props = {
  item: Item;
  resolvedPrice: PriceTier | null;
  children: React.ReactNode;  // standard ItemCard content: image, name, badges, price
};
```

**Normalisation per component:**

| Component | Wrapping |
|---|---|
| `"simple"` | `<div className="rounded-xl border bg-card shadow-sm overflow-hidden">` |
| `"card-hover-effect"` | `<CardContainer><CardBody>{children}</CardBody></CardContainer>` |
| `"card-spotlight"` | `<CardSpotlight>{children}</CardSpotlight>` |
| `"3d-card"` | `<CardContainer><CardBody>{children}</CardBody></CardContainer>` — add `perspective-1000` class to parent |
| `"evervault-card"` | `<EvervaultCard text={item.name}>{children}</EvervaultCard>` |
| `"wobble-card"` | `<WobbleCard containerClassName="col-span-1">{children}</WobbleCard>` |
| `"direction-aware-hover"` | `<DirectionAwareHover imageUrl={item.coverImage ?? ""}>` — children rendered as hover overlay; cover image is the card face. Style children for dark backgrounds. |
| `"glare-card"` | `<GlareCard>{children}</GlareCard>` |

---

## 22. Additional v1 Feature Specifications

---

### 22.1 Full-Text Search

**Dependencies:** `fuse.js ^7.0.0`

**Build-time index generation** (`lib/search/index.ts`):
```ts
export type SearchIndexEntry = {
  slug: string;          // "{categorySlug}/{itemSlug}"
  href: string;          // "/houseware/ikea-lamp"
  name: string;
  description: string;
  brand: string;
  model: string;
  tags: string[];
  course: string;        // textbook field
  isbn: string;
  edition: string;       // textbook field; searchable (e.g. "3rd Edition")
  coverImage: string | null;
};

export async function buildSearchIndex(): Promise<SearchIndexEntry[]>
```

The index is written to `public/search-index.json` during the `prebuild` step (before `next build`), by `scripts/build-search-index.ts`. It is gitignored (regenerated on every build; not committed). It must go to `public/` — not `lib/generated/` — so Next.js serves it as a static file that `SearchBar` can fetch via HTTP at runtime.

**`SearchBar` component** (`components/search/SearchBar.tsx` — client):
- Loaded lazily via `next/dynamic` with `{ ssr: false }` to avoid hydration mismatch
- On mount, fetches `/search-index.json` (Next.js serves it from `public/` — the `prebuild` step writes it there)
- **Dev mode behaviour:** In `pnpm dev`, `search-index.json` does not exist until a `pnpm build` has been run at least once. If the fetch returns 404, `SearchBar` initialises with an empty index and the search input shows no results (no crash, no error state shown to the user). Run `pnpm build` once to populate the index; subsequent `pnpm dev` sessions reuse the last-built index.
- Initialises fuse.js with keys: `["name", "description", "brand", "model", "tags", "course", "isbn", "edition"]`
- Shows results inline as the user types (debounced 150 ms)
- Results show: item cover image, name, category, price badge
- Clicking a result navigates to the item detail page
- Shown in `SiteHeader` when `siteConfig.search.enabled === true`

---

### 22.2 Dark Mode (Auto — System Preference)

**Tailwind v4 setup — CSS-first, no `tailwind.config.ts` needed for dark mode:**

In Tailwind v4, `darkMode: "media"` is the **default behaviour** — `prefers-color-scheme` is followed automatically without any configuration entry.

```css
/* app/globals.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
/* No dark mode directive needed — v4 defaults to media-query dark mode */
```

```js
// postcss.config.mjs  (required for Next.js 15 + Tailwind v4)
export default { plugins: { "@tailwindcss/postcss": {} } };
```

> ⚠️ Do **not** add `darkMode: "media"` to `tailwind.config.ts`. That is Tailwind v3 syntax and is a no-op (or causes deprecation warnings) in v4. The `tailwind.config.ts` file is optional in v4 and used only for theme extension — omit it unless you need to extend the default theme.

- No toggle needed; no user action required; no JavaScript involved
- All Tailwind `dark:` variant classes respond to OS/browser `prefers-color-scheme`
- Aceternity components installed via `npx shadcn@latest` are Tailwind v4 compatible
- `siteConfig.darkMode` is typed `"media" | "class"`. The `"class"` variant is a future extension (requires toggle button in SiteHeader + persisted preference; see DESIGN.md §19)

---

### 22.3 Seller CLI Tools

All scripts write ONLY to `content/` — sellers never touch any other directory.

#### `pnpm create-item <category>/<name>` (`scripts/create-item.ts`)

1. Validates that `<category>` matches an existing folder in `content/items/` (or creates it with a warning)
2. Creates `content/items/<category>/<name>/` folder
3. Copies `content/items/<category>/_template.json` if it exists; otherwise copies `content/items/_template.json`; otherwise uses the built-in default template
4. Renames the copy to `item.json`; substitutes `{name}` placeholder with the humanised item name
5. Opens `item.json` in `$EDITOR` if set; otherwise prints: "Created content/items/<category>/<name>/item.json — edit it now."
6. Exits 0

#### `pnpm mark-sold <category>/<name>` (`scripts/mark-sold.ts`)

1. Validates that `content/items/<category>/<name>/item.json` exists; exits 1 with a clear error if not found
2. Reads the current `item.json`
3. Sets `status: "sold"` and `sold_date: <today in ISO 8601 format (YYYY-MM-DD)>`
4. Writes the updated `item.json` in place (preserves all other fields)
5. Prints: `Marked content/items/<category>/<name> as sold (sold_date: YYYY-MM-DD).`
6. Exits 0

This script exists so non-technical users (the "potential" user persona) can mark items sold without opening or editing a JSON file directly. It is the CLI equivalent of the SETUP_GUIDE.md step 2.

#### `pnpm create-template [category]` (`scripts/create-template.ts`)

1. If `[category]` provided: creates `content/items/<category>/_template.json`
2. Without argument: creates `content/items/_template.json` (global default)
3. Template is a full `item.json` with all fields present as descriptive placeholder strings
4. Prints instructions on how to use the template

#### `pnpm new <category>/<name>` — shorthand alias for `create-item`

**Template format** (`_template.json`):
```jsonc
{
  "name": "ITEM_NAME",
  "description": "Describe the item condition and what's included.",
  "condition": "good",
  "price": {
    "tiers": [
      { "label": "Pickup", "miles_max": 5, "amount": 0 }
    ],
    "negotiable": false
  },
  "status": "draft",
  "tags": []
}
```

---

### 22.4 JSON-LD Structured Data

**`lib/utils/jsonld.ts`** (server-safe, no `"use client"`):
```ts
export function buildProductJsonLd(item: Item, baseUrl: string): object
export function buildBreadcrumbJsonLd(crumbs: { name: string; href: string }[]): object
```

**`components/common/JsonLd.tsx`** (server component):
```tsx
type Props = { data: object };
// Renders: <script type="application/ld+json">{JSON.stringify(data)}</script>
```

Both are injected into `app/[category]/[item]/page.tsx` via `generateMetadata` return or as direct component renders.

---

### 22.5 Open Graph, Twitter Card, Pinterest Rich Pin

All added in `generateMetadata` for item detail pages:

```ts
// Twitter card
"twitter:card": "summary_large_image"
"twitter:title": item.name
"twitter:description": item.metaDescription
"twitter:image": item.coverImage

// Pinterest rich pin
"og:type": "product"
"product:price:amount": highestTierPrice (string)
"product:price:currency": item.price.currency
```

---

### 22.6 Vercel Analytics + Speed Insights

```tsx
// app/layout.tsx — only rendered when config flags are true:
{siteConfig.analytics.vercel       && <Analytics />}
{siteConfig.analytics.speedInsights && <SpeedInsights />}
```

- `<Analytics />` from `@vercel/analytics/react`
- `<SpeedInsights />` from `@vercel/speed-insights/next`
- Both are no-ops in non-Vercel environments (graceful degradation)
- Free on Vercel Hobby plan

---

### 22.7 Sitemap

`next-sitemap.config.js` at project root:
```js
/** @type {import('next-sitemap').IConfig} */
module.exports = {
  // NEXT_PUBLIC_SITE_URL is injected by scripts/postbuild.ts (falls back to siteConfig.baseUrl).
  // Do NOT use require('./content/config') here — next-sitemap runs as a plain Node.js child process
  // (not via tsx), so TypeScript files cannot be required directly.
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  generateRobotsTxt: true,
  exclude: ['/preview/*'],
};
```

`scripts/postbuild.ts` (called by the `postbuild` npm lifecycle hook):
```ts
// scripts/postbuild.ts
import { siteConfig } from "@/content/config";
import { execSync } from "child_process";

if (siteConfig.sitemap.enabled) {
  console.log("[postbuild] generating sitemap...");
  // Inject NEXT_PUBLIC_SITE_URL so next-sitemap.config.js can read it via process.env.
  // next-sitemap runs as a plain Node.js child process (not tsx) and cannot require() TypeScript
  // files, so we resolve the URL here (where tsx is active) and pass it via env.
  execSync("next-sitemap", {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.baseUrl,
    },
  });
} else {
  console.log("[postbuild] sitemap.enabled is false — skipping next-sitemap");
}
```

`postbuild` runs `scripts/postbuild.ts` → conditionally generates `public/sitemap.xml` + `public/robots.txt`.

The sitemap only generates when `siteConfig.sitemap.enabled === true`. The `postbuild` script checks this before running. This is the authoritative implementation of that conditional.

---

### 22.8 Internationalisation (i18n)

**Design:** Single-instance multi-locale. All locale variants are bundled into one deployment. Visitors switch language at runtime via the `LocaleSwitcher` component in `SiteHeader`. The selected locale is persisted in `localStorage`; SSG static HTML always renders `defaultLocale`.

### SiteConfig i18n type (`lib/config/types.ts`)

```ts
export type I18nConfig = {
  defaultLocale: string;           // ISO 639-1; rendered in static HTML (SSG)
  availableLocales: string[];      // all supported locales; LocaleSwitcher shown when length > 1
  showLocaleSwitcher: boolean;     // show toggle in SiteHeader (overridden to false if locales ≤ 1)
  strings: UIStrings;              // UI string overrides per the defaultLocale
};
```

### Locale switching runtime architecture

```
Visitor loads page
  │
  ├── SSG HTML renders with defaultLocale content (e.g. item.name, not item.name_zh)
  │
  └── LocaleProvider (client component wrapping app/layout.tsx children)
        ├── reads localStorage.getItem("locale")
        ├── falls back to siteConfig.i18n.defaultLocale if absent or not in availableLocales
        ├── exposes { locale, setLocale } via React context
        └── triggers re-render of all localised fields after hydration

LocaleSwitcher (client component in SiteHeader)
  ├── hidden when siteConfig.i18n.availableLocales.length <= 1
  ├── renders buttons/select for each available locale
  └── on change: calls setLocale(newLocale) + localStorage.setItem("locale", newLocale)

useLocale() hook
  └── reads locale from LocaleProvider context
      used by all item-rendering components instead of reading siteConfig.i18n.defaultLocale directly
```

### `lib/utils/i18n.ts`

```ts
// Returns the localised field value for the given locale, falling back to the English default.
// Example: getLocalizedField(item, "name", "zh") → item.name_zh ?? item.name
// Example: getLocalizedField(item, "description", "es") → item.description_es ?? item.description
export function getLocalizedField(
  item: Record<string, unknown>,
  field: string,    // e.g. "name", "description"
  locale: string    // e.g. "zh", "es"
): string

// Returns a UI string from siteConfig.i18n.strings, falling back to the built-in English default.
// locale parameter reserved for future per-locale UIStrings support.
export function t(key: keyof UIStrings, locale?: string): string
```

Visitor-facing renders of `name` and `description` live in **client** components — `ItemCard` (card title) and `LocalizedItemContent` (detail-page `<h1>` + react-markdown description). Each calls `getLocalizedField(item, …, locale)` with `locale` from `useLocale()`. During the SSG/SSR pass the `LocaleProvider` supplies its initial value (`siteConfig.i18n.defaultLocale`), so the static HTML carries the **default-locale** text; after hydration the component re-renders in the visitor's chosen locale if `localStorage` holds a different one. A React component cannot conditionally call a hook, so localisation is never performed in a server component: server-only surfaces (`generateMetadata`, `<title>`, OG tags, JSON-LD, the breadcrumb leaf) read `siteConfig.i18n.defaultLocale` directly and are **not** runtime-switchable.

> **SEO note (intentional v1 limitation):** Only `defaultLocale` content appears in the static HTML and the crawlable metadata/JSON-LD. Non-default locales are rendered client-side after the visitor switches and are not separately indexed. Per-locale URLs / `hreflang` alternates are a future extension beyond v1 scope.

**`UIStrings` type** (defined in `lib/config/types.ts` and used by `SiteConfig.i18n.strings`):

```ts
export type UIStrings = {
  heroTagline: string;     // hero section tagline; falls back to siteConfig.tagline
  recentlyListed: string;  // "Recently Listed" section heading
  browseAll: string;       // "Browse All" link label
  makeOffer: string;       // "Make an Offer" button label
  contactSeller: string;   // "Contact Seller" toggle label
  soldBanner: string;      // "SOLD" banner text on sold item pages
};
```

All fields default to their built-in English strings when the value is `""`. `UIStrings` covers the `defaultLocale`; per-locale UI strings are provided by the item fields themselves.

### Adding a new locale

1. Add `name_{locale}` and `description_{locale}` to the Zod schema (`lib/content/schema.ts`) and `Item` type (`lib/content/types.ts`) — mirrors the existing `name_zh` / `description_zh` pattern.
2. Add the locale code to `siteConfig.i18n.availableLocales` in `content/config.ts`.
3. Run `/translate-items` AI skill (DESIGN.md §20 Skill 3) to batch-fill translations, or add `name_{locale}` / `description_{locale}` fields to `item.json` manually.
4. `LocaleSwitcher` appears automatically once `availableLocales.length > 1`.

> **Locale fallback:** `getLocalizedField` silently falls back to English for any locale whose `name_{locale}` field is absent or empty — no crash, no broken renders. Items without translations display in `defaultLocale` until translations are added. This makes adding a new locale a non-breaking, fully incremental change.

> **v1 ships concrete `zh` support.** The `name_zh` / `description_zh` fields are in the Zod schema and `Item` type. `es` and other locales follow the same additive pattern.

---

### 22.9 Payment Platforms — Venmo & Zelle

Both follow the existing contact platform architecture (DESIGN.md §7).

**Venmo (link-based):**
- `type: "venmo"`, `value: "username"` → renders `<a href="https://venmo.com/u/{value}">Venmo</a>`
- Pre-filled payment request: when item context available, append `?txn=pay&audience=private&note={encodedItemName}`

**Venmo (QR-based):**
- `type: "venmo"`, `qr_image: "/contact/venmo-qr.png"` → QR modal (same as WeChat)

**Venmo (item-level payment request — `item.venmo_payment_request`):**
- Distinct from the Venmo *contact platform* above: this is an item-level `item.json` field, **not** a `contact.platforms[]` entry.
- When `item.venmo_payment_request` is a non-empty URL, the item detail page renders a **"Pay with Venmo"** button (parallel to the Stripe "Pay Deposit" button) that opens the URL in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Seller-supplied URL format: `https://venmo.com/?txn=pay&recipients={username}&amount={price}&note={item.name}`.
- Validated as a URL by Zod (invalid → `""` → no button), consistent with §15 URL handling.
- When empty, no button renders; the Venmo contact-platform link (if configured) remains available in the contact section.

**Zelle (QR-only):**
- `type: "zelle"`, `qr_image: "/contact/zelle-qr.png"` → QR modal
- Zelle has no public profile URL; QR code is the only shareable format
- Seller generates their Zelle QR code in their bank app and saves it to `content/contact/zelle-qr.png`

**`constructUrl` additions:**
```ts
case "venmo":
  if (platform.qr_image) return null;  // QR type, handled by QRModal
  const base = `https://venmo.com/u/${platform.value}`;
  return item ? `${base}?txn=pay&audience=private&note=${encodeURIComponent(item.name)}` : base;

case "zelle":
  return null;  // always QR type; no link URL
```

---

### 22.10 Share Button

**`components/common/ShareButton.tsx`** (client):
```tsx
// On click:
// 1. Try navigator.share({ title: item.name, text: item.metaDescription, url: window.location.href })
// 2. If share API not available: navigator.clipboard.writeText(url) → show "Copied!" toast (2s)
// Shows a share icon button. On item detail pages only.
```

---

### 22.11 `formatRelativeDate` Utility

**`lib/utils/date.ts`**:
```ts
// `now` defaults to `new Date()` when omitted — pass explicitly in tests only.
// Pure function — safe to import in both server and client code.
export function formatRelativeDate(isoDate: string | null, now?: Date): string
// Returns: "Today" | "Yesterday" | "3 days ago" | "2 weeks ago" | "1 month ago" | ""
// Returns "" when isoDate is null/invalid (graceful; caller hides the element)
```

**`FreshnessLabel.tsx` is a client component** (`"use client"`). It uses `useState<string | null>(null)` and `useEffect(() => { setLabel(formatRelativeDate(listedDate)) }, [listedDate])`. The component renders `null` until the first effect fires — relative dates are then computed against the visitor's live browser clock (`new Date()`), not the SSG build clock. This ensures "Listed 3 days ago" is always accurate at view time regardless of when the last deploy happened.

---

### 22.12 SETUP_GUIDE.md

A separate file at the project root written entirely in plain English for non-technical users. It covers:

1. **Adding a new item** — create a folder, fill in `item.json`, add photos, run `pnpm upload-images`
2. **Marking an item sold** — `pnpm mark-sold category/item-name` (no JSON editing)
3. **Creating a new item from template** — `pnpm new category/item-name`
4. **Changing prices** — edit `amount` in `item.json` price tiers
5. **Uploading new photos** — add to the item folder, run `pnpm upload-images`
6. **What to back up** — the entire `content/` folder to an external drive or cloud backup
7. **Who to call** — if something breaks, contact the CS student who set this up

No code, no git commands, no terminal jargon in the guide. All actions reference only `content/` folder operations or pre-built scripts invoked by name.

---

## 23. AI Skill Files — Technical Specification

See DESIGN.md §20 for the design rationale, seller workflows, and compatibility table. This section covers the skill file format and required content.

**No SDK, no API keys, no extra dependencies.** The seller uses their existing AI coding tool (Claude Code, Cursor, etc.).

---

### 23.1 Skill File Structure

All three skill files live in `.claude/skills/` and follow this template:

```markdown
# Skill: <name>
<!-- One-line description shown in Claude Code skill list -->

## Context
<!-- Brief summary of the project structure the AI needs to know -->
<!-- Include: content/ folder layout, item.json field list, content/config.ts structure -->

## Instructions
<!-- Step-by-step numbered list of what the AI should do -->
<!-- Be explicit: which files to read, which to write, what to confirm with the user -->

## Schema Reference
<!-- Paste the full item.json schema from DESIGN.md §5 -->
<!-- Paste the full SiteConfig type from DESIGN.md §13 -->

## Output Specification
<!-- Exact file paths to write, field defaults for anything not determinable -->
<!-- Constraints: status always "draft", reserved_for never populated -->

## Examples
<!-- 1–2 sample input/output pairs -->
```

### 23.2 `update-items.md` — Required Content

The skill file must include:

| Section | Content |
|---|---|
| Trigger | "When invoked, scan `content/items/` for folders with photos but no item.json, or item.json with status: draft" |
| Vision instructions | "For each qualifying folder: look at all images in the folder; read any `.txt`, `.md`, `.yaml`, or `.json` file present (description file)" |
| Field extraction | Full table from DESIGN.md §20 — what can be extracted from photos at each confidence level |
| Merge rules | Description file values override vision output for any field they specify |
| Output rules | Write to `content/items/<category>/<name>/item.json`; always set `status: "draft"`; never set `reserved_for` |
| Confirmation | Show proposed JSON to user and ask for confirm / edit / skip before writing |
| Scope | Accept natural language scope from user ("just electronics", "the iphone folder", "everything") |
| Fallback | If photos are unclear, prefer empty string over a guess for brand/model fields |

### 23.3 `setup-wizard.md` — Required Content

The skill file must include:

| Section | Content |
|---|---|
| Trigger | "Ask the user questions to build content/config.ts from scratch" |
| Question sequence | All 8 question groups from DESIGN.md §20 in order |
| Location handling | "When user gives a location description, use your knowledge to suggest lat/lng coordinates; show them to the user for confirmation" |
| Tagline guidance | Examples of tone-matched taglines (see DESIGN.md §20 Personality Calibration table) |
| Config template | Full `content/config.ts` template with all fields, types, and comments (from DESIGN.md §13) |
| Category scaffold | After generating config.ts, create `content/items/<category>/_category.json` for each selected item type |
| Output rules | Write only to `content/config.ts` and `content/items/*/` — never touch app code |
| Idempotency instruction | "If content/config.ts already exists, read it first and pre-fill answers with current values; ask user to confirm or change each" |

### 23.4 `.claude/` Directory and CLAUDE.md

The `.claude/` directory also contains a `CLAUDE.md` project file. Claude Code reads this automatically on startup and gives the AI assistant context about the project without the seller needing to explain it.

**`CLAUDE.md` must include:**
- Project summary (what the project is, who the seller is)
- The `content/` folder rule (AI must never modify files outside `content/`)
- A summary of common seller tasks and which skill to use
- Links to `DESIGN.md` sections for deeper context when needed

```
.claude/
├── CLAUDE.md          ← loaded automatically by Claude Code; project context
└── skills/
    ├── update-items.md
    ├── setup-wizard.md
    └── translate-items.md
```

### 23.5 No Dependencies Added

| What was removed | Why |
|---|---|
| `@anthropic-ai/sdk` | Not needed — AI tool provides its own API access |
| `ANTHROPIC_API_KEY` env var | Not needed — seller's AI subscription handles auth |
| `scripts/agents/` directory | Replaced by `.claude/skills/` instruction files |
| `pnpm agent:*` scripts | Replaced by `/skill-name` in Claude Code or natural language |

The only new project artifact is the `.claude/` directory containing Markdown files.

### 23.6 Graceful Degradation

If the seller has no AI coding tool:
- `pnpm create-item <category>/<name>` creates a template `item.json` manually (Phase 3)
- `pnpm create-template` creates a `_template.json` they can copy and fill in
- The skill files serve as reference documentation even without an AI tool

### 23.7 `content/` Rule — Enforced in Skill Files

All three skill files include an explicit instruction:

> **Do not modify any files outside the `content/` directory. Do not edit `app/`, `components/`, `lib/`, `scripts/`, or any configuration files. Your output is limited to: `content/config.ts`, `content/items/*/item.json`, and `content/items/*/_category.json`.**

---

### 23.8 `translate-items.md` — Required Content

The skill file must include:

| Section | Content |
|---|---|
| Trigger | "Scan `content/items/` for item.json files where `name_{locale}` or `description_{locale}` is absent or empty string" |
| Locale detection | Read `siteConfig.i18n.availableLocales`; if only one non-English locale exists, target it automatically; otherwise ask the seller which locale to target |
| Fields to translate | `name` → `name_{locale}`, `description` → `description_{locale}` only |
| Fields to preserve verbatim | `brand`, `model`, `color`, `tags`, `course`, `isbn`, `edition`, price fields, dates, status, URLs |
| Markdown preservation | Translate prose content only; preserve all Markdown syntax (`**bold**`, `*italic*`, code spans, links, lists) unchanged |
| Model number / brand preservation | Keep brand names, model numbers, measurements, and technical identifiers untranslated; e.g. "IKEA TRÅDFRI" stays as-is |
| Merge rule | If `name_{locale}` is already non-empty, skip that field (no overwrite unless seller explicitly requests it) |
| Output rules | Write ONLY the new locale fields into each `item.json`; preserve all other fields exactly |
| Confirmation | Show proposed translations for each item; seller confirms, edits, skips, or accepts all |
| Scope | Accept natural language scope: "all items", "just electronics", "only the iphone-14 item", "everything missing Chinese" |
| Status filter | Translate all statuses including `draft` and `sold` (translations persist and are useful when items are re-listed or the archive is viewed) |

**Translation quality guidance the skill must apply:**

- Use natural, colloquial phrasing appropriate to a peer-to-peer marketplace (not formal retail language)
- For Chinese: use Simplified Chinese (简体中文) unless the seller specifies Traditional Chinese (繁體中文)
- Preserve the seller's tone: casual descriptions translate casually, detailed technical descriptions translate precisely
- Currency amounts, measurements, and model strings in the description are NOT translated

**Zod schema requirement (before translating):**

The skill must verify that `lib/content/schema.ts` includes the target locale fields. If `name_zh` / `description_zh` are in the schema but the target locale (e.g. `name_es`) is not, the skill must prompt the seller to add the fields to the schema before proceeding, and provide the exact Zod snippet to add:

```ts
// Add to ItemSchema in lib/content/schema.ts:
name_es: z.string().optional().default(""),
description_es: z.string().optional().default(""),
```

And the corresponding `Item` type addition in `lib/content/types.ts`:
```ts
name_es: string;
description_es: string;
```

---

## 24. CI/CD Pipeline — GitHub Actions Workflow Specification

The workflow file lives at `.github/workflows/deploy.yml` and ships with the project. It handles build + deploy to GitHub Pages on every push to `main`. No CDN credentials are needed in CI — the build reads the committed `lib/generated/image-manifest.json`.

### 24.1 Workflow File

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:        # allow manual trigger from GitHub UI

permissions:
  contents: read
  pages: write
  id-token: write           # required for OIDC-based Pages deployment

concurrency:
  group: pages
  cancel-in-progress: false # do not cancel in-progress deploys; finish them

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm        # caches ~/.pnpm-store between runs

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        # --frozen-lockfile: fails if pnpm-lock.yaml is out of sync (CI safety net)

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}
          # Note: No CDN credentials (CF_R2_* / BLOB_READ_WRITE_TOKEN) are needed here.
          # sync-images.ts runs in build-check mode: reads the committed image-manifest.json.
          # pnpm upload-images (the upload step) runs only on the seller's local machine.

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: out/         # Next.js static export output directory

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v4
        id: deployment
```

> **Test gate:** §25.5 adds a `test` job that runs before this `build` job (`build: needs: test`) so builds proceed only after tests pass. The workflow above shows the build + deploy core; merge in the `test` job from §25.5 when wiring CI.

### 24.2 GitHub Repository Setup (one-time)

| Setting | Value | Where |
|---|---|---|
| Pages source | **GitHub Actions** | Repo → Settings → Pages → Source |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | Repo → Settings → Variables → Actions |
| Custom domain | Your domain | Repo → Settings → Pages → Custom domain |

> **No secrets needed.** `NEXT_PUBLIC_SITE_URL` is a Repository Variable (not a secret) — it is not sensitive. CDN credentials are never added to GitHub Actions.

### 24.3 Build Failure Notifications

GitHub Actions emails the repository owner automatically on workflow failure. No additional configuration is required. The build fails with `exit 1` in these cases:

| Failure | Script | Exit code | Cause |
|---|---|---|---|
| `prebuild` sync-images fails | `scripts/sync-images.ts` | 1 | Unreadable `content/items/` directory (file permission error) |
| `prebuild` search-index fails | `scripts/build-search-index.ts` | 1 | `loadCategories()` throws (malformed directory structure) |
| TypeScript errors | `next build` | 1 | Type errors in app code (not in `content/` — those are Zod-validated) |
| `next build` output error | `next build` | 1 | Missing required files, broken imports |
| Sitemap generation fails | `scripts/postbuild.ts` | 1 (propagated) | `next-sitemap` crashes (e.g. invalid `baseUrl`) |

> **Image manifest missing:** NOT a build failure. `sync-images.ts` build-check mode logs a warning and exits 0 (graceful degradation). The site builds and deploys; item images show as broken until the seller runs `pnpm upload-images` and pushes the manifest.

### 24.4 Vercel Deployment (alternative)

Vercel auto-deploys on push to `main` when the repo is connected. No workflow file is needed. Vercel uses `pnpm build` directly (reads `package.json` scripts). The `prebuild` and `postbuild` npm lifecycle hooks run automatically.

| Vercel setting | Value |
|---|---|
| Framework preset | Next.js (auto-detected) |
| Build command | `pnpm build` (auto-detected from `package.json`) |
| Install command | `pnpm install` (do NOT use `--prod` — devDependencies are needed at build time) |
| Output directory | `.next` (Vercel mode) or `out/` (static mode — set `Output Directory` to `out` in Vercel settings) |
| Environment variables | `NEXT_PUBLIC_SITE_URL`, `BLOB_READ_WRITE_TOKEN` (if using Vercel Blob) |

---

## 25. Testing Strategy

### 25.1 Philosophy

The project has a small, well-isolated set of pure functions and a clear build-time/runtime boundary. Testing targets the functions with non-trivial logic; component rendering and routing are covered by `pnpm build` (TypeScript + Next.js static generation) as a compile-time gate.

### 25.2 Test Runner

| Package | Version | Purpose |
|---|---|---|
| `vitest` | `^2.0.0` | Test runner; fast, ESM-native, compatible with TypeScript |
| `@vitest/coverage-v8` | `^2.0.0` | Coverage reporting (optional) |

Add to `devDependencies`. Add to `package.json` scripts:
```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

### 25.3 Test File Locations

Tests co-locate with the module they test, using the `.test.ts` suffix:

```
lib/utils/pricing.test.ts         ← resolveItemPrice edge cases
lib/utils/haversine.test.ts       ← haversineInMiles known city pairs
lib/utils/date.test.ts            ← formatRelativeDate boundary conditions
lib/utils/i18n.test.ts            ← getLocalizedField fallback behaviour
lib/content/schema.test.ts        ← Zod schema parse + default merge
lib/content/loader.test.ts        ← loader with fixture content/ folders
scripts/sync-images.test.ts       ← manifest build / purge / checksum logic
```

### 25.4 Required Test Cases

#### `lib/utils/pricing.test.ts`

| Case | Input | Expected |
|---|---|---|
| Distance within tier | `D=3`, tiers `[{max:5, $15}, {min:5, max:15, $20}]` | `$15` tier |
| Distance at exact boundary | `D=5` | `$15` tier (inclusive: `D ≤ miles_max`) |
| Distance in gap | `D=5.5` with tiers having max=5 and min=6 | tier whose `miles_max=5` (nearest from below) |
| Infinity (denied/fallback) | `D=Infinity`, no open-ended tier | tier with highest `amount` |
| Infinity with open-ended tier | `D=Infinity`, last tier has no `miles_max` | open-ended tier |
| Multiple open-ended tiers | two tiers with absent `miles_max` | first in array order |
| Large numeric max not open-ended | tier with `miles_max: 99999` | NOT treated as open-ended |
| Empty tiers | `price.tiers: []` | `null` (→ "Contact for price") |
| `negotiable: true` | any resolved tier | tier returned, `negotiable` flag on Price object |

#### `lib/utils/haversine.test.ts`

| Case | Input | Expected (±0.5 mi) |
|---|---|---|
| Same point | `(37.7749,-122.4194)` to itself | `0` |
| SF → LA | `(37.7749,-122.4194)` to `(34.0522,-118.2437)` | `≈ 347 mi` |
| Short distance | 1 km apart | `≈ 0.62 mi` |

#### `lib/utils/date.test.ts`

| Case | `isoDate` | `now` | Expected |
|---|---|---|---|
| Today | `"2026-05-31"` | `2026-05-31T10:00Z` | `"Today"` |
| Yesterday | `"2026-05-30"` | `2026-05-31T10:00Z` | `"Yesterday"` |
| 3 days ago | `"2026-05-28"` | `2026-05-31T10:00Z` | `"3 days ago"` |
| 2 weeks ago | `"2026-05-17"` | `2026-05-31T10:00Z` | `"2 weeks ago"` |
| null | `null` | any | `""` |
| Invalid date | `"not-a-date"` | any | `""` |
| Full ISO timestamp | `"2026-05-28T10:00:00Z"` | `2026-05-31T10:00Z` | `"3 days ago"` |

#### `lib/content/schema.test.ts`

| Case | Input | Expected |
|---|---|---|
| Missing `name` | `{}` | item skipped (return null / throw detectable signal) |
| Invalid `status` enum | `status: "unknown"` | defaulted to `"available"` |
| Negative number | `age_years: -1` | `null` |
| Zero number | `original_price: 0` | `0` (not null) |
| Invalid URL | `original_link: "not-a-url"` | `""` |
| Full ISO timestamp in `listed_date` | `"2026-05-28T10:00:00Z"` | date portion parsed correctly |
| Absent `price.tiers` | no `price` field | `price.tiers: []` |

#### `lib/content/loader.test.ts`

Use a temporary `content/` fixture directory created in `beforeEach` / cleaned in `afterEach`:

```ts
// Fixture: content/items/test-cat/test-item/item.json
// Tests:
// - loadCategories() returns category with correct slug and displayName
// - loadItemsByCategory("test-cat") returns items filtered by visibility
// - loadItem("test-cat", "test-item") returns parsed item
// - loadItem("test-cat", "missing") returns null (not throws)
// - draft items excluded from loadItemsByCategory
// - sold items past retention excluded from loadItemsByCategory
// - image manifest key resolves to CDN URL
// - thumbnail: file named "cover.*" pinned; otherwise first alphabetical
```

### 25.5 Running Tests in CI

Add a `test` job to `.github/workflows/deploy.yml` that runs before `build`:

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    needs: test        # build only if tests pass
    # ... rest unchanged
```

### 25.6 What is NOT unit-tested

| Area | Rationale |
|---|---|
| Component rendering | `pnpm build` + TypeScript compilation catches prop-type mismatches; Playwright/Cypress E2E is a future addition |
| Geolocation hook | Requires browser environment; covered by manual verification in `pnpm dev` |
| Image upload adapters | Requires live CDN credentials; covered by the deployment checklist (TECH_REQUIREMENTS.md §19) |
| Aceternity UI components | Third-party; not modified; visual regression is out of scope for v1 |

---

## 26. Error Monitoring & Build Alerting

### 26.1 Build Failure Alerts (GitHub Pages path)

GitHub Actions sends an email to the repository owner automatically on any workflow job failure. No configuration required. The email includes a link to the failed run and the first failed step.

**To ensure alerts reach the seller:**
- GitHub account email must be verified and not have notifications disabled
- Settings → Notifications → "Actions" → "Failed workflows only" (default) or "All activity"

### 26.2 Build Failure Alerts (Vercel path)

Vercel sends an email to the project owner on deployment failure. No configuration required. Slack/webhook integrations are available in Vercel's project settings for teams that want them.

### 26.3 Runtime JavaScript Error Monitoring (optional, future)

No runtime error monitoring is configured in v1. The site is fully static with minimal client-side JavaScript surface. If runtime monitoring is desired, the recommended path is:

| Option | Integration point | Notes |
|---|---|---|
| Vercel Analytics | Already wired; tracks page views, no error tracking | Free on Hobby |
| Sentry | Add `@sentry/nextjs`; configure `sentry.client.config.ts` | Free tier covers personal sites |

Sentry integration is an additive change — add the package, run the wizard (`npx @sentry/wizard@latest -i nextjs`), and set `SENTRY_DSN` in environment variables. No existing code needs to change.

### 26.4 Image CDN Availability

The site has no mechanism to detect CDN outages at runtime (fully static, no server). If Cloudflare R2 or Vercel Blob becomes unavailable:
- Images show as broken `<img>` elements with the item `alt` text visible
- The rest of the page (name, price, contact) renders correctly
- No error is reported to the seller

**Mitigation:** Use `<AdaptiveImage>` with an `onError` handler that applies a CSS class showing a placeholder/skeleton. This is an additive UI improvement not currently in scope.

### 26.5 `pnpm upload-images` Failure Handling

See TECH_REQUIREMENTS.md §7 (Image Sync Script) and §27 (Image Upload Failure Recovery) for the full specification of upload failure handling and retry behaviour.

---

## 27. Image Upload Failure Recovery

### 27.1 Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| Missing env vars (R2 or Blob) | Step 1 of upload mode: check all required vars; print clear error naming the missing var; `exit 1` before any uploads | Seller adds the missing var to `.env.local` and re-runs |
| Network timeout during upload | Provider SDK throws; caught per-file | Log `[upload-images] WARN: failed to upload {key} — {error.message}; will retry next run`; skip that file; continue with remaining files; do NOT update manifest or checksum for the failed file → next run re-uploads it |
| Partial run (script killed mid-upload) | Checksums and manifest are written at the END of a successful run (step 8–9) | Manifest and checksums are not updated for incomplete runs; re-running re-uploads all files that were not in the last committed manifest state |
| CDN returns non-2xx | Treat same as network timeout | Same retry-next-run behaviour |
| Manifest write fails (disk full, permissions) | `fs.writeFile` throws after all uploads succeed | Log error; `exit 1`; the in-flight uploaded files are on CDN but not in manifest — re-running re-uploads them (harmless duplicate; CDN overwrites with same content) |
| `content/items/` unreadable | `fs.readdir` throws | `exit 1`; no partial state written |

### 27.2 Atomic Manifest Write

The manifest is written atomically to prevent a corrupt half-written file from breaking the CI build:

```ts
// scripts/sync-images.ts — manifest write (step 8)
import { writeFile, rename } from "fs/promises";
import { join } from "path";

const MANIFEST_PATH = "lib/generated/image-manifest.json";
const MANIFEST_TMP  = `${MANIFEST_PATH}.tmp`;

// Write to temp file first, then rename (atomic on POSIX; best-effort on Windows)
await writeFile(MANIFEST_TMP, JSON.stringify(manifest, null, 2), "utf-8");
await rename(MANIFEST_TMP, MANIFEST_PATH);
```

If the process is killed between `writeFile` and `rename`, the `.tmp` file is left behind; the previous `image-manifest.json` is untouched. On next run, the `.tmp` file is silently overwritten.

### 27.3 Per-File Error Isolation

Upload failures are isolated per file. One failed image does not abort the entire run:

```ts
for (const [manifestKey, sourcePath] of imagesToUpload) {
  try {
    const url = await adapter.syncImage(sourcePath, manifestKey, checksum);
    updatedManifest[manifestKey] = url;
    updatedChecksums[manifestKey] = checksum;
    uploadedCount++;
  } catch (err) {
    console.warn(
      `[upload-images] WARN: failed to upload ${manifestKey} — ${(err as Error).message}`
    );
    // Preserve previous manifest entry (if any) so existing CDN URL is not lost
    if (previousManifest[manifestKey]) {
      updatedManifest[manifestKey] = previousManifest[manifestKey];
    }
    warnCount++;
  }
}
```

### 27.4 Exit Code Summary

| Outcome | Exit code | Manifest written? |
|---|---|---|
| All uploads succeeded | `0` | Yes |
| Some files failed (warnings only) | `0` | Yes (failed files keep previous CDN URL or are absent) |
| Env vars missing | `1` | No |
| `content/items/` unreadable | `1` | No |
| Manifest write failed | `1` | No (previous manifest intact) |

> A non-zero warning count is reported in the summary line but does not cause a non-zero exit code. Sellers must inspect the summary output (`warnings=N`) after each upload.

### 27.5 Retry on Next Run

Because failed files are not added to `.image-cache/checksums.json`, the next `pnpm upload-images` invocation detects them as "new" (no saved checksum) and re-attempts the upload. No manual intervention is needed — re-running the command is the recovery action.

---

## 28. SiteConfig Structural Validation

### 28.1 Rationale

`content/config.ts` is a TypeScript file — TypeScript provides compile-time type checking. However, TypeScript cannot catch _values_ that are structurally invalid at the type level (e.g. `location.lat: 999` is a valid `number` but an invalid latitude). A runtime Zod validation pass at build time catches these before pages are generated.

### 28.2 Validation Module

```ts
// lib/config/validate.ts  (Node.js only — never imported in browser bundle)
import { z } from "zod";
import { siteConfig } from "@/content/config";

const SiteConfigSchema = z.object({
  name:    z.string().min(1, "siteConfig.name must not be empty"),
  baseUrl: z.string().url("siteConfig.baseUrl must be a valid URL (https://...)"),
  deploymentMode: z.enum(["static", "vercel"]),
  imageStorage: z.object({
    provider: z.enum(["cloudflare-r2", "vercel-blob", "local"]),
  }),
  location: z.object({
    lat: z.number().min(-90).max(90, "siteConfig.location.lat must be -90 to 90"),
    lng: z.number().min(-180).max(180, "siteConfig.location.lng must be -180 to 180"),
    label: z.string().min(1, "siteConfig.location.label must not be empty"),
  }),
  currency: z.string().length(3, "siteConfig.currency must be a 3-letter ISO 4217 code"),
  soldItemRetentionDays: z.number().int(),
  contact: z.object({
    reveal_behavior: z.enum(["click", "always"]),
    platforms: z.array(z.object({ type: z.string() })).min(1,
      "siteConfig.contact.platforms must have at least one entry"),
  }),
  i18n: z.object({
    defaultLocale: z.string().min(2),
    availableLocales: z.array(z.string().min(2)).min(1),
    showLocaleSwitcher: z.boolean(),
  }).refine((i) => i.availableLocales.includes(i.defaultLocale), {
    message: "siteConfig.i18n.defaultLocale must be listed in siteConfig.i18n.availableLocales",
  }),
});

export function validateSiteConfig(): void {
  const result = SiteConfigSchema.safeParse(siteConfig);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    console.error(
      `\n[config-validate] content/config.ts has invalid values:\n${messages}\n`
    );
    process.exit(1);
  }
  console.log("[config-validate] content/config.ts OK");
}
```

### 28.3 Integration Point

Called at the top of `scripts/sync-images.ts` (before any file scanning) so an invalid config fails the build immediately with a human-readable error:

```ts
// scripts/sync-images.ts — first executable statement
import { validateSiteConfig } from "@/lib/config/validate";
validateSiteConfig();   // exits 1 with a clear message if config is invalid
```

Because `sync-images.ts` runs in the `prebuild` step (before `next build`), an invalid config stops the build before any pages are generated.

### 28.4 What is NOT validated at runtime

TypeScript already enforces these at compile time (`pnpm type-check`):
- Missing required fields (TypeScript non-optional types)
- Wrong field types (e.g. `string` where `number` expected)
- Invalid `ui.*` slot values (caught by `BackgroundOption` / `ItemGridOption` union types)

Zod runtime validation fills in what TypeScript cannot: value-range checks and semantic constraints.

---

*This document is the authoritative technical specification for v1 implementation.*
