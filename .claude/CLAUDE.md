# UsedExchange — Claude Code Project Context

> This file is loaded automatically by Claude Code on every session start.
> It is the authoritative source of project-level rules and invariants.

---

## What This Project Is

**UsedExchange** is a Next.js 15 static site for listing second-hand items.
Single seller, zero database, file-system-driven. Hosted on GitHub Pages + Cloudflare R2.

**Status:** All phases (0–18) implemented and live. Seller Studio (`pnpm studio`) is local-only by design: it binds to 127.0.0.1, enforces a CSRF guard, and its git publish stages only `content/` + `lib/generated/image-manifest.json` (never `git add -A`).

**Template versioning:** `package.json` is at 1.7.1 (latest tag: `v1.7.1`). All phases (0–18) are released; `develop` is currently 11 commits ahead of `v1.7.1` with unreleased work — GA4 analytics, pickup scheduling, tag/course filters, a seven-script seller CLI toolkit, and the contact form/enquiry relay (Cloudflare Worker) plus a follow-up hardening fix — none of which has a release tag yet. Doc versions are tracked in the table below; the full script inventory lives in `docs/SCRIPTS.md`.

---

## ⚠️ IRON RULES — Check Before Every Edit

### 1. `content/` folder rule
**Sellers never touch any file outside `content/`.** All code suggestions and AI outputs must write only to files under `content/`:
- `content/config.ts`
- `content/items/*/item.json`
- `content/items/*/_category.json`
- `content/items/_template.json` / `content/items/*/_template.json` (scaffolded by `pnpm create-template`)
- Item photo files inside `content/items/<category>/<item>/`
- Contact QR images under `content/contact/`

### 2. Bilingual sync rule — ALWAYS apply edits to BOTH language versions
Every documentation file has an English version and a Chinese (`_zh`) version:

| English | Chinese |
|---|---|
| `docs/DESIGN.md` | `docs/DESIGN_zh.md` |
| `docs/TECH_REQUIREMENTS.md` | `docs/TECH_REQUIREMENTS_zh.md` |
| `docs/IMPLEMENTATION_PLAN.md` | `docs/IMPLEMENTATION_PLAN_zh.md` |
| `docs/FEATURES_ROADMAP.md` | `docs/FEATURES_ROADMAP_zh.md` |
| `docs/CURRENT_FUNCTIONALITY.md` | `docs/CURRENT_FUNCTIONALITY_zh.md` |
| `docs/ARCHITECTURE.md` | `docs/ARCHITECTURE_zh.md` |
| `docs/setup_instruction.md` | `docs/setup_instruction_zh.md` |
| `docs/SCRIPTS.md` | `docs/SCRIPTS_zh.md` |
| `docs/UPDATE_GUIDE.md` | `docs/UPDATE_GUIDE_zh.md` |

**Any correction, addition, or update to an English doc MUST be mirrored to its `_zh` counterpart in the same response. Never close a doc-editing task until both language versions are confirmed fixed.**

> Background: In the 2026-06-03 consistency audit, three bugs were found in all five English docs but the Chinese versions were initially missed, requiring a second pass. This rule prevents that from recurring.

### 3. App code is live
All phases are implemented. `app/`, `components/`, `lib/`, `scripts/`, `studio/` (Seller Studio SPA + CSRF guard), and `workers/` (independently deployed Cloudflare Worker) all contain production code. Do not create new files in these directories unless the seller explicitly requests a new feature or Phase.

### 4. Never render `reserved_for`
This field is private buyer info — must never appear on any rendered page.

### 5. `image-manifest.json` stays in git
`lib/generated/image-manifest.json` is committed. Do not add it to `.gitignore`.

### 6. `lib/utils/pricing.ts` has no `"use client"`
It must be importable by both server and client components.

### 7. Mark phases complete in docs
After finishing each phase's implementation, **update `docs/IMPLEMENTATION_PLAN.md` and `docs/IMPLEMENTATION_PLAN_zh.md`** to mark all tasks `[x]` (checked) and add ✅ after the phase title. This maintains a visible record of progress and helps future sessions understand project state. Use the bilingual sync rule (Rule 2) — update both English and Chinese versions in the same commit.

