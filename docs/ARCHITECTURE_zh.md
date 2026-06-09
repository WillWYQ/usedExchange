# UsedExchange — 架构说明

> 本文档为开发者参考文档。完整设计规范见 [DESIGN_zh.md](DESIGN_zh.md)；构建计划见 [IMPLEMENTATION_PLAN_zh.md](IMPLEMENTATION_PLAN_zh.md)；非技术卖家操作指南见 [../SETUP_GUIDE.md](../SETUP_GUIDE.md)。
>
> 🇺🇸 English version: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 目录结构

```
usedExchange/
├── app/                              ← Next.js App Router 页面 + 根布局
│   ├── layout.tsx                    ← 根布局：ThemeProvider > LocaleProvider > BackgroundEffect > SiteHeader/Footer
│   ├── globals.css                   ← Tailwind v4 指令 + CSS 自定义属性
│   ├── page.tsx                      ← 首页 (/)
│   ├── about/page.tsx                ← 模板演示域名下的项目介绍页
│   ├── all/page.tsx                  ← 全部浏览 (/all)
│   ├── sold/page.tsx                 ← 已售档案 (/sold)
│   ├── not-found.tsx                 ← 全局 404 页面
│   ├── [category]/page.tsx           ← 分类列表页 (/[category])
│   └── [category]/[item]/page.tsx    ← 物品详情页 (/[category]/[item])
│
├── components/
│   ├── category/                     ← CategoryCard, CategoryGrid
│   ├── common/                       ← AdaptiveImage, JsonLd, RecentlyViewed, ShareButton, useIncrementalReveal
│   ├── contact/                      ← ContactSection, PlatformButton, QRModal
│   ├── filters/                      ← FilterBar, SortSelect, useFilters
│   ├── home/                         ← RecentlyListedSection
│   ├── i18n/                         ← LocaleProvider, LocaleSwitcher, useLocale, useT
│   ├── intro/                        ← ProjectIntro（卖家配置 baseUrl 前显示）
│   ├── item/                         ← 所有物品渲染组件（见下方物品组件说明）
│   ├── layout/                       ← Breadcrumb, SiteHeader, SiteFooter
│   ├── pricing/                      ← DistancePricingContext, LocationPriceBar, useDistancePricing, useGeolocation
│   ├── search/                       ← SearchBar, SearchBarClient, useSearch
│   ├── theme/                        ← ThemeProvider, ThemeToggle
│   ├── ui/                           ← Aceternity UI 库（27 个组件，由 `pnpm setup-ui` 一次性安装）
│   └── ui-adapters/                  ← BackgroundEffect, GalleryAdapter, ItemCardAdapter, ItemGridAdapter
│
├── content/                          ← ⚠️ 卖家唯一需要操作的文件夹
│   ├── config.ts                     ← SiteConfig 导出（须与 lib/config/types.ts 一致）
│   └── items/
│       └── <分类>/
│           ├── _category.json        ← 可选：display_name、icon、sort_order、description
│           └── <物品>/
│               ├── item.json         ← 必需：物品元数据（全部字段见 DESIGN.md §5）
│               ├── cover.jpg         ← 固定缩略图（可选命名约定）
│               └── *.jpg/png/webp    ← 附加图片（已加入 .gitignore）
│
├── lib/
│   ├── config/types.ts               ← SiteConfig TypeScript 类型定义
│   ├── content/
│   │   ├── loader.ts                 ← ★ 公开数据访问 API（见下方加载器 API）
│   │   ├── schema.ts                 ← item.json 和 _category.json 的 Zod Schema
│   │   └── types.ts                  ← TypeScript 类型：Item、Category、Price、PriceTier 等
│   ├── generated/
│   │   └── image-manifest.json       ← CDN URL 映射表（已提交到 git，由 pnpm upload-images 写入）
│   ├── images/
│   │   ├── adapter.ts                ← ImageStorageAdapter 接口
│   │   ├── cloudflare-r2.ts          ← CloudflareR2Adapter
│   │   ├── local.ts                  ← LocalAdapter + copyIfChanged 辅助函数
│   │   ├── normalizeR2Url.ts         ← 去除 R2 公开 URL 末尾斜杠
│   │   └── vercel-blob.ts            ← VercelBlobAdapter
│   ├── i18n/
│   │   ├── translations.ts           ← EN_FALLBACK: UIStrings——所有 67 个键的内置英文默认值
│   │   └── getTranslations.ts        ← getTranslations(): UIStrings——服务端解析（始终返回 defaultLocale）
│   ├── search/index.ts               ← buildSearchIndex(): SearchIndexEntry[]
│   ├── ui/types.ts                   ← UIConfig 类型（background、itemGrid、gallery、itemCard 插槽）
│   └── utils/
│       ├── concurrency.ts            ← mapWithConcurrency<T,R>(items, limit, fn)
│       ├── date.ts                   ← formatRelativeDate(), formatAbsoluteDate()
│       ├── haversine.ts              ← haversineInMiles(lat1, lng1, lat2, lng2)
│       ├── i18n.ts                   ← getLocalizedField(item, field, locale)
│       ├── index.ts                  ← 重导出 cn()（clsx + tailwind-merge）
│       ├── jsonld.ts                 ← buildProductJsonLd(), buildBreadcrumbJsonLd()
│       ├── pricing.ts                ← resolveItemPrice(price, resolved)——禁止 "use client"
│       ├── slug.ts                   ← isValidSlug()——kebab-case 验证
│       └── templateStatus.ts         ← isTemplateConfigured()——检测未配置的模板
│
├── scripts/                          ← pnpm run 脚本（tsx，Node.js，不使用浏览器 API）
│   ├── build-search-index.ts         ← 构建前：写入 public/search-index.json
│   ├── check-config.ts               ← 构建前：若 baseUrl 仍为占位符则中断构建
│   ├── create-item.ts                ← pnpm create-item / pnpm new
│   ├── create-template.ts            ← pnpm create-template
│   ├── mark-sold.ts                  ← pnpm mark-sold
│   ├── postbuild.ts                  ← 构建后：next-sitemap
│   └── sync-images.ts                ← pnpm upload-images / dev-sync / build-check
│
├── public/
│   ├── items/                        ← 本地图片（.gitignore；开发/构建时自动生成）
│   ├── contact/                      ← 二维码图片（.gitignore；从 content/contact/ 复制）
│   └── search-index.json             ← Fuse.js 索引（.gitignore；构建前步骤生成）
│
├── .github/workflows/
│   ├── ci.yml                        ← 提交时类型检查 + lint + 测试
│   ├── deploy.yml                    ← 从 release 分支构建并部署到 GitHub Pages
│   └── release-seller.yml            ← 自动化发布分支管理
│
├── next.config.ts                    ← 静态导出配置、图片域名
├── tsconfig.json                     ← strict + noUncheckedIndexedAccess + @/* 路径别名
├── vitest.config.ts                  ← Vitest（jsdom 环境，路径别名）
├── .env.example                      ← 环境变量文档
└── next-sitemap.config.js            ← next-sitemap 配置
```

