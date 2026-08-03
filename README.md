# UsedExchange

> 🇨🇳 Chinese version: [README_zh.md](README_zh.md)

A statically-generated personal storefront for listing second-hand items. No database, no CMS — content lives entirely in one folder.

**Current version:** 1.4.2 (updated 2026-08-02)

---

## First time? Start here

**→ [Complete Setup Guide](SETUP_GUIDE.md)** — plain-language walkthrough, no coding required.

Two one-time steps before your site goes live:

1. **Enable GitHub Pages** — go to your repository on GitHub → **Settings → Pages → Source → set to "GitHub Actions"**. Without this, pushes will build but never publish.
2. **Set up image hosting** — follow the [CDN setup guide](docs/setup_instruction.md) to configure where photos are stored (Cloudflare R2 recommended for GitHub Pages).

> **Note:** the deploy workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) deploys only from the **`release`** branch (the branch you get when following [UPDATE_GUIDE.md](docs/UPDATE_GUIDE.md)). Do your seller work on `release` — pushes to other branches build in CI but won't publish.

---

## How it works

Drop photos and an `item.json` file into `content/items/<category>/<item-name>/`, run one command, push to git. GitHub Actions builds and publishes the page automatically.

```
content/              ← the only folder you ever touch
├── config.ts         ← site name, contact info, pricing defaults
├── items/
│   └── electronics/
│       └── iphone-14/
│           ├── item.json   ← name, price tiers, condition, description
│           └── cover.jpg
└── contact/
    └── wechat-qr.png
```

## Features

- **Distance-tiered pricing** — each item shows the right price for the buyer's distance (auto-geolocation, no input needed)
- **Seller Studio** — manage listings in a browser: `pnpm studio` opens a local-only graphical interface to create/edit items, drag-and-drop photos, sync the CDN, and publish — no code
- **Facebook Marketplace export** — `pnpm fb-export` walks you through building a bulk-upload CSV
- **Shipping cost estimates (optional)** — live carrier rates on item pages, via a small Cloudflare Worker proxy
- **Multi-language support** — runtime locale switching for UI strings and listing content
- **Full-text search** — instant client-side search (fuse.js)

## Quick start

```bash
pnpm install
pnpm setup-ui          # install Aceternity UI components (once)
pnpm dev               # local preview — photos served from public/items/
```

## Seller workflow (recurring)

```bash
# Add a new item
pnpm new electronics/iphone-14   # creates the folder + item.json template
# drop photos into content/items/electronics/iphone-14/ manually
pnpm upload-images               # uploads photos to CDN, updates manifest
pnpm push                        # commits content/ + the image manifest, then pushes
# → GitHub Actions builds and deploys automatically
```

```bash
# Mark an item sold
pnpm mark-sold electronics/iphone-14
pnpm push
```

```bash
# Manage listings in a browser — no code, local only
pnpm studio                      # edit items, drag-and-drop photos, sync CDN, publish
```

```bash
# Export to Facebook Marketplace (interactive)
pnpm fb-export
# → guides you through item selection, price tier, and writes exports/facebook-marketplace.csv
# → on re-run, offers to skip already-exported items (export history auto-saved locally)
```

See [docs/SCRIPTS.md](docs/SCRIPTS.md) for the full reference of every `pnpm` command — flags, env vars, and what each one touches.

## AI-assisted listing (optional)

Open Claude Code (or any capable AI tool) in this directory:

- `/setup` — guided wizard that writes `content/config.ts` from scratch
- `/update-items` — reads your photos and generates `item.json` for each new item
- `/translate-items` — translates all your listings into another locale
- `/setup-shipping` — enables and configures the optional shipping cost estimator

No API key required. Uses your existing AI tool subscription.

## Documentation

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code structure, data flow, module API, CI/CD pipeline — developer reference |
| [DESIGN.md](docs/DESIGN.md) | Full architecture, data model, component specs, all design decisions |
| [TECH_REQUIREMENTS.md](docs/TECH_REQUIREMENTS.md) | Dependencies, env vars, script specs, deployment checklist |
| [SCRIPTS.md](docs/SCRIPTS.md) | Every `pnpm` script & CLI — flags, env vars, what each touches |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 19-phase build plan (Phases 0–18, ~26 dev days) |
| [CURRENT_FUNCTIONALITY.md](docs/CURRENT_FUNCTIONALITY.md) | Plain-English summary of everything in v1 |
| [FEATURES_ROADMAP.md](docs/FEATURES_ROADMAP.md) | Post-v1 backlog |
| [setup_instruction.md](docs/setup_instruction.md) | CDN setup walkthrough (Cloudflare R2, Vercel Blob, local) |
| [UPDATE_GUIDE.md](docs/UPDATE_GUIDE.md) | How to update your site to a new template version |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Non-technical user guide (content/ operations only) |

## Tech stack

Next.js 15 · TypeScript 5 · Tailwind CSS v4 · Aceternity UI · Zod · fuse.js · GitHub Pages · Cloudflare R2

## License

See [LICENSE](LICENSE).
