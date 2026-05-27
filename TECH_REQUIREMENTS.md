# UsedExchange — Technical Requirements

**Version:** 0.6.0  
**Date:** 2026-05-27  
**Companion:** DESIGN.md v0.7.0

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
| `@vercel/analytics` | `^1.3.0` | Vercel Analytics (enabled when `siteConfig.analytics.vercel`) |
| `@vercel/speed-insights` | `^1.0.0` | Vercel Speed Insights / Core Web Vitals |

### 2.2 Aceternity UI Peer Requirements

Aceternity components are installed individually via their CLI. The following packages are required by most components and must be present:

| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | `^11.0.0` | Animations used by Aceternity components |
| `@tabler/icons-react` | `^3.0.0` | Icon set used by contact platform buttons |

> Aceternity components are copied into `components/ui/` at install time. They are treated as source files — do not install Aceternity as a package dependency.
>
> Each UI slot adapter (`components/ui-adapters/`) only imports the Aceternity components the seller has explicitly installed and registered. Only install the components you actually configure. See DESIGN.md §19 for the full slot ↔ component registry and install commands.

### 2.3 Development Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.5.0` | Type checking |
| `@types/node` | `^20.0.0` | Node.js types for `fs`, `path` in loader/scripts |
| `@types/react` | `^19.0.0` | React types |
| `@types/react-dom` | `^19.0.0` | ReactDOM types |
| `tailwindcss` | `^4.0.0` | Utility CSS |
| `@tailwindcss/typography` | `^0.5.0` | Prose styles for Markdown descriptions |
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
# Vercel Blob (recommended for Vercel Hobby)
pnpm add -D @vercel/blob

# Cloudflare R2
pnpm add -D @aws-sdk/client-s3
```

### 2.4 Image Storage — Vercel devDependency Note

> ⚠️ `@vercel/blob`, `@aws-sdk/client-s3`, and `tsx` are listed as **devDependencies**. Vercel installs devDependencies by default during the build step. If you have customised the install command (e.g., `pnpm install --prod`), the `prebuild` script will fail. Ensure Vercel's install command does **not** skip devDependencies.

### 2.5 Optional / Future Dependencies

These are not installed in v1 but are the designated choices when the extension points in DESIGN.md §19 are implemented:

| Package | Feature | Extension point |
|---|---|---|
| `sharp` | Pre-upload image resizing/optimisation | Optional `preprocess` step in `scripts/sync-images.ts --mode upload` |

---

## 3. Environment Variables

All content configuration lives in `content/config.ts` (TypeScript, type-checked, inside the seller-managed `content/` folder). Only infrastructure secrets and deployment-specific overrides use `.env`.

### 3.1 Variables

| Variable | Required | When | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | No | Always | Overrides `siteConfig.baseUrl` at runtime. Useful for Vercel preview deployments where the URL is auto-assigned. Falls back to `siteConfig.baseUrl`. |
| `BLOB_READ_WRITE_TOKEN` | **Yes** | `imageStorage.provider === "vercel-blob"` | Vercel Blob write token. Generate in Vercel Dashboard → Storage → Blob → your store → Settings. Set in Vercel project Environment Variables (all environments). |
| `CF_R2_ACCOUNT_ID` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | Cloudflare account ID. Found in Cloudflare Dashboard → right sidebar. |
| `CF_R2_ACCESS_KEY_ID` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | R2 API token access key ID. |
| `CF_R2_SECRET_ACCESS_KEY` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | R2 API token secret. |
| `CF_R2_BUCKET` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | R2 bucket name. |
| `CF_R2_PUBLIC_URL` | **Yes** | `imageStorage.provider === "cloudflare-r2"` | Public base URL for the R2 bucket (custom domain or `r2.dev` URL). Used to construct image URLs in the manifest. |

The app **must build and serve correctly with zero `.env` file** when `imageStorage.provider === "local"`.

### 3.2 `.env.example`

```bash
# ── Site URL override ────────────────────────────────────────────────────────
# Optional. Overrides siteConfig.baseUrl (useful for Vercel preview deployments).
# NEXT_PUBLIC_SITE_URL=https://your-preview.vercel.app