---

## 数据流

### 构建时（静态导出）

```
content/items/**/item.json
    │
    ▼  lib/content/schema.ts
    Zod 验证并规范化所有字段
    reserved_for 被剥离；URL 协议白名单校验；不安全值强制转为默认值
    │
    ▼  lib/content/loader.ts
    读取物品目录 + image-manifest.json（Promise 级缓存）
    应用可见性过滤（草稿隐藏；超出留存期的已售物品隐藏）
    从清单解析 CDN URL，或回退到 /items/<key>
    │
    ├──► loadHomePageData()     ──► app/page.tsx
    ├──► loadCategories() +
    │    loadItemsByCategory()  ──► app/[category]/page.tsx
    ├──► loadItem()             ──► app/[category]/[item]/page.tsx
    ├──► loadBrowseAllPageData()──► app/all/page.tsx
    └──► loadSoldItems()        ──► app/sold/page.tsx
    │
    ▼  next build
    所有页面渲染为静态 HTML → out/
    无需服务器、数据库或运行时凭证
```

### 客户端运行时（浏览器）

```
浏览器水合
    ├─► useGeolocation()          请求 Geolocation API 权限
    │       │ 已授权 → { lat, lng }
    │       │ 已拒绝 → fallback
    │       ▼
    ├─► useDistancePricing()      haversineInMiles(卖家, 买家) → ResolvedDistance
    │       │
    │       ▼
    └─► resolveItemPrice()        从 price.tiers 中选择匹配的 PriceTier
            （lib/utils/pricing.ts——可在服务端和客户端导入）
```

