# UsedExchange — Setup Instructions

> ← [Back to README.md](../README.md) · 🇨🇳 Chinese version: [setup_instruction_zh.md](setup_instruction_zh.md)

**Version:** 1.1  
**Date:** 2026-08-02

**Phase 4: Image Pipeline**

This guide covers how to configure the image storage provider, use the image sync pipeline after completing Phase 4, and manage photos from the browser with Seller Studio.

---

## Overview

Item photos are **not committed to git**. They are uploaded to a CDN once — from your local machine only — and then referenced by a committed manifest file (`lib/generated/image-manifest.json`). The build reads that manifest — no CDN credentials are needed in CI (the one CI-side variable is the non-secret `NEXT_PUBLIC_SITE_URL`; see "CI / GitHub Actions Variable" below).

Three storage providers are available. Choose one in `content/config.ts`:

| Provider | Best for | Seller effort |
|---|---|---|
| `"cloudflare-r2"` **(recommended)** | GitHub Pages, any static host — zero egress cost | 5 env vars, one-time |
| `"vercel-blob"` | Vercel deployments | 1 env var, one-time |
| `"local"` | Local dev / self-hosted (no CDN needed) | None |

---

## Option A — Cloudflare R2 (Recommended)

### Step 1 — Create an R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2 Object Storage** (left sidebar: **Build → Storage & databases → R2 Object Storage**)
3. Click **Create bucket**
4. Name it (e.g. `usedexchange-images`) and choose a region close to your buyers
5. Click **Create bucket**

### Step 2 — Enable Public Access

Photos need a public URL. **A custom domain is the recommended — and currently supported — path:**

- **Option A (Custom domain — recommended):** your bucket → **Settings** → **Custom Domains** → Add your domain (e.g. `images.your-domain.com`). Set a DNS CNAME pointing to the provided R2 hostname.
- **Option B (r2.dev URL — legacy):** your bucket → **Settings** → **Public access** → Enable `r2.dev` subdomain. Copy the URL shown (e.g. `https://pub-xxxxxxxx.r2.dev`).

> ⚠️ Cloudflare no longer offers managed `r2.dev` public URLs for newly created buckets — Option B only exists on older buckets. If you cannot find the "Enable r2.dev" toggle, use a custom domain (Option A).

### Step 3 — Configure CORS

> ℹ️ **Required if you want the item detail page's "Download Flyer" button to include photos.** Uploads run server-side from your machine via the S3 SDK, and everywhere else on the site photos are rendered with plain `<img>` tags — neither needs browser↔bucket CORS. The flyer button is the one exception: it fetches each photo's raw bytes from the visitor's browser to embed them in the generated PDF, which browsers block cross-origin without a CORS policy. Skip this step and flyers still generate — just without photos.

