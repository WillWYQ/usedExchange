# UsedExchange — Claude Code Project Context

> This file is loaded automatically by Claude Code on every session start.
> It is the authoritative source of project-level rules and invariants.

---

## What This Project Is

**UsedExchange** is a Next.js 15 static site for listing second-hand items.
Single seller, zero database, file-system-driven. Hosted on GitHub Pages + Cloudflare R2.

**Status:** Design-phase only — all docs are finalised (v0.9.1), no code yet.

---

## ⚠️ IRON RULES — Check Before Every Edit

### 1. `content/` folder rule
**Sellers never touch any file outside `content/`.** All code suggestions and AI outputs must write only to:
- `content/config.ts`
- `content/items/*/item.json`
- `content/items/*/_category.json`

### 2. Bilingual sync rule — ALWAYS apply edits to BOTH language versions
Every documentation file has an English version and a Chinese (`_zh`) version:

| English | Chinese |
|---|---|
| `docs/DESIGN.md` | `docs/DESIGN_zh.md` |
| `docs/TECH_REQUIREMENTS.md` | `docs/TECH_REQUIREMENTS_zh.md` |
| `docs/IMPLEMENTATION_PLAN.md` | `docs/IMPLEMENTATION_PLAN_zh.md` |
| `docs/FEATURES_ROADMAP.md` | `docs/FEATURES_ROADMAP_zh.md` |
| `docs/CURRENT_FUNCTIONALITY.md` | `docs/CURRENT_FUNCTIONALITY_zh.md` |

**Any correction, addition, or update to an English doc MUST be mirrored to its `_zh` counterpart in the same response. Never close a doc-editing task until both language versions are confirmed fixed.**

> Background: In the 2026-06-03 consistency audit, three bugs were found in all five English docs but the Chinese versions were initially missed, requiring a second pass. This rule prevents that from recurring.

### 3. No app code yet
The repo is docs-only. Do not create `app/`, `components/`, or `lib/` files until the seller explicitly starts Phase 0.

### 4. Never render `reserved_for`
This field is private buyer info — must never appear on any rendered page.

### 5. `image-manifest.json` stays in git
`lib/generated/image-manifest.json` is committed. Do not add it to `.gitignore`.

### 6. `lib/utils/pricing.ts` has no `"use client"`
It must be importable by both server and client components.

---

## Current Doc Versions

| File | Version | Date |
|---|---|---|
| docs/DESIGN.md / docs/DESIGN_zh.md | v0.9.1 | 2026-06-01 |
| docs/TECH_REQUIREMENTS.md / docs/TECH_REQUIREMENTS_zh.md | v0.9.1 | 2026-06-01 |
| docs/IMPLEMENTATION_PLAN.md / docs/IMPLEMENTATION_PLAN_zh.md | **v1.4** | 2026-06-03 |
| docs/FEATURES_ROADMAP.md / docs/FEATURES_ROADMAP_zh.md | — | 2026-06-01 |
| docs/CURRENT_FUNCTIONALITY.md / docs/CURRENT_FUNCTIONALITY_zh.md | — | 2026-06-03 |

---

## Common Seller Tasks → Which Skill to Use

| Task | Skill / Command |
|---|---|
| First-time site setup | `/setup` (`.claude/skills/setup-wizard.md`) |
| Generate `item.json` from photos | `/update-items` (`.claude/skills/update-items.md`) |
| Translate listings into another locale | `/translate-items` (`.claude/skills/translate-items.md`) |
| Mark an item sold | `pnpm mark-sold <category>/<name>` |
| Create a new item | `pnpm create-item <category>/<name>` |
| Upload photos to CDN | `pnpm upload-images` |

---

## Key Doc Sections Quick Reference

| Question | Where to look |
|---|---|
| Full `item.json` schema (38 fields) | docs/DESIGN.md §5 |
| `content/config.ts` full template | docs/DESIGN.md §13 |
| Image storage architecture | docs/DESIGN.md §3 |
| Sold item retention formula | docs/DESIGN.md §8 |
| Status & visibility rules | docs/DESIGN.md §15 |
| Distance-tiered pricing algorithm | docs/DESIGN.md §17 |
| Component architecture + `"use client"` list | docs/DESIGN.md §12 |
| UI slot options (27 Aceternity components) | docs/DESIGN.md §18 |
| i18n runtime (LocaleProvider / LocaleSwitcher) | docs/DESIGN.md §12, docs/TECH_REQUIREMENTS.md §22.8 |
| 15-phase build plan | docs/IMPLEMENTATION_PLAN.md |
| Deployment checklist (GitHub Pages + R2) | docs/TECH_REQUIREMENTS.md §19 |
| AI skill file specs | docs/TECH_REQUIREMENTS.md §23 |
| Testing strategy | docs/TECH_REQUIREMENTS.md §25 |