### 图片上传（仅在卖家本机）

```
content/items/<分类>/<物品>/*.jpg
    │
    ▼  pnpm upload-images   (scripts/sync-images.ts --mode upload)
    每个文件计算 SHA-256 校验和 → 未变更文件跳过
    将新增/修改的文件上传到 CDN（R2、Vercel Blob 或本地）
    写入 lib/generated/image-manifest.json  ← 提交到 git
    写入 .image-cache/checksums.json        ← 已加入 .gitignore
    │
    ▼  git commit lib/generated/image-manifest.json
    CI 读取此清单——CI 环境无需 CDN 凭证
```

---

## lib/ 模块参考

### `lib/content/loader.ts` — 公开数据 API

所有页面组件必须调用以下函数，禁止直接读取 `content/items/`。

| 函数 | 返回值 | 使用位置 |
|---|---|---|
| `loadHomePageData()` | `{ categories: Category[], recentItems: Item[] }` | `app/page.tsx` |
| `loadCategories()` | `Category[]` | `app/[category]/page.tsx`、`app/[category]/[item]/page.tsx` |
| `loadItemsByCategory(slug, manifest?)` | `Item[]` | 分类页 + 物品详情页 |
| `loadItem(categorySlug, itemSlug)` | `Item \| null` | `app/[category]/[item]/page.tsx` |
| `loadBrowseAllPageData()` | `{ items: Item[], categories: Category[] }` | `app/all/page.tsx` |
| `loadSoldItems()` | `Item[]` | `app/sold/page.tsx` |
| `loadAllItemsRaw()` | `Item[]` | 仅供脚本和 `buildSearchIndex()` 使用——不应用可见性过滤 |
| `resetManifestCache()` | `void` | 仅供测试使用 |

**性能不变性：** 图片清单（`lib/generated/image-manifest.json`）通过模块级 Promise 缓存在每个进程中只读取一次。同时需要分类和物品数据的函数（`loadHomePageData`、`loadBrowseAllPageData`）仅解析一次所有物品——不要在同一渲染流程中组合 `loadCategories()` + `loadItemsByCategory()`，否则会重复解析所有物品。

### `lib/content/schema.ts` — Zod 验证

验证并规范化原始 `item.json` 数据。关键行为：

- `reserved_for` 被 Zod 的默认 `strip` 模式剥离，永远不会出现在 `Item` 类型中。
- URL 字段（`original_link`、`stripe_payment_link`、`venmo_payment_request`、`youtube_link`）通过 `http:`/`https:` 白名单验证——`javascript:`、`data:` 等协议被强制转为 `""`。
- 负数字段强制转为 `null`；无效的 `dimensions`/`weight` 子对象强制转为 `null`，而非导致整个物品解析失败。
- `quantity` 缺失或 `< 1` 时强制转为 `1`。
- 当 `name` 存在但其他字段有 Schema 错误时，加载器以 `{ name }` + 所有默认值重新解析来恢复该物品，而非静默丢弃。

### `lib/utils/pricing.ts` — 价格档位解析

