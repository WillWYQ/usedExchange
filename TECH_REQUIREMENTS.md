# UsedExchange — Technical Requirements

**Version:** 0.2.0  
**Date:** 2026-05-26  
**Companion:** DESIGN.md v0.3.0

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

### 2.2 Aceternity UI Peer Requirements

Aceternity components are installed individually via their CLI. The following packages are required by most components and must be present:

| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | `^11.0.0` | Animations used by Aceternity components |
| `@tabler/icons-react` | `^3.0.0` | Icon set used by contact platform buttons |

> Aceternity components are copied into `components/ui/` at install time. They are treated as source files — do not install Aceternity as a package dependency.

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
| `tsx` | `^4.15.0` | Runs `scripts/sync-images.ts` without a separate compile step |

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

### 2.5 Optional / Future Dependencies

These are not installed in v1 but are the designated choices when the extension points in DESIGN.md §17 are implemented:

| Package | Feature |
|---|---|
| `fuse.js` | Client-side search |
| `next-sitemap` | Sitemap + robots.txt generation |
| `sharp` | Local image optimisation in static mode |

---

## 3. Environment Variables

All content configuration lives in `site.config.ts` (TypeScript, type-checked). Only infrastructure secrets and deployment-specific overrides use `.env`.

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
`site.config.ts` — no cloud credentials are needed for development. To test cloud upload
locally, run `pnpm upload-images` (a dedicated script that respects the configured provider)
with credentials set in a local `.env.local` file.

---

## 4. next.config.ts Specification

```ts
import type { NextConfig } from "next";
import { siteConfig } from "./site.config";

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

> `next.config.ts` reads `siteConfig` at build time (not in the browser bundle), so importing `site.config.ts` here is safe even though it's not a `NEXT_PUBLIC_*` variable.

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
      "@/*": ["./*"]                     // alias for clean imports
    }
  }
}
```

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
| Any number field | If NaN or negative → `null` |
| Any URL field | If fails URL parse → `""` (not rendered) |
| `listed_date` / `sold_date` | If not ISO 8601 → `null`; sold retention treats `null` as "keep" |

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
- `syncImage()`: copies file to `public/items/{manifestKey}`, returns `/items/{manifestKey}`
- Skips copy when `mtime + size` unchanged (equivalent to checksum match for speed)

#### `vercel-blob`
- `syncImage()`: compares SHA-256 to saved checksum; if changed, calls `@vercel/blob put(manifestKey, fileBuffer, { access: "public" })`; returns the returned `url`
- Requires `BLOB_READ_WRITE_TOKEN` in environment; throws descriptive error if absent

#### `cloudflare-r2`
- `syncImage()`: compares SHA-256; if changed, calls S3 `PutObjectCommand` to R2 endpoint; constructs public URL as `${CF_R2_PUBLIC_URL}/${manifestKey}`
- Requires all `CF_R2_*` env vars; throws descriptive error if any are absent

### Script Execution Steps

1. Read `siteConfig.imageStorage.provider`
2. If `NODE_ENV === "development"` OR required env vars are absent → force `"local"` provider with a warning
3. Load `.image-cache/checksums.json` (create empty if missing)
4. Instantiate the selected adapter, pass saved checksums
5. Scan `items/**` for image files (regex: `/\.(jpg|jpeg|png|webp|gif)$/i`)
6. Exclude `items/contact/**` from item image processing (handled separately in step 8)
7. For each image: compute SHA-256, call `adapter.syncImage()`, record returned URL in manifest
8. Copy `items/contact/**` → `public/contact/**` (always local, used for QR codes)
9. Write `lib/generated/image-manifest.json`
10. Write updated `.image-cache/checksums.json`
11. Print summary: `[sync-images] provider=vercel-blob  uploaded=12  skipped=47  total=59`
12. Exit code 1 on any unrecoverable error (halts the build)

### `package.json` scripts

```json
{
  "scripts": {
    "prebuild":      "tsx scripts/sync-images.ts",
    "build":         "next build",
    "dev":           "tsx scripts/sync-images.ts && next dev --turbo",
    "upload-images": "tsx scripts/sync-images.ts --force-provider",
    "type-check":    "tsc --noEmit",
    "lint":          "eslint . --max-warnings 0",
    "format":        "prettier --write ."
  }
}
```

