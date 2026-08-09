# Seller Studio 照片缩略图 + 语言切换 + 卡片视图实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Seller Studio 中为 item 列表增加封面缩略图、卡片/网格视图、顶部语言切换器，并复用 drawer 中已有的 Translations 分组编辑多语言名称。

**Architecture:** 服务端在 `listStudioItems` 中计算首图文件名与多语言名称，`/api/items` 额外返回 `defaultLocale`/`availableLocales`；浏览器端新增共享显示 helper、LocaleSwitcher、视图切换按钮、ItemCard/ItemGrid，并在 `App.tsx` 中持有 `viewMode`/`displayLocale` 状态并持久化到 `localStorage`。

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, jsdom, @tabler/icons-react, 纯 CSS（`studio/src/tokens.css`）。

## Global Constraints

- Studio 的 Vite 应用**没有**接入 Tailwind；所有新增样式必须写在 `studio/src/tokens.css` 并使用现有 CSS 变量。
-  sellers 永远只编辑 `content/` 下的文件；本功能修改的是模板代码（`scripts/lib/studioApi.ts`、`studio/src/*`），不属于 seller 内容。
- `image-manifest.json` 继续保留在 git 中。
- `defaultLocale` 与 `availableLocales` 必须由 `/api/items` 返回，浏览器端不直接 import `siteConfig`。
- `LocaleSwitcher` 仅在 `availableLocales.length >= 2` 时渲染。
- 默认视图模式为 `"table"`，持久化 key 为 `usedexchange-studio-view-mode`；语言持久化 key 为 `usedexchange-studio-locale`。
- 表格缩略图 40×40 px、圆角 6px；卡片图片宽高比 4:3、圆角 8px；视图切换按钮 32×32 px；语言切换器与 `ThemeToggle` 同高。
- `coverImage` 计算规则：`listImageFiles` 已按字母序排序，优先找 `cover.*`，否则第一张，无图则 `null`。
- `localizedNames` 必须包含 `defaultLocale` 映射，且仅包含非空字符串的 locale。
- 服务端 `/api/items` 响应校验：`defaultLocale` 必须是 string、`availableLocales` 必须是 array，否则按 unreadable response 报错。
- Vitest 全局 `environment: "node"`；任何组件测试文件顶部必须加 `// @vitest-environment jsdom`。

---

## File Map

| 文件 | 职责 |
|---|---|
| `scripts/lib/studioApi.ts` | 扩展 `StudioItem` 类型；`listStudioItems` 计算 `coverImage`/`localizedNames`；`GET /api/items` 返回 `defaultLocale`/`availableLocales`。 |
| `scripts/lib/studioApi.test.ts` | 服务端测试：验证封面图、多语言名称、API 响应字段。 |
| `studio/src/api.ts` | `fetchItems` 返回新 shape 并做 malformed-response 校验。 |
| `studio/src/filtering.test.ts` | `item(over)` 工厂补全新增字段。 |
| `studio/src/itemDisplay.ts` | 共享 helper：`displayName`、`coverImageUrl`、`formatPrice`。 |
| `studio/src/itemDisplay.test.ts` | `displayName` 纯函数测试。 |
| `studio/src/components/LocaleSwitcher.tsx` | 顶部语言切换 select。 |
| `studio/src/components/LocaleSwitcher.test.tsx` | 切换器渲染与回调测试。 |
| `studio/src/panes/FilterBar.tsx` | 新增 `viewMode`/`onViewModeChange` props 与视图切换按钮组。 |
| `studio/src/panes/FilterBar.test.tsx` | 视图切换按钮测试。 |
| `studio/src/panes/ItemCard.tsx` | 单个卡片组件。 |
| `studio/src/panes/ItemGrid.tsx` | 卡片网格容器。 |
| `studio/src/panes/ItemGrid.test.tsx` | 网格渲染、点击、选择测试。 |
| `studio/src/panes/ItemList.tsx` | 表格新增 Photo 列、使用 `displayName`、移除 Images 计数列。 |
| `studio/src/panes/ItemList.test.tsx` | 表格缩略图、占位、语言切换测试。 |
| `studio/src/App.tsx` | 接入 `viewMode`/`defaultLocale`/`availableLocales`/`displayLocale`，向下透传。 |
| `studio/src/tokens.css` | 新增/调整表格缩略图、卡片网格、视图切换、语言切换、移动折叠布局样式。 |

---

### Task 1: Extend server data model and API response

**Files:**
- Modify: `scripts/lib/studioApi.ts:94-113`, `scripts/lib/studioApi.ts:150-192`, `scripts/lib/studioApi.ts:984-996`
- Test: `scripts/lib/studioApi.test.ts`

**Interfaces:**
- Consumes: `siteConfig.i18n.defaultLocale`, `siteConfig.i18n.availableLocales`, `listImageFiles(dir)`, `loadAllItemsRaw()`.
- Produces: `StudioItem` with `coverImage: string | null` and `localizedNames: Record<string, string>`; `GET /api/items` body shape `{ items, defaultLocale, availableLocales }`.

- [ ] **Step 1: Write the failing test**

在 `scripts/lib/studioApi.test.ts` 的 `handleStudioRequest` describe 内新增：