```ts
resolveItemPrice(price: Price, resolved: ResolvedDistance): PriceTier | null
```

- `price.tiers` 为空时返回 `null`——调用方显示"联系询价"。
- `resolved.source === "fallback"`（地理位置被拒/不可用/空闲）：优先返回开放档位（无 `miles_max`），否则返回金额最高的档位。
- `resolved.source === "detected" | "manual"`：返回第一个满足 `D >= miles_min && D <= miles_max` 的档位。档位之间有间隙时，返回 `miles_max` 最接近 D（从下方）的档位。D 低于所有档位下限时，返回 `miles_min` 最小的档位。

**⚠ 此文件绝对不能添加 `"use client"`**——该函数既在服务端组件中调用（SSG 初始渲染，确保静态 HTML 不会显示空白价格），也在 `useDistancePricing`（客户端 hook）中调用。添加 `"use client"` 会破坏服务端导入路径。

### `lib/images/` — 存储适配器模式

`ImageStorageAdapter` 接口（定义在 `lib/images/adapter.ts`）由三个类实现：

| 类 | 提供商键 | 文件 |
|---|---|---|
| `CloudflareR2Adapter` | `"cloudflare-r2"` | `lib/images/cloudflare-r2.ts` |
| `VercelBlobAdapter` | `"vercel-blob"` | `lib/images/vercel-blob.ts` |
| `LocalAdapter` | `"local"` | `lib/images/local.ts` |

`scripts/sync-images.ts` 在运行时根据 `siteConfig.imageStorage.provider` 实例化正确的适配器。三个适配器均实现 `syncImage(sourcePath, manifestKey, checksum)` 和通过 `loadChecksums`/`getUpdatedChecksums` 实现的增量跳过机制。

### `lib/utils/concurrency.ts`

```ts
mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>
```

有界并发的 `Promise.all` 替代方案。`loader.ts` 用于分类解析（并发 6）和物品解析（每分类并发 24）；`sync-images.ts` 用于上传（并发 8）和质量检查（并发 8），以将文件描述符使用量控制在操作系统 `ulimit` 以内。

### `lib/utils/i18n.ts`

```ts
getLocalizedField(item: Item, field: "name" | "description", locale: string): string
```

当翻译字段非空时返回本地化的 `name_{locale}` 或 `description_{locale}` 值；否则回退到默认语言（英文）值。新增语言只需在 `LOCALE_FIELD_MAP` 中添加一行，并在 `Item` 类型和 `itemJsonSchema` 中添加对应的 `name_{locale}` / `description_{locale}` 字段。

### `lib/utils/haversine.ts`

```ts
haversineInMiles(lat1: number, lng1: number, lat2: number, lng2: number): number
```

两个 WGS-84 坐标点之间的大圆距离（英里）。由 `useDistancePricing` 调用，用于计算买家与卖家之间的距离，驱动价格档位选择。

### `lib/utils/date.ts`

| 函数 | 输入 | 输出 |
|---|---|---|
| `formatRelativeDate(isoDate, now?)` | `"YYYY-MM-DD"` | `"3 days ago"`、`"Today"` 或 `""` |
| `formatAbsoluteDate(isoDate)` | `"YYYY-MM-DD"` | `"June 5, 2026"`（区域无关，UTC） |

`formatAbsoluteDate` 显式解析日期组件，而非使用 `toLocaleDateString()`——无论 CI Runner 的区域设置或时区如何，均能产生确定性结果。

### `lib/utils/templateStatus.ts`

```ts
isTemplateConfigured(): boolean
```

当卖家将 `baseUrl` 替换为真实域名（即不再包含 `"your-domain.com"` 或模板演示域名）时返回 `true`。`app/page.tsx` 用此函数决定显示 `ProjectIntro` 还是实际店铺。`scripts/check-config.ts` 在构建时也执行相同检查。

---

## 组件架构

### 根布局层次