# ── Vercel Blob  (required when imageStorage.provider === "vercel-blob") ──────
# Generate at: Vercel Dashboard → Storage → Blob → <store> → Settings
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# ── Cloudflare R2  (required when imageStorage.provider === "cloudflare-r2") ─
# CF_R2_ACCOUNT_ID=
# CF_R2_ACCESS_KEY_ID=
# CF_R2_SECRET_ACCESS_KEY=
# CF_R2_BUCKET=usedexchange-images
# CF_R2_PUBLIC_URL=https://images.your-domain.com
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
| `listed_date` / `sold_date` | If not ISO 8601 → `null`; sold retention: `null sold_date` → falls back to `listed_date` for the formula (consistent with DESIGN.md §5 field defaults). If `listed_date` is also null, the item is treated as "keep" (never expires). |

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
    "prebuild":        "tsx scripts/sync-images.ts --mode build-check",
    "build":           "next build",
    "postbuild":       "next-sitemap",
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
| `pnpm build` | Deploy to production | Vercel (automatic on push) or seller |
| `pnpm dev` | Local development preview | Seller, on their machine |

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

// Returns items for home page "Recently Listed" and /all page.
// Applies MORE RESTRICTIVE filters than loadItemsByCategory():
//   - status === "available" ONLY
//   - excludes draft, sold, and expired-sold items
// Results sorted by listedDate descending, limited to siteConfig.recentlyListedCount.
export async function loadAllItems(): Promise<Item[]>

// Returns ALL sold items for the /sold archive page.
// No retention filter — shows every item that ever had status "sold".
// Sorted by soldDate descending (falls back to listedDate if soldDate absent).
export async function loadSoldItems(): Promise<Item[]>

// Builds the fuse.js search index from all available items.
// Called during next build; result serialised to lib/generated/search-index.json.
// Fields indexed: name, description, brand, model, tags, course, isbn, edition.
export async function buildSearchIndex(): Promise<SearchIndexEntry[]>
```

### Item object shape (abbreviated — see `lib/content/types.ts` for full definition)

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
  preferredPayment: string[];   // item-level; pass [] from footer
  contactNote: string;          // item-level; pass "" from footer
  // platforms come from siteConfig — no need to pass per item
};
```

Behaviour:
- If `siteConfig.contact.reveal_behavior === "click"`: renders a "Show contact info" button; platforms revealed on click; state managed with `useState`
- If `reveal_behavior === "always"`: renders platforms immediately
- `preferredPayment` block is not rendered when the array is empty
- `contactNote` block is not rendered when the string is empty or whitespace-only
- **Footer usage:** Pass `preferredPayment={[]}` and `contactNote=""`. The component renders only the platform buttons with no payment or note blocks — no separate footer-specific component is needed.

### `PlatformButton`

- Link-based: `<a href={constructUrl(platform)} target="_blank" rel="noopener noreferrer">`
- QR-based: `<button onClick={() => setModalOpen(true)}>`

**`constructUrl` — Discord special handling:**

Discord `value` can be either:
- An 18-digit numeric user ID → `https://discord.com/users/{value}` (direct message link)
- A server invite code (e.g. `abc123`) → `https://discord.gg/{value}` (server invite)

Detection: if `value` matches `/^\d{17,19}$/` treat as user ID; otherwise treat as server invite code.

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

# ── Incremental upload cache (seller's machine only) ─────────────────────────
.image-cache/

