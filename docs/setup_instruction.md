# UsedExchange — Setup Instructions

**Phase 4: Image Pipeline**

This guide covers how to configure the image storage provider and use the image sync pipeline after completing Phase 4.

---

## Overview

Item photos are **not committed to git**. They are uploaded to a CDN once and then referenced by a committed manifest file (`lib/generated/image-manifest.json`). The build reads that manifest — no CDN credentials are needed in CI.

Three storage providers are available. Choose one in `content/config.ts`:

| Provider | Best for | Seller effort |
|---|---|---|
| `"cloudflare-r2"` **(recommended)** | GitHub Pages, any static host — zero egress cost | 5 env vars, one-time |
| `"vercel-blob"` | Vercel deployments | 1 env var, one-time |
| `"local"` | Local dev / self-hosted (no CDN needed) | None |

---

## Option A — Cloudflare R2 (Recommended)

### Step 1 — Create an R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** (left sidebar)
2. Click **Create bucket**
3. Name it (e.g. `usedexchange-images`) and choose a region close to your buyers
4. Click **Create bucket**

### Step 2 — Enable Public Access

In the bucket settings, enable public access:

- **Option A (Custom domain):** R2 → your bucket → **Settings** → **Custom Domains** → Add your domain (e.g. `images.your-domain.com`). Set a DNS CNAME pointing to the provided R2 hostname.
- **Option B (r2.dev URL):** R2 → your bucket → **Settings** → **Public access** → Enable `r2.dev` subdomain. Copy the URL shown (e.g. `https://pub-xxxxxxxx.r2.dev`).

### Step 3 — Configure CORS

R2 → your bucket → **Settings** → **CORS Policy** → Add:

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

### Step 4 — Create an API Token

Cloudflare Dashboard → **R2** → **Manage R2 API Tokens** → **Create API token**

- **Permissions:** Object Read & Write
- **Specify bucket:** your bucket only (principle of least privilege)
- Copy the **Access Key ID** and **Secret Access Key** — you won't see them again

Also note your **Account ID** from the right sidebar of the Cloudflare Dashboard.

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

# 3. Commit the updated manifest:
git add lib/generated/image-manifest.json content/**/*.json
git commit -m "chore: update listings"
git push
```

### Local Development

```bash
pnpm dev
```

`pnpm dev` automatically runs `scripts/sync-images.ts --mode dev-sync` first, which copies photos from `content/items/` to `public/items/` — no CDN credentials needed during local development.

### Production Build

```bash
pnpm build
```

The `prebuild` step calls `scripts/sync-images.ts --mode build-check`. On CI (GitHub Actions), no photos are present (they're gitignored) but the committed manifest is used to resolve all image URLs. No CDN credentials are needed in CI.

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
| Image < 800px wide (requires `sharp`) | Photo resolution is low | Use a higher-quality photo |

To enable the width check, install `sharp`:
```bash
pnpm add -D sharp
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Missing CF_R2_*` | Env vars not set | Check `.env.local` values against Cloudflare Dashboard |
| `Missing BLOB_READ_WRITE_TOKEN` | Token not set | Regenerate in Vercel Dashboard → Storage → Blob |
| Images broken after deploy | Manifest not committed | Run `pnpm upload-images` and commit `lib/generated/image-manifest.json` |
| `@vercel/blob is not installed` | SDK missing | Run `pnpm add -D @vercel/blob` |
