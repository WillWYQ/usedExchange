# Seller Studio PDF export improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independent improvements to Seller Studio’s PDF export feature: local image prefetch before rendering, a pre-export readiness check, and single-item flyer export.

**Architecture:** The existing `scripts/lib/pdfCatalog/generate.ts` renders a full HTML catalog and feeds it to Playwright. We add a prefetch layer that downloads referenced images locally before rendering, a small PDF-readiness checker that flags sparse items, and a flyer variant that reuses the per-item HTML builder without the multi-item scaffolding. Each improvement is delivered as one independently testable task.

**Tech Stack:** TypeScript, Playwright, Vitest, React, CSS modules/classic CSS (existing Studio styles), Zod for route bodies, `node:crypto` for image filename hashing.

## Global Constraints

- Every new file lives under `scripts/` or `studio/src/`; never write to `content/` for code changes.
- Any new config-like field must be optional with a runtime default (Iron Rule 8); this plan does not add config fields.
- Bilingual UI strings must be added to both `studio/src/i18n/strings.en.ts` and `studio/src/i18n/strings.zh.ts`.
- `scripts/lib/pdfCatalog/generate.ts` must remain importable by `studioApi.ts` without eager-loading Playwright; keep the dynamic import.
- All temp files go under `os.tmpdir()` and are cleaned up in `finally` blocks.
- The export must stay advisory/non-blocking for the readiness check.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/pdfCatalog/generate.ts` | Orchestrates Playwright render; hosts `generateCatalogPdf()` and new `prefetchImages()` helper and `generateFlyerPdf()`. |
| `scripts/lib/pdfCatalog/generate.test.ts` | Unit tests for `prefetchImages()` URL extraction/rewriting and flyer generation logic. |
| `scripts/lib/pdfCatalog/template.ts` | HTML/CSS builders; hosts new `buildFlyerHtml()`. |
| `scripts/lib/pdfCatalog/template.test.ts` | Tests for `buildFlyerHtml()` output shape (or extend existing tests if file exists). |
| `scripts/lib/pdfCatalog/checkPdfReadiness.ts` | New module; computes sparse-item warnings. |
| `scripts/lib/pdfCatalog/checkPdfReadiness.test.ts` | Unit tests for all warning flags. |
| `scripts/lib/studioApi.ts` | Adds `description` to `StudioItem`, adds `POST /api/export-pdf/flyer` route. |
| `scripts/lib/studioApi.test.ts` | Updates for new `StudioItem` shape and flyer route. |
| `studio/src/api.ts` | Adds `exportItemFlyerPdf(id)` client function. |
| `studio/src/panes/ExportPdfDialog.tsx` | Adds readiness warning panel and catalog/flyer mode switch. |
| `studio/src/panes/ExportPdfDialog.test.tsx` | Tests for warnings and mode switch. |
| `studio/src/panes/Drawer.tsx` | Adds per-item "Export flyer" button. |
| `studio/src/i18n/strings.en.ts` | New English keys. |
| `studio/src/i18n/strings.zh.ts` | New Chinese keys. |

---

## Task 1: Local image prefetch before rendering

**Files:**
- Modify: `scripts/lib/pdfCatalog/generate.ts`
- Create: `scripts/lib/pdfCatalog/generate.test.ts`

**Interfaces:**
- Consumes: HTML string produced by `buildFullCatalogHtml()`.
- Produces: `prefetchImages(html: string): Promise<{ html: string; tempDir: string }>`.

### Step 1: Write the failing test

Create `scripts/lib/pdfCatalog/generate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { prefetchImages } from "./generate";

describe("prefetchImages", () => {
  it("rewrites a single image src to a local file path", async () => {
    const html = `<html><body><img src="https://example.com/photo.jpg" /></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("imagebytes"))));
    const { html: rewritten } = await prefetchImages(html);
    expect(rewritten).toMatch(/file:\/\/.*\.jpg/);
    expect(rewritten).not.toContain("https://example.com/photo.jpg");
  });

  it("omits a failed download while keeping the img tag", async () => {
    const html = `<html><body><img src="https://example.com/missing.jpg" /></body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    const { html: rewritten } = await prefetchImages(html);
    expect(rewritten).toContain("<img");
    expect(rewritten).not.toContain("src=");
  });
});
```

### Step 2: Run the test and confirm it fails

Run:

```bash
pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts
```

Expected: fails with `prefetchImages is not exported` or similar.

### Step 3: Implement `prefetchImages` in `generate.ts`

Add to the top of `scripts/lib/pdfCatalog/generate.ts`:

```ts
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
```

Add near the top-level helpers (after `withTimeout`):

```ts
type PrefetchResult = { html: string; tempDir: string };

