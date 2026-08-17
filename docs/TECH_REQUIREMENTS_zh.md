# UsedExchange — 技术要求

**版本：** 0.10.0  
**日期：** 2026-08-02  
**配套：** DESIGN.md v0.10.0

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
| `jsonc-parser` | `^3.3.1` | 将 `item.json`/`_category.json` 作为 JSONC 解析（允许 `//` 注释和尾随逗号）；用于加载器和所有 JSONC 编辑脚本——`lib/content/loader.ts`、`scripts/mark-sold.ts`、`scripts/lib/itemEdit.ts`（Studio PATCH 路径 + `applyFieldEdits`） |
| `@vercel/analytics` | `^1.3.0` | Vercel Analytics——Vercel 之外为空操作 |
| `@vercel/speed-insights` | `^1.0.0` | Vercel Speed Insights——同上 |
| `motion` | `^12.40.0` | Aceternity 组件使用的动画库（以 `motion/react` 导入；**不**使用旧版 `framer-motion` 包） |
| `three` | `^0.184.0` | 3D Aceternity 背景组件的 WebGL 引擎 |
| `@react-three/fiber` | `^9.6.1` | `three` 的 React 渲染器，用于 3D 背景组件 |
| `next-themes` | `^0.4.6` | 基于 class 的深色模式 provider（`ThemeProvider`）；见 §22.2 |
| `simplex-noise` | `^4.0.3` | 动画 Aceternity 背景的程序化噪声 |
| `mini-svg-data-uri` | `^1.4.4` | Aceternity 背景组件使用的紧凑 SVG data-URI 辅助库 |

### 2.2 Aceternity UI peer 要求

Aceternity 组件通过其 CLI 单独安装。以下包大多数组件需要：

| 包 | 版本 | 用途 |
|---|---|---|
| `motion` | `^12.40.0` | Aceternity 组件使用的动画（以 `motion/react` 导入） |
| `three` / `@react-three/fiber` | `^0.184.0` / `^9.6.1` | 3D Aceternity 背景组件 |
| `simplex-noise` / `mini-svg-data-uri` | `^4.0.3` / `^1.4.4` | Aceternity 组件使用的程序化背景 |
| `@tabler/icons-react` | `^3.44.0` | 联系平台按钮和 UI 使用的图标集（直接依赖） |

> Aceternity 组件在安装时复制到 `components/ui/`，视为源文件——不要将 Aceternity 作为包依赖安装。
>
> 每个 UI 槽位适配器（`components/ui-adapters/`）只导入卖家明确安装并注册的 Aceternity 组件。只安装你实际配置的组件。完整的槽位 ↔ 组件注册表和安装命令见 DESIGN.md §18。

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
| `sharp` | `^0.33.5` | 上传前剥离图片 EXIF/GPS 元数据（`lib/images/stripMetadata.ts`），并为 `scripts/sync-images.ts` 提供图片宽度质量检查 |
| `vitest` | `^2.0.0` | 测试运行器（见 §25） |
| `@vitest/coverage-v8` | `^2.0.0` | `pnpm test:coverage` 的 v8 覆盖率报告 |
| `vite` | `^8.1.5` | Seller Studio（`pnpm studio`）的开发服务器 + 打包器 |
| `@vitejs/plugin-react` | `^6.0.4` | Studio Vite 应用的 React 支持 |
| `jsdom` | `^25.0.1` | 组件测试的 DOM 环境 |
| `@testing-library/react` | `^16.3.2` | jsdom 测试中的组件渲染/查询 |
| `@testing-library/dom` | `^10.4.1` | `@testing-library/react` 的 peer |
| `@eslint/eslintrc` | `^3.0.0` | `FlatCompat` 桥接，使旧版 `next/core-web-vitals` 配置可用于 ESLint 9 flat config（`eslint.config.mjs`） |
| `@types/three` | `^0.184.1` | `three` 的类型 |
| `@fontsource/ibm-plex-sans` | `^5.3.0` | 自托管字体 |
| `@fontsource/ibm-plex-mono` | `^5.3.0` | 自托管字体 |

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

### 2.5 图片存储——Vercel devDependency 说明

> ⚠️ `@vercel/blob`、`@aws-sdk/client-s3` 和 `tsx` 被列为 **devDependencies**。Vercel 在构建步骤中默认安装 devDependencies。如果你自定义了安装命令（如 `pnpm install --prod`），`prebuild` 脚本将失败。请确保 Vercel 的安装命令**不**跳过 devDependencies。

---

## 3. 环境变量

所有内容配置位于 `content/config.ts`（TypeScript，类型检查，在卖家管理的 `content/` 文件夹内）。只有基础设施密钥和部署特定覆盖使用 `.env`。

### 3.1 变量

| 变量 | 必填 | 何时 | 设置位置 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 否 | 始终 | `.env.local`（本地）· GitHub Actions 变量 · Vercel 环境变量。覆盖 `siteConfig.baseUrl`；部署 URL 与配置的 base 不同时很有用。回退到 `siteConfig.baseUrl`。 |
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

### 3.3 使用云提供商时的本地开发

在本地运行 `pnpm dev` 时，`dev-sync` 模式**与提供商无关**：它无条件地将 `content/items/**` →
`public/items/` 和 `content/contact/**` → `public/contact/`（通过 `copyIfChanged`）复制，从不读取
`siteConfig.imageStorage.provider`。开发时不需要云凭据。提供商选择只发生在 `upload` 模式
（`pnpm upload-images`）和 Seller Studio 的同步运行器（§30）中。要在本地测试云上传，请在 `.env.local`
中配置凭据后运行 `pnpm upload-images`。

---

## 4. next.config.ts 规范

