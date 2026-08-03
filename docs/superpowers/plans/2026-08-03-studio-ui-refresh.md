# Seller Studio UI Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Studio's carbon-copy aesthetic with a modern two-theme design system built on the storefront's brand palette, extract three shared components, and add dialog focus management plus proper empty/loading states — without changing the page structure.

**Architecture:** One atomic visual flip: `tokens.css` is fully rewritten around semantic light/dark tokens (light values copied from `app/globals.css`), applied via `data-theme` on `<html>` before first paint. Subsequent tasks swap in shared `Button`/`StatusBadge`/`ThemeToggle` components and dialog behaviour hooks. No framework added; styles stay plain CSS variables; scripts/ and the API are untouched.

**Tech Stack:** React 19, Vite (studio SPA), plain CSS custom properties, `@fontsource` bundled fonts, Vitest repo suite as regression gate.

**Spec:** `docs/superpowers/specs/2026-08-03-studio-ui-refresh-design.md`

## Global Constraints

Copied from the spec and `.claude/CLAUDE.md`. Every task inherits these:

- Iron Rule 2: any doc edit ships with its `_zh` counterpart in the same commit (Task 5 handles all docs).
- Structure does not change: same single-page layout (header + table + publish pane + drawer/dialogs). Only styling, component swaps, focus behaviour, and state treatments change.
- No new style framework. Plain CSS custom properties in `studio/src/tokens.css`.
- Component rules never hardcode colors; everything consumes semantic tokens.
- Fonts stay bundled via `@fontsource` (studio must work offline): IBM Plex Sans (400/500/600) + IBM Plex Mono (400). Courier Prime and Archivo Narrow are removed.
- Both themes must pass WCAG AA contrast (4.5:1 body text, 3:1 large text/badges); badges carry text, never color alone.
- All motion honours `prefers-reduced-motion`.
- Gates: `pnpm type-check`, `pnpm lint` (zero warnings), `pnpm test` (repo suite, 619 tests, unaffected by this work) — all clean before every commit.
- Commits use repo style prefixes and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Work happens on branch `feat/studio-ui-refresh` (stacked on `feat/studio-item-defaults` / PR #4, because the Defaults pane must be styled too).
- Repo conventions: 2-space indent, double quotes.

---

### Task 1: Design tokens, fonts, theme bootstrap (the visual flip)

**Files:**
- Modify: `package.json` (font deps)
- Modify: `studio/src/tokens.css` (full rewrite)
- Create: `studio/src/theme.ts`
- Modify: `studio/src/main.tsx`

**Interfaces:**
- Consumes: light palette values from `app/globals.css` (read-only reference).
- Produces: `export type Theme = "light" | "dark"`, `export function initialTheme(): Theme`, `export function applyTheme(theme: Theme): void`, `export function currentTheme(): Theme` (used by Task 3's ThemeToggle); the token vocabulary every later task's CSS/TSX relies on: `--bg --surface --surface-2 --border --ink --ink-soft --accent --on-accent --accent-soft --danger --backdrop --shadow-sm --shadow-lg --radius-sm --radius-md --radius-pill --status-<name>-bg/-fg --font-ui --font-data --step-0/1/2 --gap --gap-lg --speed`; CSS classes introduced here and used later: `.btn .btn-primary .btn-secondary .btn-ghost`, `.badge .badge-<status>`, `.alert-error`, `.page-error`, `.empty-state`, `.skeleton`, `.theme-toggle`, `.head-actions`.

- [ ] **Step 1: Swap the font dependencies**

```bash
pnpm remove @fontsource/courier-prime @fontsource/archivo-narrow
pnpm add @fontsource/ibm-plex-mono@^5.3.0
```

(`@fontsource/ibm-plex-sans` stays; the 600 weight ships in the same package and is imported in tokens.css below.)

- [ ] **Step 2: Create `studio/src/theme.ts`**

```typescript
// Theme persistence for studio. localStorage wins, the system preference
// breaks the tie on first run. The value lands on <html data-theme="…">;
// tokens.css keys every colour off that attribute.

export type Theme = "light" | "dark";

const STORAGE_KEY = "studio-theme";

export function initialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
```

- [ ] **Step 3: Apply the theme before first paint in `studio/src/main.tsx`**

Replace the file contents with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, initialTheme } from "./theme";
import "./tokens.css";

// Resolve the theme before React mounts so the first paint is right:
// stored preference wins, system preference breaks the tie.
applyTheme(initialTheme());

const root = document.getElementById("root");
if (root === null) throw new Error("#root not found in studio/index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Rewrite `studio/src/tokens.css` completely**

Replace the entire file with the following. This is the whole visual system: token blocks first, then base styles, then every existing component class re-skinned, then the new classes later tasks consume. Keep this ordering and the section comments.

```css
/* Studio design language v2: modern tool chrome over the storefront brand
   palette. Light tokens come straight from app/globals.css; dark keeps the
   site's bg/ink/accent and adds studio-specific surfaces. Every rule below
   consumes semantic tokens — no raw hex outside the two blocks at the top. */

@import "@fontsource/ibm-plex-sans/400.css";
@import "@fontsource/ibm-plex-sans/500.css";
@import "@fontsource/ibm-plex-sans/600.css";
@import "@fontsource/ibm-plex-mono/400.css";

:root {
  --bg: #f8f4ec;
  --surface: #ffffff;
  --surface-2: #f3ede1;
  --border: #e6ddcf;
  --ink: #231f20;
  --ink-soft: #6f675e;
  --accent: #002af9;
  --on-accent: #ffffff;
  --accent-soft: #d5a198;
  --danger: #b3241e;
  --backdrop: rgb(35 31 32 / 0.4);
  --shadow-sm: 0 1px 2px rgb(35 31 32 / 0.06), 0 1px 3px rgb(35 31 32 / 0.08);
  --shadow-lg: 0 12px 32px rgb(35 31 32 / 0.18), 0 2px 8px rgb(35 31 32 / 0.1);
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-pill: 999px;

  --status-available-bg: #e3f0e4;
  --status-available-fg: #1a7f37;
  --status-pending-bg: #f5edd6;
  --status-pending-fg: #8a6a12;
  --status-reserved-bg: #e2ecf7;
  --status-reserved-fg: #0969da;
  --status-sold-bg: #f7e3e2;
  --status-sold-fg: #b3241e;
  --status-draft-bg: #eceae6;
  --status-draft-fg: #6f675e;

  --font-ui: "IBM Plex Sans", system-ui, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, monospace;
  --step-0: 0.875rem;
  --step-1: 1rem;
  --step-2: 1.25rem;
  --gap: 0.75rem;
  --gap-lg: 1.25rem;
  --speed: 140ms;
}

[data-theme="dark"] {
  --bg: #231f20;
  --surface: #2e2a2b;
  --surface-2: #383234;
  --border: #4a4340;
  --ink: #f8f4ec;
  --ink-soft: #a89e94;
  --accent: #a8bbd6;
  --on-accent: #1a1d21;
  --accent-soft: #5d4a44;
  --danger: #e06c66;
  --backdrop: rgb(0 0 0 / 0.55);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.3);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.5);

  --status-available-bg: #24402c;
  --status-available-fg: #7ed49a;
  --status-pending-bg: #423a1e;
  --status-pending-fg: #d9b95c;
  --status-reserved-bg: #1f3a52;
  --status-reserved-fg: #7ab8f0;
  --status-sold-bg: #4c2624;
  --status-sold-fg: #e06c66;
  --status-draft-bg: #383234;
  --status-draft-fg: #a89e94;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--step-0);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

input[type="checkbox"],
input[type="radio"] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--accent);
}

/* ── Buttons ────────────────────────────────────────────────────────────
   Three variants cover every button in studio. Task 2 routes all buttons
   through the shared Button component, which emits these classes. */

.btn {
  font-family: var(--font-ui);
  font-size: var(--step-0);
  font-weight: 500;
  padding: 0.4rem 0.9rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background-color var(--speed) ease,
    color var(--speed) ease,
    border-color var(--speed) ease;
}

.btn:disabled {
  cursor: default;
  opacity: 0.55;
}

.btn-primary {
  background: var(--accent);
  color: var(--on-accent);
}

.btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 85%, black);
}

.btn-secondary {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--surface-2);
}

.btn-ghost {
  background: transparent;
  color: var(--ink);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

/* ── Status badges ──────────────────────────────────────────────────────
   Pill badges, one bg/fg pair per status from the token blocks. Text is
   always present, so status never rides on colour alone. */

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-available {
  background: var(--status-available-bg);
  color: var(--status-available-fg);
}

.badge-pending {
  background: var(--status-pending-bg);
  color: var(--status-pending-fg);
}

.badge-reserved {
  background: var(--status-reserved-bg);
  color: var(--status-reserved-fg);
}

.badge-sold {
  background: var(--status-sold-bg);
  color: var(--status-sold-fg);
}

.badge-draft {
  background: var(--status-draft-bg);
  color: var(--status-draft-fg);
}

/* Transitional: ItemList still emits these until Task 2 swaps in
   StatusBadge. Kept so the interim commit looks intentional. */
.status-sold {
  color: var(--status-sold-fg);
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-pending {
  color: var(--status-pending-fg);
}

/* ── Alerts and states ──────────────────────────────────────────────────
   Every role="alert" message gets .alert-error too (Task 2 wires the
   class): danger-coloured text on a faint danger wash. */

.alert-error {
  margin: 0;
  background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  color: var(--danger);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  white-space: pre-line;
}

/* The app-level error banner sits between header and table, inset like
   the table itself. */
.page-error {
  margin: 0.75rem 1rem 0;
}

.empty-state {
  padding: 4rem 1rem;
  text-align: center;
  color: var(--ink-soft);
}

.empty-state p {
  margin: 0 0 0.25rem;
}

.skeleton {
  height: 2.75rem;
  margin-bottom: var(--gap);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

/* ── Header ─────────────────────────────────────────────────────────── */

.studio-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--gap);
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.studio-head h1 {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--step-2);
  font-weight: 600;
}

.studio-head .counts {
  font-family: var(--font-data);
  color: var(--ink-soft);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: var(--gap);
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem;
}

/* ── Item table ─────────────────────────────────────────────────────── */

.item-table {
  width: 100%;
  border-collapse: collapse;
}

.item-table th {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-soft);
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.item-table td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.item-table td.data {
  font-family: var(--font-data);
}

.item-table tbody tr {
  transition: background-color var(--speed) ease;
}

.item-table tbody tr:hover {
  background: var(--surface);
}

.item-table tbody tr.selected {
  background: color-mix(in srgb, var(--accent-soft) 26%, var(--bg));
}

tr.failed td {
  box-shadow: inset 3px 0 0 var(--danger);
}

.name-button {
  padding: 0;
  font: inherit;
  font-weight: 500;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}

.name-button:hover {
  color: var(--accent);
}

/* Narrow screens: each row becomes a card (structure unchanged from v1,
   re-skinned with tokens). */
@media (max-width: 40rem) {
  .item-table thead {
    display: none;
  }

  .item-table tr {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    column-gap: var(--gap);
    row-gap: 0.15rem;
    align-items: baseline;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .item-table td {
    border: 0;
    padding: 0;
  }

  .item-table td:nth-child(1) {
    grid-column: 1;
    grid-row: 1 / 3;
    align-self: start;
  }

  .item-table td:nth-child(2) {
    grid-column: 2 / 4;
    grid-row: 1;
    font-weight: 500;
  }

  .item-table td:nth-child(5) {
    grid-column: 4;
    grid-row: 1;
    text-align: right;
  }

  .item-table td:nth-child(3) {
    grid-column: 2;
    grid-row: 2;
  }

  .item-table td:nth-child(4) {
    grid-column: 3;
    grid-row: 2;
  }

  .item-table td:nth-child(6) {
    grid-column: 4;
    grid-row: 2;
    text-align: right;
  }

  .item-table td:nth-child(3),
  .item-table td:nth-child(6) {
    color: var(--ink-soft);
  }

  .item-table td:nth-child(6)::after {
    content: " img";
  }

  .item-table tr.failed td {
    box-shadow: none;
  }

  .item-table tr.failed {
    box-shadow: inset 3px 0 0 var(--danger);
  }
}

/* ── The SOLD stamp ─────────────────────────────────────────────────────
   Kept as the one moment of theatre: pressed once when a row is marked
   sold (Task 2 settles it into a badge afterwards). Colour rides the
   sold status tokens so both themes read as stamp red. */

.stamp {
  display: inline-block;
  padding: 0.05em 0.35em;
  border: 2px solid var(--status-sold-fg);
  color: var(--status-sold-fg);
  font-family: var(--font-ui);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transform: rotate(-4deg);
  /* Uneven ink: the edge breaks up where a real stamp lifts off the paper. */
  mask-image: radial-gradient(circle at 30% 40%, #000 78%, transparent 100%);
}

.stamp-press {
  animation: stamp-press 260ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
}

@keyframes stamp-press {
  0% {
    transform: rotate(-4deg) scale(1.6);
    opacity: 0;
  }
  60% {
    transform: rotate(-4deg) scale(0.96);
    opacity: 1;
  }
  100% {
    transform: rotate(-4deg) scale(1);
    opacity: 1;
  }
}

/* ── Bulk toolbar ───────────────────────────────────────────────────── */

.bulk-toolbar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--gap);
  padding: 0.625rem 1rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 12px rgb(35 31 32 / 0.06);
}

.bulk-toolbar .count {
  font-family: var(--font-data);
  color: var(--ink-soft);
}

/* ── Drawer ─────────────────────────────────────────────────────────── */

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(30rem, 100vw);
  overflow-y: auto;
  padding: 1rem;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--gap);
  margin-bottom: 1rem;
}

.drawer-head h2 {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--step-2);
  font-weight: 600;
}

.drawer-tabs {
  display: flex;
  gap: var(--gap);
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.tab {
  padding: 0.3rem 0.25rem;
  font-family: var(--font-ui);
  font-size: var(--step-0);
  font-weight: 500;
  color: var(--ink-soft);
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.tab:hover {
  color: var(--ink);
}

.tab-active {
  color: var(--ink);
  border-bottom-color: var(--accent);
}

/* ── Image pane ─────────────────────────────────────────────────────── */

.dropzone {
  padding: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.dropzone.over {
  border-color: var(--accent);
  border-style: solid;
}

.dropzone p {
  margin: 0 0 0.5rem;
  color: var(--ink-soft);
}

.file-button input[type="file"] {
  display: block;
  margin: 0 auto;
  font-family: var(--font-ui);
  font-size: var(--step-0);
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: var(--gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.thumb {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: grab;
}

.thumb img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.thumb-name {
  font-family: var(--font-data);
  font-size: 0.75rem;
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.thumb-readonly {
  cursor: default;
  border-style: dashed;
  border-color: var(--ink-soft);
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  background: var(--surface-2);
  color: var(--ink-soft);
  font-family: var(--font-data);
  font-size: 0.75rem;
  text-align: center;
  border-radius: var(--radius-sm);
}

.thumb-note {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.7rem;
  line-height: 1.3;
}

/* ── Sync bar ───────────────────────────────────────────────────────── */

.sync-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--gap);
}

.sync-status {
  font-family: var(--font-data);
  color: var(--ink-soft);
  white-space: pre-line;
}

/* Layout half of the sync error; colours come from .alert-error. */
.sync-error {
  display: block;
  flex: 1 0 100%;
}

/* ── Edit form ──────────────────────────────────────────────────────── */

.edit-form fieldset {
  margin: 0 0 1.25rem;
  padding: 0;
  border: 0;
}

.edit-form legend {
  padding: 0;
  margin-bottom: 0.5rem;
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
}

.field-label {
  font-size: var(--step-0);
  font-weight: 500;
  color: var(--ink);
}

.field input[type="text"],
.field textarea,
.field select,
.publish-controls input[type="text"],
.tier-cell input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  font-family: var(--font-ui);
  font-size: var(--step-0);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition:
    border-color var(--speed) ease,
    box-shadow var(--speed) ease;
}

.field input[type="text"]:focus,
.field textarea:focus,
.field select:focus,
.publish-controls input[type="text"]:focus,
.tier-cell input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.field textarea {
  resize: vertical;
}

.field input[type="checkbox"] {
  align-self: flex-start;
}

.field-hint {
  font-size: 0.7rem;
  color: var(--ink-soft);
}

/* An on-disk value the schema wouldn't produce: shown raw, flagged with
   the danger border instead of v1's violet. */
.field-offlist {
  border-color: var(--danger) !important;
}

.form-saved {
  color: var(--ink-soft);
}

/* ── Tier editor ────────────────────────────────────────────────────── */

.tier-list {
  margin: 0 0 0.5rem;
  padding: 0;
  list-style: none;
}

.tier-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  gap: var(--gap);
  align-items: end;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border);
}

.tier-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

/* ── Dialogs ────────────────────────────────────────────────────────── */

.dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: var(--backdrop);
}

.dialog {
  width: min(26rem, calc(100vw - 2rem));
  padding: 1.25rem;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.dialog h2 {
  margin: 0 0 0.75rem;
  font-family: var(--font-ui);
  font-size: var(--step-2);
  font-weight: 600;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--gap);
  margin-top: 1rem;
}

/* ── Publish pane ───────────────────────────────────────────────────── */

.publish-pane {
  margin: 1rem;
  padding: 1rem;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.publish-pane h2 {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.change-list {
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
  font-family: var(--font-data);
}

.change-list li {
  padding: 0.1rem 0;
  overflow-wrap: anywhere;
}

.change-code {
  color: var(--ink-soft);
}

.change-empty,
.publish-done {
  color: var(--ink-soft);
}

.publish-controls {
  display: flex;
  gap: var(--gap);
  align-items: center;
}

.publish-controls input[type="text"] {
  flex: 1;
}

/* Layout half of the publish error; colours come from .alert-error. */
.publish-error {
  white-space: pre-line;
}

/* ── Defaults pane ──────────────────────────────────────────────────── */

.defaults-dialog {
  width: min(46rem, calc(100vw - 2rem));
  max-height: 80vh;
  overflow-y: auto;
}

.defaults-scopes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
  margin: 0.75rem 0;
}

.defaults-row {
  display: flex;
  align-items: flex-start;
  gap: var(--gap);
}

.defaults-row .field {
  flex: 1;
}

.defaults-row-off {
  opacity: 0.55;
}

.defaults-inherited {
  opacity: 0.7;
}

/* ── Motion preferences ─────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .stamp-press,
  .skeleton {
    animation: none;
  }

  * {
    transition: none !important;
  }
}
```

- [ ] **Step 5: Verify**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean (619/619). The studio SPA has no component tests; type-check + lint are the automated gate here, and the visual result is verified in Task 6.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml studio/src/tokens.css studio/src/theme.ts studio/src/main.tsx
git commit -m "feat: studio visual refresh — dual-theme design tokens and brand palette

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared Button + StatusBadge, alert styling, selected rows

**Files:**
- Create: `studio/src/components/Button.tsx`
- Create: `studio/src/components/StatusBadge.tsx`
- Modify: `studio/src/App.tsx` (header button, error alert class)
- Modify: `studio/src/panes/BulkToolbar.tsx` (5 buttons)
- Modify: `studio/src/panes/SyncBar.tsx` (1 button + error class)
- Modify: `studio/src/panes/PublishPane.tsx` (1 button + 2 error classes)
- Modify: `studio/src/panes/NewItemDialog.tsx` (2 buttons + error class)
- Modify: `studio/src/panes/DefaultsPane.tsx` (2 buttons + error class)
- Modify: `studio/src/panes/EditForm.tsx` (Save button, TierEditor add/remove buttons, error class)
- Modify: `studio/src/panes/ImagePane.tsx` (Remove buttons, error class)
- Modify: `studio/src/panes/Drawer.tsx` (Close button)
- Modify: `studio/src/panes/ItemList.tsx` (StatusBadge, settle-to-badge, selected row class)

**Interfaces:**
- Consumes: `.btn*`, `.badge*`, `.alert-error`, status token classes from Task 1.
- Produces: `export function Button({ variant?, className?, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" })` — renders `<button type="button">` unless the caller passes another `type`; `export function StatusBadge({ status }: { status: string })`.

- [ ] **Step 1: Create `studio/src/components/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

// One button to rule every pane: variants map to the .btn classes in
// tokens.css. type defaults to "button" but a caller can pass type="submit".
export function Button({
  variant = "secondary",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cls = className === undefined ? `btn btn-${variant}` : `${className} btn btn-${variant}`;
  return <button type="button" {...rest} className={cls} />;
}
```

- [ ] **Step 2: Create `studio/src/components/StatusBadge.tsx`**

```tsx
const KNOWN_STATUSES = new Set(["available", "pending", "reserved", "sold", "draft"]);

// Pill badge per status; an unknown on-disk status renders as draft-coloured
// text rather than crashing or disappearing — same raw-show philosophy as the
// edit form's off-list values.
export function StatusBadge({ status }: { status: string }) {
  const cls = KNOWN_STATUSES.has(status) ? `badge badge-${status}` : "badge badge-draft";
  return <span className={cls}>{status}</span>;
}
```

- [ ] **Step 3: Rewire `ItemList.tsx`**

Replace the `StatusCell` function and add the settle timer; add the selected-row class. New imports at top: `import { useEffect, useState } from "react";` and `import { StatusBadge } from "../components/StatusBadge";`. Replace the existing `StatusCell` with:

```tsx
function StatusCell({ status, pressed }: { status: string; pressed: boolean }) {
  // A just-stamped row plays the SOLD stamp once, then settles into the
  // regular sold badge. 900ms lets the 260ms press animation land and hold
  // for a beat. With reduced motion the animation is off but the settle
  // still happens.
  const [settled, setSettled] = useState(!pressed);

  useEffect(() => {
    if (!pressed) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), 900);
    return () => window.clearTimeout(timer);
  }, [pressed]);

  if (status === "sold" && !settled) {
    return <span className="stamp stamp-press">sold</span>;
  }
  return <StatusBadge status={status} />;
}
```

Replace the row's `<tr>` line inside the map with:

```tsx
          <tr
            key={item.id}
            className={[
              failedIds.has(item.id) ? "failed" : "",
              selectedIds.has(item.id) ? "selected" : "",
            ]
              .filter((c) => c !== "")
              .join(" ") || undefined}
          >
```

- [ ] **Step 4: Replace buttons pane by pane**

Apply these edits exactly (variant choices: primary = the pane's main action; secondary = everything else; ghost = close/cancel):

`App.tsx`: add the import `import { Button } from "./components/Button";` (next to the pane imports). Replace

```tsx
        <button type="button" onClick={() => setShowNewItem(true)}>
          New item
        </button>
```

with

```tsx
        <Button variant="primary" onClick={() => setShowNewItem(true)}>
          New item
        </Button>
```

and replace the top-level error line

```tsx
      {error !== null && <p role="alert">{error}</p>}
```

with

```tsx
      {error !== null && (
        <p role="alert" className="alert-error page-error">
          {error}
        </p>
      )}
```

`BulkToolbar.tsx`: add `import { Button } from "../components/Button";`. Replace the ACTIONS map block

```tsx
      {ACTIONS.map((action) => (
        <button
          key={action.status}
          type="button"
          disabled={busy}
          onClick={() => onApply(action.status)}
        >
          {action.label}
        </button>
      ))}
      <button type="button" onClick={onClear} disabled={busy}>
        Clear selection
      </button>
```

with

```tsx
      {ACTIONS.map((action) => (
        <Button key={action.status} disabled={busy} onClick={() => onApply(action.status)}>
          {action.label}
        </Button>
      ))}
      <Button variant="ghost" onClick={onClear} disabled={busy}>
        Clear selection
      </Button>
```

`SyncBar.tsx`: add the Button import. Replace

```tsx
      <button type="button" disabled={running} onClick={() => void push()}>
        {running ? "Pushing to CDN…" : "Push photos to CDN"}
      </button>
```

with

```tsx
      <Button disabled={running} onClick={() => void push()}>
        {running ? "Pushing to CDN…" : "Push photos to CDN"}
      </Button>
```

and give the error span the alert class:

```tsx
        <span className="sync-error alert-error" role="alert">
```

`PublishPane.tsx`: add the Button import. Replace the publish `<button …>…</button>` (the one whose label is `{busy ? "Publishing…" : "Publish"}`) with

```tsx
        <Button
          variant="primary"
          disabled={
            busy ||
            message.trim() === "" ||
            ((changes?.files.length ?? 0) === 0 && (changes?.unpushed ?? 0) === 0)
          }
          onClick={() => void submit()}
        >
          {busy ? "Publishing…" : "Publish"}
        </Button>
```

and add `alert-error` to both error paragraphs:

```tsx
        <p className="publish-error alert-error" role="alert">
```

(two occurrences: `loadError` and `publishError`).

`NewItemDialog.tsx`: add the Button import. Replace the two buttons in `dialog-actions` with

```tsx
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
```

and change the error line to `{error !== null && <p role="alert" className="alert-error">{error}</p>}`.

`DefaultsPane.tsx`: add the Button import. Replace the two buttons in `dialog-actions` with

```tsx
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving…" : "Save defaults"}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
```

and change the error line to `{error !== null && <p role="alert" className="alert-error">{error}</p>}`.

`EditForm.tsx`: add the Button import. Replace the save button with

```tsx
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
```

In `TierEditor`, replace the per-row remove button with

```tsx
            <Button
              variant="ghost"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
```

and the add button with

```tsx
      <Button variant="ghost" onClick={() => setRows((prev) => [...prev, blank()])}>
        Add tier
      </Button>
```

and change the form's error line to `{error !== null && <p role="alert" className="alert-error">{error}</p>}`.

`ImagePane.tsx`: add the Button import. Replace the per-thumb remove button with

```tsx
            <Button
              variant="ghost"
              disabled={busy || !entry.editable}
              title={entry.editable ? undefined : "Rename this file before studio can remove it"}
              onClick={() =>
                void run(async () => {
                  setFiles(await deleteImage(item.id, entry.name));
                })
              }
            >
              Remove
            </Button>
```

and change the pane's error line to `{error !== null && <p role="alert" className="alert-error">{error}</p>}`.

`Drawer.tsx`: add the Button import. Replace the Close button with

```tsx
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
```

- [ ] **Step 5: Delete the transitional status classes from `tokens.css`**

Remove the `.status-sold` and `.status-pending` blocks plus their `Transitional:` comment (they were only there to keep the interim commit looking right; ItemList no longer emits them).

- [ ] **Step 6: Verify and commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

```bash
git add studio/src
git commit -m "feat: shared Button and StatusBadge across studio panes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: ThemeToggle and the redesigned header

**Files:**
- Create: `studio/src/components/ThemeToggle.tsx`
- Modify: `studio/src/App.tsx` (header layout)

**Interfaces:**
- Consumes: `currentTheme()`, `applyTheme(theme)` from `studio/src/theme.ts` (Task 1); `.theme-toggle`, `.head-actions` classes (Task 1).
- Produces: `export function ThemeToggle()` — icon button, persists via `applyTheme`.

- [ ] **Step 1: Create `studio/src/components/ThemeToggle.tsx`**

```tsx
import { useState } from "react";
import { applyTheme, currentTheme, type Theme } from "../theme";

// Inline icons keep studio dependency-free and offline-capable.
function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

- [ ] **Step 2: Rebuild the header in `App.tsx`**

Add the import `import { ThemeToggle } from "./components/ThemeToggle";`. Replace the whole `<header className="studio-head">…</header>` block with:

```tsx
      <header className="studio-head">
        <h1>Seller Studio</h1>
        <span className="counts">
          content/ · {items.length} items
          {changeCount !== null && changeCount > 0 && <> · {changeCount} uncommitted</>}
        </span>
        <div className="head-actions">
          <ThemeToggle />
          <SyncBar
            onFinished={() => {
              void refresh();
              bumpChanges();
            }}
          />
          <Button variant="primary" onClick={() => setShowNewItem(true)}>
            New item
          </Button>
        </div>
      </header>
```

(SyncBar moves into the action group: its button + status/error row now live at the right of the header. `.sync-bar` already wraps, so a long sync report still gets its own line.)

- [ ] **Step 3: Verify and commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

```bash
git add studio/src/components/ThemeToggle.tsx studio/src/App.tsx
git commit -m "feat: theme toggle and redesigned studio header

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Dialog focus management, Esc-to-close, empty and loading states

**Files:**
- Create: `studio/src/components/useDialogBehavior.ts`
- Modify: `studio/src/panes/NewItemDialog.tsx` (modal behaviour)
- Modify: `studio/src/panes/DefaultsPane.tsx` (modal behaviour)
- Modify: `studio/src/panes/Drawer.tsx` (Esc-to-close only — non-modal)
- Modify: `studio/src/App.tsx` (empty state)
- Modify: `studio/src/panes/EditForm.tsx` (skeleton loading)

**Interfaces:**
- Consumes: `.empty-state`, `.skeleton` classes (Task 1).
- Produces: `export function useDialogBehavior(onClose: () => void): React.RefObject<HTMLDivElement | null>` — on mount: remembers `document.activeElement`, focuses the first focusable descendant, traps Tab/Shift+Tab inside, closes on Escape; on unmount: restores focus to the remembered element.

- [ ] **Step 1: Create `studio/src/components/useDialogBehavior.ts`**

```tsx
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Modal dialog behaviour: initial focus, a Tab focus trap, Escape to close,
// and focus restored to the trigger on unmount. Attach the returned ref to
// the dialog's root element (the role="dialog" node).
//
// onClose travels through a ref so an inline arrow from the parent (a fresh
// identity on every parent render) never re-runs the effect and steals focus
// back to the first field mid-edit.
export function useDialogBehavior(onClose: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const restoreTo = (document.activeElement as HTMLElement | null) ?? null;
    const node = ref.current;

    const focusables = () =>
      node === null
        ? []
        : Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute("disabled"),
          );

    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreTo?.focus();
    };
  }, []);

  return ref;
}
```

- [ ] **Step 2: Wire `NewItemDialog.tsx`**

Add `import { useDialogBehavior } from "../components/useDialogBehavior";`. Inside the component, after the state declarations, add:

```tsx
  const dialogRef = useDialogBehavior(onCancel);