```
<html>
  <body>
    <ThemeProvider>          ← next-themes，遵循 siteConfig.darkMode
      <LocaleProvider>       ← 语言状态存储于 localStorage；暴露 useLocale()
        <BackgroundEffect>   ← 读取 siteConfig.ui.background，渲染 Aceternity 背景
          <SiteHeader />     ← Logo、搜索栏（启用时）、语言切换器
          <main>
            {children}       ← 页面内容
          </main>
          <SiteFooter />     ← 联系平台、构建时间戳
        </BackgroundEffect>
      </LocaleProvider>
    </ThemeProvider>
  </body>
</html>
```

### `"use client"` 规范

服务端组件在 `next build` 期间渲染静态 HTML。客户端边界尽量向上移动，以最大化预渲染内容。

**始终为客户端组件**（文件顶部包含 `"use client"`）：
- 所有定价组件：`DistancePricingContext`、`LocationPriceBar`、`useDistancePricing`、`useGeolocation`
- 所有 i18n 运行时：`LocaleProvider`、`LocaleSwitcher`、`useLocale`、`useT`
- 所有过滤器：`FilterBar`、`SortSelect`、`useFilters`
- 搜索：`SearchBarClient`、`useSearch`
- `RecentlyViewed`、`ShareButton`、`MakeOfferButton`、`QRModal`
- `ThemeProvider`、`ThemeToggle`
- UI 字符串消费者：`SiteHeader`、`MetadataTable`、`ConditionBadge`、`StatusBadge`、`ConditionGuide`、`PricingTable`、`PricingTableToggle`、`FreshnessLabel`、`RecentlyListedSection`、`ContactSection`
- 所有 `components/ui/*`（Aceternity）组件

**服务端组件**（不含 `"use client"`）：
- 所有 `app/*/page.tsx` 文件（需要 UI 字符串时使用 `getTranslations()`）
- `CategoryGrid`、`CategoryCard`
- `ItemGrid`、`ItemCard`
- `Breadcrumb`、`SiteFooter`
- `QuantityBadge`、`TextbookBadge`
- `JsonLd`、`AdaptiveImage`

### UI 插槽适配器（`components/ui-adapters/`）

四个适配器在渲染时读取 `siteConfig.ui.*`，并转发到相应的 Aceternity 组件。卖家修改 `content/config.ts` 中的 `ui.gallery` 无需编辑任何代码。

| 适配器 | 配置键 | 默认值 | 备选项 |
|---|---|---|---|
| `BackgroundEffect` | `ui.background` | `"none"` | 13 个 Aceternity 背景 |
| `GalleryAdapter` | `ui.gallery` | `"simple"` | apple-cards-carousel、images-slider、carousel、parallax-scroll |
| `ItemCardAdapter` | `ui.itemCard` | `"simple"` | 8 个 Aceternity 卡片效果 |
| `ItemGridAdapter` | `ui.itemGrid` | `"simple"` | bento-grid、layout-grid、focus-cards |

### 物品组件（`components/item/`）

| 组件 | 类型 | 用途 |
|---|---|---|
| `ItemCard` | 服务端 | 网格摘要卡片——名称、封面图、价格、状态徽章 |
| `ItemGrid` | 服务端 | 包装 `ItemCardAdapter` + 客户端过滤/排序控件 |
| `ItemGallery` | 客户端 | 基础图片轮播实现 |
| `LocalizedItemContent` | 客户端 | 语言为 `zh` 时渲染 `nameZh`/`descriptionZh` |
| `PricingSection` | 客户端 | 已解析档位显示 + "查看所有档位"切换 |
| `PricingTable` / `PricingTableToggle` | 客户端 | 可展开的完整档位列表 |
| `MakeOfferButton` | 客户端 | `negotiable: true` 且设置了 `minAcceptableOffer` 时显示 |
| `ConditionBadge` | 服务端 | 成色标签徽章 |
| `ConditionGuide` | 客户端 | `?` 弹出说明成色等级 |
| `StatusBadge` | 服务端 | `available`/`pending`/`reserved`/`sold` 标签 |
| `QuantityBadge` | 服务端 | `quantity > 1` 时显示"3 件在售" |
| `FreshnessLabel` | 客户端 | "3 天前上架"相对时间戳 |
| `TextbookBadge` | 服务端 | 课程 + 版次 + ISBN 区块 |
| `MetadataTable` | 服务端 | 品牌、型号、尺寸、重量、原始购买来源/价格 |