```ts
import type { NextConfig } from "next";
import { siteConfig } from "./content/config";
import { normalizeR2Url } from "./lib/images/normalizeR2Url";

const remotePatterns: NextConfig["images"]["remotePatterns"] = [];

if (siteConfig.imageStorage.provider === "vercel-blob") {
  remotePatterns.push({
    protocol: "https",
    hostname: "*.public.blob.vercel-storage.com",
  });
}

if (siteConfig.imageStorage.provider === "cloudflare-r2") {
  // 原始值先经过 normalizeR2Url()（lib/images/normalizeR2Url.ts）规范化，再用 new URL() 解析。
  const raw = process.env.CF_R2_PUBLIC_URL ?? "https://example.com";
  const r2Url = new URL(normalizeR2Url(raw));
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
  // ".next/types/**/*.ts" 引入 Next.js 生成的路由类型。
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  // "workers" 被排除——shipping-rate-proxy Worker（§29.6）是独立部署的包，有自己的 tsconfig.json。
  "exclude": ["node_modules", "workers"]
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
| `listed_date` / `sold_date` | 期望格式：仅日期 `YYYY-MM-DD`。也接受完整 ISO 时间戳——只解析日期部分。其他字符串 → `null`。已售保留期：`sold_date` 为 `null` → 公式回退到 `listed_date`（与 DESIGN.md §5 字段默认值一致）。若 `listed_date` 也为 null，该物品视为"保留"（永不过期）。 |

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

### 提供商实现

#### `local`（`pnpm dev` 的默认；无云凭据时始终使用）
- `syncImage()`：将文件从 `content/items/` 复制到 `public/items/{manifestKey}`，返回 `/items/{manifestKey}`
- `mtime + size` 未更改时跳过复制（速度上等同于校验和匹配）

#### `vercel-blob`
- `syncImage()`：将 SHA-256 与已保存校验和比较；如有更改，调用 `@vercel/blob put(manifestKey, fileBuffer, { access: "public" })`；返回返回的 `url`
- 环境中需要 `BLOB_READ_WRITE_TOKEN`；缺失时抛出描述性错误

#### `cloudflare-r2`
- `syncImage()`：比较 SHA-256；如有更改，调用 S3 `PutObjectCommand` 到 R2 端点；以 `${CF_R2_PUBLIC_URL}/${manifestKey}` 构建公开 URL
- 需要所有 `CF_R2_*` 环境变量；任一缺失时抛出描述性错误

### 三种执行模式

该脚本通过 `--mode` 标志以三种不同模式运行（`--mode` 缺失或无效时以 exit 1 退出）：

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
11. 打印摘要：`[upload-images] provider=vercel-blob  uploaded=12  skipped=47  failed=0  purged=3  total=59  warnings=2`。如果运行了 EXIF/GPS 剥离，会额外打印一行：`🔒 stripped EXIF/GPS metadata from 12/12 uploaded image(s)`。每个文件的失败会按清单键单独列出。
12. 打印**备份提醒**（见下文）
13. 退出码：若有任一文件上传失败则以 `1` 退出（清单/校验和仍会为成功的文件写入——重新运行以重试），或任何不可恢复错误时以 `1` 退出；仅建议性质量 `warnings` 保持退出码 `0`。见 §27.4。

> **孤立 CDN blob 说明：** 清除清单条目只移除 URL 引用，并**不**从 Vercel Blob 或 R2 删除文件。孤立 blob 会静默累积。v1 中云存储（Blob/R2）足够便宜，可以接受；未来的 `pnpm clean-storage` 命令可对账清单与 CDN 存储桶。

#### `dev-sync` 模式（`pnpm dev`）

1. 检查 `content/items/` 是否存在；不存在则记录 `[dev-sync] content/items/ not found — skipping image copy` 并继续（优雅，不崩溃）
2. 扫描 `content/items/**` 中的图片文件
3. 将每个文件复制到 `public/items/{相同相对路径}`（增量：`mtime + size` 未更改时跳过）
4. 复制 `content/contact/**` → `public/contact/`
5. 记录：`[dev-sync] copied N images to public/items/, M contact files to public/contact/`（为空时 `0 images`）
6. **不**上传到云，**不**写清单。

#### `build-check` 模式（`pnpm build` 预构建——在 Vercel 或本地运行）

1. 复制 `content/contact/**` → `public/contact/`（git 追踪的源，始终存在）
2. **检查提供商：**
   - 若 `imageStorage.provider === "local"`：本地机器上照片可能存在（自托管静态构建）。行为同 `dev-sync`：复制 `content/items/**` 图片 → `public/items/`。不检查也不写清单，**忽略任何现有的** `lib/generated/image-manifest.json`——提供商为 `"local"` 时加载器回退到 `/items/{key}` 本地路径，先前云提供商留下的陈旧 CDN 清单不得使用。记录 `[build-check] local provider — copied N images to public/items/` 并退出 0。
   - 若提供商为 `"vercel-blob"` 或 `"cloudflare-r2"`：照片不存在（CI runner 上已 gitignore）。检查 `lib/generated/image-manifest.json` 是否存在：存在则记录 `[build-check] manifest found (N entries) — skipping upload` 并退出 0；缺失则记录**警告**（非错误）`[build-check] WARNING: manifest not found — item images will show as broken`，退出 0（优雅降级，不中断构建）。

> **为何 `local` 提供商在 `build-check` 中特殊处理：** `local` 提供商从不写清单——它始终依赖 `public/items/` 中的文件。本地机器上 `pnpm build` 时照片存在，因此必须复制。在 Vercel 上 `local` 提供商不适用（照片已 gitignore）；使用 Vercel 的卖家应使用 `vercel-blob` 或 `cloudflare-r2`。

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
║    pnpm push   ——或手动：                                     ║
║    git add lib/generated/image-manifest.json                 ║
║    git add content/**/*.json content/config.ts               ║
║    git commit -m "chore: update listings"                    ║
╚══════════════════════════════════════════════════════════════╝
```

### `package.json` 脚本

```json
{
  "scripts": {
    "setup-ui": "bash scripts/setup-ui.sh",
    "studio": "tsx scripts/studio.ts",
    "upload-images": "tsx scripts/sync-images.ts --mode upload",
    "create-item": "tsx scripts/create-item.ts",
    "create-template": "tsx scripts/create-template.ts",
    "new": "tsx scripts/create-item.ts",
    "mark-sold": "tsx scripts/mark-sold.ts",
    "fb-export": "tsx scripts/export-facebook.ts",
    "update-site": "tsx scripts/update-site.ts",
    "migrate-config": "tsx scripts/migrate-config.ts",
    "push": "git add content lib/generated/image-manifest.json && git commit -m 'chore: update listings' && git push",
    "bump": "tsx scripts/bump-version.ts",
    "prebuild": "tsx scripts/check-config.ts && tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts",
    "build": "next build",
    "postbuild": "tsx scripts/postbuild.ts",
    "dev": "tsx scripts/sync-images.ts --mode dev-sync && next dev --turbo",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

> **`prebuild` 是三步门控。** 先运行 `scripts/check-config.ts`（占位符 `baseUrl` 或不完整 i18n 翻译时使构建失败——见 §22.8 和 §28），然后 `sync-images.ts --mode build-check`，最后 `build-search-index.ts`。三者全部成功后才运行 `next build`。

| 脚本 | 何时运行 | 由谁运行 |
|---|---|---|
| `pnpm upload-images` | 添加、替换或删除照片后 | 卖家，在其机器上 |
| `pnpm mark-sold <cat>/<name>` | 物品售出后——设置 `status: "sold"` 和 `sold_date` | 卖家，在其机器上 |
| `pnpm create-item` / `pnpm new <cat>/<name>` | 从 36 字段草稿模板生成新的 `item.json`（`new` 是 `create-item` 的完全别名） | 卖家，在其机器上 |
| `pnpm studio [--port N]` | 在浏览器中管理列表——物品编辑、照片管理、CDN 同步、git 发布（§30） | 卖家，在其机器上（仅本地） |
| `pnpm fb-export` | 将 available/pending/reserved 物品导出为 Facebook Marketplace 批量上传 CSV（交互式） | 卖家，在其机器上 |
| `pnpm update-site [tag] [--list] [--skip-verify]` | 拉取更新的上游模板版本，不触碰 `content/` | 卖家，在其机器上 |
| `pnpm migrate-config` | 将模板升级新增的配置字段拼接进 `content/config.ts`（仅增量）；也由 `update-site` 自动运行 | 卖家，在其机器上 |
| `pnpm push` | 一步提交 + 推送 `content/` 和图片清单（`git add content lib/generated/image-manifest.json`） | 卖家，在其机器上 |
| `pnpm bump` | 交互式版本升级 + GitHub release（以 `ci.yml` 通过为前提） | 维护者 |
| `pnpm build` | 部署到生产——运行 `prebuild`（check-config + 图片同步 + 搜索索引），然后 `next build`，再 `postbuild`（站点地图） | push 时的 GitHub Actions（或 Vercel 路径的 Vercel）；卖家本地构建 |
| `pnpm dev` | 本地开发预览——注意：`pnpm dev` 不重建 `public/search-index.json`；需先运行一次 `pnpm build` 填充 | 卖家，在其机器上 |
| `pnpm test` / `test:watch` / `test:coverage` | 运行 Vitest 套件（一次 / 监听 / 带 v8 覆盖率）；由 `ci.yml` 强制执行（§24） | 开发者和 CI |
| `pnpm type-check` / `pnpm lint` / `pnpm format` | 类型检查（`tsc --noEmit`）、零警告容忍的 ESLint、Prettier 格式化；由 `ci.yml` 强制执行 | 开发者和 CI |

> **模板升级指南：** 完整的 `update-site` / `migrate-config` 卖家工作流见 `docs/UPDATE_GUIDE.md`（脚本清单见 `docs/SCRIPTS.md`）。

> **`scripts/build-search-index.ts`** —— 在 `prebuild` 步骤调用（`next build` 之前）。从 `lib/search/index.ts` 导入 `buildSearchIndex()`，将 fuse.js 搜索索引写入 `public/search-index.json`，出错时以 exit 1 退出。因在 `prebuild` 中运行，`SearchBar` 运行时获取时索引已就绪。`public/search-index.json` 已 gitignore——每次构建重新生成。

> **`scripts/postbuild.ts`** —— 在 `postbuild` 步骤调用（`next build` 之后）。读取 `siteConfig.sitemap.enabled`；为 true 时运行 `npx next-sitemap --config next-sitemap.config.js` 生成 `out/sitemap.xml` 和 `out/robots.txt`（next-sitemap `outDir` 为 `./out`）；为 false 时打印跳过消息并退出 0。这是 §22.7 中"postbuild 脚本在运行前检查此项"的规范实现。

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

// 仅用于首页"最近上架"条
// 比 loadItemsByCategory() 有更严格的筛选：
//   - 仅 status === "available"（reserved、pending、sold、draft 全部排除）
//   - 排除过期已售物品
// 结果按 listedDate 降序排列，限制为 siteConfig.recentlyListedCount
export async function loadAllItems(): Promise<Item[]>

// 返回所有分类中的每一件物品，不做可见性过滤
// （不应用 draft、sold、保留期规则）。供必须看到完整清单的脚本使用——
// 如 scripts/export-facebook.ts（fb-export）和搜索索引构建器。不用于页面渲染。
export async function loadAllItemsRaw(): Promise<Item[]>

// 返回 /sold 档案页的所有已售物品
// 无保留过滤——显示所有曾经 status 为 "sold" 的物品
// 按 soldDate 降序排列（soldDate 缺失时回退到 listedDate）
export async function loadSoldItems(): Promise<Item[]>

// App Router 页面使用的页面级聚合：
//   app/all/page.tsx  → loadBrowseAllPageData()   （不是 loadItemsByCategory 循环）
//   app/page.tsx      → loadHomePageData()
// 各自在一次调用中打包该页面所需的 categories + items + 派生元数据。
export async function loadBrowseAllPageData(): Promise<{
  categories: Category[];
  items: Item[];
}>
export async function loadHomePageData(): Promise<{
  categories: Category[];
  recentItems: Item[];
}>

// 清除内存中的图片清单缓存。CDN 同步（Seller Studio，§30）后调用，
// 使下次读取获得最新写入的 CDN URL。
export function resetManifestCache(): void

// 注意：buildSearchIndex() 不是 loader.ts 的一部分。
// 它位于 lib/search/index.ts，由 scripts/build-search-index.ts（prebuild）调用。
// 完整规范和 SearchIndexEntry 类型见 §22.1。
```

> **`/all` 页面：** `app/all/page.tsx` 调用 `loadBrowseAllPageData()`——它**不**对每个分类聚合
> `loadItemsByCategory()`。结果包含 reserved、pending 和可切换的 sold 物品——与任何单个分类页面相同的集合。

### 类型定义（缩写——完整定义见 `lib/content/types.ts`）

#### `Category` 类型

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

#### `PriceTier` 和 `Price` 类型

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

#### `Item`（缩写——完整定义见 `lib/content/types.ts`）

```ts
export type Item = {
  // 解析后的 slug
  categorySlug: string;
  itemSlug: string;

  // 来自 item.json（已应用默认值）
  name: string;
  description: string;
  condition: Condition;
  status: Status;
  price: Price;
  brand: string;
  model: string;
  quantity: number;
  tags: string[];
  listedDate: string;       // ISO 8601 字符串或构建日期
  soldDate: string | null;
  preferredPayment: string[];
  contactNote: string;
  originalSource: string;
  originalLink: string;
  originalPrice: number | null;
  dimensions: Dimensions | null;
  weight: Weight | null;
  color: string;
  metaDescription: string;  // JSON 中为空时自动生成

  // 由加载器解析（经 image-manifest.json → CDN URL，或 /items/... 回退）
  images: string[];         // CDN URL（vercel-blob/r2）或 /items/... 本地路径
  coverImage: string | null;
};
```

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
- `fill` 模式在 `<img>` 回退中映射为 `style={{ objectFit: 'cover' }}`

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

**预填消息中的地理解析价格：**
提供 `item` 时，`ContactSection` 独立地为 WhatsApp 和邮件预填解析地理价格：

1. 内部调用 `useGeolocation()` + `useDistancePricing(siteConfig.location, geoState)`
2. 调用 `resolveItemPrice(item.price, resolved)` → `resolvedPrice: PriceTier | null`
3. 将 `item` 和 `resolvedPrice` 传给每个 `PlatformButton`，供 `constructUrl` 使用

因为 `navigator.geolocation.getCurrentPosition` 以 `maximumAge: 300_000` 调用，浏览器立即返回已缓存的位置（无二次提示、无可见延迟）。`ContactSection` 和 `PricingSection` 独立调用相同的 geo hook，都从同一浏览器缓存解析——两次调用，一个底层权限。

`resolvedPrice` 为 `null`（`price.tiers` 为空）时，价格令牌从预填消息中省略，仅使用物品名称。

### `PlatformButton`

- 链接式：`<a href={constructUrl(platform, item, resolvedPrice)} target="_blank" rel="noopener noreferrer">`
- 二维码式：`<button onClick={() => setModalOpen(true)}>`

**`constructUrl` 签名：**
```ts
function constructUrl(
  platform: Platform,
  item?: Item,
  resolvedPrice?: PriceTier | null
): string | null   // null → 二维码类型（由 QRModal 处理，而非链接）
```

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
- `generateMetadata` 读取物品并返回 Open Graph + Twitter 卡片标签，包括 `og:image`（物品 `coverImage`）

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
| `reserved_for` 字段 | 私人买家信息——任何地方都不读取、写入或渲染。它被**有意排除在 Zod schema 之外**（`lib/content/schema.ts`，因此 Zod 默认 strip 在解析时移除），并从 `Item` 类型（`lib/content/types.ts`）中排除。`schema.test.ts` 和 `loader.test.ts` 断言它绝不会在解析/加载后幸存；Seller Studio（§30）也从不读取或发送它。 |
| 外部链接 | 所有新标签打开的 `<a>` 标签使用 `rel="noopener noreferrer"` |
| `original_link` 渲染 | 由 Zod 验证为 URL 后才渲染；无效时为空字符串 |
| JSON 解析 | Zod schema；原始 `JSON.parse` 错误已捕获并记录；物品跳过 |
| 路径遍历 | 图片路径仅从已知 slug 构建；运行时无用户提供的路径段 |
| `meta_description` | 截断到 160 字符；不作为 HTML 渲染（仅纯文本） |
| `poweredByHeader: false` | 抑制 `X-Powered-By: Next.js` 响应头 |
| 运费计算 API 密钥（可选，§29） | 永不出现在静态构建产物中；仅以 `wrangler secret` 形式存于 `workers/shipping-rate-proxy`，浏览器通过 `siteConfig.shipping.proxyUrl` 调用 |

---

## 16. 代码检查与格式化规则

ESLint 9 **flat config** 位于 `eslint.config.mjs`（没有 `.eslintrc` 文件）。它使用 `@eslint/eslintrc` 的 `FlatCompat` 扩展 `next/core-web-vitals` 和 `next/typescript`：

```js
// eslint.config.mjs（缩写）
import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [
      ".next/**", "out/**", "node_modules/**",
      "components/ui/**",      // Aceternity——由 pnpm setup-ui 自动生成
      "hooks/**",
      "components/**-demo.tsx",
      "next-env.d.ts",
      "workers/**",            // 独立部署的 Worker（§29.6）
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
      "@typescript-eslint/no-explicit-any": "error",
      // "_" 前缀标记有意未使用的参数/变量
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import/no-default-export": "off",
    },
  },
  { files: ["scripts/**/*.ts"], rules: { "no-console": "off" } },
  // studio/ 是纯 Vite 应用——没有可切换的 next/image
  { files: ["studio/**/*.tsx"], rules: { "@next/next/no-img-element": "off" } },
];
```

> `scripts/` 覆盖完全禁用构建脚本的 `no-console`——同步脚本大量使用 `console.log` 输出进度。`pnpm lint` 以 `--max-warnings 0`（零警告容忍）运行，并由 `ci.yml` 强制执行（§24）。

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

> **混合大小写扩展名**（如 `.Jpg`、`.jPg`）不被上述模式覆盖。实际中极罕见（相机保存 `.jpg` 或 `.JPG`）。如果出现，git 会追踪它们；`pnpm upload-images` 仍能处理（扫描正则使用 `/i` 标志）。如果希望 git 忽略它们，请在放入 `content/items/` 前重命名为小写。

**有意不在 gitignore 中：**
- `content/**/*.json` — 库存元数据，始终提交
- `content/config.ts` — 站点配置，始终提交
- `content/contact/` — 二维码图片来源（微小，git 追踪；`public/contact/` 是生成的副本）
- `lib/generated/image-manifest.json` — CDN URL 映射，`pnpm upload-images` 后提交

> **`public/search-index.json` 已 gitignore** —— 它由 prebuild 步骤（`scripts/build-search-index.ts`）生成，直接写入 `public/`，使 `SearchBar` 可以在运行时通过 HTTP 获取。它**不**存储在 `lib/generated/` 中。

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
5. - [ ] `pnpm push`（暂存 `content/` + 图片清单，提交并推送）——或从 Seller Studio 的发布面板发布（§30），它只提交这两个路径，绝不 `git add -A`
6. - [ ] GitHub Actions 自动构建并部署——无 CDN 交互；只读取已提交清单

**仅代码变更（不编辑照片）：**
- [ ] 编辑 `content/**/*.json` 或 `content/config.ts` → `git commit && git push` → GitHub Actions 立即构建

> **Cloudflare R2 存储说明：** 删除物品会清除其清单条目，但**不**从 R2 删除 blob。孤立文件会静默累积。通过 Cloudflare Dashboard → R2 → 存储桶浏览器管理。计划未来提供 `pnpm clean-storage` 命令。

> **运费估算：** 如果配置了 `siteConfig.shipping`，还必须单独部署 `shipping-rate-proxy` Cloudflare Worker——见 §29.8 和 `workers/shipping-rate-proxy/README.md`。

---

### Vercel + Vercel Blob（备用）

**一次性设置：**
- [ ] 运行 `pnpm setup-ui` → 提交 `components/ui/`
- [ ] 在 `content/config.ts` 中设置 `deploymentMode: "vercel"` 和 `imageStorage.provider: "vercel-blob"`
- [ ] 将 GitHub 仓库连接到 Vercel 项目；在 Vercel 项目设置中将部署分支设为 `release`
- [ ] Vercel Dashboard → Storage → 创建 Blob 存储 → 复制 `BLOB_READ_WRITE_TOKEN`
- [ ] 将 `BLOB_READ_WRITE_TOKEN` 添加到 Vercel 项目环境变量
- [ ] 将 `NEXT_PUBLIC_SITE_URL` 添加到 Vercel 环境变量
- [ ] 确认 `content/config.ts` 中的 `baseUrl` 与生产 URL 一致
- [ ] 自定义域名：Vercel Dashboard → Domains
- [ ] 复制 `.env.example` → `.env.local`；填写 `BLOB_READ_WRITE_TOKEN`（供本地上传）
- [ ] 至少运行一次 `pnpm upload-images` → 提交 `lib/generated/image-manifest.json`

**定期工作流：** 与上方 GitHub Pages + R2 相同（步骤 1–6），将 GitHub Actions 替换为 Vercel 自动部署。

> **Vercel Blob 说明：** Blob 不会自动过期。`pnpm upload-images` 清除清单条目后，孤立 blob 仍会保留。通过 Vercel Dashboard → Storage → Blob 浏览器删除。

---

### 自托管静态——本地图片（简单，无云存储）

- [ ] 在 `content/config.ts` 中设置 `deploymentMode: "static"` 和 `imageStorage.provider: "local"`
- [ ] 在有 `content/items/` 照片的机器上运行 `pnpm build`
- [ ] `out/` 包含所有图片；将整个 `out/` 部署到任意静态主机
- [ ] 自托管无大小限制（服务器存储便宜）

### 自托管静态——云图片

- [ ] 在 `content/config.ts` 中设置 `deploymentMode: "static"` 和所需的提供商
- [ ] 本地运行 `pnpm upload-images` → 图片上 CDN，清单更新
- [ ] 运行 `pnpm build` → `out/` 仅包含 HTML/CSS/JS（很小）；图片在 CDN
- [ ] 将 `out/` 部署到任意静态主机

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

### `SiteConfig` — `location` 字段类型

```ts
// lib/config/types.ts — 新增
location: {
  lat: number;   // 十进制度，WGS84
  lng: number;   // 十进制度，WGS84
  label: string; // 显示字符串，如 "San Francisco, CA"
};
```

`location` 在 `SiteConfig` 中是**必填**的。如果卖家未配置，`next build` 必须以清晰的 TypeScript 错误失败（由非可选类型且无默认值保证）。

### `LocationPriceBar` 组件规范

```tsx
// components/pricing/LocationPriceBar.tsx  — "use client"

