# Default Price Tiers + Bulk Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `price.tiers` settable in the Seller Studio Item defaults pane, and add a selection-based bulk action that writes each selected item's `price.tiers` from its own category's merged defaults.

**Architecture:** The defaults storage pipeline already accepts tiers (`validateDefaults` → `assertEditableValue(["price"], …)` → strict `priceSchema`), and new items already merge `_defaults.json` with whole-array replacement — so the work is (1) a shared `TierEditor` component extracted from `EditForm.tsx`, (2) a tiers block in `DefaultsPane.tsx`, (3) one new server endpoint `POST /api/items/bulk-apply-tiers` modeled on `bulk-status`, and (4) client wiring (`api.ts`, `BulkToolbar.tsx`, `App.tsx`).

**Tech Stack:** TypeScript, React 18 (Studio SPA built with Vite), Zod 3, jsonc-parser (comment-preserving writes), Vitest (+ jsdom / @testing-library/react for component tests), Node `node:test`-free — everything runs through `pnpm test` (vitest run).

**Spec:** `docs/superpowers/specs/2026-08-13-studio-default-tiers-design.md`

## Global Constraints

- **Iron Rule 1:** runtime writes may only land under `content/` (`content/items/_defaults.json`, `content/items/<category>/_defaults.json`, `content/items/<cat>/<item>/item.json`). Tests use `os.tmpdir()` sandboxes, never the real `content/`.
- **Iron Rule 2:** any doc edit ships with its `_zh` counterpart in the **same commit** (Task 6 does all doc edits in one commit).
- **Iron Rule 4:** `reserved_for` is never written or rendered. The write path here is the existing allowlist (`assertEditableValue` / `applyFieldEdits`); no new read surface is created. Tests assert `reserved_for` survives untouched.
- **No version bump:** `package.json` stays unchanged (feature rides the next `pnpm bump`).
- **Test commands:** `pnpm test` (all), or one file: `pnpm vitest run <path>`. Type check: `pnpm type-check`. Lint: `pnpm lint` (must stay at 0 warnings).
- **jsdom tests:** any new `.test.tsx` that renders components starts with the line `// @vitest-environment jsdom` (see `ConfigPane.test.tsx`).
- **Commits:** non-interactive; every commit message ends with `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

### Task 1: Extract shared TierEditor component

**Files:**
- Create: `studio/src/components/TierEditor.tsx`
- Create: `studio/src/components/TierEditor.test.tsx`
- Modify: `studio/src/panes/EditForm.tsx` (delete lines 15–158: `Tier` type, `isTier`, `isTierArray`, local `TierEditor`; rewire refs)

**Interfaces:**
- Produces: `export type Tier = { label: string; miles_min?: number; miles_max?: number; amount: number }`, `export function isTierArray(value: unknown): value is Tier[]`, and `export function TierEditor({ initialTiers, resetToken, onDirtyChange, registerCollector })` where `registerCollector: (collect: () => Tier[] | null) => void`. Task 2 (endpoint) does not use this; Task 3 (DefaultsPane) consumes `TierEditor`, `isTierArray`, `Tier`.

- [ ] **Step 1: Write the failing test**

Create `studio/src/components/TierEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TierEditor, type Tier } from "./TierEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(initialTiers: Tier[]): { collect: () => Tier[] | null } {
  const holder: { collect: () => Tier[] | null } = { collect: () => null };
  render(
    <TierEditor
      initialTiers={initialTiers}
      resetToken={0}
      registerCollector={(collect) => {
        holder.collect = collect;
      }}
    />,
  );
  return holder;
}

