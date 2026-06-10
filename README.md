# UsedExchange

> 🇨🇳 Chinese version: [README_zh.md](README_zh.md)

A statically-generated personal storefront for listing second-hand items. No database, no CMS — content lives entirely in one folder.

---

## First time? Start here

**→ [Complete Setup Guide](SETUP_GUIDE.md)** — plain-language walkthrough, no coding required.

Two one-time steps before your site goes live:

1. **Enable GitHub Pages** — go to your repository on GitHub → **Settings → Pages → Source → set to "GitHub Actions"**. Without this, pushes will build but never publish.
2. **Set up image hosting** — follow the [CDN setup guide](docs/setup_instruction.md) to configure where photos are stored (Cloudflare R2 recommended for GitHub Pages).

---

## How it works

Drop photos and a `item.json` file into `content/items/<category>/<item-name>/`, run one command, push to git. GitHub Actions builds and publishes the page automatically.

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
git add content/ lib/generated/image-manifest.json && git push
# → GitHub Actions builds and deploys automatically
```

```bash
# Mark an item sold
pnpm mark-sold electronics/iphone-14
git add content/ && git push
```

## AI-assisted listing (optional)

Open Claude Code (or any capable AI tool) in this directory:

- `/setup` — guided wizard that writes `content/config.ts` from scratch
- `/update-items` — reads your photos and generates `item.json` for each new item

No API key required. Uses your existing AI tool subscription.

## Documentation

| Document | Purpose |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code structure, data flow, module API, CI/CD pipeline — developer reference |
| [DESIGN.md](docs/DESIGN.md) | Full architecture, data model, component specs, all design decisions |
| [TECH_REQUIREMENTS.md](docs/TECH_REQUIREMENTS.md) | Dependencies, env vars, script specs, deployment checklist |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 16-phase build plan (Phases 0–15, ~24 dev days) |
| [CURRENT_FUNCTIONALITY.md](docs/CURRENT_FUNCTIONALITY.md) | Plain-English summary of everything in v1 |
| [FEATURES_ROADMAP.md](docs/FEATURES_ROADMAP.md) | Post-v1 backlog |
| [setup_instruction.md](docs/setup_instruction.md) | CDN setup walkthrough (Cloudflare R2, Vercel Blob, local) |
| [UPDATE_GUIDE.md](docs/UPDATE_GUIDE.md) | How to update your site to a new template version |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Non-technical user guide (content/ operations only) |

## Tech stack

Next.js 15 · TypeScript 5 · Tailwind CSS v4 · Aceternity UI · Zod · fuse.js · GitHub Pages · Cloudflare R2

## License

See [LICENSE](LICENSE).