type Props = {
  sellerLocation: { lat: number; lng: number; label: string };
  resolvedMiles: number | null;           // null = 待定
  source: "detected" | "manual" | "fallback";
  onOverride: (miles: number | null) => void;  // null = 清除手动覆盖
};
```

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

### `PricingTable` 组件规范

```tsx
// components/item/PricingTable.tsx  — "use client"
// 客户端组件（调用 useT() 获取本地化表头/标签）。
// 渲染完整的档位表并视觉上突出已解析档位。
// 它不渲染展开/折叠切换——PricingSection 单独渲染 PricingTableToggle。

type Props = {
  price: Price;
  resolvedTier: PriceTier | null;   // null（空档位）→ 显示"联系询价"
};
```

**渲染契约：**

1. 若 `price.tiers` 为空：渲染 `t.contactForPrice` 消息。无表格、无切换。
2. 否则：渲染所有档位的表格（通过 `t.pricingLabelHeader` / `t.pricingDistanceHeader` / `t.pricingPriceHeader` 的标签 / 距离 / 金额列），突出与 `resolvedTier` 匹配的行。

**初始 SSG 状态：** 静态页面外壳（`app/[category]/[item]/page.tsx`）调用：
```ts
import { resolveItemPrice } from "@/lib/utils/pricing";
// resolveItemPrice 位于 lib/utils/pricing.ts — 无 "use client" → 服务器组件中安全
const initialResolvedTier = resolveItemPrice(item.price, { source: "fallback" });
```
然后作为 prop 传给 `PricingSection`：
```tsx
<PricingSection
  price={item.price}
  initialResolvedTier={initialResolvedTier}
  previousLowestPrice={item.previous_lowest_price}   // 可选——"原价 $X" 删除线
  weight={item.weight}
  dimensions={item.dimensions}
/>
```

`PricingSection`（客户端）**不**拥有 geo 状态。它从共享的 **`DistancePricingContext`**（`useDistancePricingContext()`）读取 `{ geoState, resolved, setManualMiles }`，由包装物品详情页的 `DistancePricingProvider` 提供。`DistancePricingProvider` 才是拥有地理定位/距离状态的一方——这避免了 `PricingSection` 和 `ContactSection` 各自运行 `useGeolocation()` 而导致浏览器两次请求位置。`PricingSection` 渲染 `LocationPriceBar`（geo 状态）、可选的 `previousLowestPrice` 删除线、`PricingTableToggle`（展开/折叠定价 UI）和 `ShippingEstimator`（weight/dimensions 透传——见 §29.5）。

`initialResolvedTier` 匹配 provider 的初始 hook 状态（`{ source: "fallback" }`），因此静态 HTML 显示最高档位，hydration 时无内容闪烁。

**`PricingTableToggle`（客户端组件，由 `PricingSection` 渲染）：**

```tsx
// components/item/PricingTableToggle.tsx  — "use client"
// 接收所有档位 + 已解析档位索引；管理打开/关闭状态。
// price.show_tiers 为 false（默认）时：只显示已解析档位行——
//   无切换按钮，不暗示存在其他档位。
// price.show_tiers 为 true 时：
//   折叠：已解析档位行 + "查看全部价格档位 ▼" 按钮。
//   展开：完整档位列表表格；已解析档位行视觉突出
//         （如 Tailwind ring 或加粗文字）；按钮变为 "收起 ▲"。
```

- 切换状态是本地的（`useState`）；默认 = `false`（折叠）
- `price.show_tiers`（默认 `false`）决定是否显示切换按钮——卖家可能不希望买家知道存在更便宜的档位
- 该切换仅在物品详情页渲染，绝不在物品卡片上渲染
- 键盘可访问：切换按钮响应 Enter 和空格

### `useFilters.ts` — 价格区间基础更新

价格区间滑块状态是作用于**已解析价格**的 `[min, max]` 元组：

```ts
// 应用于每个物品的过滤函数：
function pricePassesFilter(item: Item, resolved: ResolvedDistance, [min, max]: [number, number]): boolean {
  const tier = resolveItemPrice(item.price, resolved);
  if (tier === null) return true;   // 无定价 → 始终显示
  return tier.amount >= min && tier.amount <= max;
}
```

滑块的初始 `max` 设为当前分类中所有物品已解析价格的最高值（`resolveDistanceMi` 变化时重新计算）。当分类中没有物品定义了价格档位时，滑块**隐藏**。

`resolveItemPrice` 从 `lib/utils/pricing.ts` 导入——见 DESIGN.md §17。

### `"use client"` 组件列表

> 此表列出携带 `"use client"` 指令的组件及**原因**。它不是完整清单——完整组件列表见 ARCHITECTURE.md。`app/` 本身**零** `"use client"` 指令（每个路由都是服务器组件）；客户端行为位于 `components/`。

| 组件 | 原因 |
|---|---|
| `RecentlyListedSection` | 拥有首页 geo + 距离状态 |
| `ItemGrid` | 读取分类页距离状态；距离变化时重新渲染 |
| `PricingSection` | 从 `DistancePricingContext` 读取 geo/距离；渲染 LocationPriceBar + PricingTableToggle + ShippingEstimator |
| `PricingTable` | 调用 `useT()` 获取本地化表头/标签 |
| `DistancePricingContext` | Provider 拥有 PricingSection/ContactSection 共享的地理定位 + 距离状态 |
| `ItemGallery` | 照片轮播交互 |
| `LocationPriceBar` | Geolocation API + 用户输入 |
| `PricingTableToggle` | 档位列表展开/折叠状态 |
| `FilterBar` | 客户端过滤状态 |
| `ContactSection` | 点击展开切换；也独立运行 `useGeolocation` + `useDistancePricing` 获取预填消息中的地理解析价格 |
| `PlatformButton` | 接收 `onClick` 函数 prop（来自 `ContactSection` 的状态 setter）——函数 prop 无法跨服务器/客户端边界序列化 |
| `QRModal` | 弹窗打开/关闭状态 |
| `SortSelect` | 排序下拉状态（FilterBar 的子组件；为一致性设为客户端） |
| `MakeOfferButton` | 出价表单状态；提交时预填联系平台消息 |
| `ConditionGuide` | 解释各成色值的工具提示/弹窗打开-关闭状态 |
| `SearchBar` / `SearchBarClient` | 经 `next/dynamic({ ssr: false })` 加载；fuse.js 查询 + 结果状态 |
| `ShareButton` | `navigator.share()` 和 `navigator.clipboard`——仅浏览器 API |
| `RecentlyViewed` | 挂载时 `sessionStorage` 读写——仅浏览器 API |
| `FreshnessLabel` | 相对 `new Date()`（访客时钟，非 SSG 构建时间）计算相对日期 |
| `LocaleProvider` / `LocaleSwitcher` | 挂载时读取 `localStorage.getItem("locale")`；通过 React context 提供 `{ locale, setLocale }` |
| `ItemCard` | 通过 `useLocale()` 本地化标题；始终在客户端父组件（`ItemGrid` / `RecentlyListedSection`）内渲染 |
| `LocalizedItemContent` | 物品详情 `<h1>` 名称 + react-markdown 描述；读取 `useLocale()` 以便在语言切换时重新渲染 |
| `ThemeProvider` / `ThemeToggle` | `next-themes` 基于 class 的深色模式 + 访客切换（§22.2） |
| `MeasurementUnitProvider` / `MeasurementUnitToggle` | 公制/英制选择；每语区单位覆盖（§22.13） |
| `NewlyListedClient` | `/newly-listed` 页面按访客时钟/上次访问分组 |
| `SiteHeader` | 导航状态、搜索、语言/主题/单位切换 |
| `MetadataTable` / `StatusBadge` / `ConditionBadge` | 通过 `useT()` 本地化标签；成色说明交互 |
| `ShippingEstimator` | 邮编输入 + `useShippingRate` 请求（§29.5） |
| `ProjectIntro` / `UISlotPlayground` | `baseUrl` 未配置时显示的介绍页；槽位预览 |
| `BackgroundEffect` / `ItemGridAdapter` / `GalleryAdapter` / `ItemCardAdapter` | 包装客户端 Aceternity 组件（§21） |

> **`PricingTable` 是客户端组件。** 它此前被记录为服务器/展示型组件，但现在携带 `"use client"` 并调用 `useT()` 获取本地化表头。服务器端页面（`page.tsx`）仍将 `resolveItemPrice` 作为纯函数调用于 SSG 初始渲染，并将结果作为 `initialResolvedTier` 传给 `PricingSection`。`lib/utils/pricing.ts` 本身**没有** `"use client"` 指令，因此仍可被服务器和客户端代码导入。

### 安全与隐私

| 关切 | 缓解措施 |
|---|---|
| 访客坐标发送到服务器 | **不可能**——站点完全静态；没有接收数据的服务器函数 |
| 未经同意持久化坐标 | v1 仅 `useState`；页面关闭时清除。无 `localStorage` 或 cookies |
| 卖家坐标暴露 | 有意为之，见 DESIGN.md §17；卖家应使用附近地标 |
| Geolocation API 的 HTTPS 要求 | Vercel 上的 Next.js 默认提供 HTTPS；自托管必须配置 TLS |

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

export type PriceFilterStrategy =
  | "none"
  | "percentile"
  | "logarithmic"
  | "preset-buckets"
  | "iqr";

export type UIConfig = {
  background: BackgroundOption;
  itemGrid:   ItemGridOption;
  gallery:    GalleryOption;
  itemCard:   ItemCardOption;
  // 可选（铁律 8——TS 可选 + 运行时默认值；省略它们的下游配置在模板升级后仍能通过类型检查）。
  priceFilterStrategy?: PriceFilterStrategy;   // 消费方以 ?? "none" 读取
  priceFilterBuckets?: number[];               // "preset-buckets" 的桶边界
};
```