- `prebuild` runs automatically before every `next build`
- `dev` runs a local sync before the dev server starts (no cloud upload in dev)
- `upload-images` is the **explicit local-to-cloud upload command**: respects `site.config.ts` provider and env vars, bypasses the `NODE_ENV === development` local override. Use this when you want to upload new photos to cloud storage from your local machine before pushing a commit.

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

// Returns all items across all categories (used for home page "Recently Listed")
export async function loadAllItems(): Promise<Item[]>
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
  preferredPayment: string[];
  contactNote: string;
  // platforms come from siteConfig — no need to pass per item
};
```

Behaviour:
- If `siteConfig.contact.reveal_behavior === "click"`: renders a "Show contact info" button; platforms revealed on click; state managed with `useState`
- If `reveal_behavior === "always"`: renders platforms immediately

### `PlatformButton`

- Link-based: `<a href={constructUrl(platform)} target="_blank" rel="noopener noreferrer">`
- QR-based: `<button onClick={() => setModalOpen(true)}>`

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
- `generateMetadata` reads the item and returns Open Graph + Twitter card tags

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
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "import/no-default-export": "off"
  }
}
```

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
| Config files | kebab-case `.ts` | `site.config.ts`, `next.config.ts` |
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
# ── Generated by prebuild image sync ─────────────────────────────────────────
# Local image copies (only populated when imageStorage.provider === "local")
public/items/
public/contact/

# Image URL manifest (regenerated on every build from items/ + cloud provider)
lib/generated/

# Incremental upload checksum cache (build-machine local, not needed in git)
.image-cache/

# ── Next.js build output ──────────────────────────────────────────────────────
.next/
out/
```

---

## 19. Deployment Checklist

### Vercel Hobby — with Vercel Blob (recommended)

**One-time setup:**
- [ ] Connect GitHub repo to Vercel project
- [ ] Set `deploymentMode: "vercel"` and `imageStorage.provider: "vercel-blob"` in `site.config.ts`
- [ ] Vercel Dashboard → Storage → Create Blob store → copy `BLOB_READ_WRITE_TOKEN`
- [ ] Add `BLOB_READ_WRITE_TOKEN` to Vercel project Environment Variables (Production + Preview + Development)
- [ ] Set `NEXT_PUBLIC_SITE_URL` to production URL in Vercel Environment Variables
- [ ] Confirm `baseUrl` in `site.config.ts` points to custom domain or `.vercel.app` URL
- [ ] Custom domain: configure in Vercel Dashboard → Domains

**Per-deployment (automatic):**
- [ ] Push to `main` → Vercel triggers build → `pnpm prebuild` uploads new/changed images to Blob → `next build` runs
- [ ] Vercel build command: `pnpm build` (default, no change needed)
- [ ] Vercel output directory: `.next` (default)

### Vercel Hobby — with Cloudflare R2 (alternative, zero egress cost)

**One-time setup:**
- [ ] Create R2 bucket in Cloudflare Dashboard
- [ ] Enable public access on bucket (or attach custom domain)
- [ ] Create R2 API token with Object Read & Write permission
- [ ] Set `imageStorage.provider: "cloudflare-r2"` in `site.config.ts`
- [ ] Add all `CF_R2_*` env vars to Vercel project Environment Variables
- [ ] Set `CF_R2_PUBLIC_URL` to your R2 bucket public URL

### Self-hosted static — local images

- [ ] Set `deploymentMode: "static"` and `imageStorage.provider: "local"` in `site.config.ts`
- [ ] Run `pnpm build` on a machine with the `items/` folder present → outputs to `out/`
- [ ] Upload entire `out/` directory to any static host (Nginx, Apache, S3+CloudFront, Netlify, GitHub Pages)
- [ ] No size concern: images are part of `out/`, served from the same host
- [ ] Ensure web server serves `404.html` for unknown paths (Next.js static export generates this automatically)

### Self-hosted static — with cloud images

- [ ] Set `deploymentMode: "static"` and `imageStorage.provider: "cloudflare-r2"` (or `vercel-blob`) in `site.config.ts`
- [ ] Run `pnpm upload-images` locally to push images to cloud storage
- [ ] Run `pnpm build` → `out/` will be small (no images embedded)
- [ ] Deploy `out/` to static host; images served from R2/Blob CDN

---

*This document is the authoritative technical specification for v1 implementation.*
