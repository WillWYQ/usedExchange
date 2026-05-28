# UsedExchange

A statically-generated personal storefront for listing second-hand items. No database, no CMS — content lives entirely in one folder.

## How it works

Drop photos and a `item.json` file into `content/items/<category>/<item-name>/`, run one command, push to git. Vercel rebuilds and publishes the page automatically.

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
# drop photos into content/items/electronics/iphone-14/ mannually
pnpm upload-images               # uploads photos to CDN, updates manifest
git add content/ lib/generated/image-manifest.json && git push
# → Vercel builds automatically
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
| [DESIGN.md](DESIGN.md) | Full architecture, data model, component specs, all design decisions |
| [TECH_REQUIREMENTS.md](TECH_REQUIREMENTS.md) | Dependencies, env vars, script specs, deployment checklist |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 14-phase build plan (~20 dev days) |
| [CURRENT_FUNCTIONALITY.md](CURRENT_FUNCTIONALITY.md) | Plain-English summary of everything in v1 |
| [FEATURES_ROADMAP.md](FEATURES_ROADMAP.md) | Post-v1 backlog |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Non-technical user guide (content/ operations only) |

## Tech stack

Next.js 15 · TypeScript 5 · Tailwind CSS v4 · Aceternity UI · Zod · fuse.js · Vercel Blob

## License

See [LICENSE](LICENSE).