> **价格过滤（可选）：** 当 `ui.priceFilterStrategy` 设为 `"none"` 以外的值时，`FilterBar` / `ItemGrid` 提供由 `lib/utils/priceFilterStrategies.ts`（有单元测试）计算的价格区间控件。字段缺失时消费方默认为 `"none"`（`?? "none"` / 解构默认），因此现有配置无需更改。

> 在 `package.json` 中添加：`"setup-ui": "bash scripts/setup-ui.sh"`

### 适配器模式——全部四个适配器

所有适配器遵循相同结构。它们**已预接所有受支持的选项**，卖家不得编辑。`pnpm setup-ui` 运行后提交完整导入列表。

```tsx
// ⚠️  请勿编辑——只在 content/config.ts 中更改 ui.* 值
"use client";   // 包装客户端 Aceternity 组件的适配器携带此指令

import { siteConfig } from "@/content/config";

// 所有组件已通过 pnpm setup-ui 预安装并提交到 components/ui/
import { AuroraBackground }             from "@/components/ui/aurora-background";
import { BackgroundBeams }              from "@/components/ui/background-beams";
// ...（该槽位的所有导入）

const COMPONENTS = {
  "aurora":            AuroraBackground,
  "background-beams":  BackgroundBeams,
  // ... 所有条目
} as const;

// 适配器读取配置、选择组件、规范化 props、渲染。
// 对 "simple"、"none" 或未知值回退到内置 simple/none 实现。
```

---

### 适配器 1 — `BackgroundEffect.tsx`

**Props：** `{ children: React.ReactNode }`
**位置：** `app/layout.tsx` 用 `<BackgroundEffect>` 包装 `{children}`。

**每个组件的规范化：**

| 组件 | 所需包装形状 |
|---|---|
| `AuroraBackground` | `<AuroraBackground className="min-h-screen">{children}</AuroraBackground>` |
| `BackgroundBeams` | `<BackgroundBeams>{children}</BackgroundBeams>`——默认全屏 |
| `WavyBackground` | `<WavyBackground className="flex flex-col">{children}</WavyBackground>` |
| `Vortex` | `<Vortex particleCount={200} rangeY={800} baseHue={220}>{children}</Vortex>`——合理默认值 |
| 其他所有 | `<Component>{children}</Component>` |

---

### 适配器 2 — `ItemGridAdapter.tsx`

```tsx
type Props = {
  items: Item[];
  resolved: ResolvedDistance;
  renderCard: (item: Item, index: number) => React.ReactNode;  // render prop
};
```

**每个组件的规范化：**

| 组件 | 数据映射 |
|---|---|
| `"simple"` | `<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">` + `renderCard()` 调用 |
| `"bento-grid"` | 将 items 映射为 `BentoGridItem[]`：`{ title: item.name, description: item.description, header: <img coverImage>, className: 模式（第一项 "md:col-span-2"） }` |
| `"layout-grid"` | 将 items 映射为 `{ id, content: renderCard(), className, thumbnail: item.coverImage }` |
| `"focus-cards"` | 将 items 映射为 `{ title: item.name, src: item.coverImage ?? "" }`；`renderCard` 通过 `absolute inset-0` 叠加 |

---

### 适配器 3 — `GalleryAdapter.tsx`

```tsx
type Props = {
  images: string[];        // 所有图片 URL
  coverImage: string | null;
  itemName: string;        // 用于 alt 文本和轮播标签
};
```

**每个组件的规范化：**

| 组件 | 数据映射 |
|---|---|
| `"simple"` | 大图 + 可滚动缩略图条；点击缩略图切换大图 |
| `"apple-cards-carousel"` | 将图片映射为 `Card[]`：`{ category: itemName, title: "Photo N", src: url, content: <img> }` |
| `"images-slider"` | 直接传入 `images` 数组 |
| `"carousel"` | 每张图片包在 `<CarouselItem><img /></CarouselItem>` 中 |
| `"parallax-scroll"` | 拆分图片：偶数索引 → 第一列，奇数 → 第二列 |

---

### 适配器 4 — `ItemCardAdapter.tsx`

```tsx
type Props = {
  item: Item;
  resolvedPrice: PriceTier | null;
  children: React.ReactNode;  // 标准 ItemCard 内容：图片、名称、徽章、价格
};
```

**每个组件的规范化：**

| 组件 | 包装方式 |
|---|---|
| `"simple"` | `<div className="rounded-xl border bg-card shadow-sm overflow-hidden">` |
| `"card-hover-effect"` | `<CardContainer><CardBody>{children}</CardBody></CardContainer>` |
| `"card-spotlight"` | `<CardSpotlight>{children}</CardSpotlight>` |
| `"3d-card"` | `<CardContainer><CardBody>{children}</CardBody></CardContainer>`——父级添加 `perspective-1000` class |
| `"evervault-card"` | `<EvervaultCard text={item.name}>{children}</EvervaultCard>` |
| `"wobble-card"` | `<WobbleCard containerClassName="col-span-1">{children}</WobbleCard>` |
| `"direction-aware-hover"` | `<DirectionAwareHover imageUrl={item.coverImage ?? ""}>`——children 作为悬停覆盖层渲染；封面图片是卡片正面。children 按深色背景设计样式。 |
| `"glare-card"` | `<GlareCard>{children}</GlareCard>` |

---

## 22. v1 额外功能规范

### 22.1 全文搜索

**依赖：** `fuse.js ^7.0.0`

**构建时索引生成**（`lib/search/index.ts`）：

```ts
export type SearchIndexEntry = {
  name: string;
  description: string;    // 截断到 200 字符（DESCRIPTION_EXCERPT_LENGTH）
  brand: string;
  model: string;
  tags: string[];
  course: string;
  isbn: string;
  edition: string;
  categorySlug: string;  // 客户端由 categorySlug + itemSlug 组装路由
  itemSlug: string;
  coverImage: string | null;
};

export async function buildSearchIndex(): Promise<SearchIndexEntry[]>
```

> 没有预计算的 `slug`/`href` 字段——条目分别携带 `categorySlug` 和 `itemSlug`，由客户端组装路由。`description` 截断到 200 字符以保持索引小巧。**可见性：** `buildSearchIndex`（经 `loadAllItemsRaw`）只包含 `available`、`pending`、`reserved` 物品——`draft` 和 `sold` 物品被排除。

索引在 `prebuild` 步骤（`next build` 之前）写入 `public/search-index.json`。它被 gitignore（每次构建重新生成；不提交）。必须放在 `public/` ——不是 `lib/generated/`——这样 Next.js 作为静态文件提供，`SearchBar` 可以通过 HTTP 在运行时获取。

**`SearchBar` 组件：**
- 通过 `next/dynamic` 的 `{ ssr: false }` 延迟加载以避免 hydration 不匹配
- 挂载时获取 `/search-index.json`
- **开发模式行为：** 在 `pnpm dev` 中，`search-index.json` 在运行至少一次 `pnpm build` 前不存在。如果获取返回 404，`SearchBar` 以空索引初始化（不崩溃，不向用户显示错误状态）
- 用 fuse.js 初始化键：`["name", "description", "brand", "model", "tags", "course", "isbn", "edition"]`
- 防抖 150 毫秒实时显示结果

### 22.2 深色模式（系统默认 + 访客覆盖）

深色模式是**基于 class** 的，由 `next-themes`（`^0.4.6`，见 §2.1）驱动。默认跟随操作系统偏好，但允许访客通过切换按钮覆盖；选择持久化到 `localStorage`。

- `components/theme/ThemeProvider.tsx` 包装 `app/layout.tsx`：
  `<NextThemesProvider attribute="class" defaultTheme="system" enableSystem>`。
- `ThemeToggle`（客户端组件）在 `SiteHeader` 中渲染，桌面和移动导航均可用。
- `attribute="class"` 意味着 `next-themes` 在 `<html>` 上切换 `dark` class；`globals.css` 声明 `@custom-variant dark` 规则，使 Tailwind v4 的 `dark:` 工具类响应这个 class（而非媒体查询）。
- 访客的显式选择持久化到 `localStorage`；无选择时 `enableSystem` 跟随 `prefers-color-scheme`。

**Tailwind v4 设置——CSS 优先：**

```css
/* app/globals.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
/* next-themes 的基于 class 的深色模式： */
@custom-variant dark (&:where(.dark, .dark *));
```

```js
// postcss.config.mjs（Next.js 15 + Tailwind v4 需要）
export default { plugins: { "@tailwindcss/postcss": {} } };
```

> ⚠️ **不要**向 `tailwind.config.ts` 添加 `darkMode: "media"`。那是 Tailwind v3 语法，在 v4 中是 no-op（或导致弃用警告）。`tailwind.config.ts` 文件在 v4 中可选，仅用于主题扩展——除非需要扩展默认主题，否则省略。

- 所有 Tailwind `dark:` 变体类都响应 `next-themes` 管理的 `.dark` class
- 通过 `npx shadcn@latest` 安装的 Aceternity 组件兼容 Tailwind v4

### 22.3 卖家 CLI 工具

所有脚本只写入 `content/`——卖家不需要接触任何其他目录。

#### `pnpm create-item <category>/<name>`

1. **在任何文件系统访问之前**通过 `isValidSlug` 验证 `<category>` 和 `<name>` 为 kebab-case slug——这是路径遍历防护（与 `generateStaticParams` 使用同一验证器）。
2. 要求分类文件夹已存在（缺失时以 exit 1 退出——**不**创建它），且物品文件夹**不**存在（存在时以 exit 1 退出）。
3. 从**内置 36 字段草稿模板**（`scripts/lib/itemTemplate.ts`）生成 `item.json`：`status: "draft"`、今天的日期，并遵循 `content/config.ts` 的站点 `measurementUnit` 和 `defaultPriceTiers`（缺失时使用内置 3 档 pickup/shipping 回退）。模板有意省略私有的 `reserved_for`（铁律 4）——算上它，完整 schema 共 37 个字段。
4. 写入 `content/items/<category>/<name>/item.json` 并打印 `✓ Created …` 加后续步骤文本。
5. 如果设置了 `$EDITOR`，通过 `spawnSync` 以参数数组（无 shell 插值）打开新文件。

#### `pnpm mark-sold <category>/<name>`

1. **在任何文件系统访问之前**验证 `<category>` 和 `<name>` 为 kebab-case slug（路径遍历防护）。
2. 读取当前 `item.json`。**幂等：** 若 `status` 已为 `"sold"`，打印 `[mark-sold] <item> is already marked as sold.` 并以 exit 0 退出，不写入。
3. 否则应用**外科 JSONC 编辑**（`scripts/lib/markSold.ts` + `itemEdit.ts`，使用 jsonc-parser `modify`/`applyEdits`——绝不 parse/`JSON.stringify` 往返）设置 `status: "sold"` 和 `sold_date: <今天 YYYY-MM-DD>`。这保留 `//` 注释和所有其他字段，包括 `reserved_for`。
4. 打印 `✓ Marked <item> as sold (sold_date: YYYY-MM-DD).` 并以 exit 0 退出。

#### `pnpm create-template [category]`

1. 如果提供了 `[category]`：创建 `content/items/<category>/_template.json`（分类目录必须已存在——否则以 exit 1 退出）
2. 无参数：创建 `content/items/_template.json`（全局默认）
3. 模板是所有字段都作为描述性占位符字符串的完整 `item.json`
4. 打印如何使用该模板的说明