```ts
it("returns defaultLocale and availableLocales on GET /api/items", async () => {
  const res = await handleStudioRequest({
    method: "GET",
    url: "/api/items",
    body: Buffer.alloc(0),
    projectRoot: PROJECT_ROOT,
  });
  expect(res.status).toBe(200);
  const body = asJson(res).body as {
    items: unknown[];
    defaultLocale: unknown;
    availableLocales: unknown;
  };
  expect(typeof body.defaultLocale).toBe("string");
  expect(Array.isArray(body.availableLocales)).toBe(true);
});
```

再新增一个 describe 验证 `listStudioItems` 封面与多语言（放在 `listStudioItems resilience` describe 附近）：

```ts
describe("listStudioItems cover and localized names", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "studio-cover-"));
  });
  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  async function seedItem(id: string, itemJson: string, images: string[] = []) {
    const dir = path.join(sandbox, "content", "items", ...id.split("/"));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "item.json"), itemJson, "utf-8");
    for (const name of images) {
      await fs.writeFile(path.join(dir, name), PNG_BYTES);
    }
  }

  it("picks cover.* as the cover image when present", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([
        {
          categorySlug: "electronics",
          itemSlug: "desk-lamp",
          name: "Desk Lamp",
          nameZh: "台灯",
          status: "available",
          price: { currency: "USD", tiers: [{ amount: 20 }] },
          tags: [],
          listedDate: "2026-01-01",
        },
      ] as any);
    try {
      await seedItem(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
        ["01-side.jpg", "cover.webp", "03-back.jpg"],
      );
      const items = await listStudioItems(sandbox);
      expect(items[0]?.coverImage).toBe("cover.webp");
      expect(items[0]?.localizedNames).toEqual({ en: "Desk Lamp", zh: "台灯" });
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("falls back to the first image when there is no cover.*", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([
        {
          categorySlug: "electronics",
          itemSlug: "desk-lamp",
          name: "Desk Lamp",
          status: "available",
          price: { currency: "USD", tiers: [{ amount: 20 }] },
          tags: [],
          listedDate: "2026-01-01",
        },
      ] as any);
    try {
      await seedItem(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
        ["01-front.jpg"],
      );
      const items = await listStudioItems(sandbox);
      expect(items[0]?.coverImage).toBe("01-front.jpg");
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });

  it("returns null coverImage when the item has no images", async () => {
    const mockLoadAllItemsRaw = vi
      .spyOn(loaderModule, "loadAllItemsRaw")
      .mockResolvedValue([
        {
          categorySlug: "electronics",
          itemSlug: "desk-lamp",
          name: "Desk Lamp",
          status: "available",
          price: { currency: "USD", tiers: [{ amount: 20 }] },
          tags: [],
          listedDate: "2026-01-01",
        },
      ] as any);
    try {
      await seedItem(
        "electronics/desk-lamp",
        JSON.stringify({ name: "Desk Lamp", status: "available" }),
      );
      const items = await listStudioItems(sandbox);
      expect(items[0]?.coverImage).toBeNull();
    } finally {
      mockLoadAllItemsRaw.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test scripts/lib/studioApi.test.ts`

Expected: FAIL — `StudioItem` 没有 `coverImage`/`localizedNames`，`/api/items` 响应没有 `defaultLocale`/`availableLocales`。

- [ ] **Step 3: Write minimal implementation**

1. 在 `scripts/lib/studioApi.ts` 的 `StudioItem` 类型中新增两个字段：

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
  /** First image filename, or null if the item has no images. */
  coverImage: string | null;
  /** locale -> display name; defaultLocale is always included. */
  localizedNames: Record<string, string>;
  tags: string[];
  listedDate: string | null;
};
```

2. 在 `listStudioItems` 上方新增封面计算 helper：

```ts
async function firstCoverImage(dir: string): Promise<string | null> {
  const files = await listImageFiles(dir);
  const coverIdx = files.findIndex((f) => /^cover\./i.test(f.name));
  return files[coverIdx]?.name ?? files[0]?.name ?? null;
}
```

3. 在 `listStudioItems` 上方新增多语言名称 helper：

```ts
function localizedNameFor(item: {
  name: string;
  nameZh?: string;
}, locale: string): string | undefined {
  if (locale === siteConfig.i18n.defaultLocale) return item.name;
  if (locale === "zh") return item.nameZh;
  return undefined;
}

function buildLocalizedNames(item: { name: string; nameZh?: string }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const locale of siteConfig.i18n.availableLocales) {
    const value = localizedNameFor(item, locale);
    if (typeof value === "string" && value.trim() !== "") {
      result[locale] = value;
    }
  }
  return result;
}
```

4. 修改 `listStudioItems` 中的 item 映射：

```ts
return Promise.all(
  items.map(async (item) => {
    let imageCount = 0;
    let coverImage: string | null = null;
    try {
      const dir = resolveItemDir(projectRoot, item.categorySlug, item.itemSlug);
      imageCount = await countImages(dir);
      coverImage = await firstCoverImage(dir);
    } catch {
      // Invalid slug folder: still show the item with zero images.
    }

    const amounts = item.price.tiers.map((t) => t.amount);
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
      localizedNames: buildLocalizedNames(item as { name: string; nameZh?: string }),
      tags: Array.isArray(item.tags) ? item.tags : [],
      listedDate: typeof item.listedDate === "string" ? item.listedDate : null,
    } satisfies StudioItem;
  }),
);
```

5. 修改 `handleStudioRequest` 中 `GET /api/items` 的返回：

```ts
if (pathname === "/api/items") {
  if (req.method === "GET") {
    return {
      status: 200,
      body: {
        items: await listStudioItems(req.projectRoot),
        defaultLocale: siteConfig.i18n.defaultLocale,
        availableLocales: siteConfig.i18n.availableLocales,
      },
    };
  }
  // ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test scripts/lib/studioApi.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/studioApi.ts scripts/lib/studioApi.test.ts
git commit -m "feat(studio): add coverImage, localizedNames, and locale metadata to /api/items"
```

---

### Task 2: Update client API contract

**Files:**
- Modify: `studio/src/api.ts:33-50`
- Test: `studio/src/api.test.ts`（新建）

**Interfaces:**
- Consumes: `GET /api/items` response `{ items, defaultLocale, availableLocales }`.
- Produces: `fetchItems(): Promise<{ items: StudioItem[]; defaultLocale: string; availableLocales: string[] }>`.

- [ ] **Step 1: Write the failing test**

新建 `studio/src/api.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fetchItems } from "./api";