describe("TierEditor", () => {
  it("collects null while the rows are unchanged", () => {
    const { collect } = mount([{ label: "Pickup", miles_max: 5, amount: 40 }]);
    expect(collect()).toBeNull();
  });

  it("collects the edited rows after an amount changes", async () => {
    const { collect } = mount([{ label: "Pickup", miles_max: 5, amount: 40 }]);
    const amount = screen.getByDisplayValue("40");
    await userEvent.clear(amount);
    await userEvent.type(amount, "45");
    expect(collect()).toEqual([{ label: "Pickup", miles_max: 5, amount: 45 }]);
  });

  it("collects added rows", async () => {
    const { collect } = mount([{ label: "Pickup", amount: 40 }]);
    await userEvent.click(screen.getByRole("button", { name: "Add tier" }));
    expect(collect()).toEqual([
      { label: "Pickup", amount: 40 },
      { label: "", amount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run studio/src/components/TierEditor.test.tsx`
Expected: FAIL — cannot resolve `./TierEditor` (module does not exist yet).

- [ ] **Step 3: Create the shared component**

Create `studio/src/components/TierEditor.tsx`. This is the body of the current `TierEditor` in `studio/src/panes/EditForm.tsx` (lines 15–158) moved verbatim, with the props renamed/generalised (`loadedTiers` → `initialTiers`, `onDirty` → optional `onDirtyChange`, `registerEdits` collecting a `FieldEdit` → `registerCollector` collecting `Tier[] | null`):

```tsx
import { useEffect, useState } from "react";
import { Button } from "./Button";

export type Tier = {
  label: string;
  miles_min?: number;
  miles_max?: number;
  amount: number;
};

export function isTier(value: unknown): value is Tier {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { label?: unknown }).label === "string"
  );
}

export function isTierArray(value: unknown): value is Tier[] {
  return Array.isArray(value) && value.every(isTier);
}

// Shared by the item edit form (per-item tiers) and the Item defaults pane
// (default tiers). Rows are a staging copy of `initialTiers`: they resync
// whenever that prop changes identity (parent reloaded from disk) or
// `resetToken` bumps (parent's Discard).
export function TierEditor({
  initialTiers,
  resetToken,
  onDirtyChange,
  registerCollector,
}: {
  initialTiers: Tier[];
  /** Bumped by the parent to force rows back to `initialTiers` without the prop changing. */
  resetToken: number;
  onDirtyChange?: (dirty: boolean) => void;
  /** Save calls this to collect the current rows, or null when unchanged. */
  registerCollector: (collect: () => Tier[] | null) => void;
}) {
  const blank = (): Tier => ({ label: "", amount: 0 });
  const [rows, setRows] = useState<Tier[]>(initialTiers);
  const [baseline, setBaseline] = useState<Tier[]>(initialTiers);

  useEffect(() => {
    setRows(initialTiers);
    setBaseline(initialTiers);
  }, [initialTiers, resetToken]);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(rows) !== JSON.stringify(baseline));
    registerCollector(() =>
      JSON.stringify(rows) === JSON.stringify(baseline) ? null : rows,
    );
  }, [rows, baseline, onDirtyChange, registerCollector]);
  // Both props must be referentially stable or this effect re-runs on every
  // parent render. Parents keep the collector in a ref for exactly that
  // reason — storing it in state made each registration re-render the parent,
  // which handed down a new registerCollector, which re-ran this effect:
  // React logged "Maximum update depth exceeded" every time the drawer opened.

  const setRow = (index: number, next: Tier) =>
    setRows((prev) => prev.map((row, i) => (i === index ? next : row)));

  return (
    <fieldset>
      <legend>Price tiers</legend>
      {rows.length === 0 && (
        <p className="field-hint">No tiers. The listing needs at least one price tier.</p>
      )}
      <ol className="tier-list">
        {rows.map((tier, index) => (
          <li key={index} className="tier-row">
            <label className="tier-cell">
              <span className="field-label">Label</span>
              <input
                type="text"
                value={tier.label}
                onChange={(e) => setRow(index, { ...tier, label: e.target.value })}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">From (mi)</span>
              <input
                type="text"
                inputMode="decimal"
                value={tier.miles_min ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const next = { ...tier };
                  if (raw === "") delete next.miles_min;
                  else {
                    const n = Number(raw);
                    if (Number.isFinite(n)) next.miles_min = n;
                  }
                  setRow(index, next);
                }}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">To (mi)</span>
              <input
                type="text"
                inputMode="decimal"
                value={tier.miles_max ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const next = { ...tier };
                  if (raw === "") delete next.miles_max;
                  else {
                    const n = Number(raw);
                    if (Number.isFinite(n)) next.miles_max = n;
                  }
                  setRow(index, next);
                }}
              />
            </label>
            <label className="tier-cell">
              <span className="field-label">Amount</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(tier.amount)}
                onChange={(e) => {
                  const n = Number(e.target.value.trim());
                  if (Number.isFinite(n)) setRow(index, { ...tier, amount: n });
                }}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <Button variant="ghost" onClick={() => setRows((prev) => [...prev, blank()])}>
        Add tier
      </Button>
    </fieldset>
  );
}
```

- [ ] **Step 4: Rewire EditForm to the shared component**

In `studio/src/panes/EditForm.tsx`:

1. Delete the local `type Tier`, `isTier`, `isTierArray`, and the entire local `TierEditor` function (currently lines 15–158).
2. Add the import (with the other imports at the top):

```tsx
import { TierEditor, isTierArray, type Tier } from "../components/TierEditor";
```

3. Replace the collector ref + registration callback (currently `tierCollector` / `registerTierEdits`, typed with `FieldEdit`):

```tsx
  // A ref, not state: writing it must not re-render, or registering the
  // collector loops against TierEditor's effect (see the note there).
  const tierCollector = useRef<() => Tier[] | null>(() => null);
  const registerTierCollector = useCallback((collect: () => Tier[] | null) => {
    tierCollector.current = collect;
  }, []);
```

4. In `save()`, replace the `tiersEdit` lines (`const tiersEdit = tierCollector.current(); if (tiersEdit !== null) edits.push(tiersEdit);`) with:

```tsx
    const tierRows = tierCollector.current();
    if (tierRows !== null) edits.push({ path: ["price", "tiers"], value: tierRows });
```

5. Replace the `tierEditor` JSX:

```tsx
  const tierEditor = (
    <TierEditor
      initialTiers={tiers}
      resetToken={tierResetToken}
      onDirtyChange={setTiersDirty}
      registerCollector={registerTierCollector}
    />
  );
```

6. If the `type FieldEdit` import from `../api` is now unused in this file, remove it from the import list (`pnpm type-check` / lint flags it otherwise). `patchItem` and `ItemFields` imports stay.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run studio/src/components/TierEditor.test.tsx studio/src/editForm.test.ts && pnpm type-check`
Expected: TierEditor tests PASS; `editForm.test.ts` still green; type check clean.

- [ ] **Step 6: Commit**

```bash
git add studio/src/components/TierEditor.tsx studio/src/components/TierEditor.test.tsx studio/src/panes/EditForm.tsx
git commit -m "refactor(studio): extract shared TierEditor from EditForm

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Server endpoint `POST /api/items/bulk-apply-tiers`

**Files:**
- Modify: `scripts/lib/studioApi.ts` (new schema/type/helpers/handler after `handleBulkStatus` ~line 330; route registration after the `/api/items/bulk-status` block ~line 1047)
- Test: `scripts/lib/studioApi.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `loadMergedDefaults` (already imported at studioApi.ts:38), `resolveItemDir`, `readItemField`, `applyFieldEdits`, `isPlainRecord` (all already in this file), `StudioError`, `parseJsonBody`.
- Produces: `export type BulkTiersResult = { ok: number; skipped: number; failed: Array<{ id: string; error: string }> }` (Task 4 imports this type into `studio/src/api.ts`) and the route `POST /api/items/bulk-apply-tiers` accepting body `{ ids: string[] }`, responding 200 with `BulkTiersResult`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/studioApi.test.ts` (after the `bulk-status` describe block). It follows that block's sandbox pattern exactly:

```ts
// ── POST /api/items/bulk-apply-tiers ────────────────────────────────────────

let tiersSandbox: string;

async function seedTiersItem(id: string, json: string): Promise<void> {
  const dir = path.join(tiersSandbox, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), json);
}

async function seedTiersDefaults(scope: string, json: string): Promise<void> {
  const filePath =
    scope === "site"
      ? path.join(tiersSandbox, "content", "items", "_defaults.json")
      : path.join(tiersSandbox, "content", "items", scope, "_defaults.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json);
}

async function readTiersItem(id: string): Promise<string> {
  return fs.readFile(
    path.join(tiersSandbox, "content", "items", ...id.split("/"), "item.json"),
    "utf-8",
  );
}

function bulkApplyTiers(ids: string[]) {
  return handleStudioRequest({
    method: "POST",
    url: "/api/items/bulk-apply-tiers",
    body: Buffer.from(JSON.stringify({ ids })),
    projectRoot: tiersSandbox,
  });
}

describe("POST /api/items/bulk-apply-tiers", () => {
  beforeEach(async () => {
    tiersSandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-tiers-"));
  });

  afterEach(async () => {
    await fs.rm(tiersSandbox, { recursive: true, force: true });
  });

  const ITEM = `{
  "name": "Desk lamp",
  // options: available | pending | reserved | sold | draft
  "status": "available",
  "reserved_for": "alice@example.com"
}
`;

  const SITE_DEFAULTS = `{
  "price": {
    "tiers": [
      { "label": "Pickup", "miles_max": 5, "amount": 40 },
      { "label": "Shipping", "miles_min": 5, "amount": 55 }
    ]
  }
}
`;

  it("writes the site default tiers into selected items", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);

    const res = await bulkApplyTiers(["electronics/desk-lamp"]);

    expect(res.status).toBe(200);
    expect(asJson(res).body).toMatchObject({ ok: 1, skipped: 0, failed: [] });
    const text = await readTiersItem("electronics/desk-lamp");
    expect(text).toContain('"tiers"');
    expect(text).toContain('"label": "Pickup"');
    expect(text).toContain('"amount": 55');
  });

  it("preserves comments and reserved_for", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);
    await bulkApplyTiers(["electronics/desk-lamp"]);
    const text = await readTiersItem("electronics/desk-lamp");
    expect(text).toContain("// options: available | pending | reserved | sold | draft");
    expect(text).toContain('"reserved_for": "alice@example.com"');
  });

  it("lets category defaults override site defaults", async () => {
    await seedTiersItem("books/cs61a", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);
    await seedTiersDefaults(
      "books",
      `{
  "price": {
    "tiers": [{ "label": "Campus pickup", "miles_max": 2, "amount": 10 }]
  }
}
`,
    );

    await bulkApplyTiers(["books/cs61a"]);

    const text = await readTiersItem("books/cs61a");
    expect(text).toContain('"label": "Campus pickup"');
    expect(text).not.toContain('"label": "Pickup"');
  });

  it("skips items whose merged defaults have no tiers", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);

    const res = await bulkApplyTiers(["electronics/desk-lamp"]);

    expect(asJson(res).body).toMatchObject({ ok: 0, skipped: 1, failed: [] });
    expect(await readTiersItem("electronics/desk-lamp")).toBe(ITEM);
  });

  it("skips items whose tiers already match (idempotent, file untouched)", async () => {
    await seedTiersDefaults("site", SITE_DEFAULTS);
    await seedTiersItem(
      "electronics/desk-lamp",
      `{
  "name": "Desk lamp",
  "status": "available",
  "price": {
    "tiers": [
      { "label": "Pickup", "miles_max": 5, "amount": 40 },
      { "label": "Shipping", "miles_min": 5, "amount": 55 }
    ]
  }
}
`,
    );
    const before = await readTiersItem("electronics/desk-lamp");

    const res = await bulkApplyTiers(["electronics/desk-lamp"]);

    expect(asJson(res).body).toMatchObject({ ok: 0, skipped: 1, failed: [] });
    expect(await readTiersItem("electronics/desk-lamp")).toBe(before);
  });

  it("reports per-item failures without discarding successes", async () => {
    await seedTiersItem("electronics/desk-lamp", ITEM);
    await seedTiersDefaults("site", SITE_DEFAULTS);

    const res = await bulkApplyTiers(["electronics/desk-lamp", "books/missing"]);

    const body = asJson(res).body as { ok: number; failed: Array<{ id: string }> };
    expect(body.ok).toBe(1);
    expect(body.failed.map((f) => f.id)).toEqual(["books/missing"]);
  });

  it("rejects an empty id list", async () => {
    const res = await bulkApplyTiers([]);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts -t "bulk-apply-tiers"`
Expected: FAIL — 404/unknown route (the endpoint does not exist yet).

- [ ] **Step 3: Implement the endpoint**

In `scripts/lib/studioApi.ts`, insert directly after `handleBulkStatus` (before the `IMAGE_ROUTE_RE` line):

```ts
// ── Bulk apply default tiers ─────────────────────────────────────────────────
// Writes each selected item's price.tiers from its OWN category's merged
// defaults (site ← category) — the same tiers a new item of that category
// would receive. Items with no default tiers, or tiers already matching, are
// skipped; failures are per-item and never abort the batch (same philosophy
// as handleBulkStatus).

const bulkApplyTiersBodySchema = z.object({
  ids: z.array(z.string()).min(1),
});

export type BulkTiersResult = {
  ok: number;
  /** No default tiers for this item's merged scope, or tiers already match. */
  skipped: number;
  failed: Array<{ id: string; error: string }>;
};

// Tiers compare equal when their four fields match, whatever key order the
// on-disk JSON uses. Missing optional bounds read as null on both sides.
function canonicalTier(tier: Record<string, unknown>): string {
  return JSON.stringify([
    tier.label ?? "",
    tier.miles_min ?? null,
    tier.miles_max ?? null,
    tier.amount ?? 0,
  ]);
}

function sameTiers(current: unknown, next: unknown[]): boolean {
  if (!Array.isArray(current) || current.length !== next.length) return false;
  return current.every((tier, i) => {
    const other = next[i];
    return (
      isPlainRecord(tier) &&
      isPlainRecord(other) &&
      canonicalTier(tier) === canonicalTier(other)
    );
  });
}

async function applyDefaultTiersToItem(
  projectRoot: string,
  id: string,
  itemsRoot: string,
): Promise<"written" | "skipped"> {
  const slashIdx = id.indexOf("/");
  if (slashIdx === -1) {
    throw new StudioError(400, `id must be "<category>/<item>": got "${id}"`);
  }
  const category = id.slice(0, slashIdx);
  const dir = resolveItemDir(projectRoot, category, id.slice(slashIdx + 1));
  const jsonPath = path.join(dir, "item.json");
  const text = await fsPromises.readFile(jsonPath, "utf-8");

  // loadMergedDefaults validates both _defaults.json layers as it reads; a
  // hand-broken file surfaces here as a per-item failure naming the file.
  const merged = await loadMergedDefaults(itemsRoot, category);
  const price = merged["price"];
  const tiers = isPlainRecord(price) ? price["tiers"] : undefined;
  if (!Array.isArray(tiers) || tiers.length === 0) return "skipped";

  const currentPrice = readItemField(text, "price") as { tiers?: unknown } | undefined;
  if (sameTiers(currentPrice?.tiers, tiers)) return "skipped";

  // The edit form's own write path: field allowlist + strict tier schema are
  // re-checked here, and a rejected edit leaves the file untouched.
  const next = applyFieldEdits(text, [{ path: ["price", "tiers"], value: tiers }]);
  await fsPromises.writeFile(jsonPath, next, "utf-8");
  return "written";
}

async function handleBulkApplyTiers(req: StudioRequest): Promise<StudioResponse> {
  const { ids } = parseJsonBody(req.body, bulkApplyTiersBodySchema);
  const itemsRoot = path.join(req.projectRoot, "content", "items");
  const result: BulkTiersResult = { ok: 0, skipped: 0, failed: [] };

  for (const id of ids) {
    try {
      const outcome = await applyDefaultTiersToItem(req.projectRoot, id, itemsRoot);
      if (outcome === "skipped") result.skipped++;
      else result.ok++;
    } catch (err: unknown) {
      result.failed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { status: 200, body: result };
}
```

Then register the route — insert immediately AFTER the existing `/api/items/bulk-status` block (~line 1039) and BEFORE the `/api/defaults` block:

```ts
    if (pathname === "/api/items/bulk-apply-tiers") {
      if (req.method !== "POST") {
        return { status: 405, body: { error: "POST only" } };
      }
      // `await`, not a bare return — same reason as bulk-status above.
      return await handleBulkApplyTiers(req);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run scripts/lib/studioApi.test.ts && pnpm type-check`
Expected: all PASS, including the pre-existing bulk-status suites.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat(studio): add POST /api/items/bulk-apply-tiers endpoint

Writes each selected item's price.tiers from its own category's merged
defaults; skips items with no default tiers or already-matching tiers.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Tiers block in the Item defaults pane

**Files:**
- Create: `studio/src/panes/DefaultsPane.test.tsx`
- Modify: `studio/src/panes/DefaultsPane.tsx`
- Modify: `studio/src/tokens.css` (one rule after `.defaults-inherited` ~line 1001)

**Interfaces:**
- Consumes: `TierEditor`, `isTierArray`, `type Tier` from `../components/TierEditor` (Task 1); existing `readAtPath`/`pathKey` from `../fields`, local `writeAtPath`, `fetchDefaults`/`saveDefaults` from `../api`.
- Produces: `_defaults.json` files may now contain `price.tiers` (already accepted by the server — no server change). Task 4 is independent of this task's UI.

- [ ] **Step 1: Write the failing tests**

Create `studio/src/panes/DefaultsPane.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DefaultsPane } from "./DefaultsPane";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mountPane(defaults: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("/api/defaults")) throw new Error(`unexpected fetch: ${url}`);
    if (init?.method === "PUT") return jsonResponse({});
    return jsonResponse(defaults);
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(<DefaultsPane categories={[]} onClose={vi.fn()} onSaved={onSaved} />);
  return { fetchMock, onSaved };
}

function putBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> | undefined {
  const call = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === "PUT",
  );
  if (call === undefined) return undefined;
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

describe("DefaultsPane price tiers", () => {
  it("loads saved default tiers and saves them back", async () => {
    const tiers = [
      { label: "Pickup", miles_max: 5, amount: 40 },
      { label: "Shipping", miles_min: 5, amount: 55 },
    ];
    const { fetchMock, onSaved } = mountPane({ price: { tiers } });

    const checkbox = await screen.findByLabelText("Set a default for price tiers");
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByDisplayValue("Pickup")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(putBody(fetchMock)).toEqual({ price: { tiers } });
    expect(onSaved).toHaveBeenCalled();
  });

  it("adds a tier and saves it", async () => {
    const { fetchMock } = mountPane({});
    await screen.findByLabelText("Set a default for price tiers");

    await userEvent.click(screen.getByLabelText("Set a default for price tiers"));
    await userEvent.click(screen.getByRole("button", { name: "Add tier" }));
    await userEvent.type(screen.getByDisplayValue("0"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(putBody(fetchMock)).toEqual({
      price: { tiers: [{ label: "", amount: 12 }] },
    });
  });

  it("blocks saving enabled tiers with zero rows", async () => {
    const { fetchMock } = mountPane({});
    await screen.findByLabelText("Set a default for price tiers");

    await userEvent.click(screen.getByLabelText("Set a default for price tiers"));
    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(screen.getByRole("alert").textContent).toContain("add at least one tier");
    expect(putBody(fetchMock)).toBeUndefined();
  });

  it("drops tiers from the saved defaults when the checkbox is switched off", async () => {
    const tiers = [{ label: "Pickup", miles_max: 5, amount: 40 }];
    const { fetchMock } = mountPane({ price: { tiers } });

    const checkbox = await screen.findByLabelText("Set a default for price tiers");
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Save defaults" }));

    expect(putBody(fetchMock)).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run studio/src/panes/DefaultsPane.test.tsx`
Expected: FAIL — `findByLabelText("Set a default for price tiers")` times out (the pane has no tiers block yet).

- [ ] **Step 3: Implement the tiers block in DefaultsPane.tsx**

Apply these five edits to `studio/src/panes/DefaultsPane.tsx`:

**3a. Imports** — extend the react import with `useRef`, and add the TierEditor import:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDefaults, saveDefaults } from "../api";
import { Button } from "../components/Button";
import { TierEditor, isTierArray, type Tier } from "../components/TierEditor";
```

**3b. State + collector** — after `const [busy, setBusy] = useState(false);`:

```tsx
  // Tiers are one array, not one leaf per row, so they sit outside the
  // per-field draft: a single checkbox gates the whole block, and the shared
  // TierEditor stages the rows. The collector lives in a ref for the same
  // reason as EditForm's: writing it must not re-render (registration would
  // loop against TierEditor's effect).
  const [tiersEnabled, setTiersEnabled] = useState(false);
  const [tiersInitial, setTiersInitial] = useState<Tier[]>([]);
  const tiersCollector = useRef<() => Tier[] | null>(() => null);
  const registerTiersCollector = useCallback((collect: () => Tier[] | null) => {
    tiersCollector.current = collect;
  }, []);
```

**3c. Load** — in `load()`, immediately after `setDraft(nextDraft);` (before `setLoaded(true);`):

```tsx
    const tiersRaw = readAtPath(current, ["price", "tiers"]);
    setTiersEnabled(Array.isArray(tiersRaw));
    setTiersInitial(isTierArray(tiersRaw) ? tiersRaw : []);
```

**3d. Save** — in `save()`, after the group/field loop closes and BEFORE `if (problems.length > 0) {`:

```tsx
    if (tiersEnabled) {
      // Unchanged rows come back as null from the collector; fall back to
      // what was loaded so an enabled-but-untouched block still saves.
      const rows = tiersCollector.current() ?? tiersInitial;
      if (rows.length === 0) {
        problems.push("Price tiers: add at least one tier or switch the field off");
      } else {
        writeAtPath(out, ["price", "tiers"], rows);
      }
    }
```

**3e. Render** — replace the `SORTED_GROUPS.map((group) => { … })` callback with the version below (the leaf-row JSX inside is unchanged; the only additions are `tiersBlock` and the `flatMap` splice after `price.currency`):

```tsx
            {SORTED_GROUPS.map((group) => {
              const siteTiers = readAtPath(siteDefaults, ["price", "tiers"]);
              const tiersInherited =
                scope !== "site" && !tiersEnabled && isTierArray(siteTiers)
                  ? siteTiers.length
                  : undefined;
              const tiersBlock = (
                <div
                  key="price.tiers"
                  className={tiersEnabled ? "defaults-row" : "defaults-row defaults-row-off"}
                >
                  <input
                    type="checkbox"
                    className="defaults-enable"
                    checked={tiersEnabled}
                    aria-label="Set a default for price tiers"
                    onChange={(e) => {
                      setTiersEnabled(e.target.checked);
                      setSaved(false);
                    }}
                  />
                  <div className="defaults-tier-block">
                    {tiersEnabled ? (
                      <TierEditor
                        initialTiers={tiersInitial}
                        resetToken={0}
                        registerCollector={registerTiersCollector}
                      />
                    ) : (
                      <span className="field-label">Price tiers</span>
                    )}
                    {tiersInherited !== undefined && (
                      <span className="field-hint defaults-inherited">
                        site: {tiersInherited} tiers
                      </span>
                    )}
                  </div>
                </div>
              );
              const fields = group.fields.flatMap((field) => {
                const key = pathKey(field.path);
                const state = draft[key] ?? { enabled: false, raw: "" };
                const inherited =
                  scope !== "site" && !state.enabled
                    ? readAtPath(siteDefaults, field.path)
                    : undefined;
                const row = (
                  <div
                    key={key}
                    className={state.enabled ? "defaults-row" : "defaults-row defaults-row-off"}
                  >
                    <input
                      type="checkbox"
                      className="defaults-enable"
                      checked={state.enabled}
                      aria-label={`Set a default for ${field.label}`}
                      onChange={(e) => {
                        setDraft((prev) => ({
                          ...prev,
                          [key]: { ...(prev[key] ?? { enabled: false, raw: "" }), enabled: e.target.checked },
                        }));
                        setSaved(false);
                      }}
                    />
                    <FieldInput
                      field={field}
                      value={state.raw}
                      disabled={!state.enabled}
                      onChange={(raw) => {
                        setDraft((prev) => ({
                          ...prev,
                          [key]: { ...(prev[key] ?? { enabled: false, raw: "" }), raw },
                        }));
                        setSaved(false);
                      }}
                    />
                    {inherited !== undefined && (
                      <span className="field-hint defaults-inherited">site: {formatInherited(inherited)}</span>
                    )}
                  </div>
                );
                // The tiers block sits next to the currency its amounts are
                // in — same placement rule as the item edit form.
                return key === "price.currency" ? [row, tiersBlock] : [row];
              });
              return PINNED_GROUPS.has(group.id) ? (
                <fieldset key={group.id}>
                  <legend>{group.title}</legend>
                  {fields}
                </fieldset>
              ) : (
                <details key={group.id}>
                  <summary>{group.title}</summary>
                  <fieldset>{fields}</fieldset>
                </details>
              );
            })}
```

- [ ] **Step 4: Add the one CSS rule**

In `studio/src/tokens.css`, after the `.defaults-inherited { opacity: 0.7; }` block (~line 1001):

```css
.defaults-tier-block {
  flex: 1;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run studio/src/panes/DefaultsPane.test.tsx && pnpm type-check`
Expected: all four tests PASS; type check clean.

- [ ] **Step 6: Commit**

```bash
git add studio/src/panes/DefaultsPane.tsx studio/src/panes/DefaultsPane.test.tsx studio/src/tokens.css
git commit -m "feat(studio): make price tiers settable in the Item defaults pane

One checkbox gates the whole tier array; saved tiers land in the scope's
_defaults.json and flow into new items through the existing merge.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Client wiring — `api.ts`, `BulkToolbar`, `App.tsx`

**Files:**
- Modify: `studio/src/api.ts` (type import/re-export + `applyDefaultTiers` after `bulkStatus` ~line 78)
- Modify: `studio/src/panes/BulkToolbar.tsx`
- Create: `studio/src/panes/BulkToolbar.test.tsx`
- Modify: `studio/src/App.tsx` (import ~line 2, new `applyTiers()` after `apply()` ~line 173, `BulkToolbar` usage ~line 279)

**Interfaces:**
- Consumes: `BulkTiersResult` exported by Task 2's `scripts/lib/studioApi.ts`; route `POST /api/items/bulk-apply-tiers` from Task 2.
- Produces: `applyDefaultTiers(ids: string[]): Promise<BulkTiersResult>` in the browser API module; `BulkToolbar` gains required prop `onApplyTiers: () => void`.

- [ ] **Step 1: Write the failing BulkToolbar test**

Create `studio/src/panes/BulkToolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkToolbar } from "./BulkToolbar";

afterEach(() => cleanup());

it("fires onApplyTiers when the button is clicked", async () => {
  const onApplyTiers = vi.fn();
  render(
    <BulkToolbar
      count={2}
      busy={false}
      onApply={vi.fn()}
      onApplyTiers={onApplyTiers}
      onClear={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Apply default tiers" }));
  expect(onApplyTiers).toHaveBeenCalledTimes(1);
});

it("disables the tiers action while busy", () => {
  render(
    <BulkToolbar count={2} busy onApply={vi.fn()} onApplyTiers={vi.fn()} onClear={vi.fn()} />,
  );
  expect(
    (screen.getByRole("button", { name: "Apply default tiers" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it("renders nothing with no selection", () => {
  const { container } = render(
    <BulkToolbar count={0} busy={false} onApply={vi.fn()} onApplyTiers={vi.fn()} onClear={vi.fn()} />,
  );
  expect(container.innerHTML).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run studio/src/panes/BulkToolbar.test.tsx`
Expected: FAIL — `onApplyTiers` is not a prop / no "Apply default tiers" button.

- [ ] **Step 3: Extend BulkToolbar**

Replace `studio/src/panes/BulkToolbar.tsx` with:

```tsx
import { Button } from "../components/Button";

// Actions keep the same name from button to result: "Mark sold" produces rows
// that read "sold". One job per control.
const ACTIONS: Array<{ label: string; status: string }> = [
  { label: "Mark sold", status: "sold" },
  { label: "Mark pending", status: "pending" },
  { label: "Mark available", status: "available" },
  { label: "Move to draft", status: "draft" },
];

export function BulkToolbar({
  count,
  busy,
  onApply,
  onApplyTiers,
  onClear,
}: {
  count: number;
  busy: boolean;
  onApply: (status: string) => void;
  onApplyTiers: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
      <span className="count">{count} selected</span>
      {ACTIONS.map((action) => (
        <Button key={action.status} disabled={busy} onClick={() => onApply(action.status)}>
          {action.label}
        </Button>
      ))}
      <Button disabled={busy} onClick={onApplyTiers}>
        Apply default tiers
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={busy}>
        Clear selection
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add the browser API function**

In `studio/src/api.ts`:

1. Extend the type-only import from `../../scripts/lib/studioApi` and the re-export with `BulkTiersResult`:

```ts
import type { BulkStatusResult, BulkTiersResult, ImageEntry, StudioItem } from "../../scripts/lib/studioApi";

export type { BulkStatusResult, BulkTiersResult, ConfigField, ConfigFieldKind, ImageEntry, ReadinessAction, ReadinessItem, ReadinessReport, StudioItem };
```

2. Insert after the `bulkStatus` function (~line 78), following its defensive-read pattern exactly:

```ts
export async function applyDefaultTiers(ids: string[]): Promise<BulkTiersResult> {
  const res = await fetch("/api/items/bulk-apply-tiers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `bulk apply tiers failed with ${res.status} ${res.statusText}`));
  }
  if (body === null) {
    throw new Error(`bulk apply tiers returned an unreadable response (${res.status} ${res.statusText})`);
  }
  return body as unknown as BulkTiersResult;
}
```

- [ ] **Step 5: Wire App.tsx**

In `studio/src/App.tsx`:

1. Import: change the api import (line 2) to include `applyDefaultTiers`:

```ts
import { applyDefaultTiers, bulkStatus, fetchItems, type StudioItem } from "./api";
```

2. Insert after the existing `apply(status)` function (~line 173). Same result conventions: failed rows stay selected for retry; the message bar carries both success summaries and failures; `refresh()` + `bumpChanges()` afterwards. No sold-stamping, no filter-exemption bookkeeping — tiers do not affect which rows match the filters.

```ts
  async function applyTiers() {
    const ids = [...selectedIds];
    setBusy(true);
    setError(null);
    try {
      const result = await applyDefaultTiers(ids);
      const failed = new Set(result.failed.map((f) => f.id));
      setFailedIds(failed);
      // Failed rows stay selected so the seller can retry them directly.
      setSelectedIds(failed);
      await refresh();
      bumpChanges();
      if (result.failed.length > 0) {
        setError(
          `${result.failed.length} of ${ids.length} items could not be updated: ` +
            result.failed.map((f) => `${f.id} (${f.error})`).join(", "),
        );
      }
      if (result.failed.length === 0 && result.skipped > 0) {
        setError(
          `${result.ok} updated, ${result.skipped} skipped (no default tiers for their ` +
            `category, or already matching).`,
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
```

3. Pass the handler to the toolbar (~line 279):

```tsx
      <BulkToolbar
        count={selectedIds.size}
        busy={busy}
        onApply={(status) => void apply(status)}
        onApplyTiers={() => void applyTiers()}
        onClear={() => setSelectedIds(new Set())}
      />
```

- [ ] **Step 6: Run tests + type check**

Run: `pnpm vitest run studio/src/panes/BulkToolbar.test.tsx && pnpm type-check && pnpm lint`
Expected: PASS; type check clean (this is where the new required prop would catch a missed call site); lint at 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add studio/src/api.ts studio/src/panes/BulkToolbar.tsx studio/src/panes/BulkToolbar.test.tsx studio/src/App.tsx
git commit -m "feat(studio): bulk 'Apply default tiers' action on the selection toolbar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Full verification pass

**Files:** none modified (verification only; any content/ changes made during the manual pass are reverted at the end)

- [ ] **Step 1: Run the whole suite + checks**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all green, 0 warnings.

- [ ] **Step 2: Manual pass in the real Studio**

Run: `pnpm studio` and work through:

1. Open **Item defaults** → confirm the **Price** group shows the "Price tiers" checkbox + editor; enable it, add two tiers (e.g. `Pickup / ≤ 5 mi` amount 0, `Shipping` amount 0), Save → confirm `content/items/_defaults.json` now contains `price.tiers`.
2. Create a new item in any category (with "apply defaults" checked) → open it → its tiers come from the defaults.
3. Set a category-scoped override (category tab → enable tiers with a different band) → create another item in that category → category tiers win.
4. In the item list, tick two existing items from different categories → click **Apply default tiers** → verify the message bar summary, that each item's `item.json` now holds its own category's merged tiers, and that a second click reports everything as skipped (idempotent).
5. Confirm a sold or draft item updates too when selected, and that unselected items are untouched.

- [ ] **Step 3: Revert the manual-pass content changes**

Run: `git status` (only `content/` files should be dirty or untracked), then:

```bash
git checkout -- content/ && git clean -fd content/
```

`checkout` restores modified tracked files; `clean` removes what the manual pass created untracked (new item folders, a fresh `content/items/_defaults.json` — no `_defaults.json` exists in the committed tree). Tasks 1–4 committed only code/tests, so this returns the catalog to its committed state. If the seller wants to keep the manually created defaults/items instead, skip this step.

---

### Task 6: Docs — English and Chinese in one commit

**Files:**
- Modify: `docs/DESIGN.md` (§22 bullet list, after the item-defaults bullet ending "…are rejected.", ~line 2271) + `docs/DESIGN_zh.md` (same section, ~line 2058)
- Modify: `docs/CURRENT_FUNCTIONALITY.md` (Defaults row line 374; insert new row after Bulk status line 377) + `docs/CURRENT_FUNCTIONALITY_zh.md` (lines 374/377)
- Modify: `docs/TECH_REQUIREMENTS.md` (endpoint table, insert after the `bulk-status` row line 2790) + `docs/TECH_REQUIREMENTS_zh.md` (insert after line 2484)

- [ ] **Step 1: DESIGN.md §22 — append two bullets after the existing item-defaults bullet**

```markdown
- Price tiers are defaultable too: the Defaults pane carries a **Price tiers** block
  (enable checkbox plus the same tier editor the item form uses). Saved tiers land in
  `price.tiers` of the scope's `_defaults.json` and replace the template's tiers wholesale
  on item creation — the full layering is `siteConfig.content.defaultPriceTiers` (or the
  built-in 3-tier template) ← site defaults ← category defaults.
- A bulk action, **Apply default tiers** (selection toolbar, `POST /api/items/bulk-apply-tiers`),
  writes each selected item's `price.tiers` from its own category's merged defaults. Items
  with no default tiers, or tiers already matching, are skipped and reported; failures are
  per-item and never abort the batch; only `price.tiers` is written.
```

- [ ] **Step 2: DESIGN_zh.md — mirror the same two bullets in the matching §22 spot**

```markdown
- 价格档位同样可以设为默认值：Defaults 面板带有 **Price tiers** 区块（一个启用复选框加上与
  物品编辑表单相同的档位编辑器）。保存的档位写入该作用域 `_defaults.json` 的 `price.tiers`，
  建 item 时整体替换模板中的档位——完整层级为 `siteConfig.content.defaultPriceTiers`
  （或内置的三档模板）← 站点级默认值 ← 分类级默认值。
- 批量操作 **Apply default tiers**（选择工具栏，`POST /api/items/bulk-apply-tiers`）会把每个
  选中物品的 `price.tiers` 覆写为该物品所属分类合并后的默认值。无默认档位、或档位已一致的
  物品会被跳过并提示；失败按物品报告、不会中断整批；只写入 `price.tiers`。
```

- [ ] **Step 3: CURRENT_FUNCTIONALITY.md — extend the Defaults row (line 374) and add a new row after Bulk status (line 377)**

Extend the Defaults row's last clause to read: `…with an opt-out checkbox in the new-item dialog. Price tiers are set through a dedicated "Price tiers" block (one checkbox gates the whole array).`

New table row after `| Bulk status | … |`:

```markdown
| Bulk apply default tiers | Overwrite `price.tiers` on the selected items with each item's own merged defaults (site ← category); items without default tiers, or already matching, are skipped and reported |
```

- [ ] **Step 4: CURRENT_FUNCTIONALITY_zh.md — mirror both changes (lines 374/377)**

Extend the 默认值 row: `……新建弹窗可勾选关闭。价格档位通过专门的"Price tiers"区块设置（一个复选框控制整个数组）。`

New row after `| 批量改状态 | … |`:

```markdown
| 批量应用默认档位 | 用各物品自身合并后的默认值（站点级 ← 分类级）覆盖所选物品的 `price.tiers`；无默认档位或已一致的物品会被跳过并提示 |
```

- [ ] **Step 5: TECH_REQUIREMENTS.md — insert after the bulk-status row (line 2790)**

```markdown
| `POST /api/items/bulk-apply-tiers` | Overwrite `price.tiers` on a selection with each item's own merged defaults; skips items with no default tiers or already-matching tiers, with per-item failure reporting. |
```

- [ ] **Step 6: TECH_REQUIREMENTS_zh.md — insert after the bulk-status row (line 2484)**

```markdown
| `POST /api/items/bulk-apply-tiers` | 用各物品自身合并后的默认值覆盖所选物品的 `price.tiers`；无默认档位或档位已一致的跳过，逐项报告失败。 |
```

- [ ] **Step 7: Commit both languages together**

```bash
git add docs/DESIGN.md docs/DESIGN_zh.md docs/CURRENT_FUNCTIONALITY.md docs/CURRENT_FUNCTIONALITY_zh.md docs/TECH_REQUIREMENTS.md docs/TECH_REQUIREMENTS_zh.md
git commit -m "docs: default price tiers + bulk apply in Studio (EN + zh)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Done

All tasks complete when: `pnpm test && pnpm type-check && pnpm lint` is green, the manual pass (Task 5) succeeded, and the six commits (one per task) are on the branch. The feature ships with the next `pnpm bump` release — no `package.json` change here.