#### `pnpm new <category>/<name>` —— `create-item` 的简写别名（行为完全相同）

**模板格式**（`_template.json`）：
```jsonc
{
  "name": "ITEM_NAME",
  "description": "Describe the item condition and what's included.",
  "condition": "good",
  "price": {
    "tiers": [
      { "label": "Pickup", "miles_max": 5, "amount": 0 }
    ],
    "negotiable": false
  },
  "status": "draft",
  "tags": []
}
```

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
"twitter:description": item.metaDescription
"twitter:image": item.coverImage

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
  // 直接从 process.env 读取；未设置时回退到占位符域名。
  // CI 中来自 NEXT_PUBLIC_SITE_URL Actions 变量（§24）；本地在 .env.local 中设置。
  // next-sitemap 作为纯 Node.js 子进程运行（非 tsx），因此不要 require('./content/config')。
  siteUrl: process.env["NEXT_PUBLIC_SITE_URL"] || "https://your-domain.com",
  generateRobotsTxt: true,
  // 静态导出将页面写入 ./out，因此 sitemap/robots 也写入那里。
  outDir: "./out",
  robotsTxtOptions: {
    policies: [{ userAgent: "*", allow: "/" }],
  },
};
```

`scripts/postbuild.ts`（由 `postbuild` npm 生命周期钩子调用）：
```ts
import { siteConfig } from "@/content/config";
import { execSync } from "child_process";

if (siteConfig.sitemap.enabled) {
  console.log("[postbuild] 生成站点地图...");
  // 不注入环境变量——URL 由 next-sitemap.config.js 自身从 process.env.NEXT_PUBLIC_SITE_URL
  // （以 CI 变量设置）或其内置回退解析。
  execSync("npx next-sitemap --config next-sitemap.config.js", { stdio: "inherit" });
} else {
  console.log("[postbuild] sitemap disabled — skipping");
}
```

`postbuild` 运行 `scripts/postbuild.ts` → 有条件地生成 `out/sitemap.xml` + `out/robots.txt`（next-sitemap 的 `outDir` 为 `./out`，与静态导出输出一致）。站点地图仅在 `siteConfig.sitemap.enabled === true` 时生成；`postbuild` 脚本在运行前检查此项。

### 22.8 国际化（i18n）

**设计：** 单次部署多语区。所有语区变体打包进一次部署。访客通过 `SiteHeader` 中的 `LocaleSwitcher` 组件在运行时切换语言。所选语区存储在 `localStorage` 中；SSG 静态 HTML 始终渲染 `defaultLocale`。

### 两层翻译体系

| 层 | 覆盖内容 | 存储位置 | 填写者 |
|---|---|---|---|
| **UI 字符串** | 全部 87 个按钮/标签/徽章/标题文本 | `content/config.ts` → `i18n.translations.{locale}` | 卖家（通过 `/setup` 或手动编辑） |
| **物品内容** | 每件物品的 `name` 和 `description` | `content/items/**/item.json` → `name_{locale}`、`description_{locale}` | `/translate-items` AI 技能或手动编辑 |

### SiteConfig i18n 类型（`lib/config/types.ts`）

```ts
export type I18nConfig = {
  defaultLocale: string;                          // ISO 639-1；在静态 HTML（SSG）中渲染
  availableLocales: string[];                     // 所有支持的语区；长度 > 1 时显示 LocaleSwitcher
  showLocaleSwitcher: boolean;                    // 在 SiteHeader 中显示切换器
  translations: Record<string, Partial<UIStrings>>; // 每语区 UI 字符串字典
};
```

### `UIStrings` 类型（87 个键，`lib/config/types.ts`）

涵盖所有可见 UI 标签：导航链接、板块标题、联系标签、出价表单、分享按钮、元数据表头、成色/状态徽章、筛选/排序 + 价格过滤选项、新鲜度标签、页面横幅、成色说明、位置栏文本、定价表头、运费估算（§29.7）、移动导航、新上架页面文本。

`lib/i18n/translations.ts` 中的 `EN_FALLBACK` 常量为全部 87 个键提供内置英文默认值，确保即使 `content/config.ts` 配置有误，UI 标签也不会为空。

> **必需键与可选键：** `scripts/check-config.ts`（在 `prebuild` 中运行）强制一个 **73 键 `REQUIRED_KEYS` 子集**——每个启用的语区必须提供的键（见 §28）。其余约 14 个键在构建时可选，运行时回退到默认语区 / `EN_FALLBACK`：六个运费键（§29.7）、两个价格过滤键（`filterPriceBucketAll`、`filterPriceIncludesOutliers`）和新上架页面键。

### 运行时架构 — 语言切换

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

### `lib/i18n/` 模块

```ts
// lib/i18n/translations.ts
// EN_FALLBACK: UIStrings — 所有 87 个键的内置英文默认值
// 被 useT()（客户端）和 getTranslations()（服务端）用作安全兜底

// lib/i18n/getTranslations.ts
// 服务端字符串解析。始终基于 defaultLocale 解析。
// 供无法调用 hook 的 Server Component（app 页面）使用。
export function getTranslations(): UIStrings

// components/i18n/useT.ts（客户端）
// 解析顺序：EN_FALLBACK → defaultLocale 字典 → 当前语区字典
export function useT(): UIStrings
```

### `lib/utils/i18n.ts` — 物品级语区解析

```ts
// 返回给定语区的本地化字段值，回退到英文默认值
// 示例：getLocalizedField(item, "name", "zh") → item.name_zh ?? item.name
export function getLocalizedField(
  item: Record<string, unknown>,
  field: string,    // 如 "name"、"description"
  locale: string    // 如 "zh"、"es"
): string
```

### 客户端与服务端渲染面

`name` 和 `description` 的访客渲染存在于**客户端**组件（`ItemCard`、`LocalizedItemContent`）中，调用 `getLocalizedField(item, …, locale)`。所有其他客户端组件通过 `useT()` 获取 UI 标签。Server Component（`generateMetadata`、`<title>`、OG 标签、JSON-LD）调用 `getTranslations()`，始终返回 `defaultLocale` 字典，**不支持**运行时切换。

> **SEO 说明（v1 有意限制）：** 只有 `defaultLocale` 内容出现在静态 HTML 和可爬取的元数据/JSON-LD 中。非默认语区在访客切换后在客户端渲染，不单独索引。

### 构建时完整性校验

`scripts/check-config.ts` 在每次构建时验证 `availableLocales` 中的每个语区都有包含全部 **73 个 `REQUIRED_KEYS`** 的 `translations` 条目（带默认语区回退）。如有语区缺失或不完整，构建将以描述性错误信息失败。完整 check-config 规范见 §28。

### 添加新语区步骤

1. 将语区代码加入 `content/config.ts` 的 `siteConfig.i18n.availableLocales`。
2. 添加包含全部 87 个 `UIStrings` 键（已翻译）的 `translations.{locale}` 块（至少覆盖 `check-config` 强制的 73 个 `REQUIRED_KEYS`）。
3. 在 Zod schema（`lib/content/schema.ts`）和 `Item` 类型（`lib/content/types.ts`）中添加 `name_{locale}` 和 `description_{locale}`——与现有的 `name_zh` / `description_zh` 模式相同。
4. 运行 `/translate-items` AI 技能批量填充各 `item.json` 中的 `name_{locale}` / `description_{locale}`，或手动添加。
5. `availableLocales.length > 1` 时，`LocaleSwitcher` 自动出现。

> **语区回退：** `getLocalizedField` 对缺少 `name_{locale}` 字段的物品静默回退到英文，不崩溃、不空渲染。`useT()` / `getTranslations()` 通过 `EN_FALLBACK` 回退，确保 UI 标签永不为空。

> **v1 内置具体的 `zh` 支持。** `name_zh` / `description_zh` 字段已在 Zod schema 和 `Item` 类型中。其他语区遵循相同的增量模式。

### 22.9 支付平台——Venmo 与 Zelle

**Venmo（链接式）：**
- `type: "venmo"`，`value: "username"` → `<a href="https://venmo.com/u/{value}">Venmo</a>`
- 存在物品上下文时，追加 `?txn=pay&audience=private&note={encodedItemName}`

**Venmo（二维码式）：**
- `type: "venmo"`，`qr_image: "/contact/venmo-qr.png"` → 二维码弹窗（与 WeChat 相同）

**Venmo（物品级付款请求——`item.venmo_payment_request`）：**
- 这是物品级 `item.json` 字段，**不是** `contact.platforms[]` 条目
- 非空 URL 时，物品详情页渲染**"通过 Venmo 支付"**按钮（与 Stripe"支付定金"按钮并排）
- 卖家提供的 URL 格式：`https://venmo.com/?txn=pay&recipients={username}&amount={price}&note={item.name}`
- 由 Zod 验证为 URL（无效 → `""` → 无按钮），与 §15 的 URL 处理一致
- 为空时不渲染按钮；Venmo 联系平台链接（如已配置）仍在联系区块中可用

**Zelle（仅二维码）：**
- `type: "zelle"`，`qr_image: "/contact/zelle-qr.png"` → 二维码弹窗
- Zelle 无公开主页 URL；二维码是唯一可分享格式
- 卖家在银行 App 中生成其 Zelle 二维码并保存到 `content/contact/zelle-qr.png`

**`constructUrl` 新增分支：**
```ts
case "venmo":
  if (platform.qr_image) return null;  // 二维码类型，由 QRModal 处理
  const base = `https://venmo.com/u/${platform.value}`;
  return item ? `${base}?txn=pay&audience=private&note=${encodeURIComponent(item.name)}` : base;

case "zelle":
  return null;  // 始终为二维码类型；无链接 URL