const PREFETCH_TIMEOUT_MS = 30_000;
const PER_IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext === ".jpg") return ".jpg";
    if (ext === ".jpeg") return ".jpg";
    if (ext === ".png") return ".png";
    if (ext === ".webp") return ".webp";
    if (ext === ".gif") return ".gif";
  } catch {
    // fall through
  }
  return ".bin";
}

function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
}

async function downloadOneImage(
  url: string,
  tempDir: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const chunks: Buffer[] = [];
    let total = 0;
    if (res.body) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) return null;
        chunks.push(Buffer.from(chunk));
      }
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;

    const filename = `usedexchange-pdf-${hashUrl(url)}${extensionFromUrl(url)}`;
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, bytes);
    return filePath;
  } catch {
    return null;
  }
}

export async function prefetchImages(html: string): Promise<PrefetchResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "usedexchange-pdf-images-"));
  const controller = new AbortController();
  const globalTimer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);

  try {
    const srcRe = /<img[^>]+src="([^"]+)"/g;
    const urls = [...html.matchAll(srcRe)].map((m) => m[1]).filter((url) => url.startsWith("http"));
    const uniqueUrls = [...new Set(urls)];

    const downloads = await Promise.all(
      uniqueUrls.map(async (url) => {
        const perImageController = new AbortController();
        const perImageTimer = setTimeout(() => perImageController.abort(), PER_IMAGE_TIMEOUT_MS);
        const file = await downloadOneImage(
          url,
          tempDir,
          combineSignals(controller.signal, perImageController.signal),
        );
        clearTimeout(perImageTimer);
        return { url, file };
      }),
    );

    const urlToFile = new Map<string, string>();
    for (const { url, file } of downloads) {
      if (file) urlToFile.set(url, file);
    }

    let rewritten = html;
    for (const [url, file] of urlToFile) {
      rewritten = rewritten.split(url).join(`file://${file}`);
    }

    return { html: rewritten, tempDir };
  } finally {
    clearTimeout(globalTimer);
  }
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  function onAbort() {
    controller.abort();
  }
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
```

### Step 4: Wire `prefetchImages` into `generateCatalogPdf`

In `generateCatalogPdf`, replace:

```ts
const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
await fs.writeFile(file, pdfBytes);
return { file };
```

with:

```ts
let tempDir: string | undefined;
let prefetchResult: Awaited<ReturnType<typeof prefetchImages>> | undefined;
try {
  prefetchResult = await prefetchImages(html);
  tempDir = prefetchResult.tempDir;
} catch {
  // Prefetch failed entirely — fall back to remote URLs.
}
const htmlToRender = prefetchResult?.html ?? html;

