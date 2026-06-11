# UsedExchange — 技术要求

**版本：** 0.9.1  
**日期：** 2026-06-01  
**配套：** DESIGN.md v0.9.1

---

## 1. 运行时与工具要求

| 要求 | 最低版本 | 推荐版本 |
|---|---|---|
| Node.js | 20 LTS | 22 LTS |
| pnpm | 9 | 9 |
| Git | 2.40 | 最新版 |
| 操作系统（开发） | macOS 13、Ubuntu 22.04、Windows 11 WSL2 | macOS 15+ |

---

## 2. npm 依赖

### 2.1 生产依赖

| 包 | 版本 | 用途 |
|---|---|---|
| `next` | `^15.0.0` | 框架：路由、SSG、图片优化 |
| `react` | `^19.0.0` | UI 运行时 |
| `react-dom` | `^19.0.0` | DOM 渲染器 |
| `zod` | `^3.23.0` | 带安全默认值的 JSON schema 验证 |
| `react-markdown` | `^9.0.0` | 渲染 Markdown `description` 字段 |
| `remark-gfm` | `^4.0.0` | GitHub Flavored Markdown 表格 + 删除线 |
| `clsx` | `^2.1.0` | 条件 class 合并 |
| `tailwind-merge` | `^2.3.0` | Tailwind class 去重（用于 `cn()` 工具） |
| `fuse.js` | `^7.0.0` | 客户端全文搜索；构建时构建索引 |
| `@vercel/analytics` | `^1.3.0` | Vercel Analytics——Vercel 之外为空操作 |
| `@vercel/speed-insights` | `^1.0.0` | Vercel Speed Insights——同上 |

### 2.2 Aceternity UI peer 要求

Aceternity 组件通过其 CLI 单独安装。以下包大多数组件需要：

| 包 | 版本 | 用途 |
|---|---|---|
| `framer-motion` | `^11.0.0` | Aceternity 组件使用的动画 |
| `@tabler/icons-react` | `^3.0.0` | 联系平台按钮使用的图标集 |

> Aceternity 组件在安装时复制到 `components/ui/`，视为源文件——不要将 Aceternity 作为包依赖安装。

### 2.3 开发依赖

| 包 | 版本 | 用途 |
|---|---|---|
| `typescript` | `^5.5.0` | 类型检查 |
| `@types/node` | `^20.0.0` | 加载器/脚本中 `fs`、`path` 的 Node.js 类型 |
| `@types/react` | `^19.0.0` | React 类型 |
| `@types/react-dom` | `^19.0.0` | ReactDOM 类型 |
| `tailwindcss` | `^4.0.0` | 实用 CSS——v4，CSS 优先 |
| `@tailwindcss/postcss` | `^4.0.0` | Tailwind v4 的 PostCSS 集成 |
| `@tailwindcss/typography` | `^0.5.13` | Markdown 描述的 Prose 样式 |
| `eslint` | `^9.0.0` | 代码检查 |
| `eslint-config-next` | `^15.0.0` | Next.js ESLint 预设 |
| `prettier` | `^3.3.0` | 代码格式化 |
| `prettier-plugin-tailwindcss` | `^0.6.0` | 自动排序 Tailwind class |
| `tsx` | `^4.15.0` | 无需单独编译步骤运行 TypeScript 脚本 |
| `next-sitemap` | `^4.2.0` | 在 `postbuild` 中生成 `sitemap.xml` + `robots.txt` |

### 2.4 图片存储提供商依赖

根据 `siteConfig.imageStorage.provider` **有条件需要**。只安装与所选提供商匹配的：

| 包 | 版本 | 提供商 | 用途 |
|---|---|---|---|
| `@vercel/blob` | `^0.27.0` | `"vercel-blob"` | 通过 SDK 上传图片到 Vercel Blob CDN |
| `@aws-sdk/client-s3` | `^3.600.0` | `"cloudflare-r2"` | 上传图片到 Cloudflare R2（S3 兼容 API） |

> 这些包**不**在任何应用代码中导入——只在 `scripts/sync-images.ts` 中（仅构建时运行于 Node.js）。应列为 **devDependencies**。

```bash
# Cloudflare R2（推荐——零出站费用，适用于 GitHub Pages 或任意主机）
pnpm add -D @aws-sdk/client-s3

# Vercel Blob（用于 Vercel 部署）
pnpm add -D @vercel/blob
```

---

## 3. 环境变量

所有内容配置位于 `content/config.ts`（TypeScript，类型检查，在卖家管理的 `content/` 文件夹内）。只有基础设施密钥和部署特定覆盖使用 `.env`。

### 3.1 变量

| 变量 | 必填 | 何时 | 设置位置 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 否 | 始终 | `.env.local`（本地）· GitHub Actions 变量 · Vercel 环境变量。覆盖 `siteConfig.baseUrl`。 |
| `CF_R2_ACCOUNT_ID` | **是** | `imageStorage.provider === "cloudflare-r2"` | 仅 `.env.local`——CI 中绝不需要 |
| `CF_R2_ACCESS_KEY_ID` | **是** | 同上 | 仅 `.env.local` |
| `CF_R2_SECRET_ACCESS_KEY` | **是** | 同上 | 仅 `.env.local` |
| `CF_R2_BUCKET` | **是** | 同上 | 仅 `.env.local` |
| `CF_R2_PUBLIC_URL` | **是** | 同上 | 仅 `.env.local`。存储桶的公开基础 URL（自定义域名或 `r2.dev` URL）。 |
| `BLOB_READ_WRITE_TOKEN` | **是** | `imageStorage.provider === "vercel-blob"` | `.env.local`（本地）· Vercel 环境变量 |

`imageStorage.provider === "local"` 时，应用**必须在零 `.env` 文件的情况下正确构建和提供服务**。

### 3.2 `.env.example`

```bash
# ── 站点 URL 覆盖（可选）────────────────────────────────────────────────────
# NEXT_PUBLIC_SITE_URL=https://your-domain.com

# ── Cloudflare R2（imageStorage.provider === "cloudflare-r2" 时必填）────────
# 仅本地——复制到 .env.local；GitHub Actions 或 CI 中绝不需要。
# pnpm upload-images 只在你的机器上运行。
# CF_R2_ACCOUNT_ID=
# CF_R2_ACCESS_KEY_ID=
# CF_R2_SECRET_ACCESS_KEY=
# CF_R2_BUCKET=usedexchange-images
# CF_R2_PUBLIC_URL=https://images.your-domain.com

# ── Vercel Blob（imageStorage.provider === "vercel-blob" 时必填）────────────
# 在：Vercel Dashboard → Storage → Blob → <store> → Settings 生成
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

---

## 4. next.config.ts 规范

```ts
import type { NextConfig } from "next";
import { siteConfig } from "./content/config";

const remotePatterns: NextConfig["images"]["remotePatterns"] = [];

if (siteConfig.imageStorage.provider === "vercel-blob") {
  remotePatterns.push({
    protocol: "https",
    hostname: "*.public.blob.vercel-storage.com",
  });
}

if (siteConfig.imageStorage.provider === "cloudflare-r2") {
  const r2Url = new URL(process.env.CF_R2_PUBLIC_URL ?? "https://example.com");
  remotePatterns.push({
    protocol: "https",
    hostname: r2Url.hostname,
  });
}

const nextConfig: NextConfig = {
  ...(siteConfig.deploymentMode === "static" && { output: "export" }),

  images: {
    unoptimized: siteConfig.deploymentMode === "static",
    remotePatterns,
  },

  poweredByHeader: false,  // 抑制 X-Powered-By 头（轻微安全加固）
};