---

## 脚本参考

所有脚本通过 `tsx` 调用（TypeScript 直接执行，无需编译）。

| 命令 | 脚本 | 功能 |
|---|---|---|
| `pnpm dev` | `sync-images.ts --mode dev-sync` + `next dev` | 将图片复制到 `public/items/`；启动开发服务器 |
| `pnpm build` | `prebuild` + `next build` + `postbuild` | 完整生产构建 |
| `pnpm upload-images` | `sync-images.ts --mode upload` | SHA-256 增量上传到 CDN；写入清单 |
| `pnpm new <分类>/<物品>` | `create-item.ts` | 创建物品目录 + 草稿 `item.json`；验证 slug |
| `pnpm create-item <分类>/<物品>` | 同上 | `pnpm new` 的别名 |
| `pnpm mark-sold <分类>/<物品>` | `mark-sold.ts` | 设置 `status: "sold"` + `sold_date: 今天` |
| `pnpm create-template [分类]` | `create-template.ts` | 为分类创建 `_template.json` 脚手架 |
| `pnpm push` | 内联 git 命令 | `git add content/ image-manifest.json && git commit && git push` |
| `pnpm type-check` | `tsc --noEmit` | TypeScript 类型验证（不生成文件） |
| `pnpm lint` | `eslint . --max-warnings 0` | ESLint（零警告） |
| `pnpm test` | `vitest run` | 完整测试套件（单次运行） |
| `pnpm test:watch` | `vitest` | 测试套件监听模式 |
| `pnpm test:coverage` | `vitest run --coverage` | 测试覆盖率报告 |

### 构建流程详情

```
pnpm build
  ├── prebuild（next build 之前运行）
  │     ├── tsx scripts/check-config.ts
  │     │       若 siteConfig.baseUrl 仍包含 "your-domain.com" 则以退出码 1 中断
  │     │       防止意外将未配置的模板部署到生产环境
  │     ├── tsx scripts/sync-images.ts --mode build-check
  │     │       云端提供商：验证 lib/generated/image-manifest.json 存在。
  │     │       本地提供商：将图片从 content/items/ 复制到 public/items/。
  │     │       始终将 content/contact/ 复制到 public/contact/。
  │     └── tsx scripts/build-search-index.ts
  │             调用 buildSearchIndex() 并写入 public/search-index.json。
  │             排除草稿和已售物品；描述截断为 200 字符。
  │
  ├── next build
  │       在所有动态路由上调用 generateStaticParams()。
  │       将所有页面渲染为静态 HTML 到 out/。
  │       每个页面组件使用 React.cache() 在 generateMetadata() 和页面渲染函数之间共享同一次解析。
  │
  └── postbuild
        tsx scripts/postbuild.ts
              运行 next-sitemap，在 out/ 中生成 sitemap.xml + robots.txt。
```

---

## CI/CD 流水线

### 分支模型

```
develop    ← 活跃开发；所有功能开发；CI 在此运行
    │
    ▼  PR / 合并 → release
release    ← 生产就绪；触发 GitHub Pages 部署
    │
    ▼  GitHub Actions deploy.yml
gh-pages   ← 线上站点（GitHub Pages 管理分支）
```

### 工作流概览

| 文件 | 触发条件 | 步骤 |
|---|---|---|
| `ci.yml` | 推送到 `develop` 或 `release`；任意 PR | `pnpm type-check` → `pnpm lint` → `pnpm test` |
| `deploy.yml` | 推送到 `release`；`release-seller.yml` 完成后 | `pnpm build` → `actions/upload-pages-artifact` → `actions/deploy-pages` |
| `release-seller.yml` | 卖家发起（workflow_dispatch） | 自动化发布分支管理 |