### 8. New config fields must be backward-compatible
`content/config.ts` is seller-owned — `pnpm update-site` never overwrites it. Any new field added to `SiteConfig`, `UIConfig`, or any config-related type **must be TypeScript-optional (`?`)** with a runtime default at the consumption site. This ensures downstream sites that haven't updated their config still pass type-check after pulling new template code.

Checklist for every new config field:
1. Type definition: mark with `?` (e.g. `priceFilterStrategy?: PriceFilterStrategy`)
2. Consumer code: use `?? "default"` when reading (e.g. `siteConfig.ui.priceFilterStrategy ?? "none"`)
3. Upstream `content/config.ts`: set the value explicitly (as documentation)
4. Add the field to `scripts/lib/configDefaults.ts` so `pnpm update-site` (which auto-runs the config migration after checkout) and standalone `pnpm migrate-config` can auto-inject it into downstream configs

> Background: In the v1.4.1 release, `priceFilterStrategy` was added as a required field in `UIConfig`. Downstream sites running `pnpm update-site` failed type-check because their `content/config.ts` lacked the field. This rule prevents that class of breakage.

> The one historical exception, `soldArchiveDisplayLimit`, was fixed on 2026-08-02 with the seller's approval: it is now optional (`soldArchiveDisplayLimit?: number` in `lib/config/types.ts`), read with `?? 200` in `app/sold/page.tsx`, and registered in `scripts/lib/configDefaults.ts`, so `pnpm update-site` / `pnpm migrate-config` auto-inject it into older downstream configs.

---

## Current Doc Versions

| File | Version | Date |
|---|---|---|
| docs/DESIGN.md / docs/DESIGN_zh.md | v0.10.3 | 2026-09-07 |
| docs/TECH_REQUIREMENTS.md / docs/TECH_REQUIREMENTS_zh.md | v0.10.2 | 2026-09-07 |
| docs/IMPLEMENTATION_PLAN.md / docs/IMPLEMENTATION_PLAN_zh.md | **v1.7** | 2026-08-02 |
| docs/FEATURES_ROADMAP.md / docs/FEATURES_ROADMAP_zh.md | v1.6 | 2026-09-05 |
| docs/CURRENT_FUNCTIONALITY.md / docs/CURRENT_FUNCTIONALITY_zh.md | v1.4 | 2026-09-07 |
| docs/ARCHITECTURE.md / docs/ARCHITECTURE_zh.md | v1.3 | 2026-09-07 |
| docs/setup_instruction.md / docs/setup_instruction_zh.md | v1.1 | 2026-08-02 |
| docs/SCRIPTS.md / docs/SCRIPTS_zh.md | v1.2 | 2026-09-07 |
| docs/UPDATE_GUIDE.md / docs/UPDATE_GUIDE_zh.md | v1.1 | 2026-08-02 |

---

## Common Seller Tasks → Which Skill to Use