const file = path.join(os.tmpdir(), `usedexchange-catalog-${Date.now()}.pdf`);
let pdfBytes: Buffer;
try {
  const page = await browser.newPage();
  try {
    await page.setContent(htmlToRender, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
    pdfBytes = await withTimeout(
      page.pdf({
        format: "Letter",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: `<div style="font-size:8px; width:100%; text-align:center; color:#888;">${escapeHtml(siteConfig.name)} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
        margin: { top: "20mm", bottom: "16mm", left: "14mm", right: "14mm" },
      }),
      RENDER_TIMEOUT_MS,
      `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
    );
  } finally {
    await page.close();
  }
} finally {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
await fs.writeFile(file, pdfBytes);
return { file };
```

Make sure `page` is no longer declared outside the inner `try` so the cleanup is scoped correctly.

### Step 5: Run tests

```bash
pnpm vitest run scripts/lib/pdfCatalog/generate.test.ts
```

Expected: all tests pass.

### Step 6: Manual smoke test

Start Studio and generate a catalog PDF. Verify the PDF still contains item photos.

### Step 7: Commit

```bash
git add scripts/lib/pdfCatalog/generate.ts scripts/lib/pdfCatalog/generate.test.ts
git commit -m "feat(pdf): prefetch images locally before rendering catalog PDF

Improves performance and removes CDN flakiness for large catalogs.
Failed downloads are omitted; temp files are cleaned up."
```

---

## Task 2: Pre-export readiness check

**Files:**
- Create: `scripts/lib/pdfCatalog/checkPdfReadiness.ts`
- Create: `scripts/lib/pdfCatalog/checkPdfReadiness.test.ts`
- Modify: `scripts/lib/studioApi.ts`
- Modify: `studio/src/panes/ExportPdfDialog.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`
- Modify: `studio/src/panes/ExportPdfDialog.test.tsx`

**Interfaces:**
- Consumes: `StudioItem[]` from `fetchItems()`.
- Produces: `PdfReadinessWarning[]` shape.

### Step 1: Write the failing test

Create `scripts/lib/pdfCatalog/checkPdfReadiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkPdfReadiness } from "./checkPdfReadiness";
import type { StudioItem } from "../../scripts/lib/studioApi";

function makeItem(overrides: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: null,
    localizedNames: { en: "Desk Lamp" },
    tags: [],
    listedDate: "2026-01-01",
    description: "A nice lamp",
    ...overrides,
  };
}

describe("checkPdfReadiness", () => {
  it("returns no warnings for a complete item", () => {
    expect(checkPdfReadiness([makeItem()])).toEqual([]);
  });

  it("flags missing photos", () => {
    const warnings = checkPdfReadiness([makeItem({ imageCount: 0 })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toContain("photos");
  });

  it("flags missing description", () => {
    const warnings = checkPdfReadiness([makeItem({ description: "" })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toContain("description");
  });

  it("flags missing price", () => {
    const warnings = checkPdfReadiness([makeItem({ lowestTierAmount: null })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].missing).toContain("price");
  });

  it("combines flags for one item", () => {
    const warnings = checkPdfReadiness([
      makeItem({ imageCount: 0, description: "", lowestTierAmount: null }),
    ]);
    expect(warnings[0].missing).toEqual(["photos", "description", "price"]);
  });
});
```

### Step 2: Run the test and confirm it fails

```bash
pnpm vitest run scripts/lib/pdfCatalog/checkPdfReadiness.test.ts
```

Expected: fails because module and type do not exist.

### Step 3: Implement `checkPdfReadiness`

Create `scripts/lib/pdfCatalog/checkPdfReadiness.ts`:

```ts
import type { StudioItem } from "../../scripts/lib/studioApi";

export type PdfReadinessFlag = "photos" | "description" | "price";

export type PdfReadinessWarning = {
  id: string;
  name: string;
  missing: PdfReadinessFlag[];
};

export function checkPdfReadiness(items: StudioItem[]): PdfReadinessWarning[] {
  const warnings: PdfReadinessWarning[] = [];
  for (const item of items) {
    const missing: PdfReadinessFlag[] = [];
    if (item.imageCount === 0) missing.push("photos");
    if (!item.description || item.description.trim() === "") missing.push("description");
    if (item.lowestTierAmount === null) missing.push("price");
    if (missing.length > 0) {
      warnings.push({ id: item.id, name: item.name, missing });
    }
  }
  return warnings;
}
```

### Step 4: Add `description` to `StudioItem`

In `scripts/lib/studioApi.ts`, update the `StudioItem` type:

```ts
export type StudioItem = {
  id: string;
  categorySlug: string;
  itemSlug: string;
  name: string;
  status: string;
  currency: string;
  lowestTierAmount: number | null;
  imageCount: number;
  coverImage: string | null;
  localizedNames: Record<string, string>;
  tags: string[];
  listedDate: string | null;
  description: string;
};
```

In `listStudioItems()`, add `description: item.description` to the returned object:

```ts
return {
  id: `${item.categorySlug}/${item.itemSlug}`,
  categorySlug: item.categorySlug,
  itemSlug: item.itemSlug,
  name: item.name,
  status: item.status,
  currency: item.price.currency,
  lowestTierAmount: amounts.length > 0 ? Math.min(...amounts) : null,
  imageCount,
  coverImage,
  localizedNames: buildLocalizedNames(item),
  tags: Array.isArray(item.tags) ? item.tags : [],
  listedDate: typeof item.listedDate === "string" ? item.listedDate : null,
  description: item.description,
} satisfies StudioItem;
```

### Step 5: Update `ExportPdfDialog` to render warnings

Modify `studio/src/panes/ExportPdfDialog.tsx`:

Add import:

```ts
import { checkPdfReadiness } from "../../../scripts/lib/pdfCatalog/checkPdfReadiness";
```

Inside the component, before the return statement:

```ts
const warnings = checkPdfReadiness(eligible);
```

Add warning UI before the action buttons inside the dialog:

```tsx
{warnings.length > 0 && (
  <details className="pdf-readiness-warnings">
    <summary>
      {t("exportPdf.readiness.summary", { count: warnings.length })}
    </summary>
    <ul>
      {warnings.map((w) => (
        <li key={w.id}>
          <strong>{w.name}</strong>
          {": "}
          {w.missing
            .map((flag) => t(`exportPdf.readiness.${flag}`))
            .join(", ")}
        </li>
      ))}
    </ul>
  </details>
)}
```

### Step 6: Add i18n strings

In `studio/src/i18n/strings.en.ts`, add after the existing `exportPdf` block:

```ts
"exportPdf.readiness.summary": "{count} item may look sparse in the PDF",
"exportPdf.readiness.summaryPlural": "{count} items may look sparse in the PDF",
"exportPdf.readiness.photos": "no photos",
"exportPdf.readiness.description": "no description",
"exportPdf.readiness.price": "no price",
```

In `studio/src/i18n/strings.zh.ts`, add:

```ts
"exportPdf.readiness.summary": "{count} 件商品在 PDF 中可能显示不完整",
"exportPdf.readiness.summaryPlural": "{count} 件商品在 PDF 中可能显示不完整",
"exportPdf.readiness.photos": "无照片",
"exportPdf.readiness.description": "无描述",
"exportPdf.readiness.price": "无价格",
```

Note: `summary`/`summaryPlural` follow the existing pattern where English distinguishes singular/plural via separate keys.

### Step 7: Update `ExportPdfDialog.test.tsx`

Update the `makeItem` helper to include `description: "A nice lamp"`.

Add a test:

```ts
it("shows a readiness warning for an item missing photos and description", () => {
  renderDialog([
    makeItem({ id: "a", imageCount: 0, description: "" }),
  ]);
  expect(screen.getByText(/may look sparse/)).toBeTruthy();
});
```

### Step 8: Run tests

```bash
pnpm vitest run scripts/lib/pdfCatalog/checkPdfReadiness.test.ts studio/src/panes/ExportPdfDialog.test.tsx scripts/lib/studioApi.test.ts
```

Expected: all pass. If `studioApi.test.ts` constructs `StudioItem` literals, add `description` to them.

### Step 9: Manual smoke test

Open Studio, open Export PDF dialog, and confirm warnings appear for items missing photos/description/price.

### Step 10: Commit

```bash
git add scripts/lib/pdfCatalog/checkPdfReadiness.ts \
  scripts/lib/pdfCatalog/checkPdfReadiness.test.ts \
  scripts/lib/studioApi.ts \
  studio/src/panes/ExportPdfDialog.tsx \
  studio/src/i18n/strings.en.ts \
  studio/src/i18n/strings.zh.ts \
  studio/src/panes/ExportPdfDialog.test.tsx
git commit -m "feat(studio): pre-export PDF readiness check

Warns sellers which eligible items lack photos, description, or
price before generating the catalog PDF. Advisory only."
```

---

## Task 3: Single-item flyer export

**Files:**
- Modify: `scripts/lib/pdfCatalog/template.ts`
- Modify: `scripts/lib/pdfCatalog/generate.ts`
- Modify: `scripts/lib/studioApi.ts`
- Modify: `studio/src/api.ts`
- Modify: `studio/src/panes/Drawer.tsx`
- Modify: `studio/src/panes/ExportPdfDialog.tsx`
- Modify: `studio/src/i18n/strings.en.ts`
- Modify: `studio/src/i18n/strings.zh.ts`
- Modify: `scripts/lib/pdfCatalog/template.test.ts` (create if absent)

**Interfaces:**
- Consumes: `ItemPdfView`, `SiteBranding`, and an item id string.
- Produces: `buildFlyerHtml(item, branding)` and `generateFlyerPdf(itemId)`.

### Step 1: Add `buildFlyerHtml` to `template.ts`

Add after `buildItemHtml`:

```ts
export function buildFlyerHtml(item: ItemPdfView, branding: SiteBranding): string {
  const logoHtml = branding.logo
    ? `<img class="flyer-logo" src="${escapeHtml(branding.logo)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>${CATALOG_CSS}
          .flyer-header { text-align: center; padding: 24px 8px 12px; border-bottom: 2px solid var(--accent); margin-bottom: 8px; }
          .flyer-logo { max-height: 48px; margin-bottom: 8px; }
          .flyer-header h1 { font-size: 20px; margin: 0; }
          .flyer-tagline { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
        </style>
      </head>
      <body>
        <div class="flyer-header">
          ${logoHtml}
          <h1>${escapeHtml(branding.name)}</h1>
          <p class="flyer-tagline">${escapeHtml(branding.tagline)}</p>
        </div>
        ${buildItemHtml(item, branding.baseUrl)}
      </body>
    </html>`;
}
```

### Step 2: Add flyer CSS overrides to `CATALOG_CSS` or inline

The inline `<style>` above extends `CATALOG_CSS` with flyer-specific rules; this avoids changing the shared CSS string shape for catalog tests.

### Step 3: Write the failing test for `buildFlyerHtml`

Create or append to `scripts/lib/pdfCatalog/template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFlyerHtml } from "./template";
import type { ItemPdfView, SiteBranding } from "./template";

function makeItem(): ItemPdfView {
  return {
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    description: "A lamp",
    condition: "good",
    status: "available",
    price: { currency: "USD", negotiable: false, show_tiers: false, tiers: [] },
    brand: "",
    model: "",
    ageYears: null,
    dimensions: null,
    weight: null,
    color: "",
    tags: [],
    images: [],
    coverImage: null,
  };
}

const branding: SiteBranding = { name: "My Shop", tagline: "Great stuff", logo: "", baseUrl: "https://example.com" };

describe("buildFlyerHtml", () => {
  it("contains the item name and site name", () => {
    const html = buildFlyerHtml(makeItem(), branding);
    expect(html).toContain("Desk Lamp");
    expect(html).toContain("My Shop");
  });

  it("has no TOC or page-number footer", () => {
    const html = buildFlyerHtml(makeItem(), branding);
    expect(html).not.toContain("Table of Contents");
    expect(html).not.toContain("pageNumber");
  });
});
```

### Step 4: Run the test and confirm it fails

```bash
pnpm vitest run scripts/lib/pdfCatalog/template.test.ts
```

Expected: fails because `buildFlyerHtml` is not yet exported.

### Step 5: Add `generateFlyerPdf` to `generate.ts`

Add after `generateCatalogPdf`:

```ts
export async function generateFlyerPdf(
  itemId: string,
): Promise<{ file: string } | { error: string }> {
  const [items, categories] = await Promise.all([loadAllItemsRaw(), loadCategories()]);
  const item = items.find((i) => `${i.categorySlug}/${i.itemSlug}` === itemId);
  if (item === undefined) {
    return { error: `Item "${itemId}" not found.` };
  }
  if (!EXPORTABLE_STATUSES.has(item.status)) {
    return { error: `Item "${itemId}" is not available, pending, or reserved.` };
  }

  const logo = siteConfig.logo ? `${siteConfig.baseUrl}${siteConfig.logo}` : "";
  const html = buildFlyerHtml(
    toItemPdfView(item),
    { name: siteConfig.name, tagline: siteConfig.tagline, logo, baseUrl: siteConfig.baseUrl },
  );

  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    return { error: "PDF renderer not installed. Run: npx playwright install chromium" };
  }

  const RENDER_TIMEOUT_MS = 60_000;

  try {
    const page = await browser.newPage();
    let pdfBytes: Buffer;
    let tempDir: string | undefined;
    try {
      const prefetch = await prefetchImages(html).catch(() => undefined);
      const htmlToRender = prefetch?.html ?? html;
      tempDir = prefetch?.tempDir;
      await page.setContent(htmlToRender, { waitUntil: "networkidle", timeout: RENDER_TIMEOUT_MS });
      pdfBytes = await withTimeout(
        page.pdf({
          format: "Letter",
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
        }),
        RENDER_TIMEOUT_MS,
        `PDF generation exceeded ${RENDER_TIMEOUT_MS}ms`,
      );
    } finally {
      await page.close();
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const file = path.join(os.tmpdir(), `usedexchange-flyer-${itemId.replace(/\//g, "-")}-${Date.now()}.pdf`);
    await fs.writeFile(file, pdfBytes);
    return { file };
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}
```

### Step 6: Add the server route in `studioApi.ts`

Add a flyer body schema:

```ts
const exportFlyerBodySchema = z.object({ id: z.string().min(1) });
```

Add a handler:

```ts
async function handleExportFlyer(req: StudioRequest): Promise<StudioResponse> {
  const { id } = parseJsonBody(req.body, exportFlyerBodySchema);
  const result = await generateFlyerPdf(id);
  if ("error" in result) {
    return { status: 400, body: { error: result.error } };
  }
  return { status: 200, file: result.file, contentType: "application/pdf" };
}
```

Import `generateFlyerPdf` from `./pdfCatalog/generate`.

Wire the route in `handleStudioRequest`, near the existing `/api/export-pdf` block:

```ts
if (pathname === "/api/export-pdf/flyer") {
  if (req.method !== "POST") {
    return { status: 405, body: { error: "POST only" } };
  }
  return await handleExportFlyer(req);
}
```

### Step 7: Add client API function

In `studio/src/api.ts`, add after `exportCatalogPdf`:

```ts
export async function exportItemFlyerPdf(id: string): Promise<Blob> {
  const res = await fetch("/api/export-pdf/flyer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    throw new Error(errorMessage(body, `Flyer export failed with ${res.status} ${res.statusText}`));
  }
  return res.blob();
}
```

### Step 8: Add flyer mode to `ExportPdfDialog`

Modify `studio/src/panes/ExportPdfDialog.tsx`:

Add new imports:

```ts
import { useMemo, useState } from "react";
import { exportCatalogPdf, exportItemFlyerPdf, type StudioItem } from "../api";
```

Inside the component, add state:

```ts
const [mode, setMode] = useState<"catalog" | "flyer">("catalog");
const [flyerId, setFlyerId] = useState<string | null>(eligible.length > 0 ? eligible[0].id : null);
```

Derive warnings only in catalog mode:

```ts
const warnings = useMemo(() => (mode === "catalog" ? checkPdfReadiness(eligible) : []), [mode, eligible]);
```

Update `generate()`:

```ts
async function generate() {
  setBusy(true);
  setError(null);
  try {
    const blob = mode === "catalog"
      ? await exportCatalogPdf()
      : await exportItemFlyerPdf(flyerId ?? "");
    const filename = mode === "catalog"
      ? `usedexchange-catalog-${new Date().toISOString().slice(0, 10)}.pdf`
      : `usedexchange-flyer-${flyerId}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setDownloadedFilename(filename);
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setBusy(false);
  }
}
```

Add UI for mode switch and flyer dropdown before the summary:

```tsx
<div className="export-pdf-mode" role="radiogroup" aria-label={t("exportPdf.modeLabel")}>
  <button
    type="button"
    role="radio"
    aria-checked={mode === "catalog"}
    className={mode === "catalog" ? "mode-active" : ""}
    onClick={() => setMode("catalog")}
  >
    {t("exportPdf.mode.catalog")}
  </button>
  <button
    type="button"
    role="radio"
    aria-checked={mode === "flyer"}
    className={mode === "flyer" ? "mode-active" : ""}
    onClick={() => setMode("flyer")}
  >
    {t("exportPdf.mode.flyer")}
  </button>
</div>

{mode === "flyer" && (
  <label className="export-pdf-flyer-select">
    {t("exportPdf.flyer.item")}
    <select
      value={flyerId ?? ""}
      onChange={(e) => setFlyerId(e.target.value)}
      disabled={busy || eligible.length === 0}
    >
      {eligible.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  </label>
)}
```

Update the Generate button disabled condition:

```tsx
disabled={busy || eligible.length === 0 || (mode === "flyer" && flyerId === null)}
```

### Step 9: Add per-item button in `Drawer.tsx`

Modify `studio/src/panes/Drawer.tsx`:

Add imports:

```ts
import { exportItemFlyerPdf } from "../api";
import { useState } from "react";
```

Add state:

```ts
const [flyerBusy, setFlyerBusy] = useState(false);
```

Add handler:

```ts
async function exportFlyer() {
  setFlyerBusy(true);
  try {
    const blob = await exportItemFlyerPdf(item.id);
    const filename = `usedexchange-flyer-${item.id.replace(/\//g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    setFlyerBusy(false);
  }
}
```

Update drawer header:

```tsx
<header className="drawer-head">
  <h2>{item.name}</h2>
  <div className="drawer-actions">
    <Button
      variant="secondary"
      disabled={!EXPORTABLE_STATUSES.has(item.status) || flyerBusy}
      onClick={() => void exportFlyer()}
    >
      {flyerBusy ? t("drawer.exportFlyerBusy") : t("drawer.exportFlyer")}
    </Button>
    <Button variant="ghost" onClick={onClose}>
      {t("drawer.close")}
    </Button>
  </div>
</header>
```

Add the exportable statuses constant at the top of the file:

```ts
const EXPORTABLE_STATUSES = new Set(["available", "pending", "reserved"]);
```

### Step 10: Add i18n strings

In `studio/src/i18n/strings.en.ts`:

```ts
"exportPdf.modeLabel": "Export mode",
"exportPdf.mode.catalog": "Full catalog",
"exportPdf.mode.flyer": "Single-item flyer",
"exportPdf.flyer.item": "Item",
"drawer.exportFlyer": "Export flyer",
"drawer.exportFlyerBusy": "Exporting…",
```

In `studio/src/i18n/strings.zh.ts`:

```ts
"exportPdf.modeLabel": "导出模式",
"exportPdf.mode.catalog": "完整目录",
"exportPdf.mode.flyer": "单页宣传单",
"exportPdf.flyer.item": "商品",
"drawer.exportFlyer": "导出宣传单",
"drawer.exportFlyerBusy": "正在导出…",
```

### Step 11: Run tests

```bash
pnpm vitest run scripts/lib/pdfCatalog/template.test.ts scripts/lib/studioApi.test.ts studio/src/panes/ExportPdfDialog.test.tsx
```

Fix any failures (likely `StudioItem` literals missing `description`).

### Step 12: Type-check and lint

```bash
pnpm type-check
pnpm lint
```

### Step 13: Manual smoke test

1. Open an item drawer and click "Export flyer".
2. Open Export PDF dialog, switch to "Single-item flyer", pick an item, generate.
3. Verify both PDFs download and contain the expected content.

### Step 14: Commit

```bash
git add scripts/lib/pdfCatalog/template.ts \
  scripts/lib/pdfCatalog/template.test.ts \
  scripts/lib/pdfCatalog/generate.ts \
  scripts/lib/studioApi.ts \
  studio/src/api.ts \
  studio/src/panes/Drawer.tsx \
  studio/src/panes/ExportPdfDialog.tsx \
  studio/src/i18n/strings.en.ts \
  studio/src/i18n/strings.zh.ts
git commit -m "feat(studio): single-item flyer export

Adds per-item flyer export from the item drawer and from the
Export PDF dialog. Flyers reuse the item page styling without
cover/TOC/page numbers."
```

---

## Self-Review

1. **Spec coverage:**
   - Local image prefetch: Task 1 covers extraction, parallel download, rewriting, fallback, cleanup.
   - Pre-export readiness check: Task 2 covers the checker, `StudioItem.description`, UI warnings, i18n.
   - Single-item flyer: Task 3 covers template, generation, route, client API, drawer button, dialog mode switch, i18n.

2. **Placeholder scan:** No TBD/TODO; every step includes concrete code or exact command.

3. **Type consistency:**
   - `StudioItem.description: string` added in Task 2 and used by `checkPdfReadiness`.
   - `generateFlyerPdf(itemId: string)` matches the route body `{ id: string }`.
   - `exportItemFlyerPdf(id: string)` matches the client usage.

4. **Gaps:** None identified; each task is independently testable and commit-able.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-15-studio-pdf-export-improvements.md`.

**Recommended execution:** Use `superpowers:subagent-driven-development` and run Task 1 → Task 2 → Task 3 sequentially, reviewing test output after each task.