**CI 不需要 CDN 凭证。** 已提交的 `lib/generated/image-manifest.json` 在构建时被读取——所有图片 URL 在静态 HTML 中预先解析完毕。

---

## 关键不变性

以下约束由代码强制执行，绝对不能违反：

| 不变性 | 执行位置 |
|---|---|
| `reserved_for` 永不渲染 | `schema.ts` 的 Zod `strip` 模式；`Item` 类型中不含此字段 |
| `lib/utils/pricing.ts` 无 `"use client"` | 服务端和客户端均需导入此文件 |
| `lib/generated/image-manifest.json` 保留在 git 中 | 未加入 `.gitignore`；CI 构建依赖此文件 |
| 物品和分类 slug 为 kebab-case | `create-item.ts`、`mark-sold.ts`、`generateStaticParams` 中的 `isValidSlug()` |
| 卖家仅向 `content/` 写入 | AI 技能文件和所有脚本均遵守此边界 |
| 草稿物品无静态路由 | 加载器可见性过滤器从 `generateStaticParams` 中排除 `status: "draft"` |
| `soldItemRetentionDays: -1` 立即隐藏 | `isSoldItemVisible()` 中的显式 `< 0` 判断 |
| 无 `sold_date` 的已售物品保持可见 | 保守默认：无日期 → 无到期依据 |

---

## 环境变量

仅在卖家本机运行 `pnpm upload-images` 时需要。CI 无需任何此类变量。

| 变量 | 提供商 | 需要条件 |
|---|---|---|
| `CF_R2_ACCOUNT_ID` | Cloudflare R2 | `imageStorage.provider === "cloudflare-r2"` |
| `CF_R2_ACCESS_KEY_ID` | Cloudflare R2 | 同上 |
| `CF_R2_SECRET_ACCESS_KEY` | Cloudflare R2 | 同上 |
| `CF_R2_BUCKET` | Cloudflare R2 | 同上 |
| `CF_R2_PUBLIC_URL` | Cloudflare R2 | 同上 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | `imageStorage.provider === "vercel-blob"` |
| `NEXT_PUBLIC_SITE_URL` | CI / 构建 | 可选；用于 Sitemap + OG 标签的基础 URL（设为 GitHub Actions Variable） |

详见 [`.env.example`](../.env.example) 和 [setup_instruction_zh.md](setup_instruction_zh.md)。

---

## 交叉引用

| 主题 | 文档 |
|---|---|
| `item.json` 完整 Schema（38 个字段） | [DESIGN_zh.md §5](DESIGN_zh.md) |
| `content/config.ts` 完整模板 | [DESIGN_zh.md §13](DESIGN_zh.md) |
| 距离分级定价算法 | [DESIGN_zh.md §17](DESIGN_zh.md) |
| 组件架构 + `"use client"` 清单 | [DESIGN_zh.md §12](DESIGN_zh.md) |
| UI 插槽选项（27 个 Aceternity 组件） | [DESIGN_zh.md §18](DESIGN_zh.md) |
| 已售物品留存公式 | [DESIGN_zh.md §8](DESIGN_zh.md) |
| 部署清单 | [TECH_REQUIREMENTS_zh.md §19](TECH_REQUIREMENTS_zh.md) |
| 测试策略 | [TECH_REQUIREMENTS_zh.md §25](TECH_REQUIREMENTS_zh.md) |
| CDN 配置说明 | [setup_instruction_zh.md](setup_instruction_zh.md) |
| 卖家操作指南 | [../SETUP_GUIDE.md](../SETUP_GUIDE.md) |
| 构建计划（第 0–15 阶段） | [IMPLEMENTATION_PLAN_zh.md](IMPLEMENTATION_PLAN_zh.md) |