| Task | Skill / Command |
|---|---|
| First-time site setup | `/setup` (`.claude/commands/setup.md`) |
| Generate `item.json` from photos | `/update-items` (`.claude/commands/update-items.md`) |
| Translate listings into another locale | `/translate-items` (`.claude/commands/translate-items.md`) |
| Enable/configure shipping cost estimator | `/setup-shipping` (`.claude/commands/setup-shipping.md`) |
| Enable/configure the item-page enquiry form (buyer contact relay) | `/setup-contact-form` (`.claude/commands/setup-contact-form.md`) |
| Manage listings in a browser | `pnpm studio [--port <n>]` (local only; see docs/CURRENT_FUNCTIONALITY.md) |
| Publish content changes | `pnpm push` (stages `content/` + `lib/generated/image-manifest.json`, commits, pushes; Studio's git publish mirrors exactly these paths) |
| Mark an item sold | `pnpm mark-sold <category>/<name>` |
| Create a new item | `pnpm create-item <category>/<name>` (alias: `pnpm new`) |
| Duplicate an item as a starting point | `pnpm duplicate <category>/<name> <category>/<new-name>` (copies photos, resets lifecycle fields, strips `reserved_for`) |
| Scaffold a commented `_template.json` | `pnpm create-template [category]` |
| Reset a sold/reserved item back to available | `pnpm mark-available <category>/<name>` |
| List every item with status/price/age | `pnpm inventory` |
| Find long-listed `available` items | `pnpm stale-check [--days N]` (default 60) |
| Find listings missing recommended fields | `pnpm audit-listings` |
| Export all listings to a personal CSV | `pnpm export-csv` |
| End-of-semester batch cleanup (CS student workflow) | `pnpm semester-end` |
| Upload photos to CDN | `pnpm upload-images` |
| Enable photos in the item flyer PDF | `pnpm configure-image-cors` (one-time, `cloudflare-r2` only; needed because the flyer button fetches image bytes cross-origin, unlike the `<img>` tags used elsewhere) |
| Export listings to Facebook Marketplace | `pnpm fb-export` (interactive; outputs `exports/facebook-marketplace.csv` — numbered `-<N>` variants for 50+ item batches, plus `exports/facebook-marketplace-photos/` for manual photo upload) |
| Update site to a new template version | `pnpm update-site [tag] [--list] [--skip-verify]` (`docs/UPDATE_GUIDE.md`; auto-runs the config migration) |
| Splice missing config fields after an upgrade | `pnpm migrate-config` (also runs automatically during `pnpm update-site`) |
| Install all 27 Aceternity components (one-time) | `pnpm setup-ui` |
| Bump version + create GitHub release (maintainer) | `pnpm bump` (interactive; requires an authenticated `gh` CLI) |

---

## Key Doc Sections Quick Reference

| Question | Where to look |
|---|---|
| Full `item.json` schema (36 schema fields; 37 incl. `reserved_for`) | docs/DESIGN.md §5 |
| `content/config.ts` full template | docs/DESIGN.md §13 |
| Image storage architecture | docs/DESIGN.md §3 |
| Sold item retention formula | docs/DESIGN.md §8 |
| Status & visibility rules | docs/DESIGN.md §15 |
| Distance-tiered pricing algorithm | docs/DESIGN.md §17 |
| Component architecture + `"use client"` list | docs/DESIGN.md §12, docs/ARCHITECTURE.md |
| UI slot options (27 Aceternity components) | docs/DESIGN.md §18 |
| Shipping cost estimator (incl. `workers/shipping-rate-proxy` contract) | docs/DESIGN.md §21, docs/TECH_REQUIREMENTS.md §29 |
| Contact form / enquiry relay (incl. `workers/contact-form-proxy` contract) | docs/DESIGN.md §23, docs/TECH_REQUIREMENTS.md §31 |
| Seller Studio (local management GUI) | docs/DESIGN.md §22, docs/TECH_REQUIREMENTS.md §30, docs/CURRENT_FUNCTIONALITY.md |
| i18n runtime (useT / getTranslations / UIStrings) | docs/DESIGN.md §12, docs/TECH_REQUIREMENTS.md §22.8 |
| Environment variables (CF_R2_* / BLOB_READ_WRITE_TOKEN / NEXT_PUBLIC_SITE_URL) | docs/TECH_REQUIREMENTS.md §3 |
| 19-phase build plan (Phases 0–18) | docs/IMPLEMENTATION_PLAN.md |
| Deployment checklist (GitHub Pages + R2) | docs/TECH_REQUIREMENTS.md §19 |
| AI skill file specs | docs/TECH_REQUIREMENTS.md §23 |
| Testing strategy | docs/TECH_REQUIREMENTS.md §25 |
| Facebook Marketplace export | docs/CURRENT_FUNCTIONALITY.md, `scripts/export-facebook.ts` |
| Scripts & tooling reference (every npm script + CLI) | docs/SCRIPTS.md |
| Code structure, data flow, module API | docs/ARCHITECTURE.md |
| Updating to a new template version | docs/UPDATE_GUIDE.md |
| CDN setup walkthrough | docs/setup_instruction.md |