Easiest path — run this once from your machine (reads `CF_R2_*` from `.env.local` and your site's `baseUrl` from `content/config.ts`, and only adds a rule — it never touches other CORS rules already on the bucket):

```bash
pnpm configure-image-cors
```

If your R2 API token isn't scoped for bucket settings, the command will fail with that reason and print the manual policy to add. To do it by hand instead: your bucket → **Settings** → **CORS Policy** → Add:

```json
[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

Replace `https://your-domain.com` with your actual site URL.

### Step 4 — Find Account ID and Create API Token

All three values are on one page:

**R2 Object Storage → Overview → scroll to bottom → "Account Details" panel**

| Field | What to do |
|---|---|
| **Account ID** | Copy this → `CF_R2_ACCOUNT_ID` |
| **API Tokens** (Manage link) | Click to open the token manager |
| **S3 API** | The S3-compatible endpoint — used internally by the adapter, no action needed |

In the token manager, click **Create API token**:
- **Token type:** User API Tokens *(ideal for personal access and development)*
- **Permissions:** Object Read & Write
- **Specify bucket:** your bucket only (principle of least privilege)
- Click **Create API Token**
- Copy the **Access Key ID** and **Secret Access Key** — you won't see the secret again

> **What's safe to share vs. what's secret**
>
> | Value | Safe to share? |
> |---|---|
> | Account ID | ✅ Yes — not a secret; Cloudflare displays it publicly |
> | Access Key ID | ✅ Yes — identifies the token but can't do anything alone |
> | **Secret Access Key** | ❌ Never — treat it like a password; don't paste it in chat or email |
>
> When using the AI assistant to set up R2, you can share Account ID and Access Key ID freely. Always paste the Secret Access Key directly into `.env.local` yourself.

### Step 5 — Configure `.env.local`

Copy `.env.example` to `.env.local` in the project root, then fill in:

```bash
CF_R2_ACCOUNT_ID=your_cloudflare_account_id
CF_R2_ACCESS_KEY_ID=your_r2_access_key_id
CF_R2_SECRET_ACCESS_KEY=your_r2_secret_key
CF_R2_BUCKET=usedexchange-images
CF_R2_PUBLIC_URL=https://images.your-domain.com
# or: CF_R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

> ⚠️ Never commit `.env.local` to git. It is gitignored by default.

### Step 6 — Set the Provider in `content/config.ts`

```ts
imageStorage: {
  provider: "cloudflare-r2",
},
```

---

## Option B — Vercel Blob

### Step 1 — Install the SDK

```bash
pnpm add -D @vercel/blob
```

### Step 2 — Create a Blob Store

Vercel Dashboard → **Storage** → **Create** → **Blob** → Follow the prompts

### Step 3 — Get the Token

Storage → your Blob store → **Settings** → copy **BLOB_READ_WRITE_TOKEN**

### Step 4 — Configure `.env.local`

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### Step 5 — Set the Provider

```ts
imageStorage: {
  provider: "vercel-blob",
},
```

---

## Option C — Local (No CDN)

No configuration needed. Images are copied to `public/items/` at build time. Suitable for self-hosted servers or development-only setups where the full `out/` folder is deployed.

```ts
imageStorage: {
  provider: "local",
},
```

> ⚠️ Do not use `local` provider on GitHub Pages or Vercel — item photos are gitignored and will not be present on the CI runner.

---

## Daily Workflow

### Adding or Changing Photos

```bash
# 1. Drop photos into content/items/<category>/<item-name>/
# 2. Upload to CDN (runs on your machine only):
pnpm upload-images

# 3. Stage, commit, and push in one step:
pnpm push
```

> 🔒 `pnpm upload-images` automatically strips EXIF/GPS metadata (including
> the location where the photo was taken) from every new or changed photo
> before it's uploaded — see "Photo Privacy" below.

**Partial failures are safe.** If one photo fails to upload, the batch is not discarded: the manifest is still written for the successful files, and the script exits 1 at the end. Re-running `pnpm upload-images` retries only the failed or changed files (a sha256 checksum cache in `.image-cache/checksums.json` makes runs incremental). Upload mode also copies `content/contact/` → `public/contact/` alongside the CDN upload.

> 🔐 **Git prerequisite:** `pnpm push` (and Studio's publish button) shells out to plain `git` — no script reads a GitHub token env var. Make sure `git push` to your GitHub repo already works from your machine (SSH key or a personal access token via the credential helper) before your first publish.

### Browser Management: Seller Studio (Optional)

```bash
pnpm studio              # http://127.0.0.1:5174
pnpm studio --port 5200  # custom port (1024–65535)
```

Seller Studio is a **local-only** browser dashboard (bound to `127.0.0.1`) for editing item metadata, managing photos (upload / delete / reorder), changing status in bulk, and syncing photos to the CDN — no command line required.

- Its **Sync** button uses the exact same `.env.local` credentials documented in this guide (`CF_R2_*` or `BLOB_READ_WRITE_TOKEN`, depending on your provider).
- Its **Publish** button mirrors `pnpm push`: it stages only `content/` and `lib/generated/image-manifest.json` (never `git add -A`), so `.env.local` can never be committed by accident.
- Missing CDN credentials do not block startup — they surface as an error only when you trigger a sync.

### Local Development

```bash
pnpm dev
```

`pnpm dev` automatically runs `scripts/sync-images.ts --mode dev-sync` first, which copies photos from `content/items/` to `public/items/` (and contact files from `content/contact/` to `public/contact/`) — no CDN credentials needed during local development.

### Production Build

```bash
pnpm build
```

The `prebuild` step calls `scripts/sync-images.ts --mode build-check`. On CI (GitHub Actions), no photos are present (they're gitignored) but the committed manifest is used to resolve all image URLs. No CDN credentials are needed in CI.

---

## CI / GitHub Actions Variable

CI needs **no CDN credentials** — the only CI-side variable is:

| Variable | Value | Where to set |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Your production site URL (e.g. `https://your-domain.com`) | GitHub repo → **Settings → Variables → Actions → New repository variable** — a plain Variable, **not** a Secret |

It is read by `next-sitemap.config.js` (via `scripts/postbuild.ts`) to build the sitemap; if unset, the placeholder `https://your-domain.com` is used. You can also set it in `.env.local` if you want correct sitemap URLs during local builds. Open Graph URLs do not depend on this variable — they derive from `baseUrl` in `content/config.ts` (via `metadataBase` in `app/layout.tsx`).

---

## What Gets Committed to Git

| File | Committed? | Notes |
|---|---|---|
| `content/**/*.json` | **Yes** | Item metadata — tiny text files |
| `content/config.ts` | **Yes** | Site configuration |
| `content/contact/*.png` | **Yes** | QR codes — tiny, rarely change |
| `content/items/**/*.jpg/png/…` | **No** | Gitignored — on seller's machine + CDN |
| `lib/generated/image-manifest.json` | **Yes** | CDN URL map — CI needs this to build |
| `.image-cache/checksums.json` | **No** | Gitignored — local speed cache |
| `public/items/` | **No** | Gitignored — populated at dev/build time |
| `public/contact/` | **No** | Gitignored — copied from `content/contact/` |

---

## Backup Warning

> ⚠️ **Your photos are not in git and cloud storage is not a backup.**
>
> After every `pnpm upload-images` run the script prints a backup reminder. Make sure your `content/` folder (especially the photos) is backed up to an external drive or cloud storage service (iCloud, Google Drive, Dropbox).

---

## Photo Quality Guidelines

The upload script prints advisory warnings (never blocks the upload):

| Warning | Cause | Recommended fix |
|---|---|---|
| Image > 8 MB | File is very large | Resize to max 2000px wide before uploading |
| No `cover.*` found | Item folder has no `cover.jpg/png` | Name your main thumbnail `cover.jpg` |
| No images found | Item folder has no photos | Add at least one photo before listing |
| Image < 800px wide | Photo resolution is low | Use a higher-quality photo |

---

## Photo Privacy: EXIF/GPS Stripping

Phone cameras embed EXIF metadata in photos — including the GPS coordinates
of where the photo was taken. Every time you run `pnpm upload-images`, any
new or changed JPEG/PNG/WebP photo is automatically re-encoded via `sharp`
(`lib/images/stripMetadata.ts`) before it leaves your machine:

- The photo's orientation is preserved (it still displays right-side-up).
- All EXIF/IPTC/XMP metadata — including GPS location — is removed.
- GIFs are uploaded unchanged (GIF has no EXIF data, and re-encoding would
  break animated GIFs).

This only affects the copy that gets uploaded to the CDN. Your original
files in `content/items/` are never modified. The summary line after each
upload that actually uploads at least one photo reports how many were
processed, e.g.:

```
🔒 stripped EXIF/GPS metadata from 3/3 uploaded image(s)
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Missing CF_R2_*` | Env vars not set | Check `.env.local` values against Cloudflare Dashboard |
| `Missing BLOB_READ_WRITE_TOKEN` | Token not set | Regenerate in Vercel Dashboard → Storage → Blob |
| Images broken after deploy | Manifest not committed | Run `pnpm upload-images` and commit `lib/generated/image-manifest.json` |
| `N file(s) failed to upload` at the end of a run | One photo failed; successful uploads were kept | Re-run `pnpm upload-images` — only failed/changed files are retried (incremental checksum cache) |
| `@vercel/blob is not installed` | SDK missing | Run `pnpm add -D @vercel/blob` |