describe("fetchItems", () => {
  it("returns items and locale metadata for a valid response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          items: [{ id: "a/b", name: "B" }],
          defaultLocale: "en",
          availableLocales: ["en", "zh"],
        }),
      })) as any,
    );
    const result = await fetchItems();
    expect(result.items).toHaveLength(1);
    expect(result.defaultLocale).toBe("en");
    expect(result.availableLocales).toEqual(["en", "zh"]);
    vi.unstubAllGlobals();
  });

  it("throws when defaultLocale is missing or malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ items: [], availableLocales: ["en"] }),
      })) as any,
    );
    await expect(fetchItems()).rejects.toThrow(/unreadable response/);
    vi.unstubAllGlobals();
  });

  it("throws when availableLocales is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ items: [], defaultLocale: "en", availableLocales: "en" }),
      })) as any,
    );
    await expect(fetchItems()).rejects.toThrow(/unreadable response/);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test studio/src/api.test.ts`

Expected: FAIL — `fetchItems` 仍返回 `StudioItem[]` 并且没有 locale 校验。

- [ ] **Step 3: Write minimal implementation**

修改 `studio/src/api.ts`：

```ts
export async function fetchItems(): Promise<{
  items: StudioItem[];
  defaultLocale: string;
  availableLocales: string[];
}> {
  const res = await fetch("/api/items");
  const body = await readJsonBody(res);
  if (!res.ok) {
    throw new Error(errorMessage(body, `GET /api/items failed with ${res.status} ${res.statusText}`));
  }
  if (
    !Array.isArray(body?.items) ||
    typeof body?.defaultLocale !== "string" ||
    !Array.isArray(body?.availableLocales)
  ) {
    throw new Error(
      `GET /api/items returned an unreadable response (${res.status} ${res.statusText})`,
    );
  }
  return {
    items: body.items as StudioItem[],
    defaultLocale: body.defaultLocale as string,
    availableLocales: body.availableLocales as string[],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test studio/src/api.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add studio/src/api.ts studio/src/api.test.ts
git commit -m "feat(studio): update fetchItems to return locale metadata and validate shape"
```

---

### Task 3: Update filtering test factory

**Files:**
- Modify: `studio/src/filtering.test.ts:11-24`

**Interfaces:**
- Consumes: `StudioItem`（现在含 `coverImage` 和 `localizedNames`）。
- Produces: `item(over)` 返回完整 `StudioItem`。

- [ ] **Step 1: Write the failing test / compile check**

Run: `pnpm type-check`

Expected: FAIL — `filtering.test.ts` 的 `item()` 字面量缺少 `coverImage` 和 `localizedNames`。

- [ ] **Step 2: Update the factory**

在 `studio/src/filtering.test.ts` 的 `item()` 返回值中新增：

```ts
function item(over: Partial<StudioItem> & { id: string }): StudioItem {
  return {
    categorySlug: "electronics",
    itemSlug: over.id,
    name: "Item",
    status: "available",
    currency: "USD",
    lowestTierAmount: 10,
    imageCount: 0,
    coverImage: null,
    localizedNames: { en: "Item" },
    tags: [],
    listedDate: "2026-01-01",
    ...over,
  };
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test studio/src/filtering.test.ts`

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add studio/src/filtering.test.ts
git commit -m "test(studio): include new StudioItem fields in filtering factory"
```

---

### Task 4: Add shared display helpers

**Files:**
- Create: `studio/src/itemDisplay.ts`
- Create: `studio/src/itemDisplay.test.ts`
- Modify: `studio/src/panes/ItemList.tsx:5-18`

**Interfaces:**
- Consumes: `StudioItem`。
- Produces: `displayName(item, locale): string`, `coverImageUrl(item): string | null`, `formatPrice(item): string`。

- [ ] **Step 1: Write the failing test**

新建 `studio/src/itemDisplay.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { displayName, coverImageUrl } from "./itemDisplay";
import type { StudioItem } from "./api";

function item(over: Partial<StudioItem> = {}): StudioItem {
  return {
    id: "electronics/desk-lamp",
    categorySlug: "electronics",
    itemSlug: "desk-lamp",
    name: "Desk Lamp",
    status: "available",
    currency: "USD",
    lowestTierAmount: 20,
    imageCount: 1,
    coverImage: "cover.jpg",
    localizedNames: { en: "Desk Lamp", zh: "台灯" },
    tags: [],
    listedDate: "2026-01-01",
    ...over,
  };
}

describe("displayName", () => {
  it("uses the requested locale when available", () => {
    expect(displayName(item(), "zh")).toBe("台灯");
  });

  it("falls back to the default name when the locale is missing", () => {
    expect(displayName(item({ localizedNames: { en: "Desk Lamp" } }), "zh")).toBe("Desk Lamp");
  });
});

describe("coverImageUrl", () => {
  it("encodes the category, item slug, and filename into the API path", () => {
    expect(coverImageUrl(item())).toBe(
      "/api/items/electronics/desk-lamp/images/cover.jpg",
    );
  });

  it("returns null when there is no cover image", () => {
    expect(coverImageUrl(item({ coverImage: null }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test studio/src/itemDisplay.test.ts`

Expected: FAIL — 模块不存在。

- [ ] **Step 3: Write minimal implementation**

新建 `studio/src/itemDisplay.ts`：

```ts
import type { StudioItem } from "./api";

export function displayName(item: StudioItem, locale: string): string {
  return item.localizedNames[locale] ?? item.name;
}

export function coverImageUrl(item: StudioItem): string | null {
  if (item.coverImage === null) return null;
  return `/api/items/${encodeURIComponent(item.categorySlug)}/${encodeURIComponent(
    item.itemSlug,
  )}/images/${encodeURIComponent(item.coverImage)}`;
}

export function formatPrice(item: StudioItem): string {
  if (item.lowestTierAmount === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: item.currency,
    }).format(item.lowestTierAmount);
  } catch {
    return item.lowestTierAmount.toFixed(2);
  }
}
```

同时从 `studio/src/panes/ItemList.tsx` 删除本地的 `formatPrice` 函数，改为从 `itemDisplay` import：

```ts
import { displayName, formatPrice } from "../itemDisplay";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test studio/src/itemDisplay.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add studio/src/itemDisplay.ts studio/src/itemDisplay.test.ts studio/src/panes/ItemList.tsx
git commit -m "feat(studio): add shared item display helpers"
```

---

### Task 5: Add LocaleSwitcher component

**Files:**
- Create: `studio/src/components/LocaleSwitcher.tsx`
- Create: `studio/src/components/LocaleSwitcher.test.tsx`

**Interfaces:**
- Consumes: `availableLocales: string[]`, `value: string`, `onChange(locale): void`。
- Produces: `<LocaleSwitcher />`；单语言时返回 `null`。

- [ ] **Step 1: Write the failing test**

新建 `studio/src/components/LocaleSwitcher.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleSwitcher } from "./LocaleSwitcher";

describe("LocaleSwitcher", () => {
  it("renders nothing when there is only one locale", () => {
    const { container } = render(
      <LocaleSwitcher availableLocales={["en"]} value="en" onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a select for multiple locales", () => {
    render(<LocaleSwitcher availableLocales={["en", "zh"]} value="en" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Display language")).toBeInTheDocument();
  });

  it("calls onChange when a new locale is selected", async () => {
    const onChange = vi.fn();
    render(<LocaleSwitcher availableLocales={["en", "zh"]} value="en" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Display language"), "zh");
    expect(onChange).toHaveBeenCalledWith("zh");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test studio/src/components/LocaleSwitcher.test.tsx`

Expected: FAIL — 组件不存在。

- [ ] **Step 3: Write minimal implementation**

新建 `studio/src/components/LocaleSwitcher.tsx`：

```tsx
export function LocaleSwitcher({
  availableLocales,
  value,
  onChange,
}: {
  availableLocales: string[];
  value: string;
  onChange: (locale: string) => void;
}) {
  if (availableLocales.length < 2) return null;
  return (
    <select
      className="locale-switcher"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Display language"
    >
      {availableLocales.map((locale) => (
        <option key={locale} value={locale}>
          {locale.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test studio/src/components/LocaleSwitcher.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add studio/src/components/LocaleSwitcher.tsx studio/src/components/LocaleSwitcher.test.tsx
git commit -m "feat(studio): add LocaleSwitcher component"
```

---

### Task 6: Add view-mode toggle to FilterBar

**Files:**
- Modify: `studio/src/panes/FilterBar.tsx`
- Create: `studio/src/panes/FilterBar.test.tsx`

**Interfaces:**
- Consumes: `viewMode: "table" | "cards"`, `onViewModeChange(mode): void`。
- Produces: 在 `filter-controls` 最右侧、Sort select 与结果计数之间插入 Table/Cards 切换按钮组。

- [ ] **Step 1: Write the failing test**

新建 `studio/src/panes/FilterBar.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./FilterBar";
import { DEFAULT_FILTERS } from "../filtering";

const baseCounts = {
  active: 1,
  all: 1,
  available: 1,
  reserved: 0,
  pending: 0,
  sold: 0,
  draft: 0,
};

describe("FilterBar view mode", () => {
  it("renders table and cards buttons", () => {
    render(
      <FilterBar
        filters={DEFAULT_FILTERS}
        counts={baseCounts}
        categories={[]}
        resultCount={1}
        onChange={vi.fn()}
        viewMode="table"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /table/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cards/i })).toBeInTheDocument();
  });

  it("switches to cards when the cards button is pressed", async () => {
    const onViewModeChange = vi.fn();
    render(
      <FilterBar
        filters={DEFAULT_FILTERS}
        counts={baseCounts}
        categories={[]}
        resultCount={1}
        onChange={vi.fn()}
        viewMode="table"
        onViewModeChange={onViewModeChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /cards/i }));
    expect(onViewModeChange).toHaveBeenCalledWith("cards");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test studio/src/panes/FilterBar.test.tsx`

Expected: FAIL — `viewMode`/`onViewModeChange` props 不存在。

- [ ] **Step 3: Write minimal implementation**

在 `studio/src/panes/FilterBar.tsx` 中：

1. 引入图标：

```ts
import { IconLayoutGrid, IconList } from "@tabler/icons-react";
```

2. 新增 props：

```ts
export function FilterBar({
  filters,
  counts,
  categories,
  resultCount,
  onChange,
  busy,
  viewMode,
  onViewModeChange,
}: {
  filters: Filters;
  counts: Record<StatusFilter, number>;
  categories: string[];
  resultCount: number;
  onChange: (next: Filters) => void;
  busy?: boolean;
  viewMode: "table" | "cards";
  onViewModeChange: (mode: "table" | "cards") => void;
}) {
```

3. 在 `filter-controls` 的 Sort `label` 之后、`filter-count` 之前插入：

```tsx
<div className="view-toggle" role="group" aria-label="View mode">
  <button
    type="button"
    className={viewMode === "table" ? "view-toggle-btn view-toggle-active" : "view-toggle-btn"}
    aria-pressed={viewMode === "table"}
    aria-label="Table"
    onClick={() => onViewModeChange("table")}
  >
    <IconList size={18} />
  </button>
  <button
    type="button"
    className={viewMode === "cards" ? "view-toggle-btn view-toggle-active" : "view-toggle-btn"}
    aria-pressed={viewMode === "cards"}
    aria-label="Cards"
    onClick={() => onViewModeChange("cards")}
  >
    <IconLayoutGrid size={18} />
  </button>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test studio/src/panes/FilterBar.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add studio/src/panes/FilterBar.tsx studio/src/panes/FilterBar.test.tsx
git commit -m "feat(studio): add table/cards view toggle to FilterBar"
```

---

### Task 7: Add ItemCard and ItemGrid components

**Files:**
- Create: `studio/src/panes/ItemCard.tsx`
- Create: `studio/src/panes/ItemGrid.tsx`
- Create: `studio/src/panes/ItemGrid.test.tsx`

**Interfaces:**
- Consumes: `StudioItem`, `displayName(item, locale)`, `formatPrice(item)`, `coverImageUrl(item)`；选择状态与事件。
- Produces: `ItemCard` 和 `ItemGrid`，支持选择框与打开 drawer。

- [ ] **Step 1: Write the failing test**

新建 `studio/src/panes/ItemGrid.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemGrid } from "./ItemGrid";
import type { StudioItem } from "../api";

function makeItem(id: string, name: string, coverImage: string | null = null): StudioItem {
  return {
    id,
    categorySlug: "electronics",
    itemSlug: id.split("/")[1] ?? id,
    name,
    status: "available",
    currency: "USD",
    lowestTierAmount: 10,
    imageCount: coverImage ? 1 : 0,
    coverImage,
    localizedNames: { en: name },
    tags: [],
    listedDate: "2026-01-01",
  };
}

describe("ItemGrid", () => {
  it("renders one card per item", () => {
    render(
      <ItemGrid
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Lamp" })).toBeInTheDocument();
  });

  it("calls onOpen when the card main area is clicked", async () => {
    const onOpen = vi.fn();
    render(
      <ItemGrid
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Lamp" }));
    expect(onOpen).toHaveBeenCalledWith("electronics/lamp");
  });

  it("calls onToggle but not onOpen when the checkbox is clicked", async () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    render(
      <ItemGrid
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        displayLocale="en"
        onToggle={onToggle}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("electronics/lamp");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test studio/src/panes/ItemGrid.test.tsx`

Expected: FAIL — `ItemGrid` 不存在。

- [ ] **Step 3: Write minimal implementation**

新建 `studio/src/panes/ItemCard.tsx`：

```tsx
import { IconCameraOff } from "@tabler/icons-react";
import type { StudioItem } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { coverImageUrl, formatPrice } from "../itemDisplay";

export type ItemCardProps = {
  item: StudioItem;
  displayName: string;
  selected: boolean;
  onToggle: (id: string) => void;
  onClick: (id: string) => void;
};

export function ItemCard({ item, displayName, selected, onToggle, onClick }: ItemCardProps) {
  const src = coverImageUrl(item);
  return (
    <div className="item-card">
      <label className="item-card-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          aria-label={`Select ${displayName}`}
        />
      </label>
      <button type="button" className="item-card-main" onClick={() => onClick(item.id)}>
        <div className="item-card-image">
          {src !== null ? (
            <img src={src} alt="" loading="lazy" />
          ) : (
            <span className="item-card-placeholder" aria-hidden>
              <IconCameraOff size={32} />
            </span>
          )}
        </div>
        <div className="item-card-body">
          <div className="item-card-meta">
            <StatusBadge status={item.status} />
            <span className="item-card-category">{item.categorySlug}</span>
          </div>
          <h3 className="item-card-name">{displayName}</h3>
          <p className="item-card-price">{formatPrice(item)}</p>
        </div>
      </button>
    </div>
  );
}
```

新建 `studio/src/panes/ItemGrid.tsx`：

```tsx
import type { StudioItem } from "../api";
import { displayName } from "../itemDisplay";
import { ItemCard } from "./ItemCard";

export function ItemGrid({
  items,
  selectedIds,
  displayLocale,
  onToggle,
  onOpen,
}: {
  items: StudioItem[];
  selectedIds: Set<string>;
  displayLocale: string;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="item-grid" role="list">
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <ItemCard
            item={item}
            displayName={displayName(item, displayLocale)}
            selected={selectedIds.has(item.id)}
            onToggle={onToggle}
            onClick={onOpen}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test studio/src/panes/ItemGrid.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add studio/src/panes/ItemCard.tsx studio/src/panes/ItemGrid.tsx studio/src/panes/ItemGrid.test.tsx
git commit -m "feat(studio): add ItemCard and ItemGrid components"
```

---

### Task 8: Update ItemList table with thumbnail and display locale

**Files:**
- Modify: `studio/src/panes/ItemList.tsx`
- Create: `studio/src/panes/ItemList.test.tsx`

**Interfaces:**
- Consumes: `displayLocale: string` prop；`displayName`, `coverImageUrl`, `formatPrice`。
- Produces: 表格新增 Photo 列，Name 单元格使用当前语言，移除 Images 计数列。

- [ ] **Step 1: Write the failing test**

新建 `studio/src/panes/ItemList.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemList } from "./ItemList";
import type { StudioItem } from "../api";

function makeItem(id: string, name: string, coverImage: string | null = null): StudioItem {
  return {
    id,
    categorySlug: "electronics",
    itemSlug: id.split("/")[1] ?? id,
    name,
    status: "available",
    currency: "USD",
    lowestTierAmount: 10,
    imageCount: coverImage ? 1 : 0,
    coverImage,
    localizedNames: { en: name, zh: `${name}（中文）` },
    tags: [],
    listedDate: "2026-01-01",
  };
}

describe("ItemList", () => {
  it("renders a Photo column", () => {
    render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp")]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Photo" })).toBeInTheDocument();
  });

  it("shows an image when coverImage is present", () => {
    render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", "01-front.jpg")]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("/api/items/electronics/lamp/images/01-front.jpg");
  });

  it("shows a placeholder when coverImage is null", () => {
    render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", null)]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByLabelText("Select Lamp")).toBeInTheDocument();
  });

  it("switches the displayed name when displayLocale changes", () => {
    const { rerender } = render(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", null)]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="en"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Lamp" })).toBeInTheDocument();
    rerender(
      <ItemList
        items={[makeItem("electronics/lamp", "Lamp", null)]}
        selectedIds={new Set()}
        failedIds={new Set()}
        justStampedIds={new Set()}
        displayLocale="zh"
        onToggle={vi.fn()}
        onToggleAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Lamp（中文）" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test studio/src/panes/ItemList.test.tsx`

Expected: FAIL — `ItemList` 没有 `displayLocale` prop，也没有 Photo 列。

- [ ] **Step 3: Write minimal implementation**

修改 `studio/src/panes/ItemList.tsx` 为：

```tsx
import { useEffect, useState } from "react";
import { IconCameraOff } from "@tabler/icons-react";
import type { StudioItem } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { coverImageUrl, displayName, formatPrice } from "../itemDisplay";

function StatusCell({ status, pressed }: { status: string; pressed: boolean }) {
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

function Thumb({ item }: { item: StudioItem }) {
  const [error, setError] = useState(false);
  const src = coverImageUrl(item);
  if (src === null || error) {
    return (
      <span className="item-thumb-placeholder" aria-hidden>
        <IconCameraOff size={18} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="item-thumb"
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

export function ItemList({
  items,
  selectedIds,
  failedIds,
  justStampedIds,
  displayLocale,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  items: StudioItem[];
  selectedIds: Set<string>;
  failedIds: Set<string>;
  justStampedIds: Set<string>;
  displayLocale: string;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label="Select all items"
            />
          </th>
          <th scope="col">Photo</th>
          <th scope="col">Name</th>
          <th scope="col">Category</th>
          <th scope="col">Status</th>
          <th scope="col">Price</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const shownName = displayName(item, displayLocale);
          return (
            <tr
              key={item.id}
              className={[
                failedIds.has(item.id) ? "failed" : "",
                selectedIds.has(item.id) ? "selected" : "",
              ]
                .filter((c) => c !== "")
                .join(" ") || undefined}
            >
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => onToggle(item.id)}
                  aria-label={`Select ${shownName}`}
                />
              </td>
              <td className="photo-cell">
                <Thumb item={item} />
              </td>
              <td>
                <button type="button" className="name-button" onClick={() => onOpen(item.id)}>
                  {shownName}
                </button>
              </td>
              <td className="data">{item.categorySlug}</td>
              <td>
                <StatusCell status={item.status} pressed={justStampedIds.has(item.id)} />
              </td>
              <td className="data">{formatPrice(item)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test studio/src/panes/ItemList.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add studio/src/panes/ItemList.tsx studio/src/panes/ItemList.test.tsx
git commit -m "feat(studio): add thumbnail column and display locale to ItemList"
```

---

### Task 9: Wire App.tsx state and header

**Files:**
- Modify: `studio/src/App.tsx`
- Modify: `studio/src/components/LocaleSwitcher.tsx`（已在 Task 5 创建；本任务仅 import）

**Interfaces:**
- Consumes: `fetchItems` 返回的 `{ items, defaultLocale, availableLocales }`，`localStorage` 读写。
- Produces: 向 `FilterBar`、`ItemList`、`ItemGrid`、`LocaleSwitcher` 透传 `viewMode`/`displayLocale`。

- [ ] **Step 1: Make the change**

1. 在 `studio/src/App.tsx` 顶部新增 import：

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { bulkStatus, fetchItems, type StudioItem } from "./api";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { ItemGrid } from "./panes/ItemGrid";
```

2. 在 `App()` 内新增状态与 localStorage 读取 helper（放在现有 state 附近）：

```ts
type ViewMode = "table" | "cards";

function readViewMode(): ViewMode {
  const raw = localStorage.getItem("usedexchange-studio-view-mode");
  return raw === "cards" ? "cards" : "table";
}

function readDisplayLocale(defaultLocale: string): string {
  const raw = localStorage.getItem("usedexchange-studio-locale");
  return raw ?? defaultLocale;
}

export function App() {
  const [items, setItems] = useState<StudioItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [justStampedIds, setJustStampedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideAutoOpened, setGuideAutoOpened] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [exemptIds, setExemptIds] = useState<Set<string>>(new Set());
  const [changesToken, setChangesToken] = useState(0);
  const [changeCount, setChangeCount] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => readViewMode());
  const [defaultLocale, setDefaultLocale] = useState<string>("en");
  const [availableLocales, setAvailableLocales] = useState<string[]>(["en"]);
  const [displayLocale, setDisplayLocale] = useState<string>(() => readDisplayLocale("en"));

  const bumpChanges = useCallback(() => setChangesToken((t) => t + 1), []);

  const refresh = useCallback(async () => {
    const { items, defaultLocale: dl, availableLocales: al } = await fetchItems();
    setItems(items);
    setDefaultLocale(dl);
    setAvailableLocales(al);
    setDisplayLocale((prev) => (al.includes(prev) ? prev : dl));
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem("usedexchange-studio-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("usedexchange-studio-locale", displayLocale);
  }, [displayLocale]);

  // ... rest of existing handlers unchanged ...
```

3. 在 header 的 `ThemeToggle` 旁加入 `LocaleSwitcher`：

```tsx
<div className="head-actions">
  <LocaleSwitcher
    availableLocales={availableLocales}
    value={displayLocale}
    onChange={setDisplayLocale}
  />
  <ThemeToggle />
  {/* ... existing SyncBar, Config, Setup, Defaults, New item ... */}
</div>
```

4. 将 `FilterBar` 调用替换为：

```tsx
<FilterBar
  filters={filters}
  counts={counts}
  categories={categories}
  resultCount={visibleItems.length}
  onChange={changeFilters}
  busy={busy}
  viewMode={viewMode}
  onViewModeChange={setViewMode}
/>
```

5. 将 `ItemList` 调用包裹为条件渲染：

```tsx
{visibleItems.length > 0 && viewMode === "table" && (
  <ItemList
    items={visibleItems}
    selectedIds={selectedIds}
    failedIds={failedIds}
    justStampedIds={justStampedIds}
    displayLocale={displayLocale}
    onToggle={toggle}
    onToggleAll={toggleAll}
    onOpen={setOpenItemId}
  />
)}
{visibleItems.length > 0 && viewMode === "cards" && (
  <ItemGrid
    items={visibleItems}
    selectedIds={selectedIds}
    displayLocale={displayLocale}
    onToggle={toggle}
    onOpen={setOpenItemId}
  />
)}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`

Expected: PASS（如果仍失败，修复 App 中任何类型不匹配）。

- [ ] **Step 3: Commit**

```bash
git add studio/src/App.tsx
git commit -m "feat(studio): wire view mode, locale state, and persistence in App"
```

---

### Task 10: Add CSS styles in tokens.css

**Files:**
- Modify: `studio/src/tokens.css`

**Interfaces:**
- Consumes: 新增的 class names（`item-thumb`, `item-thumb-placeholder`, `view-toggle`, `view-toggle-btn`, `locale-switcher`, `item-grid`, `item-card`, etc.）。
- Produces: 视觉样式与响应式布局。

- [ ] **Step 1: Add table thumbnail styles**

在 `/* ── Item table ─────────────────────────────────────────────────────── */` 区域，`.name-button` 之前插入：

```css
.photo-cell {
  width: 3.25rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

.item-thumb {
  width: 2.5rem;
  height: 2.5rem;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.item-thumb-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  color: var(--ink-soft);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 2: Update mobile folded layout for the new Photo column**

当前 `@media (max-width: 40rem)` 的 `nth-child` 布局是 5 列（选择框 / Name / Category / Status / Price）。现在列顺序变为 选择框 / Photo / Name / Category / Status / Price，需要把 grid-template-columns 改为 `auto auto 1fr auto auto` 并重新分配：

```css
@media (max-width: 40rem) {
  .item-table thead {
    display: none;
  }

  .item-table tr {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    column-gap: var(--gap);
    row-gap: 0.15rem;
    align-items: center;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .item-table td {
    border: 0;
    padding: 0;
  }

  /* checkbox */
  .item-table td:nth-child(1) {
    grid-column: 1;
    grid-row: 1 / 3;
    align-self: start;
  }

  /* photo */
  .item-table td:nth-child(2) {
    grid-column: 2;
    grid-row: 1 / 3;
  }

  /* name */
  .item-table td:nth-child(3) {
    grid-column: 3 / 5;
    grid-row: 1;
    font-weight: 500;
  }

  /* category */
  .item-table td:nth-child(4) {
    grid-column: 3;
    grid-row: 2;
    color: var(--ink-soft);
  }

  /* status */
  .item-table td:nth-child(5) {
    grid-column: 4;
    grid-row: 2;
  }

  /* price */
  .item-table td:nth-child(6) {
    grid-column: 5;
    grid-row: 1 / 3;
    text-align: right;
  }

  .item-table tr.failed td {
    box-shadow: none;
  }

  .item-table tr.failed {
    box-shadow: inset 3px 0 0 var(--danger);
  }
}
```

删除旧的 5 列布局规则。

- [ ] **Step 3: Add view-toggle styles**

在 `/* ── Filter bar ───────────────────────────────────────────────────── */` 区域的 `.filter-count` 之后、媒体查询之前插入：

```css
.view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.15rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.view-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  color: var(--ink-soft);
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  cursor: pointer;
}

.view-toggle-btn:hover:not(.view-toggle-active) {
  color: var(--ink);
  background: var(--surface-2);
}

.view-toggle-active {
  color: var(--ink);
  background: var(--surface-2);
}
```

- [ ] **Step 4: Add locale-switcher styles**

在 header 区域 `.theme-toggle` 规则之后插入：

```css
.locale-switcher {
  height: 2.25rem;
  padding: 0 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--step-0);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 5: Add card grid styles**

在文件末尾（`/* ── Getting started checklist … */` 之前）新增一个分区：

```css
/* ── Card grid ───────────────────────────────────────────────────────── */

.item-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--gap-lg);
  padding: var(--gap) 1rem;
}

@media (min-width: 40rem) {
  .item-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 64rem) {
  .item-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 80rem) {
  .item-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.item-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.item-card-select {
  display: flex;
  align-items: center;
  gap: var(--gap);
  padding: 0.5rem 0.75rem 0;
}

.item-card-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.75rem 0.75rem;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}

.item-card-image {
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.item-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-card-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--ink-soft);
}

.item-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.item-card-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.item-card-category {
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.item-card-name {
  margin: 0;
  font-size: var(--step-1);
  font-weight: 500;
}

.item-card-price {
  margin: 0;
  font-family: var(--font-data);
  color: var(--ink-soft);
}
```

- [ ] **Step 6: Verify build**

Run: `pnpm type-check && pnpm lint`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add studio/src/tokens.css
git commit -m "feat(studio): style thumbnails, view toggle, locale switcher, and card grid"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: PASS（服务端与客户端测试全部通过）。

- [ ] **Step 2: Run type-check and lint**

Run: `pnpm type-check && pnpm lint`

Expected: PASS。

- [ ] **Step 3: Manual smoke test**

1. `pnpm studio` 启动 Seller Studio。
2. 创建带照片的商品，确认表格出现 40×40 缩略图。
3. 点击 FilterBar 的 Cards 按钮，确认切换到卡片网格视图。
4. 在 `content/config.ts` 临时把 `availableLocales` 改为 `["en", "zh"]` 并补充 `zh` translations，刷新 Studio，确认顶部出现语言切换器；切换后列表名称变化。
5. 打开商品 drawer，在 Translations 分组修改 `name_zh`，保存后切换语言确认生效。
6. 刷新页面，确认视图模式和语言选择被持久化。
7. 把 `content/config.ts` 改回单语言并确认 `LocaleSwitcher` 消失（恢复 seller 配置）。

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(studio): photos thumbnail, locale switcher, and card view"
```

---

## Self-Review

**1. Spec coverage:**
- 表格缩略图列 → Task 8。
- 卡片/网格视图 → Task 7。
- 顶部语言切换器 → Task 5 + Task 9。
- 使用 drawer 中已有 Translations 分组 → Task 9 未修改 `EditForm.tsx`/`fields.ts`，确认现有分组正常工作。
- `/api/items` 返回 `defaultLocale`/`availableLocales` → Task 1。
- `coverImage` 与 `localizedNames` 计算规则 → Task 1。
- 持久化 `localStorage` → Task 9。
- 错误处理（无图、加载失败、单语言不渲染）→ Task 1、Task 8（`onError` 回退）、Task 5。
- 测试覆盖 → 每个 task 都有对应测试。

**2. Placeholder scan:** 无 TBD/TODO/"add appropriate error handling"/"similar to Task N" 等占位符；每个步骤都给出了具体代码或命令。

**3. Type consistency：**
- `StudioItem` 新增 `coverImage` 和 `localizedNames`；所有测试工厂、组件 props、API 返回类型一致。
- `fetchItems` 返回 `{ items, defaultLocale, availableLocales }`；`App.tsx` 解构字段名一致。
- `displayName`/`coverImageUrl`/`formatPrice` 全部来自 `itemDisplay.ts`。
- `viewMode` 类型 `"table" | "cards"` 在 `FilterBar` 与 `App` 中一致。