```

Change the dialog root div to carry the ref:

```tsx
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New item"
        onClick={(e) => e.stopPropagation()}
      >
```

- [ ] **Step 3: Wire `DefaultsPane.tsx`**

Add `import { useDialogBehavior } from "../components/useDialogBehavior";`. After the state declarations add:

```tsx
  const dialogRef = useDialogBehavior(onClose);
```

Change the dialog root div to carry the ref:

```tsx
      <div
        ref={dialogRef}
        className="dialog defaults-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Item defaults"
        onClick={(e) => e.stopPropagation()}
      >
```

- [ ] **Step 4: Esc-to-close on `Drawer.tsx`**

The drawer is non-modal (no trap, no focus move), but Esc should close it. Add `useEffect` to the react import and add inside the component:

```tsx
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
```

- [ ] **Step 5: Empty state in `App.tsx`**

Replace

```tsx
      {error === null && items.length === 0 && (
        <p>No items yet. Run `pnpm create-item &lt;category&gt;/&lt;name&gt;` to add the first one.</p>
      )}
```

with

```tsx
      {error === null && items.length === 0 && (
        <div className="empty-state">
          <p>No items yet.</p>
          <p>
            Use <strong>New item</strong> in the header to create your first listing.
          </p>
        </div>
      )}
```

- [ ] **Step 6: Skeleton loading in `EditForm.tsx`**

Replace the loading branch

```tsx
  if (loaded === null) {
    return error !== null ? <p role="alert">{error}</p> : <p>Loading…</p>;
  }