```

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

### 22.13 计量单位与可选配置字段

**计量单位（可选，铁律 8）。** 两个配置字段控制显示单位：

| 字段 | 类型 | 运行时默认值 |
|---|---|---|
| `siteConfig.measurementUnit` | `"metric" \| "imperial"`（可选） | `"metric"` |
| `siteConfig.i18n.localeMeasurementUnits` | `Partial<Record<string, "metric" \| "imperial">>`（可选） | 回退到 `measurementUnit` |

`lib/utils/units.ts` 以链式 `localeMeasurementUnits?.[locale] ?? measurementUnit ?? "metric"` 解析有效单位。它设置 `pnpm create-item` 写入新 `item.json` 的单位及显示回退；每个物品的值始终以卖家输入的单位存储，并为显示而转换。`MeasurementUnitProvider` / `MeasurementUnitToggle`（客户端组件）允许访客切换公制/英制。

**其他 `SiteConfig` 字段（除注明外均按铁律 8 向后兼容）：**

| 字段 | 必填？ | 说明 |
|---|---|---|
| `defaultPriceTiers?` | 可选 | 由 `create-item`/Studio 写入新物品；缺失时使用内置 3 档 pickup/shipping 回退 |
| `shipping?` | 可选 | 缺失/`enabled: false` → `ShippingEstimator` 不渲染（§29） |
| `ui.priceFilterStrategy?` / `ui.priceFilterBuckets?` | 可选 | 消费方默认 `"none"`（§21） |
| `measurementUnit?` / `i18n.localeMeasurementUnits?` | 可选 | 见上 |
| `soldArchiveDisplayLimit?` | 可选 `number` | 限制 `/sold` 渲染的已售物品数量（0 = 无上限）。在 `app/sold/page.tsx` 中以 `?? 200` 读取（运行时默认值 200），并已登记在 `scripts/lib/configDefaults.ts` 中，因此 `pnpm migrate-config` / `update-site` 会自动将其注入早于此字段的下游配置。 |

> **模板状态门控**（`lib/utils/templateStatus.ts`）：`PLACEHOLDER_DOMAIN`（`"your-domain.com"`）和 `DEMO_DOMAIN` 决定 `/` 渲染目录还是 `ProjectIntro` 页面。只要 `baseUrl` 仍含占位符，`isTemplateConfigured()` 为 false，首页显示项目介绍视图——`scripts/check-config.ts`（§28）在同一信号上使生产构建失败。

---

## 23. AI 技能文件——技术规范

见 DESIGN.md §20 了解设计原理、卖家工作流和兼容性表。本节涵盖技能文件格式和必要内容。

**无 SDK，无 API 密钥，无额外依赖。** 卖家使用其现有 AI 编程工具。

### 23.1 技能文件结构

在开发（develop）分支上，四个技能文件位于 **`.claude/commands/`**，遵循此模板：

```
.claude/commands/
├── setup.md              ← 从零构建 content/config.ts（原 "setup-wizard"）
├── update-items.md       ← 从照片生成 item.json
├── translate-items.md    ← 本地化物品 name/description
└── setup-shipping.md     ← 配置 siteConfig.shipping + 运费代理 Worker
```

每个遵循此模板：

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

### 23.2 `update-items.md` — 必要内容

技能文件必须包含：

| 章节 | 内容 |
|---|---|
| 触发 | "调用时扫描 `content/items/` 中有照片但无 item.json、或 item.json status 为 draft 的文件夹" |
| 视觉指令 | "对每个符合条件的文件夹：查看文件夹中所有图片；读取任何 `.txt`、`.md`、`.yaml` 或 `.json` 文件（描述文件）" |
| 字段提取 | DESIGN.md §20 中的完整表——每个置信级别可从照片提取的内容 |
| 合并规则 | 描述文件值覆盖视觉输出中其指定的任何字段 |
| 输出规则 | 写入 `content/items/<category>/<name>/item.json`；始终设置 `status: "draft"`；绝不设置 `reserved_for` |
| 确认 | 写入前向用户展示建议的 JSON 并要求确认/编辑/跳过 |
| 范围 | 接受用户的自然语言范围（"仅 electronics"、"iphone 文件夹"、"全部"） |
| 回退 | 照片不清晰时，brand/model 字段优先空字符串而非猜测 |

### 23.3 `setup.md` — 必要内容

技能文件必须包含：

| 章节 | 内容 |
|---|---|
| 触发 | "向用户提问以从零构建 content/config.ts" |
| 提问序列 | 按顺序的 DESIGN.md §20 全部 8 组问题 |
| 位置处理 | "当用户给出位置描述时，用你的知识建议 lat/lng 坐标；展示给用户确认" |
| 标语指导 | 语气匹配的标语示例（见 DESIGN.md §20 个性校准表） |
| 配置模板 | 完整的 `content/config.ts` 模板，含所有字段、类型和注释（来自 DESIGN.md §13） |
| 分类脚手架 | 生成 config.ts 后，为每个所选物品类型创建 `content/items/<category>/_category.json` |
| 输出规则 | 只写入 `content/config.ts` 和 `content/items/*/`——绝不触碰应用代码 |
| 幂等指令 | "如果 content/config.ts 已存在，先读取并用当前值预填答案；要求用户确认或更改每一项" |

### 23.4 `.claude/` 目录与 CLAUDE.md

`.claude/` 目录还包含一个 `CLAUDE.md` 项目文件。Claude Code 在启动时自动读取它，无需卖家解释即可为 AI 助手提供项目上下文。

**`CLAUDE.md` 必须包含：**
- 项目摘要（项目是什么、卖家是谁）
- `content/` 文件夹规则（AI 绝不修改 `content/` 之外的文件）
- 常见卖家任务及使用哪个技能的摘要
- 需要更深入上下文时指向 `DESIGN.md` 章节的链接

```
.claude/
├── CLAUDE.md              ← 由 Claude Code 自动加载；项目上下文
├── commands/              ← develop 分支上的卖家技能
│   ├── setup.md
│   ├── update-items.md
│   ├── translate-items.md
│   └── setup-shipping.md
└── seller/                ← release 分支晋升的源（见下文）
    └── CLAUDE.md
```

**Release 分支晋升（`release-seller.yml`）：** 在 `v*` tag 上，`Release Seller Template` 工作流（§24）重置 `release` 分支并晋升卖家工件：将 `.claude/seller/CLAUDE.md` → `.claude/CLAUDE.md`，其他每个 `.claude/seller/*.md` → `.claude/skills/<name>.md`。因此克隆 `release` 分支的下游卖家从 `.claude/skills/` 获取技能，而非 `.claude/commands/`。

> **仅报告缺口：** `.claude/seller/` 目前只有 `CLAUDE.md`，没有技能文件，因此 `release` 分支晋升的 `.claude/skills/` 会为空。这与 `release-seller.yml` 的意图矛盾，应予调和（要么用技能文件填充 `.claude/seller/`，要么从 `.claude/commands/` 复制）。

### 23.5 不新增依赖

| 移除的内容 | 原因 |
|---|---|
| `@anthropic-ai/sdk` | 不需要——AI 工具提供自己的 API 访问 |
| `ANTHROPIC_API_KEY` 环境变量 | 不需要——卖家的 AI 订阅处理认证 |
| `scripts/agents/` 目录 | 由 `.claude/commands/` 指令文件取代（release 分支晋升到 `.claude/skills/`——见 §23.4） |
| `pnpm agent:*` 脚本 | 由 Claude Code 中的 `/skill-name` 或自然语言取代 |

唯一的新项目工件是包含 Markdown 文件的 `.claude/` 目录。

### 23.6 优雅降级

如果卖家没有 AI 编程工具：
- `pnpm create-item <category>/<name>` 手动创建模板 `item.json`（Phase 3）
- `pnpm create-template` 创建可复制并填写的 `_template.json`
- 技能文件即使没有 AI 工具也可作为参考文档

### 23.7 `content/` 规则——在技能文件中强制执行

所有四个技能文件都包含明确的输出范围指令。`setup.md`、`update-items.md` 和 `translate-items.md` 携带完整规则：

> **不要修改 `content/` 目录之外的任何文件。不要编辑 `app/`、`components/`、`lib/`、`scripts/` 或任何配置文件。你的输出限于：`content/config.ts`、`content/items/*/item.json` 和 `content/items/*/_category.json`。**

`setup-shipping.md` 以更窄的范围应用同一原则：其输出限于 `content/config.ts`（以及通过正常物品编辑添加的物品级 `weight`/`dimensions`/`shipping_payer`）——绝不写入 Worker 代码或应用代码（见 §23.9）。

### 23.8 `translate-items.md` — 必要内容

技能文件必须包含：

| 章节 | 内容 |
|---|---|
| 触发 | "扫描 `content/items/` 中 `name_{locale}` 或 `description_{locale}` 缺失或为空字符串的 item.json 文件" |
| 语区检测 | 读取 `siteConfig.i18n.availableLocales`；若只有一个非英语语区，自动针对它；否则询问卖家目标语区 |
| 要翻译的字段 | 仅 `name` → `name_{locale}`，`description` → `description_{locale}` |
| 需逐字保留的字段 | `brand`、`model`、`color`、`tags`、`course`、`isbn`、`edition`、价格字段、日期、status、URL |
| Markdown 保留 | 仅翻译散文内容；保留所有 Markdown 语法（`**粗体**`、`*斜体*`、代码段、链接、列表）不变 |
| 型号/品牌保留 | 品牌名、型号、尺寸和技术标识符不翻译；如 "IKEA TRÅDFRI" 保持原样 |
| 合并规则 | 若 `name_{locale}` 已非空，跳过该字段（除非卖家明确要求，否则不覆盖） |
| 输出规则 | 只将新语区字段写入每个 `item.json`；完全保留所有其他字段 |
| 确认 | 展示每件物品的建议翻译；卖家确认、编辑、跳过或全部接受 |
| 范围 | 接受自然语言范围："全部物品"、"仅 electronics"、"只有 iphone-14 物品"、"所有缺中文的" |
| 状态过滤 | 翻译所有状态，包括 `draft` 和 `sold`（翻译持久，物品重新上架或查看档案时有用） |

**技能必须应用的翻译质量指导：**
- 使用适合同级市场（非正式零售语言）的自然口语化表达
- 中文：除非卖家指定繁体中文，否则使用简体中文
- 保留卖家语气：随意描述随意翻译，详细技术描述精确翻译
- 描述中的货币金额、尺寸和型号字符串**不**翻译

**Zod schema 要求（翻译前）：** 技能必须验证 `lib/content/schema.ts` 包含目标语区字段。若 `name_zh` / `description_zh` 在 schema 中但目标语区（如 `name_es`）不在，技能必须提示卖家在继续前将字段添加到 schema，并提供确切的 Zod 代码段。

### 23.9 `setup-shipping.md` — 必要内容

技能文件必须包含：

| 章节 | 内容 |
|---|---|
| 触发 | "引导卖家启用可选的运费估算器（§29）" |
| 配置步骤 | 在 `content/config.ts` 中添加 `siteConfig.shipping`（`enabled`、`proxyUrl`、`defaultPayer`、`origin {zip, country}`） |
| Worker 部署 | 指向 `workers/shipping-rate-proxy/README.md`；`wrangler deploy`，`ALLOWED_ORIGIN` = 确切的 `baseUrl`，密钥通过 `wrangler secret put` |
| 物品要求 | 提醒卖家每个可运输物品需要 `weight` 和 `dimensions`，以及一个开放式运费档位 |
| 输出规则 | 只写入 `content/config.ts`（及通过正常物品编辑的物品 `weight`/`dimensions`）；绝不触碰 Worker 代码或应用代码 |

---

## 24. CI/CD 管道——GitHub Actions 工作流规范

三个工作流文件位于 `.github/workflows/`，随项目发布：

| 工作流 | 触发 | 用途 |
|---|---|---|
| `deploy.yml` | push 到 `release`、"Release Seller Template" 的 `workflow_run`、手动 | 构建 + 部署静态站点到 GitHub Pages |
| `ci.yml` | push 到 `develop`/`release`、PR、手动 | 质量门控：`pnpm type-check` + `lint` + `test`（§24.5） |
| `release-seller.yml` | `v*` tag、手动 | 重置 `release` 分支并晋升卖家技能（§24.6） |

三者都不需要 CDN 凭据——构建读取已提交的 `lib/generated/image-manifest.json`。

### 24.1 工作流文件

```yaml
# .github/workflows/deploy.yml
name: 部署到 GitHub Pages

on:
  push:
    branches: [release]
  workflow_run:
    workflows: ["Release Seller Template"]   # release 之后也立即部署
    types: [completed]
  workflow_dispatch:        # 允许从 GitHub UI 手动触发

permissions:
  contents: read
  pages: write
  id-token: write           # OIDC Pages 部署所需

concurrency:
  group: "pages"
  cancel-in-progress: true  # 新 push 时取消被取代的部署

jobs:
  build:
    runs-on: ubuntu-latest
    # 对 workflow_run 触发，仅在 release 工作流成功时继续。
    if: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: release      # 始终构建 release 分支

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

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
          path: ./out       # Next.js 静态导出输出目录

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

> **测试门控：** 测试在独立的 `ci.yml` 质量门控工作流（§24.5）中运行，而非 `deploy.yml` 内的作业。`deploy.yml` 只构建 + 部署已经过验证的 `release` 分支。

### 24.2 GitHub 仓库设置（一次性）

| 设置 | 值 | 位置 |
|---|---|---|
| Pages 来源 | **GitHub Actions** | 仓库 → Settings → Pages → Source |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | 仓库 → Settings → Variables → Actions |
| 自定义域名 | 你的域名 | 仓库 → Settings → Pages → Custom domain |

> **不需要密钥。** `NEXT_PUBLIC_SITE_URL` 是仓库变量（不是密钥）——不敏感。CDN 凭据从不添加到 GitHub Actions。

### 24.3 构建失败通知

GitHub Actions 在工作流失败时自动给仓库所有者发邮件。无需额外配置。构建在这些情况下以 `exit 1` 失败：

| 失败 | 脚本 | 退出码 | 原因 |
|---|---|---|---|
| `prebuild` 配置检查失败 | `scripts/check-config.ts` | 1 | `baseUrl` 仍含占位符域名，或某语区在 `i18n.translations` 中缺失/不完整（73 个必需键）——见 §28 |
| `prebuild` sync-images 失败 | `scripts/sync-images.ts` | 1 | `content/items/` 目录不可读（文件权限错误） |
| `prebuild` search-index 失败 | `scripts/build-search-index.ts` | 1 | `loadCategories()` 抛出（目录结构异常） |
| TypeScript 错误 | `next build` | 1 | 应用代码中的类型错误（非 `content/`——那些经 Zod 验证） |
| `next build` 输出错误 | `next build` | 1 | 缺少必需文件、损坏的导入 |
| 站点地图生成失败 | `scripts/postbuild.ts` | 1（传播） | `next-sitemap` 崩溃（如无效 `baseUrl`） |

> **图片清单缺失：** 不是构建失败。`sync-images.ts` build-check 模式记录警告并退出 0（优雅降级）。站点构建并部署；在卖家运行 `pnpm upload-images` 并推送清单之前，物品图片显示为损坏。

### 24.4 Vercel 部署（备用）

仓库连接后，Vercel 在 push 到 `release` 时自动部署（在 Vercel 项目设置中将部署分支设为 `release`）。无需工作流文件。Vercel 直接使用 `pnpm build`（读取 `package.json` 脚本）。`prebuild` 和 `postbuild` npm 生命周期钩子自动运行。

| Vercel 设置 | 值 |
|---|---|
| 框架预设 | Next.js（自动检测） |
| 构建命令 | `pnpm build`（从 `package.json` 自动检测） |
| 安装命令 | `pnpm install`（**不要**用 `--prod`——构建时需要 devDependencies） |
| 输出目录 | `.next`（Vercel 模式）或 `out/`（静态模式——在 Vercel 设置中将 Output Directory 设为 `out`） |
| 环境变量 | `NEXT_PUBLIC_SITE_URL`、`BLOB_READ_WRITE_TOKEN`（如使用 Vercel Blob） |

### 24.5 `ci.yml` — 质量门控

在 push 到 `develop`/`release` 和 pull request 时运行。这是测试/lint/类型检查门控实际所在（§25.5 曾归因于 `deploy.yml` 测试作业的要求）：

```yaml
# .github/workflows/ci.yml（缩写）
on:
  push:
    branches: [develop, release]
  pull_request:
  workflow_dispatch:

jobs:
  quality:
    name: Type-check, lint, and test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm type-check
      - run: pnpm lint
      - run: pnpm test
```

### 24.6 `release-seller.yml` — 卖家模板发布

由 `v*` tag 触发。它从打 tag 的提交创建/重置 `release` 分支，并晋升面向卖家的 AI 工件：

- 将 `.claude/seller/CLAUDE.md` → `.claude/CLAUDE.md`（面向卖家的上下文替换开发版）。
- 将其他每个 `.claude/seller/*.md` → `.claude/skills/<name>.md`。
- 强制推送 `release`（它始终被重新生成，从不手工编辑）。随后 `deploy.yml` 构建该分支（也由该工作流的 `workflow_run` 完成触发）。

当前缺口见 §23.4：`.claude/seller/` 只有 `CLAUDE.md`，因此在向那里添加技能文件之前，`.claude/skills/` 会被晋升为空。

---

## 25. 测试策略

### 25.1 理念

项目有一小组良好隔离的纯函数和清晰的构建时/运行时边界。测试针对有非平凡逻辑的函数；组件渲染和路由通过 `pnpm build`（TypeScript + Next.js 静态生成）作为编译时门控。

### 25.2 测试运行器

| 包 | 版本 | 用途 |
|---|---|---|
| `vitest` | `^2.0.0` | 测试运行器；快速，ESM 原生，兼容 TypeScript |
| `@vitest/coverage-v8` | `^2.0.0` | 覆盖率报告（可选） |
| `jsdom` | `^25.0.1` | 组件测试的 DOM 环境 |
| `@testing-library/react` | `^16.3.2` | jsdom 测试中渲染/查询组件 |
| `@testing-library/dom` | `^10.4.1` | `@testing-library/react` 的 peer |

均列为 `devDependencies`。`package.json` 脚本：
```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage"
```

**`vitest.config.ts` 事实：** 默认 `environment: "node"`，`@` 别名映射到仓库根目录，`esbuild: { jsx: "automatic" }`（tsconfig 使用 `"jsx": "preserve"`，因此 Vitest 需要显式 JSX 运行时来编译 `.tsx` 测试）。需要 DOM 的组件测试通过每文件的 `// @vitest-environment jsdom` 文档注释指令选择加入。

### 25.3 测试文件位置

测试与被测模块并置，使用 `.test.ts` / `.test.tsx` 后缀。当前套件为 **36 个测试文件（约 585 个测试）**，`pnpm test` 下全部通过：

```
lib/utils/          pricing、haversine、date、i18n、shipping、slug、units、
                    concurrency、jsonld、priceFilterStrategies   （10 个文件）
lib/content/        schema.test.ts、loader.test.ts               （2 个文件）
lib/images/         local.test.ts、stripMetadata.test.ts         （2 个文件）
components/         JsonLd、badges、useFilters、useSearch、useDistancePricing、
                    LocationPriceBar、PlatformButton、MakeOfferButton、
                    LocalizedItemContent、useIncrementalReveal   （10 个文件）
scripts/            update-site.test.ts、studioFields.test.ts    （2 个文件）
scripts/lib/        imageSync、itemEdit、itemFields、itemTemplate、markSold、
                    studioApi、studioGit、studioImages、studioSync  （9 个文件）
studio/             csrfGuard.test.ts                            （1 个文件）
```

> **没有** `scripts/sync-images.test.ts`——CDN 管道由 `scripts/lib/imageSync.test.ts` 覆盖。组件测试（`components/` 文件）通过每文件的 `// @vitest-environment jsdom` 指令在 jsdom 中运行。Seller Studio 的覆盖仅为后端（`studioApi` / `studioGit` / `studioImages` / `studioSync` / `itemEdit` / `itemFields` / `csrfGuard` / `studioFields`）——见 §30。

### 25.4 必要测试用例

#### `lib/utils/pricing.test.ts`

| 用例 | 输入 | 预期 |
|---|---|---|
| 距离在档位内 | `D=3`，档位 `[{max:5, $15}, {min:5, max:15, $20}]` | `$15` 档位 |
| 距离在精确边界 | `D=5` | `$15` 档位（含：`D ≤ miles_max`） |
| 距离在间隙中 | `D=5.5`，档位 max=5 和 min=6 | `miles_max=5` 的档位（最近的从下方） |
| Infinity（已拒绝/回退） | `D=Infinity`，无开放式档位 | 金额最高的档位 |
| Infinity 有开放式档位 | `D=Infinity`，最后档位无 `miles_max` | 开放式档位 |
| 多个开放式档位 | 两个 `miles_max` 缺失的档位 | 数组顺序中的第一个 |
| 大数字 max 不是开放式 | `miles_max: 99999` 的档位 | 不视为开放式 |
| 空档位 | `price.tiers: []` | `null`（→"联系询价"） |
| `negotiable: true` | 任何已解析档位 | 返回档位，Price 对象上保留 `negotiable` 标志 |

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
| 缺失 `price.tiers` | 无 `price` 字段 | `price.tiers: []` |

#### `lib/utils/date.test.ts`

| 用例 | `isoDate` | `now` | 预期 |
|---|---|---|---|
| 今天 | `"2026-05-31"` | `2026-05-31T10:00Z` | `"Today"` |
| 昨天 | `"2026-05-30"` | `2026-05-31T10:00Z` | `"Yesterday"` |
| 3 天前 | `"2026-05-28"` | `2026-05-31T10:00Z` | `"3 days ago"` |
| 2 周前 | `"2026-05-17"` | `2026-05-31T10:00Z` | `"2 weeks ago"` |
| null | `null` | 任意 | `""` |
| 无效日期 | `"not-a-date"` | 任意 | `""` |
| 完整 ISO 时间戳 | `"2026-05-28T10:00:00Z"` | `2026-05-31T10:00Z` | `"3 days ago"` |

#### `lib/content/loader.test.ts`

使用在 `beforeEach` 中创建、`afterEach` 中清理的临时 `content/` 固定目录：

```ts
// 固定目录：content/items/test-cat/test-item/item.json
// 测试：
// - loadCategories() 返回 slug 和 displayName 正确的分类
// - loadItemsByCategory("test-cat") 返回按可见性过滤的物品
// - loadItem("test-cat", "test-item") 返回解析后的物品
// - loadItem("test-cat", "missing") 返回 null（不抛出）
// - draft 物品从 loadItemsByCategory 排除
// - 超过保留期的 sold 物品从 loadItemsByCategory 排除
// - 图片清单键解析到 CDN URL
// - 缩略图：名为 "cover.*" 的文件固定；否则按字母顺序取第一个
```

### 25.5 在 CI 中运行测试

测试在 **`ci.yml`**（§24.5）中对代码进行门控，它在 push 到 `develop`/`release` 和 pull request 时运行 `pnpm type-check`、`pnpm lint` 和 `pnpm test`。`deploy.yml` 内没有单独的 `test` 作业——当提交到达 `release` 分支时它已通过 CI 质量门控，`deploy.yml` 只构建 + 部署。

### 25.6 未做单元测试的内容

> 组件渲染和脚本**现在**已有单元测试（见 §25.3 清单）。Vitest 套件之外仍包括：

| 领域 | 原因 |
|---|---|
| 完整 E2E / 视觉回归 | jsdom 组件测试覆盖逻辑；真实浏览器流程和视觉（Playwright/Cypress）是未来添加 |
| 真实浏览器 Geolocation API | `useDistancePricing` 逻辑已测试；实际的 `navigator.geolocation` 提示需要真实浏览器（`pnpm dev`） |
| 真实 CDN 上传往返 | `imageSync` 逻辑（校验和、清除、失败隔离）用桩测试；真实 R2/Blob 上传需要凭据——见 §19 |
| Aceternity UI 组件 | 第三方；未修改；视觉回归不在 v1 范围内 |
| `workers/shipping-rate-proxy` | 独立子项目，从 `pnpm test` 范围排除（自有 `package.json`）；由手动 `wrangler dev` 验证覆盖——见 §29 |

---

## 26. 错误监控与构建告警

### 26.1 构建失败告警（GitHub Pages 路径）

GitHub Actions 在任何工作流作业失败时自动给仓库所有者发送邮件。无需配置。

**确保告警送达卖家：**
- GitHub 账号邮箱必须已验证且未禁用通知
- Settings → Notifications → "Actions" → "Failed workflows only"（默认）或 "All activity"

### 26.2 构建失败告警（Vercel 路径）

Vercel 在部署失败时给项目所有者发送邮件。无需配置。需要 Slack/webhook 集成的团队可在 Vercel 项目设置中启用。

### 26.3 运行时 JavaScript 错误监控（可选，未来）

v1 中未配置运行时错误监控。站点完全静态，客户端 JavaScript 表面最小。如需运行时监控：

| 选项 | 集成点 | 备注 |
|---|---|---|
| Vercel Analytics | 已接线；追踪页面浏览量，无错误追踪 | Hobby 计划免费 |
| Sentry | 添加 `@sentry/nextjs`；配置 `sentry.client.config.ts` | 免费层涵盖个人站点 |

Sentry 集成是增量变更——添加包、运行向导（`npx @sentry/wizard@latest -i nextjs`）并在环境变量中设置 `SENTRY_DSN`。无需更改现有代码。

### 26.4 图片 CDN 可用性

站点没有机制在运行时检测 CDN 故障（完全静态，无服务器）。如果 Cloudflare R2 或 Vercel Blob 不可用：
- 图片显示为损坏的 `<img>` 元素，物品 `alt` 文本可见
- 页面其余部分（名称、价格、联系）正常渲染
- 不向卖家报告错误

**缓解：** 使用带 `onError` 处理器的 `<AdaptiveImage>`，应用 CSS class 显示占位符/骨架。这是当前不在范围内的增量 UI 改进。

### 26.5 `pnpm upload-images` 失败处理

上传失败处理和重试行为的完整规范见 TECH_REQUIREMENTS_zh.md §7（图片同步脚本）和 §27（图片上传失败恢复）。

---

## 27. 图片上传失败恢复

### 27.1 失败模式

| 失败 | 检测 | 恢复 |
|---|---|---|
| 缺少环境变量（R2 或 Blob） | 上传模式步骤 1：检查所有必要变量；打印清晰错误指出缺失变量；在任何上传前以 exit 1 退出 | 卖家将缺失变量添加到 `.env.local` 并重新运行 |
| 上传期间网络超时 | 提供商 SDK 抛出；每个文件捕获 | 记录 `[upload-images] WARN: failed to upload {key} — {error.message}`；跳过该文件；继续处理其余文件；清单/校验和为成功的文件写入，脚本最后以 `1` 退出（失败文件在下次运行重试） |
| 部分运行（脚本被中途终止） | 校验和和清单在成功运行**结束**时写入（步骤 8–9） | 不完整运行不更新清单和校验和；重新运行时重新上传上次提交清单状态中没有的所有文件 |
| CDN 返回非 2xx | 与网络超时同样处理 | 相同的下次运行重试行为 |
| 清单写入失败（磁盘满、权限） | 所有上传成功后 `fs.writeFile` 抛出 | 记录错误；`exit 1`；已上传的文件在 CDN 上但不在清单中——重新运行会重新上传它们（无害的重复；CDN 以相同内容覆盖） |
| `content/items/` 不可读 | `fs.readdir` 抛出 | `exit 1`；不写入任何部分状态 |

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
| 部分文件失败 | `1` | **是——为成功的文件写入。** 失败文件保留之前的 CDN URL（或缺失）。重新运行以重试失败（§27.5）。 |
| 仅建议性质量警告（无失败上传） | `0` | 是 |
| 环境变量缺失 | `1` | 否 |
| `content/items/` 不可读 | `1` | 否 |
| 清单写入失败 | `1` | 否（之前清单完整） |

> `sync-images.ts runUpload()` 在 `result.failures.length > 0` 时调用 `process.exit(1)`，即使它已为成功的文件写入清单/校验和。只有建议性质量警告（`warnings=N` 计数）使退出码保持 `0`——卖家仍必须检查摘要。

### 27.5 下次运行重试

因为失败文件不会被添加到 `.image-cache/checksums.json`，下次 `pnpm upload-images` 调用会将它们检测为"新"（无保存的校验和）并重新尝试上传。无需手动干预——重新运行命令即为恢复操作。

---

## 28. 配置构建门控 — `scripts/check-config.ts`

> 此处原始规范描述了一个位于 `lib/config/validate.ts`、含 `validateSiteConfig()` 函数并从 `sync-images.ts` 调用的 Zod 模块。**该模块从未构建**——`lib/config/` 只包含 `types.ts`，没有任何东西引用 `validateSiteConfig`。实际的、已发布的构建时守卫是 `scripts/check-config.ts`，记录如下。

### 28.1 原理

`content/config.ts` 是 TypeScript，因此编译器能捕获缺失字段和错误类型。但它无法捕获**有效但仍错误的 URL**：`new URL("https://your-domain.com")` 成功，因此忘记设置 `baseUrl` 的卖家会得到一次干净的构建，静默发布占位符 canonical/OG/JSON-LD URL——一个没有错误的 SEO 陷阱。`check-config.ts` 在这类错误时让构建明确失败。

### 28.2 检查内容

`scripts/check-config.ts` 运行两项检查，任一失败即以 exit 1 退出：

1. **占位符 `baseUrl`。** 若 `siteConfig.baseUrl` 包含 `PLACEHOLDER_DOMAIN`（`"your-domain.com"`，来自 `lib/utils/templateStatus.ts`），失败并提示卖家设置其真实部署域名。
2. **翻译完整性。** 对 `siteConfig.i18n.availableLocales` 中的每个语区，要求有 `translations.{locale}` 条目，并要求 73 个 **`REQUIRED_KEYS`** 中的每一个都存在于该条目或默认语区条目中（回退）。缺失条目或缺失键会使构建失败，并指出语区和确切的缺失键。

> 73 个 `REQUIRED_KEYS` 是 87 个 `UIStrings` 键的子集。其余约 14 个（运费 §29.7、价格过滤、新上架）在构建时可选，运行时回退——见 §22.8。

### 28.3 集成点

`check-config.ts` 是 `prebuild` 的**第一**步：

```json
"prebuild": "tsx scripts/check-config.ts && tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts"
```

因为 `prebuild` 在 `next build` 之前运行，无效配置会在生成任何页面之前停止构建。它也作为单独一行列在 §24.3 构建失败表中。

### 28.4 运行时不验证的内容

TypeScript 已在编译时（`pnpm type-check`）强制这些：
- 缺失必填字段（TypeScript 非可选类型）
- 错误字段类型（如期望 `number` 处为 `string`）
- 无效 `ui.*` 槽位值（由 `BackgroundOption` / `ItemGridOption` 联合类型捕获）
- 值范围如 `location.lat` 边界（v1 中不在运行时强制——仅 TypeScript）

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

## 30. Seller Studio — 本地管理 GUI

Seller Studio（`pnpm studio`）是一个**仅本地**的浏览器仪表板，用于管理 `content/` 而无需手工编辑 JSON：物品表、批量状态更改、图片面板、schema 驱动的编辑表单、物品创建、CDN 同步和 git 发布。它是一个 Vite SPA（`studio/`），与一个小型 API（`scripts/lib/studioApi.ts`）一起由单个启动器提供服务。

> 卖家仅通过浏览器与之交互。它从不要求卖家编辑 `content/` 之外的文件——发布路径额外写入 `lib/generated/image-manifest.json`，并对 `content/` + 清单运行 git（镜像 `pnpm push`）。

### 30.1 启动器 — `scripts/studio.ts`

- `pnpm studio [--port N]`；默认端口 **5174**，`--port` 验证为 1024–65535 之间的整数（`strictPort=false`）。**仅绑定 127.0.0.1**——该服务器写文件、持有 CDN 凭据并运行 git，因此绝不能从网络访问。
- 通过 `loadDotEnvLocal()`（`scripts/lib/loadEnv.ts`；现有环境变量始终优先，因为 `tsx` 不自动加载 `.env.local`）加载 `.env.local`。
- 当 `vite` 未安装或 `studio/vite.config.ts` 缺失时**快速失败**并给出清晰错误（提示用户运行 `pnpm update-site`）。
- CDN 适配器（R2 / Vercel Blob / local，按 `siteConfig.imageStorage.provider`）在**每次同步运行时**构建，而非启动时——缺失的 CDN 凭据表现为同步期间的 SSE 错误事件，而非启动失败。

### 30.2 前端 — `studio/` Vite SPA

- 入口链：`studio/index.html` → `src/main.tsx` → `src/App.tsx`；面板位于 `src/panes/`：`ItemList`、`BulkToolbar`、`Drawer`、`EditForm`、`ImagePane`、`NewItemDialog`、`PublishPane`、`SyncBar`。
- `src/api.ts` 包装每个 `/api/*` 路由；`streamSync()` 是一个异步生成器，通过 `fetch` `ReadableStream` 解析同步 **SSE 流**（不用 `EventSource`，因为请求是 POST）。
- `src/fields.ts` 声明驱动 `EditForm` 的 `FIELD_GROUPS`；路径必须与 `scripts/lib/itemFields.ts` 中的权威一致。每个分组带一个稳定的 `id: GroupId`（字符串字面量联合类型）和一个可选的 `defaultOpen`。`defaultOpen` 只作用于**编辑表单**——没有该标志的分组渲染为折叠的 `<details>`。`DefaultsPane` 不复用这个标志，而是维护自己的 `ReadonlySet<GroupId>` 置顶集合：卖家预设一次的组（收款、面交）和日常编辑要动的组不是同一批；把它标注成 `GroupId` 类型，使得重命名分组会**编译失败**，而不是静默地「匹配不到、全部折叠」。
- `src/editForm.ts` 以纯函数形式保存写入逻辑（`buildEdits`、`draftFromFields`、`fieldIsDirty`、各分组计数），可直接单测；`src/fieldValues.ts` 存放它与组件共用的 `toInput` / `fromInput` 转换。`fieldIsDirty` 是「改动过」的唯一定义——未保存计数与实际下发的 edit 不可能对不上。
- `studio/vite.config.ts` 安装 `studioApiPlugin` 中间件：每个 `/api/*` 请求经过 `checkStudioCsrf` → 32 MB 请求体上限 → `handleStudioRequest`。`App.tsx` **不保留本地物品状态**——每次写入后从服务器重新获取，因此没有客户端漂移。

### 30.3 API 接口 — `scripts/lib/studioApi.ts`

| 方法 + 路由 | 用途 |
|---|---|
| `GET /api/items` | 列出每件物品（+ 图片文件、最低档金额）。每物品加载错误相互隔离——一个坏 `item.json` 不会使整个响应失败。 |
| `POST /api/items` | 创建新物品（分类选择器 + kebab-case 名称；服务器用共享 slug 允许列表 + 包含性重新检查）。可选 `applyDefaults` 标志（默认 `true`）；为 `false` 时脚手架为不含两层默认值的裸模板。 |
| `POST /api/items/bulk-status` | 对选择批量标记 sold/pending/available/draft，带每物品失败报告。 |
| `POST /api/items/bulk-apply-tiers` | 用各物品自身合并后的默认值覆盖所选物品的 `price.tiers`；无默认档位或档位已一致的跳过，逐项报告失败。 |
| `GET /api/items/<cat>/<item>` | 读取单个物品的可编辑字段。 |
| `PATCH /api/items/<cat>/<item>` | 通过保留注释的 JSONC 编辑应用 `FieldEdit[]`（path+value）。 |
| `GET/PUT /api/defaults?scope=site\|<cat>` | 读取 / 写入该作用域的稀疏 `_defaults.json`（`site` → `content/items/_defaults.json`，否则为对应分类自己的）。空 PUT 请求体删除该文件；PUT 会创建缺失的分类文件夹。无效文件以 400 失败并指明文件与字段。 |
| `GET .../images`、`GET .../images/<filename>` | 列出 / 提供照片（包含性验证；编码的 `%2F` 遍历被阻断）。 |
| `POST .../images`、`POST .../images/reorder`、`DELETE .../images/<filename>` | 上传（base64，魔数字节嗅探）、重新排序、删除。 |
| `POST /api/sync-images` | 启动 CDN 同步；返回 **SSE** 进度流（`progress`/`done`/`error`）。 |
| `GET /api/changes` | 供发布面板使用的 git 状态（未提交更改）。 |
| `POST /api/publish` | `git add content + manifest`、提交、推送。同步运行时被拒绝（409）。 |
| `POST /api/export-pdf` | 通过 headless Chromium 生成合并目录 PDF 并以 `application/pdf` 形式返回。请求体：`{ locale, priceStrategy, categories, statuses }` —— `priceStrategy` 为 `lowest`/`highest`/`pickup`/`shipping`/`average` 之一；`statuses` 可为 5 种 `Status` 值的任意子集；`categories` 为任意分类 slug 列表。当请求体校验失败（`priceStrategy`/`status` 非法或 `locale` 不在可用语言列表中）、过滤后没有可导出商品、或未安装 Chromium 时返回 `400` 及 `{ error }`。 |

路由正则匹配原始百分号编码路径，并在匹配**之后**逐段解码（防遍历）。

### 30.4 安全模型

- **CSRF 守卫**（`studio/csrfGuard.ts`，在 `studio/csrfGuard.test.ts` 中单元测试）：所有非 `GET`/`HEAD` 方法要求 `Content-Type: application/json`（否则 `415`），并且——当存在 `Origin` 头时——它必须等于服务器自身的源（`http://Host`，否则 `403`）。它按方法**失败关闭**，因此未来的 PUT/PATCH/DELETE 路由会自动受保护。
- **发布安全**（`scripts/lib/studioGit.ts`）：`git add` 只命名可发布路径（`content/` 和 `lib/generated/image-manifest.json`——与 `pnpm push` 相同），**绝不使用 `git add -A`**，因此 `.env.local`（含 CDN 凭据）绝不会被顺带提交。仅用参数数组的 `execFile`（无 shell）；提交消息通过 stdin；处理 detached HEAD / 未出生分支情况。
- **`reserved_for` 从不被任何 Studio 路径读取、写入或发送**（铁律 4）。
- 可编辑字段由 `scripts/lib/itemFields.ts` 强制——一个独立的 Zod 镜像（无 `.catch`/`.default`/`.preprocess`，因此 `safeParse` 失败即硬拒绝）；漂移测试断言与 `itemJsonSchema` 在每个嵌套级别的一致性。

### 30.5 CDN 同步（`scripts/lib/studioSync.ts`）

一次一个的互斥锁（保存在 `globalThis` 上以便在 Vite 双重打包中幸存）确保只有一次同步运行；锁在工作完成时释放，而非客户端断开时。进度以 SSE 事件交付；每文件失败在 UI 中渲染；同步后调用 `resetManifestCache()`，使后续读取显示最新的 CDN URL。

### 30.6 测试覆盖

Studio 覆盖**仅后端**：`studioApi`、`studioGit`、`studioImages`、`studioSync`、`itemEdit`、`itemFields`、`csrfGuard` 和 `studioFields` 测试（见 §25.3）。SPA UI 本身不做单元测试。

---

*本文档是 v1 实施的权威技术规范。*