export default nextConfig;
```

---

## 5. TypeScript 配置

`tsconfig.json` 必须包含：

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,    // 捕获 array[i] = undefined
    "noImplicitOverride": true,
    "paths": {
      "@/*": ["./*"]                     // 别名：@/content/config → ./content/config
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`noUncheckedIndexedAccess` 是必填的——加载器对目录读取的结果进行数组索引，这会在编译时捕获不安全访问。

---

## 6. Zod Schema 要求

### 6.1 解析契约

- 所有地方使用 `schema.safeParse(raw)`。绝不使用 `.parse()`（对错误输入抛出）。
- 失败时：记录含物品路径 + ZodError 摘要的警告；返回所有有效字段与默认值合并的物品。
- 成功时：返回解析后、默认值合并的对象。

### 6.2 默认值合并辅助函数

```ts
function withDefaults<T>(partial: Partial<T>, defaults: T): T {
  return { ...defaults, ...Object.fromEntries(
    Object.entries(partial).filter(([, v]) => v !== null && v !== undefined)
  )} as T;
}
```

### 6.3 每字段 Schema 验证严格度

| 字段 | 无效值时的行为 |
|---|---|
| `name`（必填） | 如果为空字符串或缺失 → 完全跳过该物品；记录警告 |
| `status` | 如果不是有效枚举值 → 默认 `"available"` |
| `condition` | 如果不是有效枚举值 → 默认 `"good"` |
| `price.tiers` | 如果不是数组 → 视为 `[]` |
| 任何数字字段 | 如果缺失 → Zod 默认（大多数数字字段为 `null`；`quantity` 为 `1`）。如果存在但为 NaN 或非数字 → `null`。如果为负数 → `null`。零（`0`）是有效值，**不**转换为 `null`。 |
| `price.currency` | 如果缺失 → 回退到 `siteConfig.currency` |
| 任何 URL 字段 | 如果 URL 解析失败 → `""`（不渲染） |
| `listed_date` / `sold_date` | 期望格式：仅日期 `YYYY-MM-DD`。也接受完整 ISO 时间戳——只解析日期部分。其他字符串 → `null`。 |

---

## 7. 图片同步脚本 — `scripts/sync-images.ts`

### 图片存储适配器接口

所有三个提供商实现此接口：

```ts
export interface ImageStorageAdapter {
  syncImage(sourcePath: string, manifestKey: string, checksum: string): Promise<string>;
  loadChecksums(saved: Record<string, string>): void;
  getUpdatedChecksums(): Record<string, string>;
}
```

### 两种执行模式

| 模式 | 由...触发 | 图片来源 | 上传？ | 写清单？ | 打印备份提醒？ |
|---|---|---|---|---|---|
| `upload` | `pnpm upload-images`（卖家机器） | `content/items/`（照片在本地） | 是——到配置的 CDN 提供商 | 是——**提交到 git** | **是** |
| `dev-sync` | `pnpm dev`（卖家机器） | `content/items/`（照片在本地） | 否——复制到 `public/items/` | 否 | 否 |
| `build-check` | `pnpm build` / Vercel 预构建 | 无图片（CI runner 上已 gitignore） | 否——清单已提交 | 否——读取现有清单 | 否 |

所有模式始终将 `content/contact/**` 复制到 `public/contact/`（最后步骤）。

### 脚本执行步骤

#### `upload` 模式（`pnpm upload-images`）

1. 验证配置提供商所需环境变量；缺失时打印清晰错误并以 exit 1 退出
2. 加载 `.image-cache/checksums.json`（缺失时创建空 `{}`）
3. 实例化所选适配器，传入保存的校验和
4. 扫描 `content/items/**` 中的图片文件（正则：`/\.(jpg|jpeg|png|webp|gif)$/i`）
5. 对每张图片：计算 SHA-256；调用 `adapter.syncImage()`（跳过未更改的）；记录 CDN URL
6. **清除过时条目**：从清单中删除其源文件不再存在于 `content/items/` 的所有清单键（处理已删除物品文件夹——CDN blob 不删除，只删除 URL 引用）
7. 复制 `content/contact/**` → `public/contact/`
8. 写入 `lib/generated/image-manifest.json` ← **此文件必须提交到 git**
9. 写入更新后的 `.image-cache/checksums.json`
10. **照片质量检查**（建议性警告，绝不阻断上传）：任意图片 < 800px 宽、任意图片 > 8 MB、物品文件夹有图片但无 `cover.*`、物品文件夹完全没有图片
11. 打印摘要：`[upload-images] provider=vercel-blob  uploaded=12  skipped=47  purged=3  total=59  warnings=2`
12. 打印**备份提醒**（见下文）
13. 任何不可恢复错误时以 exit code 1 退出

### 备份提醒输出

每次成功 `upload` 运行后打印到 stdout：

```
╔══════════════════════════════════════════════════════════════╗
║  ⚠️   备份提醒                                                 ║
║                                                              ║
║  你的物品照片没有被 git 追踪。                                  ║
║  云存储（Vercel Blob / R2）是传输层，                          ║
║  不是备份——可能被意外清空。                                     ║
║                                                              ║
║  请确保你的 content/ 文件夹已备份到：                           ║
║    • 外置硬盘或 Time Machine                                   ║
║    • iCloud Drive / Google Drive / Dropbox                   ║
║                                                              ║
║  后续步骤：                                                    ║
║    git add lib/generated/image-manifest.json                 ║
║    git add content/**/*.json content/config.ts               ║
║    git commit -m "chore: update listings"                    ║
╚══════════════════════════════════════════════════════════════╝
```

### `package.json` 脚本

```json
{
  "scripts": {
    "setup-ui":        "bash scripts/setup-ui.sh",
    "upload-images":   "tsx scripts/sync-images.ts --mode upload",
    "create-item":     "tsx scripts/create-item.ts",
    "create-template": "tsx scripts/create-template.ts",
    "new":             "tsx scripts/create-item.ts",
    "mark-sold":       "tsx scripts/mark-sold.ts",
    "prebuild":        "tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts",
    "build":           "next build",
    "postbuild":       "tsx scripts/postbuild.ts",
    "dev":             "tsx scripts/sync-images.ts --mode dev-sync && next dev --turbo",
    "type-check":      "tsc --noEmit",
    "lint":            "eslint . --max-warnings 0",
    "format":          "prettier --write ."
  }
}
```

---

## 8. 内容加载器 API — `lib/content/loader.ts`

所有函数都是异步的（使用 `fs/promises`），仅在构建时运行（不在浏览器包中）。

```ts
// 按显示顺序返回所有有效分类（DESIGN.md §6 排序逻辑）
export async function loadCategories(): Promise<Category[]>

// 返回分类中所有物品，按可见性规则过滤（排除草稿；排除过期已售）
export async function loadItemsByCategory(categorySlug: string): Promise<Item[]>

// 返回单个物品，如果文件夹/item.json 缺失或 name 为空则返回 null
export async function loadItem(
  categorySlug: string,
  itemSlug: string
): Promise<Item | null>

// ⚠️  仅用于首页"最近上架"条
// 比 loadItemsByCategory() 有更严格的筛选：
//   - 仅 status === "available"（reserved、pending、sold、draft 全部排除）
// 结果按 listedDate 降序排列，限制为 siteConfig.recentlyListedCount
// 绝不用于 /all 页面
export async function loadAllItems(): Promise<Item[]>

// 返回 /sold 档案页的所有已售物品
// 无保留过滤——显示所有曾经 status 为 "sold" 的物品
// 按 soldDate 降序排列（soldDate 缺失时回退到 listedDate）
export async function loadSoldItems(): Promise<Item[]>
```

### `Category` 类型

```ts
export type Category = {
  slug: string;
  displayName: string;
  description: string;
  icon: string;
  sortOrder: number | null;
  availableItemCount: number;
  coverImage: string | null;
};
```

### `PriceTier` 和 `Price` 类型

```ts
export type PriceTier = {
  label: string;
  miles_min?: number;   // 缺失 = 无下限（开放起点）
  miles_max?: number;   // 缺失 = 无上限（开放式；匹配 Infinity 距离）
  amount: number;
};