```

with

```tsx
  if (loaded === null) {
    if (error !== null) return <p role="alert" className="alert-error">{error}</p>;
    return (
      <div aria-busy="true" aria-label="Loading item fields">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all clean.

```bash
git add studio/src
git commit -m "feat: dialog focus management, empty and loading states

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation (bilingual, one commit)

Every edit ships in both the English file and its `_zh` counterpart (Iron Rule 2). Locate each insertion point by structure in the `_zh` file (parallel translation, same tables at the same line numbers).

**Files:**
- Modify: `docs/TECH_REQUIREMENTS.md` + `docs/TECH_REQUIREMENTS_zh.md`
- Modify: `docs/CURRENT_FUNCTIONALITY.md` + `docs/CURRENT_FUNCTIONALITY_zh.md`
- Modify: `docs/ARCHITECTURE.md` + `docs/ARCHITECTURE_zh.md`

- [ ] **Step 1: TECH_REQUIREMENTS dependency table**

Both languages: delete the rows for `@fontsource/archivo-narrow` and `@fontsource/courier-prime` (lines 87-88 in both files) and add, next to the `@fontsource/ibm-plex-sans` row:

```markdown
| `@fontsource/ibm-plex-mono` | `^5.3.0` | Self-hosted font |
```

Chinese row: `| `@fontsource/ibm-plex-mono` | `^5.3.0` | 自托管字体 |`

- [ ] **Step 2: CURRENT_FUNCTIONALITY Studio section**

Both languages: append one sentence to the first paragraph of the `## Seller Studio` section (the paragraph beginning "A local-only web GUI for managing listings…"). English:

```markdown
It follows the storefront's brand palette and offers light and dark themes, switchable from the header; the choice persists across sessions.
```

Chinese (append to the corresponding 中文 paragraph):

```markdown
它采用与店面一致的品牌配色，提供浅色/深色两套主题，可在顶栏切换，选择会被记住。
```

- [ ] **Step 3: ARCHITECTURE studio structure**

Both languages: in the Seller Studio section that enumerates `studio/src/` (the block listing `panes/` such as `ItemList`, `BulkToolbar`, `Drawer`…), add a line for the new components directory immediately after the panes line:

```markdown
- `studio/src/components/` — shared presentational components: `Button`, `StatusBadge`, `ThemeToggle`, and the `useDialogBehavior` focus-management hook
```

Chinese:

```markdown
- `studio/src/components/` — 共享展示组件：`Button`、`StatusBadge`、`ThemeToggle`，以及焦点管理 hook `useDialogBehavior`
```

- [ ] **Step 4: Commit**

```bash
git add docs/TECH_REQUIREMENTS.md docs/TECH_REQUIREMENTS_zh.md docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md docs/ARCHITECTURE.md docs/ARCHITECTURE_zh.md
git commit -m "docs: studio dual-theme refresh in TECH_REQUIREMENTS, CURRENT_FUNCTIONALITY, ARCHITECTURE

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

Verification only — no code changes, no commits (a required fix gets its own `fix:` commit instead).

- [ ] **Step 1: Automated gates**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: 619/619 tests, both tools clean.

- [ ] **Step 2: Serve check**

```bash
pnpm studio --port 5199 &
sleep 6
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5199/
```

Expected: `200`. Then kill the background server (`kill %1` or by PID).

- [ ] **Step 3: Record the human-only checklist**

The following need eyes and cannot be automated here; write them into the report as the seller's walkthrough:

1. Light theme default: header, table, drawer, dialogs, publish pane, defaults pane all use the warm palette with white cards.
2. Theme toggle switches to dark instantly, persists after reload; first run in a fresh profile follows the OS preference.
3. Status badges render all five states with readable contrast in both themes.
4. Mark an item sold via bulk toolbar: the SOLD stamp presses once, then settles into the sold badge.
5. Select rows: selected rows tint; failed rows keep the red edge.
6. Tab through the page: focus rings visible; New item dialog traps Tab, Esc closes it, focus returns to the New item button. Same for the Defaults dialog. Drawer closes on Esc.
7. Empty the table view (filter not available — use a project state with items; optional) and confirm the empty state copy; open an item drawer and watch the skeleton rows appear before the form.
8. View at 320px and 768px widths: the table collapses to cards without overlap.

- [ ] **Step 4: Report**

Write the report to the workspace's `task-6-report.md` equivalent (the SDD workspace if present, else note it in the completion message): gate results, serve-check result, the checklist above, and any anomalies.

---

## Self-Review Notes (done at plan-writing time)

- Spec coverage: tokens/palette/fonts/geometry → Task 1; Button/StatusBadge/badges/alerts/selected rows/stamp settle → Task 2; ThemeToggle + header + mechanism → Task 1 bootstrap + Task 3; focus trap/Esc/restore → Task 4; empty state → Task 4; skeleton → Task 4; error styling → Task 2; docs → Task 5; verification incl. widths and both themes → Task 6. No spec section left without a task.
- No placeholders: every step carries exact code or exact commands.
- Type/name consistency checked: `Button`, `StatusBadge`, `ThemeToggle`, `useDialogBehavior`, `initialTheme/applyTheme/currentTheme`, the `.btn*`/`.badge*`/`.alert-error`/`.empty-state`/`.skeleton`/`.theme-toggle`/`.head-actions` class names are spelled identically across tasks. The transitional `.status-sold`/`.status-pending` classes exist only between Task 1 and Task 2 by design and are deleted in Task 2 Step 5.
- Ordering check: Task 1's tokens define every class Tasks 2-4 consume; Task 2 deletes the transitional classes the same commit ItemList stops emitting them; Task 3's ThemeToggle uses theme.ts from Task 1; Task 4's hook is consumed in the same task it lands.