# ── Next.js build output ──────────────────────────────────────────────────────
.next/
out/
```

**What is intentionally NOT gitignored:**
- `content/**/*.json` — inventory metadata, always committed
- `content/config.ts` — site configuration, always committed
- `content/contact/` — QR code image sources (tiny, git-tracked; `public/contact/` is the generated copy)
- `lib/generated/image-manifest.json` — CDN URL map, committed after `pnpm upload-images`

---

## 19. Deployment Checklist

### Vercel Hobby — Vercel Blob (recommended path)

**One-time setup (do once, then forget):**
- [ ] Run `pnpm setup-ui` to install all supported Aceternity UI components into `components/ui/`. Commit the resulting files. This only needs to be done once per developer machine; subsequent clones get the components from git.
- [ ] Connect GitHub repo to Vercel project
- [ ] Set `deploymentMode: "vercel"` and `imageStorage.provider: "vercel-blob"` in `content/config.ts`
- [ ] Vercel Dashboard → Storage → Create Blob store → copy `BLOB_READ_WRITE_TOKEN`
- [ ] Add `BLOB_READ_WRITE_TOKEN` to Vercel project Environment Variables (all environments)
- [ ] Set `NEXT_PUBLIC_SITE_URL` to production URL in Vercel Environment Variables
- [ ] Confirm `baseUrl` in `content/config.ts` matches production URL
- [ ] Custom domain: configure in Vercel Dashboard → Domains
- [ ] Run `pnpm upload-images` at least once (even with no photos) to create the initial `lib/generated/image-manifest.json`. The script creates the file with `{}` if `content/items/` has no images. Commit this file before first deploy.
- [ ] **Vercel Blob storage note:** Blobs are permanent — they do not auto-expire. When items are deleted, `pnpm upload-images` purges their manifest entries but the actual blob files remain in storage. This is fine for v1 (storage cost is negligible). Use the Vercel Dashboard → Storage → Blob → browser to delete orphaned files manually if needed.

**Adding or updating items (recurring seller workflow):**
1. - [ ] Create/edit item folder + `item.json` in `content/items/`
2. - [ ] Drop photos into the item folder
3. - [ ] Run `pnpm upload-images` → photos uploaded to Blob, manifest updated
4. - [ ] Read and follow the printed **BACKUP REMINDER** — back up your `content/` folder
5. - [ ] `git add content/**/*.json lib/generated/image-manifest.json && git commit && git push`
6. - [ ] Vercel auto-builds — no images to upload on Vercel's end; just `next build` runs

**Code-only changes (no photo edits):**
- [ ] Edit `content/**/*.json` or `content/config.ts` → `git commit && git push` → Vercel builds immediately

### Vercel Hobby — Cloudflare R2 (alternative, zero egress cost)

**One-time setup:**
- [ ] Create R2 bucket in Cloudflare Dashboard; enable public access or attach custom domain
- [ ] Create R2 API token (Object Read & Write)
- [ ] **Configure CORS on the R2 bucket** — without this, browsers will block image loads from your site domain. In Cloudflare Dashboard → R2 → bucket → Settings → CORS Policy, add:
  ```json
  [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
  ```
  Use `["*"]` for `AllowedOrigins` during testing; restrict to your production domain before go-live.
- [ ] Set `imageStorage.provider: "cloudflare-r2"` in `content/config.ts`
- [ ] Add `CF_R2_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET`, `CF_R2_PUBLIC_URL` to Vercel Environment Variables
- [ ] Add the same vars to local `.env.local` for `pnpm upload-images` to work locally

**Recurring workflow:** identical to Vercel Blob above (step 1–6).

### Self-hosted static — local images (simple, no cloud storage)

- [ ] Set `deploymentMode: "static"` and `imageStorage.provider: "local"` in `content/config.ts`
- [ ] Run `pnpm build` on a machine where the `content/items/` folder (with photos) is present
- [ ] `out/` includes all images; deploy the entire `out/` directory to any static host
- [ ] No size constraint for self-hosted (server storage is cheap)

### Self-hosted static — with cloud images

- [ ] Set `deploymentMode: "static"` and desired provider in `content/config.ts`
- [ ] Run `pnpm upload-images` locally → images go to CDN, manifest updated
- [ ] Run `pnpm build` → `out/` contains only HTML/CSS/JS (tiny)
- [ ] Deploy `out/` to static host; images served from CDN

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
| `ContactSection` | Click-to-reveal toggle |
| `PlatformButton` | Receives `onClick` function prop (state setter from `ContactSection`) — function props are not serialisable across the server/client boundary |
| `QRModal` | Modal open/close state |

> **`PricingTable` reclassification note:** `PricingTable` is NOT in this list. It was previously documented as a server component but was reclassified to a **presentational component** (no `"use client"`, no hooks). It renders `PricingTableToggle` (a client component) as a child, so in practice it always runs in a client subtree. The server-side page (`page.tsx`) calls `resolveItemPrice` as a pure function for the SSG initial render and passes the result as `initialResolvedTier` prop to `PricingSection`, not directly to `PricingTable`.

### Security & Privacy

| Concern | Mitigation |
|---|---|
| Visitor coordinates sent to server | **Impossible** — site is fully static; no server functions receive data |
| Coordinates persisted without consent | `useState` only in v1; cleared on page close. No `localStorage` or cookies. A `sessionStorage` cache is listed in DESIGN.md §18 Extensibility as a future opt-in — it must be gated behind user consent or an explicit config flag when implemented. |
| Seller coordinates exposed | Intentional and documented in DESIGN.md §17; seller should use a nearby landmark |
| HTTPS requirement for Geolocation API | Next.js on Vercel serves HTTPS by default; self-hosted must configure TLS |

---

## 21. UI Component Adapter Specification

See DESIGN.md §18 for the design rationale, slot tables, and the core principle (seller only touches `content/`). This section covers the setup script, TypeScript types, adapter props, and data normalisation specs.

---

### Setup Script — `scripts/setup-ui.sh`

Run once by a developer after initial clone. Installs all 25 supported Aceternity components. The resulting files in `components/ui/` must be committed to git — after that, sellers never run any install commands.

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
  coverImage: string | null;
};

export async function buildSearchIndex(): Promise<SearchIndexEntry[]>
```

The index is written to `lib/generated/search-index.json` during `next build`. It is gitignored (regenerated on every build; not committed).

**`SearchBar` component** (`components/search/SearchBar.tsx` — client):
- Loaded lazily via `next/dynamic` with `{ ssr: false }` to avoid hydration mismatch
- On mount, fetches `/search-index.json` (Next.js serves it from `public/` — the build copies it there during generation)
- Initialises fuse.js with keys: `["name", "description", "brand", "model", "tags", "course", "isbn"]`
- Shows results inline as the user types (debounced 150 ms)
- Results show: item cover image, name, category, price badge
- Clicking a result navigates to the item detail page
- Shown in `SiteHeader` when `siteConfig.search.enabled === true`

---

### 22.2 Dark Mode (Auto — System Preference)

**Tailwind configuration:**
```ts
// tailwind.config.ts
export default {
  darkMode: "media",   // follows prefers-color-scheme media query automatically
  // ...
}
```

- No toggle needed; no user action required; no JavaScript involved
- All Tailwind `dark:` variant classes respond to OS/browser preference
- Aceternity components support dark mode via their own `dark:` classes
- `siteConfig.darkMode` is typed `"media" | "class"`. The `"class"` variant is a future extension (requires toggle button in SiteHeader + persisted preference)

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
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || require('./content/config').siteConfig.baseUrl,
  generateRobotsTxt: true,
  exclude: ['/preview/*'],
};
```

`postbuild` script runs `next-sitemap` → generates `public/sitemap.xml` + `public/robots.txt`.

The sitemap only generates when `siteConfig.sitemap.enabled === true`. The `postbuild` script checks this before running.

---

### 22.8 Internationalisation (i18n)

**Design:** Single-locale per deployment. No routing changes; the active locale is set by `siteConfig.i18n.locale`.

**`lib/utils/i18n.ts`**:
```ts
// Returns the localised field value, falling back to the English default.
// Example: getLocalizedField(item, "name", "zh") → item.name_zh ?? item.name
export function getLocalizedField(
  item: Record<string, unknown>,
  field: string,    // e.g. "name", "description"
  locale: string    // e.g. "zh", "es"
): string

// Returns a UI string from siteConfig.i18n.strings, falling back to the built-in English default.
export function t(key: keyof UIStrings): string
```

All item-rendering components call `getLocalizedField` instead of accessing `item.name` directly. The locale comes from `siteConfig.i18n.locale` (static at build time).

---

### 22.9 Payment Platforms — Venmo & Zelle

Both follow the existing contact platform architecture (DESIGN.md §7).

**Venmo (link-based):**
- `type: "venmo"`, `value: "username"` → renders `<a href="https://venmo.com/u/{value}">Venmo</a>`
- Pre-filled payment request: when item context available, append `?txn=pay&audience=private&note={encodedItemName}`

**Venmo (QR-based):**
- `type: "venmo"`, `qr_image: "/contact/venmo-qr.png"` → QR modal (same as WeChat)

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
export function formatRelativeDate(isoDate: string | null): string
// Returns: "Today" | "Yesterday" | "3 days ago" | "2 weeks ago" | "1 month ago" | ""
// Returns "" when isoDate is null/invalid (graceful; caller hides the element)
```

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

*This document is the authoritative technical specification for v1 implementation.*