export type Price = {
  currency: string;
  tiers: PriceTier[];
  negotiable: boolean;
};
```

> `miles_max` 对开放式档位是**缺失**的（JSON 中键不存在）——不是一个大数字。`resolveItemPrice` 不将大数字视为开放式。

---

## 9. `AdaptiveImage` 组件规范

```tsx
type Props = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  priority?: boolean;
};
```

- `siteConfig.deploymentMode === "vercel"` 时：渲染 `next/image` 的 `<Image>`
- `siteConfig.deploymentMode === "static"` 时：渲染带相同 props 的 `<img>`（无优化）
- 这是唯一导入 `next/image` 的组件。所有其他组件使用 `<AdaptiveImage>`。

---

## 10. 联系区块组件规范

### `ContactSection`（客户端组件）

```ts
type ContactSectionProps = {
  item?: Item;
  preferredPayment: string[];
  contactNote: string;
};
```

行为：
- `siteConfig.contact.reveal_behavior === "click"`：渲染"显示联系信息"按钮；点击后显示平台
- `reveal_behavior === "always"`：立即渲染平台
- `preferredPayment` 数组为空时不渲染该块
- `contactNote` 为空或仅空白时不渲染该块
- **Footer 用法：** 传入 `preferredPayment={[]}` 和 `contactNote=""`（省略 `item`）

### `PlatformButton`

- 链接式：`<a href={constructUrl(platform, item, resolvedPrice)} target="_blank" rel="noopener noreferrer">`
- 二维码式：`<button onClick={() => setModalOpen(true)}>`

**Discord 特殊处理：**
Discord `value` 可以是：
- 数字用户 ID（17–19 位）→ `https://discord.com/users/{value}`（私信链接）
- 服务器邀请码（如 `abc123`）→ `https://discord.gg/{value}`（服务器邀请）

检测：如果 `value` 匹配 `/^\d{17,19}$/` 则视为用户 ID；否则视为服务器邀请码。

### `QRModal`（客户端组件）

- 使用 Aceternity `Modal` 或原生 `<dialog>` 元素
- 渲染 `<AdaptiveImage src={platform.qr_image} alt={platform.label + " 二维码"} />`
- 点击背景或 Escape 键关闭

---

## 11. 路由与静态生成

### `/[category]` 的 `generateStaticParams`

```ts
export async function generateStaticParams() {
  const categories = await loadCategories();
  return categories.map((c) => ({ category: c.slug }));
}
```

### `/[category]/[item]` 的 `generateStaticParams`

```ts
export async function generateStaticParams() {
  const categories = await loadCategories();
  const pairs = await Promise.all(
    categories.map(async (c) => {
      const items = await loadItemsByCategory(c.slug);
      return items.map((i) => ({ category: c.slug, item: i.itemSlug }));
    })
  );
  return pairs.flat();
}
```

- `draft` 物品从参数中排除（不生成页面）
- 超过保留期的 `sold` 物品从参数中排除（不生成页面）

---

## 12. 性能要求

| 指标 | 目标 |
|---|---|
| Lighthouse 性能（移动端） | ≥ 80 |
| Lighthouse 无障碍 | ≥ 90 |
| 最大内容绘制（LCP） | < 2.5 秒（Vercel 模式） |
| 总阻塞时间（TBT） | < 300 毫秒 |
| JS 包（首次加载） | < 150 KB（gzip 压缩后） |
| 图片格式 | 优先 WebP；接受 JPEG/PNG |
| 图片大小（封面） | 建议 ≤ 1200px 宽；不强制，仅文档说明 |

---

## 13. 浏览器支持

| 浏览器 | 最低版本 |
|---|---|
| Chrome | 109 |
| Safari | 16 |
| Firefox | 115 |
| Edge | 109 |
| 移动端 Safari（iOS） | 16 |
| Samsung Internet | 21 |

不支持 IE。CSS Grid 和 `aspect-ratio` 可自由使用。

---

## 14. 无障碍要求

- 所有图片必须有非空 `alt` 文字（最低为物品名称）
- 所有可交互元素（按钮、链接）必须有可见焦点环（Tailwind `focus-visible:ring`）
- 正文颜色对比度 ≥ 4.5:1，大文字 ≥ 3:1
- 弹窗（`QRModal`）必须捕获焦点并在关闭时恢复焦点
- 状态和成色徽章不得只依赖颜色（包含文字标签）
- 每个路由的页面 `<title>` 和 `<meta name="description">` 必须填充

---

## 15. 安全要求

| 关切 | 缓解措施 |
|---|---|
| `reserved_for` 字段 | 任何页面上均不渲染；在加载器内部类型中仅返回时剥离 |
| 外部链接 | 所有新标签打开的 `<a>` 标签使用 `rel="noopener noreferrer"` |
| `original_link` 渲染 | 由 Zod 验证为 URL 后才渲染；无效时为空字符串 |
| JSON 解析 | Zod schema；原始 `JSON.parse` 错误已捕获并记录；物品跳过 |
| 路径遍历 | 图片路径仅从已知 slug 构建；运行时无用户提供的路径段 |
| `meta_description` | 截断到 160 字符；不作为 HTML 渲染（仅纯文本） |
| `poweredByHeader: false` | 抑制 `X-Powered-By: Next.js` 响应头 |
| 运费计算 API 密钥（可选，§29） | 永不出现在静态构建产物中；仅以 `wrangler secret` 形式存于 `workers/shipping-rate-proxy`，浏览器通过 `siteConfig.shipping.proxyUrl` 调用 |

---

## 16. 代码检查与格式化规则

`.eslintrc`（扩展 `next/core-web-vitals`），附加规则：

```json
{
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error", "log"] }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "import/no-default-export": "off"
  },
  "overrides": [
    {
      "files": ["scripts/**/*.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

`prettier.config.js`：

```js
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  plugins: ["prettier-plugin-tailwindcss"],
};
```

---

## 17. 文件命名约定

| 类型 | 约定 | 示例 |
|---|---|---|
| React 组件 | PascalCase `.tsx` | `ItemCard.tsx` |
| Hooks | camelCase，`use` 前缀 | `useFilters.ts` |
| 库模块 | camelCase `.ts` | `loader.ts`、`schema.ts` |
| 脚本 | kebab-case `.ts` | `sync-images.ts` |
| 配置文件 | kebab-case `.ts` | `content/config.ts`、`next.config.ts` |
| 内容文件夹 | kebab-case | `ikea-desk-lamp/`、`cast-iron-pan/` |
| 内容 JSON | 固定名称 | `item.json`、`_category.json` |

---

## 18. Git 约定

### 分支策略
- `develop` — 活跃开发；代码变更、技能更新
- `release` — 从版本 tag 自动生成；推送时部署到 GitHub Pages
- 功能分支：`feat/`、`fix/`、`chore/` 前缀

### 提交消息格式（Conventional Commits）
```
feat(item): add QR modal for WeChat contact
fix(loader): handle missing sold_date gracefully
chore(deps): upgrade next to 15.1.0
```

### `.gitignore` 必要添加
```
# ── 物品照片（仅本地 + CDN——不提交到 git）────────────────────────────────
content/items/**/*.jpg
content/items/**/*.jpeg
content/items/**/*.png
content/items/**/*.webp
content/items/**/*.gif
content/items/**/*.JPG
content/items/**/*.JPEG
content/items/**/*.PNG
content/items/**/*.WEBP
content/items/**/*.GIF

# ── 生成的公共资产副本（构建/开发时填充）────────────────────────────────────
public/items/
public/contact/
public/search-index.json

# ── 增量上传缓存（仅卖家机器）────────────────────────────────────────────────
.image-cache/

# ── Next.js 构建输出 ──────────────────────────────────────────────────────
.next/
out/
```

**有意不在 gitignore 中：**
- `content/**/*.json` — 库存元数据，始终提交
- `content/config.ts` — 站点配置，始终提交
- `content/contact/` — 二维码图片来源（微小，git 追踪；`public/contact/` 是生成的副本）
- `lib/generated/image-manifest.json` — CDN URL 映射，`pnpm upload-images` 后提交

---

## 19. 部署清单

### GitHub Pages + Cloudflare R2 ✅（推荐路径）

> ⚠️ **R2 凭据仅本地。** `pnpm upload-images` 在卖家机器上运行。
> GitHub Actions 只运行 `pnpm build`（build-check 模式——读取已提交清单，不上传）。
> **GitHub Actions 中不需要任何密钥。**

**一次性设置（做一次，之后忘记）：**
- [ ] 运行 `pnpm setup-ui` → 安装所有 Aceternity UI 组件 → 提交 `components/ui/`
- [ ] 在 `content/config.ts` 中设置 `deploymentMode: "static"` 和 `imageStorage.provider: "cloudflare-r2"`
- [ ] **Cloudflare：创建 R2 存储桶**
  - Cloudflare Dashboard → R2 → 创建存储桶
  - 启用公共访问或附加自定义子域名
  - 创建 R2 API 令牌：**对象读写**，仅限此存储桶
- [ ] **在 R2 存储桶上配置 CORS**——浏览器从你的站点加载图片所需：
  ```json
  [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
  ```
  测试期间使用 `["*"]`；上线前限制为你的生产域名。
- [ ] 复制 `.env.example` → `.env.local`；填写 `CF_R2_*` 值
- [ ] **GitHub Pages：启用 GitHub Actions 部署**
  - GitHub 仓库 → Settings → Pages → 来源：**GitHub Actions**
  - GitHub 仓库 → Settings → Variables → Actions → 添加 `NEXT_PUBLIC_SITE_URL`
- [ ] 自定义域名：设置 DNS CNAME
- [ ] 至少运行一次 `pnpm upload-images` 以创建初始 `lib/generated/image-manifest.json`
- [ ] `git push` → GitHub Actions 触发 → 站点在你的域名上线

**添加或更新物品（定期卖家工作流）：**
1. - [ ] 在 `content/items/` 中创建/编辑物品文件夹 + `item.json`
2. - [ ] 将照片放入物品文件夹
3. - [ ] 运行 `pnpm upload-images` → 照片上传到 R2，清单更新
4. - [ ] 阅读并遵循打印的**备份提醒**——备份你的 `content/` 文件夹
5. - [ ] `git add content/**/*.json lib/generated/image-manifest.json && git commit && git push`
6. - [ ] GitHub Actions 自动构建并部署——无 CDN 交互；只读取已提交清单

---

### Vercel + Vercel Blob（备用）

**一次性设置：**
- [ ] 运行 `pnpm setup-ui` → 提交 `components/ui/`
- [ ] 在 `content/config.ts` 中设置 `deploymentMode: "vercel"` 和 `imageStorage.provider: "vercel-blob"`
- [ ] 将 GitHub 仓库连接到 Vercel 项目；在 Vercel 项目设置中将部署分支设为 `release`
- [ ] Vercel Dashboard → Storage → 创建 Blob 存储 → 复制 `BLOB_READ_WRITE_TOKEN`
- [ ] 将 `BLOB_READ_WRITE_TOKEN` 添加到 Vercel 项目环境变量
- [ ] 复制 `.env.example` → `.env.local`；填写 `BLOB_READ_WRITE_TOKEN`
- [ ] 至少运行一次 `pnpm upload-images` → 提交 `lib/generated/image-manifest.json`

---

### 自托管静态——本地图片（简单，无云存储）

- [ ] 在 `content/config.ts` 中设置 `deploymentMode: "static"` 和 `imageStorage.provider: "local"`
- [ ] 在有 `content/items/` 照片的机器上运行 `pnpm build`
- [ ] `out/` 包含所有图片；将整个 `out/` 部署到任意静态主机

---

## 20. 地理定位与距离定价——技术规范

见 DESIGN.md §17 了解完整架构原理。本节涵盖实施细节。

### 浏览器 API

```ts
navigator.geolocation.getCurrentPosition(
  (pos) => { /* granted */ },
  (err) => { /* denied (err.code === 1) or unavailable (err.code === 2) or timeout (err.code === 3) */ },
  { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
);
```

- `enableHighAccuracy: false` — 城市级别距离精度足够；避免移动端 GPS 预热缓慢
- `timeout: 8000` — 8 秒后回退到最高价格
- `maximumAge: 300_000` — 最多 5 分钟重用缓存位置；避免页面导航时重新提示

### Haversine 距离公式

```ts
// lib/utils/haversine.ts — 纯函数，零依赖
export function haversineInMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8; // 地球半径（英里）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### `LocationPriceBar` 组件规范

**渲染状态：**

| 地理状态 / 来源 | 显示的 UI |
|---|---|
| `idle` | 与 `pending` 相同——hook 立即从 `idle` 过渡到 `pending` |
| `pending` | `"🔍 正在检测你的位置…"` 带骨架占位符 |
| `granted`，来源 = `detected` | `"📍 ~{N} 英里，距 {label}——显示你的距离价格"` + "修改"链接 |
| 来源 = `manual` | `"📍 {N} 英里（手动设置）"` + "重置为检测值"链接 |
| 来源 = `fallback`（已拒绝/不可用） | `"📍 位置不可用——显示最高价格"` + "输入距离"链接 |

**"修改距离"控件：**
- 点击打开内联数字输入框（不是弹窗），单位为英里
- 只接受正整数；内联拒绝非数字输入
- 按 Enter 或点击"应用"调用 `onOverride(enteredMiles)`
- "重置"清除覆盖（`onOverride(null)`）并重新显示检测值或回退值

---

## 21. UI 组件适配器规范

见 DESIGN.md §18 了解设计原理、槽位表和核心原则。本节涵盖设置脚本、TypeScript 类型、适配器 props 和数据规范化规范。

### 设置脚本 — `scripts/setup-ui.sh`

开发者在初始克隆后运行一次。安装所有 27 个受支持的 Aceternity 组件（13 背景 + 3 网格 + 4 图库 + 7 卡片）。`components/ui/` 中的结果文件必须提交到 git——之后，卖家无需运行任何安装命令。

```bash
#!/usr/bin/env bash
# scripts/setup-ui.sh
# 运行一次：pnpm setup-ui

set -e
echo "安装所有受支持的 Aceternity UI 组件..."

# ── 背景槽位 ──────────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/aurora-background
npx shadcn@latest add @aceternity/background-beams-demo
npx shadcn@latest add @aceternity/background-beams-with-collision
npx shadcn@latest add @aceternity/background-gradient-animation
npx shadcn@latest add @aceternity/background-boxes-demo
npx shadcn@latest add @aceternity/wavy-background
npx shadcn@latest add @aceternity/vortex
npx shadcn@latest add @aceternity/shooting-stars-and-stars-background-demo
npx shadcn@latest add @aceternity/meteors
npx shadcn@latest add @aceternity/grid-background-demo
npx shadcn@latest add @aceternity/background-lines
npx shadcn@latest add @aceternity/spotlight
npx shadcn@latest add @aceternity/spotlight-new

# ── 物品网格槽位 ──────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/bento-grid
npx shadcn@latest add @aceternity/layout-grid
npx shadcn@latest add @aceternity/focus-cards

# ── 图库槽位 ──────────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/apple-cards-carousel-demo
npx shadcn@latest add @aceternity/images-slider
npx shadcn@latest add @aceternity/carousel
npx shadcn@latest add @aceternity/parallax-scroll parallax-scroll-2

# ── 物品卡片槽位 ──────────────────────────────────────────────────────────────
npx shadcn@latest add @aceternity/card-hover-effect
npx shadcn@latest add @aceternity/card-spotlight
npx shadcn@latest add @aceternity/3d-card
npx shadcn@latest add @aceternity/evervault-card
npx shadcn@latest add @aceternity/wobble-card
npx shadcn@latest add @aceternity/direction-aware-hover
npx shadcn@latest add @aceternity/glare-card

echo "完成。将 components/ui/ 文件提交到 git。"
```

### TypeScript 类型 — `lib/ui/types.ts`

```ts
export type BackgroundOption =
  | "none" | "aurora" | "background-beams" | "background-beams-collision"
  | "background-gradient-animation" | "background-boxes" | "wavy" | "vortex"
  | "shooting-stars" | "meteors" | "grid-and-dot" | "background-lines"
  | "spotlight" | "spotlight-new";

export type ItemGridOption = "simple" | "bento-grid" | "layout-grid" | "focus-cards";

export type GalleryOption =
  | "simple" | "apple-cards-carousel" | "images-slider" | "carousel" | "parallax-scroll";

export type ItemCardOption =
  | "simple" | "card-hover-effect" | "card-spotlight" | "3d-card"
  | "evervault-card" | "wobble-card" | "direction-aware-hover" | "glare-card";

export type UIConfig = {
  background: BackgroundOption;
  itemGrid:   ItemGridOption;
  gallery:    GalleryOption;
  itemCard:   ItemCardOption;
};
```

---

## 22. v1 额外功能规范

### 22.1 全文搜索

**依赖：** `fuse.js ^7.0.0`

**构建时索引生成**（`lib/search/index.ts`）：

```ts
export type SearchIndexEntry = {
  slug: string;          // "{categorySlug}/{itemSlug}"
  href: string;          // "/houseware/ikea-lamp"
  name: string;
  description: string;
  brand: string;
  model: string;
  tags: string[];
  course: string;
  isbn: string;
  edition: string;
  coverImage: string | null;
};

export async function buildSearchIndex(): Promise<SearchIndexEntry[]>
```

索引在 `prebuild` 步骤（`next build` 之前）写入 `public/search-index.json`。它被 gitignore（每次构建重新生成；不提交）。必须放在 `public/` ——不是 `lib/generated/`——这样 Next.js 作为静态文件提供，`SearchBar` 可以通过 HTTP 在运行时获取。

**`SearchBar` 组件：**
- 通过 `next/dynamic` 的 `{ ssr: false }` 延迟加载以避免 hydration 不匹配
- 挂载时获取 `/search-index.json`
- **开发模式行为：** 在 `pnpm dev` 中，`search-index.json` 在运行至少一次 `pnpm build` 前不存在。如果获取返回 404，`SearchBar` 以空索引初始化（不崩溃，不向用户显示错误状态）
- 用 fuse.js 初始化键：`["name", "description", "brand", "model", "tags", "course", "isbn", "edition"]`
- 防抖 150 毫秒实时显示结果

### 22.2 深色模式（自动——系统偏好）

在 Tailwind v4 中，`darkMode: "media"` 是**默认行为**——无需任何配置条目，`prefers-color-scheme` 自动跟随。

```css
/* app/globals.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
/* 不需要 dark mode 指令——v4 默认使用媒体查询 dark mode */
```

```js
// postcss.config.mjs（Next.js 15 + Tailwind v4 需要）
export default { plugins: { "@tailwindcss/postcss": {} } };
```

> ⚠️ **不要**向 `tailwind.config.ts` 添加 `darkMode: "media"`。那是 Tailwind v3 语法，在 v4 中是 no-op（或导致弃用警告）。

### 22.3 卖家 CLI 工具

所有脚本只写入 `content/`——卖家不需要接触任何其他目录。

#### `pnpm create-item <category>/<name>`

1. 验证 `<category>` 匹配 `content/items/` 中的现有文件夹（或创建它并打印警告）
2. 创建 `content/items/<category>/<name>/` 文件夹
3. 如果存在则复制 `content/items/<category>/_template.json`；否则复制 `content/items/_template.json`；否则使用内置默认模板
4. 将副本重命名为 `item.json`；用人性化物品名替换 `{name}` 占位符
5. 如果设置了 `$EDITOR` 则在其中打开 `item.json`；否则打印："已创建...—立即编辑它。"

#### `pnpm mark-sold <category>/<name>`

1. 验证 `content/items/<category>/<name>/item.json` 存在；不存在时以清晰错误退出 1
2. 读取当前 `item.json`
3. 设置 `status: "sold"` 和 `sold_date: <今天的 ISO 8601 格式（YYYY-MM-DD）>`
4. 就地写入更新后的 `item.json`（保留所有其他字段）
5. 打印：`已将 content/items/<category>/<name> 标记为已售（sold_date: YYYY-MM-DD）。`

#### `pnpm create-template [category]`

1. 如果提供了 `[category]`：创建 `content/items/<category>/_template.json`
2. 无参数：创建 `content/items/_template.json`（全局默认）
3. 模板是所有字段都作为描述性占位符字符串的完整 `item.json`

### 22.4 JSON-LD 结构化数据

**`lib/utils/jsonld.ts`**（服务器安全，无 `"use client"`）：
```ts
export function buildProductJsonLd(item: Item, baseUrl: string): object
export function buildBreadcrumbJsonLd(crumbs: { name: string; href: string }[]): object
```

**`components/common/JsonLd.tsx`**（服务器组件）：
```tsx
// 渲染：<script type="application/ld+json">{JSON.stringify(data)}</script>
```

### 22.5 Open Graph、Twitter 卡片、Pinterest 富 Pin

所有在物品详情页的 `generateMetadata` 中添加：

```ts
// Twitter 卡片
"twitter:card": "summary_large_image"
"twitter:title": item.name

// Pinterest 富 pin
"og:type": "product"
"product:price:amount": 最高档位价格（字符串）
"product:price:currency": item.price.currency
```

### 22.6 Vercel Analytics + Speed Insights

```tsx
// app/layout.tsx——仅当配置标志为 true 时渲染：
{siteConfig.analytics.vercel       && <Analytics />}
{siteConfig.analytics.speedInsights && <SpeedInsights />}
```

两者在非 Vercel 环境中均为空操作（优雅降级）。Vercel Hobby 计划免费。

### 22.7 站点地图

`next-sitemap.config.js` 在项目根目录：
```js
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  generateRobotsTxt: true,
  exclude: ['/preview/*'],
};
```

`scripts/postbuild.ts`（由 `postbuild` npm 生命周期钩子调用）：
```ts
import { siteConfig } from "@/content/config";
import { execSync } from "child_process";

if (siteConfig.sitemap.enabled) {
  console.log("[postbuild] 生成站点地图...");
  execSync("next-sitemap", {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.baseUrl,
    },
  });
} else {
  console.log("[postbuild] sitemap.enabled 为 false——跳过 next-sitemap");
}
```

### 22.8 国际化（i18n）

**设计：** 单次部署多语区。所有语区变体打包进一次部署。访客通过 `SiteHeader` 中的 `LocaleSwitcher` 组件在运行时切换语言。所选语区存储在 `localStorage` 中；SSG 静态 HTML 始终渲染 `defaultLocale`。

### 两层翻译体系

| 层 | 覆盖内容 | 存储位置 | 填写者 |
|---|---|---|---|
| **UI 字符串** | 全部 71 个按钮/标签/徽章/标题文本 | `content/config.ts` → `i18n.translations.{locale}` | 卖家（通过 `/setup` 或手动编辑） |
| **物品内容** | 每件物品的 `name` 和 `description` | `content/items/**/item.json` → `name_{locale}`、`description_{locale}` | `/translate-items` AI 技能或手动编辑 |

**SiteConfig i18n 类型（`lib/config/types.ts`）：**

```ts
export type I18nConfig = {
  defaultLocale: string;                          // ISO 639-1；在静态 HTML（SSG）中渲染
  availableLocales: string[];                     // 所有支持的语区；长度 > 1 时显示 LocaleSwitcher
  showLocaleSwitcher: boolean;                    // 在 SiteHeader 中显示切换器
  translations: Record<string, Partial<UIStrings>>; // 每语区 UI 字符串字典
};
```

**`UIStrings` 类型（71 个键，`lib/config/types.ts`）：**

涵盖所有可见 UI 标签：导航链接、板块标题、联系标签、出价表单、分享按钮、元数据表头、成色/状态徽章、筛选/排序选项、新鲜度标签、页面横幅、成色说明、位置栏文本、定价表头。

`lib/i18n/translations.ts` 中的 `EN_FALLBACK` 常量为每个键提供内置英文默认值，确保即使 `content/config.ts` 配置有误，UI 标签也不会为空。

**运行时架构 — 语言切换：**

```
访客加载页面
  │
  ├── SSG HTML 以 defaultLocale 内容渲染（item.name，而非 item.name_zh）
  │
  └── LocaleProvider（客户端组件，包装 app/layout.tsx children）
        ├── 读取 localStorage.getItem("locale")
        ├── 缺失或不在 availableLocales 中时回退到 siteConfig.i18n.defaultLocale
        └── 通过 React context 暴露 { locale, setLocale }

LocaleSwitcher（SiteHeader 中的客户端组件）
  ├── siteConfig.i18n.availableLocales.length <= 1 时隐藏
  └── 更改时：调用 setLocale(newLocale) + localStorage.setItem("locale", newLocale)

useLocale() hook — 从 LocaleProvider context 读取当前语区
useT() hook     — 返回当前语区的 UIStrings 字典（合并顺序：EN_FALLBACK → defaultLocale 字典 → 当前语区字典）
```

**`lib/i18n/` 模块：**

```ts
// lib/i18n/translations.ts
// EN_FALLBACK: UIStrings — 所有 71 个键的内置英文默认值
// 被 useT()（客户端）和 getTranslations()（服务端）用作安全兜底

// lib/i18n/getTranslations.ts
// 服务端字符串解析。始终基于 defaultLocale 解析。
// 供无法调用 hook 的 Server Component（app 页面）使用。
export function getTranslations(): UIStrings

// components/i18n/useT.ts（客户端）
// 解析顺序：EN_FALLBACK → defaultLocale 字典 → 当前语区字典
export function useT(): UIStrings
```

**`lib/utils/i18n.ts` — 物品级语区解析：**

```ts
// 返回给定语区的本地化字段值，回退到英文默认值
// 示例：getLocalizedField(item, "name", "zh") → item.name_zh ?? item.name
export function getLocalizedField(
  item: Record<string, unknown>,
  field: string,    // 如 "name"、"description"
  locale: string    // 如 "zh"、"es"
): string
```

**客户端与服务端渲染面：**

`name` 和 `description` 的访客渲染存在于**客户端**组件（`ItemCard`、`LocalizedItemContent`）中，调用 `getLocalizedField(item, …, locale)`。所有其他客户端组件通过 `useT()` 获取 UI 标签。Server Component（`generateMetadata`、`<title>`、OG 标签、JSON-LD）调用 `getTranslations()`，始终返回 `defaultLocale` 字典，**不支持**运行时切换。

> **SEO 说明（v1 有意限制）：** 只有 `defaultLocale` 内容出现在静态 HTML 和可爬取的元数据/JSON-LD 中。非默认语区在访客切换后在客户端渲染，不单独索引。

**构建时完整性校验：**

`scripts/check-config.ts` 在每次构建时验证 `availableLocales` 中的每个语区都有包含全部 71 个必需键的 `translations` 条目。如有语区缺失或不完整，构建将以描述性错误信息失败。

**添加新语区步骤：**

1. 将语区代码加入 `content/config.ts` 的 `siteConfig.i18n.availableLocales`。
2. 添加包含全部 71 个 `UIStrings` 键（已翻译）的 `translations.{locale}` 块。
3. 在 Zod schema（`lib/content/schema.ts`）和 `Item` 类型（`lib/content/types.ts`）中添加 `name_{locale}` 和 `description_{locale}`——与现有的 `name_zh` / `description_zh` 模式相同。
4. 运行 `/translate-items` AI 技能批量填充各 `item.json` 中的 `name_{locale}` / `description_{locale}`，或手动添加。
5. `availableLocales.length > 1` 时，`LocaleSwitcher` 自动出现。

> **语区回退：** `getLocalizedField` 对缺少 `name_{locale}` 字段的物品静默回退到英文，不崩溃、不空渲染。`useT()` / `getTranslations()` 通过 `EN_FALLBACK` 回退，确保 UI 标签永不为空。

### 22.9 支付平台——Venmo 与 Zelle

**Venmo（链接式）：**
- `type: "venmo"`，`value: "username"` → `<a href="https://venmo.com/u/{value}">Venmo</a>`
- 存在物品上下文时，追加 `?txn=pay&audience=private&note={encodedItemName}`

**Venmo（物品级付款请求——`item.venmo_payment_request`）：**
- 这是物品级 `item.json` 字段，**不是** `contact.platforms[]` 条目
- 非空 URL 时，物品详情页渲染**"通过 Venmo 支付"**按钮（与 Stripe"支付定金"按钮并排）
- 为空时不渲染按钮；Venmo 联系平台链接（如已配置）仍在联系区块中可用

**Zelle（仅二维码）：**
- `type: "zelle"`，`qr_image: "/contact/zelle-qr.png"` → 二维码弹窗
- Zelle 无公开主页 URL；二维码是唯一可分享格式
- 卖家在银行 App 中生成其 Zelle 二维码并保存到 `content/contact/zelle-qr.png`

### 22.10 分享按钮

**`components/common/ShareButton.tsx`**（客户端）：
```tsx
// 点击时：
// 1. 尝试 navigator.share({ title: item.name, text: item.metaDescription, url: window.location.href })
// 2. 如果 share API 不可用：navigator.clipboard.writeText(url) → 显示"已复制！"提示（2 秒）
```

### 22.11 `formatRelativeDate` 工具

**`lib/utils/date.ts`**：
```ts
// `now` 省略时默认为 `new Date()`——仅在测试中显式传入
// 纯函数——可安全在服务器和客户端代码中导入
export function formatRelativeDate(isoDate: string | null, now?: Date): string
// 返回："今天" | "昨天" | "3 天前" | "2 周前" | "1 个月前" | ""
// isoDate 为 null/无效时返回 ""（优雅；调用者隐藏该元素）
```

**`FreshnessLabel.tsx` 是客户端组件**（`"use client"`）。使用 `useState<string | null>(null)` 和 `useEffect(() => { setLabel(formatRelativeDate(listedDate)) }, [listedDate])`。第一次 effect 触发前组件渲染 `null`——相对日期随后针对访客的实时浏览器时钟（`new Date()`）计算，不是 SSG 构建时钟。

### 22.12 SETUP_GUIDE.md

项目根目录的独立文件，完全用简明语言为非技术用户编写。涵盖：

1. **添加新物品** — 创建文件夹，填写 `item.json`，添加照片，运行 `pnpm upload-images`
2. **标记物品已售** — `pnpm mark-sold category/item-name`（无需编辑 JSON）
3. **从模板创建新物品** — `pnpm new category/item-name`
4. **修改价格** — 编辑 `item.json` 价格档位中的 `amount`
5. **上传新照片** — 添加到物品文件夹，运行 `pnpm upload-images`
6. **备份什么** — 将整个 `content/` 文件夹备份到外置驱动器或云备份
7. **找谁** — 如果出了问题，联系设置此系统的 CS 学生

指南中无代码、无 git 命令、无终端术语。

---

## 23. AI 技能文件——技术规范

见 DESIGN.md §20 了解设计原理、卖家工作流和兼容性表。本节涵盖技能文件格式和必要内容。

**无 SDK，无 API 密钥，无额外依赖。** 卖家使用其现有 AI 编程工具。

### 23.1 技能文件结构

所有三个技能文件位于 `.claude/skills/`，遵循此模板：

```markdown
# 技能：<名称>
<!-- Claude Code 技能列表中显示的一行描述 -->

## 上下文
<!-- AI 需要了解的项目结构简要摘要 -->
<!-- 包含：content/ 文件夹布局、item.json 字段列表、content/config.ts 结构 -->

## 指令
<!-- AI 应该做什么的逐步编号列表 -->

## Schema 参考
<!-- 粘贴 DESIGN.md §5 中的完整 item.json schema -->

## 输出规范
<!-- 要写入的确切文件路径、无法确定时的字段默认值 -->
<!-- 约束：status 始终为 "draft"，reserved_for 从不填写 -->

## 示例
<!-- 1–2 个示例输入/输出对 -->
```

### 23.7 `content/` 规则——在技能文件中强制执行

所有三个技能文件包含明确指令：

> **不要修改 `content/` 目录之外的任何文件。不要编辑 `app/`、`components/`、`lib/`、`scripts/` 或任何配置文件。你的输出限于：`content/config.ts`、`content/items/*/item.json` 和 `content/items/*/_category.json`。**

---

## 24. CI/CD 管道——GitHub Actions 工作流规范

工作流文件位于 `.github/workflows/deploy.yml`，随项目发布。它在每次推送到 `release` 分支时处理构建 + 部署到 GitHub Pages。CI 中不需要 CDN 凭据——构建读取已提交的 `lib/generated/image-manifest.json`。

### 24.1 工作流文件

```yaml
# .github/workflows/deploy.yml
name: 部署到 GitHub Pages

on:
  push:
    branches: [release]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: 安装依赖
        run: pnpm install --frozen-lockfile

      - name: 构建
        run: pnpm build
        env:
          NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}
          # 注意：此处不需要 CDN 凭据（CF_R2_* / BLOB_READ_WRITE_TOKEN）。
          # sync-images.ts 以 build-check 模式运行：读取已提交的 image-manifest.json。
          # pnpm upload-images（上传步骤）只在卖家本地机器上运行。

      - name: 上传 Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: out/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: 部署到 GitHub Pages
        uses: actions/deploy-pages@v4
        id: deployment
```

### 24.2 GitHub 仓库设置（一次性）

| 设置 | 值 | 位置 |
|---|---|---|
| Pages 来源 | **GitHub Actions** | 仓库 → Settings → Pages → Source |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | 仓库 → Settings → Variables → Actions |
| 自定义域名 | 你的域名 | 仓库 → Settings → Pages → Custom domain |

> **不需要密钥。** `NEXT_PUBLIC_SITE_URL` 是仓库变量（不是密钥）——不敏感。CDN 凭据从不添加到 GitHub Actions。

---

## 25. 测试策略

### 25.1 理念

项目有一小组良好隔离的纯函数和清晰的构建时/运行时边界。测试针对有非平凡逻辑的函数；组件渲染和路由通过 `pnpm build`（TypeScript + Next.js 静态生成）作为编译时门控。

### 25.2 测试运行器

| 包 | 版本 | 用途 |
|---|---|---|
| `vitest` | `^2.0.0` | 测试运行器；快速，ESM 原生，兼容 TypeScript |
| `@vitest/coverage-v8` | `^2.0.0` | 覆盖率报告（可选） |

```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

### 25.3 测试文件位置

测试与被测模块并置，使用 `.test.ts` 后缀：

```
lib/utils/pricing.test.ts         ← resolveItemPrice 边缘情况
lib/utils/haversine.test.ts       ← haversineInMiles 已知城市对
lib/utils/date.test.ts            ← formatRelativeDate 边界条件
lib/utils/i18n.test.ts            ← getLocalizedField 回退行为
lib/content/schema.test.ts        ← Zod schema 解析 + 默认值合并
lib/content/loader.test.ts        ← 带固定 content/ 文件夹的加载器
scripts/sync-images.test.ts       ← 清单构建 / 清除 / 校验和逻辑
```

### 25.4 必要测试用例

#### `lib/utils/pricing.test.ts`

| 用例 | 输入 | 预期 |
|---|---|---|
| 距离在档位内 | `D=3`，档位 `[{max:5, $15}, {min:5, max:15, $20}]` | `$15` 档位 |
| 距离在精确边界 | `D=5` | `$15` 档位（含：`D ≤ miles_max`） |
| 距离在间隙中 | `D=5.5`，档位 max=5 和 min=6 | `miles_max=5` 的档位（最近的从下方） |
| Infinity（已拒绝/回退） | `D=Infinity`，无开放式档位 | 金额最高的档位 |
| Infinity 有开放式档位 | `D=Infinity`，最后档位无 `miles_max` | 开放式档位 |
| 空档位 | `price.tiers: []` | `null`（→"联系询价"） |

#### `lib/utils/shipping.test.ts`

| 用例 | 输入 | 预期 |
|---|---|---|
| `isShippingTier` — null 档位 | `null` | `false` |
| `isShippingTier` — 有边界的档位 | `miles_max: 5` 的档位 | `false` |
| `isShippingTier` — 开放式档位 | `miles_max` 缺失的档位 | `true` |
| `resolveShippingPayer` — 物品无覆盖 | `price.shipping_payer` 缺失，`siteConfig.shipping.defaultPayer: "seller"` | `"seller"` |
| `resolveShippingPayer` — 物品有覆盖 | `price.shipping_payer: "seller"`，默认 `"buyer"` | `"seller"` |
| `canEstimateShipping` — 配置缺失 | `shipping: undefined` | `false` |
| `canEstimateShipping` — 已禁用 | `shipping.enabled: false` | `false` |
| `canEstimateShipping` — 缺少重量/尺寸 | 任一为 `null` | `false` |
| `canEstimateShipping` — 非运费档位 | 解析后档位有 `miles_max` | `false` |
| `canEstimateShipping` — 满足所有前置条件 | 已启用 + 重量 + 尺寸 + 开放式档位 | `true` |

#### `lib/utils/haversine.test.ts`

| 用例 | 输入 | 预期（±0.5 英里） |
|---|---|---|
| 同一点 | `(37.7749,-122.4194)` 到自身 | `0` |
| 旧金山 → 洛杉矶 | `(37.7749,-122.4194)` 到 `(34.0522,-118.2437)` | `≈ 347 英里` |
| 短距离 | 相距 1 公里 | `≈ 0.62 英里` |

#### `lib/content/schema.test.ts`

| 用例 | 输入 | 预期 |
|---|---|---|
| 缺少 `name` | `{}` | 物品跳过 |
| 无效 `status` 枚举 | `status: "unknown"` | 默认为 `"available"` |
| 负数 | `age_years: -1` | `null` |
| 零数字 | `original_price: 0` | `0`（不是 null） |
| 无效 URL | `original_link: "not-a-url"` | `""` |
| `listed_date` 中的完整 ISO 时间戳 | `"2026-05-28T10:00:00Z"` | 日期部分正确解析 |

### 25.5 在 CI 中运行测试

在 `.github/workflows/deploy.yml` 中添加在 `build` 之前运行的 `test` 作业：

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    needs: test        # 只有测试通过才构建
    # ... 其余不变
```

---

## 26. 错误监控与构建告警

### 26.1 构建失败告警（GitHub Pages 路径）

GitHub Actions 在任何工作流作业失败时自动给仓库所有者发送邮件。无需配置。

### 26.2 构建失败告警（Vercel 路径）

Vercel 在部署失败时给项目所有者发送邮件。无需配置。

### 26.3 运行时 JavaScript 错误监控（可选，未来）

v1 中未配置运行时错误监控。站点完全静态，客户端 JavaScript 表面最小。如需运行时监控：

| 选项 | 集成点 | 备注 |
|---|---|---|
| Vercel Analytics | 已接线；追踪页面浏览量，无错误追踪 | Hobby 计划免费 |
| Sentry | 添加 `@sentry/nextjs`；配置 `sentry.client.config.ts` | 免费层涵盖个人站点 |

---

## 27. 图片上传失败恢复

### 27.1 失败模式

| 失败 | 检测 | 恢复 |
|---|---|---|
| 缺少环境变量（R2 或 Blob） | 上传模式步骤 1：检查所有必要变量；打印清晰错误指出缺失变量；在任何上传前以 exit 1 退出 | 卖家将缺失变量添加到 `.env.local` 并重新运行 |
| 上传期间网络超时 | 提供商 SDK 抛出；每个文件捕获 | 记录警告；跳过该文件；继续处理其余文件；不为失败文件更新清单或校验和 → 下次运行重新上传 |
| 部分运行（脚本被中途终止） | 校验和和清单在成功运行**结束**时写入（步骤 8–9） | 不完整运行不更新清单和校验和；重新运行时重新上传上次提交清单状态中没有的所有文件 |

### 27.2 原子清单写入

清单以原子方式写入，防止损坏的半写入文件破坏 CI 构建：

```ts
const MANIFEST_PATH = "lib/generated/image-manifest.json";
const MANIFEST_TMP  = `${MANIFEST_PATH}.tmp`;

// 先写入临时文件，然后重命名（在 POSIX 上是原子的）
await writeFile(MANIFEST_TMP, JSON.stringify(manifest, null, 2), "utf-8");
await rename(MANIFEST_TMP, MANIFEST_PATH);
```

### 27.3 每个文件的错误隔离

上传失败按文件隔离。一个失败的图片不会中止整个运行：

```ts
for (const [manifestKey, sourcePath] of imagesToUpload) {
  try {
    const url = await adapter.syncImage(sourcePath, manifestKey, checksum);
    updatedManifest[manifestKey] = url;
    uploadedCount++;
  } catch (err) {
    console.warn(`[upload-images] WARN: 上传 ${manifestKey} 失败——${(err as Error).message}`);
    // 保留之前的清单条目（如有）以防 CDN URL 丢失
    if (previousManifest[manifestKey]) {
      updatedManifest[manifestKey] = previousManifest[manifestKey];
    }
    warnCount++;
  }
}
```

### 27.4 退出码汇总

| 结果 | 退出码 | 清单已写入？ |
|---|---|---|
| 所有上传成功 | `0` | 是 |
| 部分文件失败（仅警告） | `0` | 是（失败文件保留之前 CDN URL 或缺失） |
| 环境变量缺失 | `1` | 否 |
| `content/items/` 不可读 | `1` | 否 |
| 清单写入失败 | `1` | 否（之前清单完整） |

---

## 28. SiteConfig 结构验证

### 28.1 原理

`content/config.ts` 是 TypeScript 文件——TypeScript 提供编译时类型检查。但 TypeScript 无法捕获在类型级别结构无效的_值_（如 `location.lat: 999` 是有效的 `number` 但无效的纬度）。构建时运行时 Zod 验证传递在页面生成前捕获这些。

### 28.2 验证模块

```ts
// lib/config/validate.ts（仅 Node.js——绝不在浏览器包中导入）
import { z } from "zod";
import { siteConfig } from "@/content/config";

const SiteConfigSchema = z.object({
  name:    z.string().min(1, "siteConfig.name 不能为空"),
  baseUrl: z.string().url("siteConfig.baseUrl 必须是有效 URL（https://...）"),
  deploymentMode: z.enum(["static", "vercel"]),
  location: z.object({
    lat: z.number().min(-90).max(90, "siteConfig.location.lat 必须在 -90 到 90 之间"),
    lng: z.number().min(-180).max(180, "siteConfig.location.lng 必须在 -180 到 180 之间"),
    label: z.string().min(1, "siteConfig.location.label 不能为空"),
  }),
  currency: z.string().length(3, "siteConfig.currency 必须是 3 字母 ISO 4217 代码"),
  contact: z.object({
    platforms: z.array(z.object({ type: z.string() })).min(1,
      "siteConfig.contact.platforms 至少需要一个条目"),
  }),
  i18n: z.object({
    defaultLocale: z.string().min(2),
    availableLocales: z.array(z.string().min(2)).min(1),
  }).refine((i) => i.availableLocales.includes(i.defaultLocale), {
    message: "siteConfig.i18n.defaultLocale 必须列在 siteConfig.i18n.availableLocales 中",
  }),
});

export function validateSiteConfig(): void {
  const result = SiteConfigSchema.safeParse(siteConfig);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    console.error(
      `\n[config-validate] content/config.ts 有无效值：\n${messages}\n`
    );
    process.exit(1);
  }
  console.log("[config-validate] content/config.ts 验证通过");
}
```

### 28.3 集成点

在 `scripts/sync-images.ts` 顶部调用（任何文件扫描之前），以便无效配置立即以人类可读的错误使构建失败：

```ts
// scripts/sync-images.ts——第一条可执行语句
import { validateSiteConfig } from "@/lib/config/validate";
validateSiteConfig();   // 配置无效时以清晰消息退出 1
```

---

## 29. 运费计算器集成——技术规范

> 完整功能设计与原理见 [DESIGN_zh.md §21](DESIGN_zh.md)。本节涵盖实现约定。

### 29.1 概述

运费估算功能**完全可选**，仅当 `siteConfig.shipping` 已定义且 `enabled: true` 时才启用。该功能纯粹是附加性的：缺失时不引入任何新的网络请求、UI 元素或构建期要求。

### 29.2 `SiteConfig.shipping` 类型（`lib/config/types.ts`）

```ts
shipping?: {
  enabled: boolean;
  proxyUrl: string;                          // Cloudflare Worker 端点（workers/shipping-rate-proxy）
  defaultPayer: "seller" | "buyer";
  origin: { zip: string; country: string };  // 卖家发货地
};
```

### 29.3 `Price.shipping_payer`（`lib/content/types.ts` + `schema.ts`）

```ts
// lib/content/types.ts
shipping_payer?: "seller" | "buyer";

// lib/content/schema.ts
shipping_payer: z.enum(["seller", "buyer"]).optional().catch(undefined),
```

单品级覆盖 `siteConfig.shipping.defaultPayer`，由 `resolveShippingPayer()`（`lib/utils/shipping.ts`，见 ARCHITECTURE_zh.md）解析。

### 29.4 `useShippingRate` hook（`components/pricing/useShippingRate.ts`）

`"use client"` hook，状态机：

```ts
type ShippingRateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rate: ShippingRate }
  | { status: "error" };

function useShippingRate(): {
  state: ShippingRateState;
  fetchRate: (input: {
    destinationZip: string;
    destinationCountry: string;
    weight: Weight;
    dimensions: Dimensions;
    currency: string;
  }) => void;
};
```

- 使用 `AbortController` ref，每次调用 `fetchRate()` 会取消上一次未完成的请求——防止旧响应覆盖新输入的邮编结果。
- 向 `siteConfig.shipping.proxyUrl` POST JSON；非 2xx 响应或网络错误均转入 `{ status: "error" }`。

### 29.5 `ShippingEstimator` 组件（`components/item/ShippingEstimator.tsx`）

`"use client"` 组件，props：

```ts
{
  price: Price;
  resolvedTier: PriceTier | null;
  weight: Weight | null;
  dimensions: Dimensions | null;
}
```

- 当 `!canEstimateShipping(...)`（见 `lib/utils/shipping.ts`）时返回 `null`——一次判断即覆盖"未启用"、"数据缺失"、"非运费档位"三种情况。
- `resolveShippingPayer() === "seller"` → 渲染 `t.shippingIncludedBySeller`，不发起网络请求。
- `resolveShippingPayer() === "buyer"` → 渲染邮编输入框；`onBlur`/回车触发 `fetchRate()`；加载中显示 `t.shippingCalculating`，成功显示解析后的 `ShippingRate`，出错显示 `t.shippingUnavailable`。

### 29.6 Cloudflare Worker 约定（`workers/shipping-rate-proxy`）

独立部署；从根目录 `tsconfig.json`（`exclude`）和 `eslint.config.mjs`（`ignores`）中排除——拥有自己的 `package.json`、`tsconfig.json` 和 `wrangler.toml`。

**请求** —— `POST /`（CORS 限制为 `ALLOWED_ORIGIN`）：

```ts
{
  destinationZip: string;
  destinationCountry: string;
  weight: { value: number; unit: "kg" | "lb" };
  dimensions: { length: number; width: number; height: number; unit: "cm" | "in" };
  currency: string;
}
```

**响应**（`RateResponseBody`）：

```ts
{
  amount: number;
  currency: string;
  carrier: string;
  service: string;
  estimatedDays: number | null;
}
```

- `Env` 变量：`SHIPPING_PROVIDER`（`"shippo" | "easypost"`）、`ALLOWED_ORIGIN`、`ORIGIN_ZIP`、`ORIGIN_COUNTRY`。
- `Env` 密钥（通过 `wrangler secret put` 设置，绝不提交到 git）：`SHIPPO_API_KEY` 和/或 `EASYPOST_API_KEY`。
- Worker 调用配置的服务商，将单位转换为该服务商 API 所需格式（`toInches()` 等），并在返回的多个选项中取最低运费。
- `OPTIONS` 请求返回 CORS 预检响应头；非 `POST` 方法返回 `405`。

### 29.7 新增 i18n 键（`UIStrings`，`lib/config/types.ts` + `lib/i18n/translations.ts`）

| 键 | 英文默认值 |
|---|---|
| `shippingEstimateLabel` | `"Estimated shipping"` |
| `shippingZipPlaceholder` | `"ZIP code"` |
| `shippingCalculating` | `"Calculating shipping…"` |
| `shippingUnavailable` | `"Shipping estimate unavailable"` |
| `shippingIncludedBySeller` | `"Free shipping (included by seller)"` |
| `shippingEstimateSuffix` | `"shipping"` |

### 29.8 部署

面向卖家的操作指南：`workers/shipping-rate-proxy/README.md` 和 `.claude/commands/setup-shipping.md`。不影响 `pnpm build`、CI 或 GitHub Pages 部署——Worker 通过 `workers/shipping-rate-proxy/` 目录下的 `wrangler deploy` 单独部署。

---

*本文档是 v1 实施的权威技术规范。*
