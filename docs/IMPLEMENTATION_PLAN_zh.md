# UsedExchange — 实施计划

**版本：** 1.4  
**日期：** 2026-06-03  
**基于：** DESIGN.md v0.9.1 · TECH_REQUIREMENTS.md v0.9.1  
**假设：** 单人开发者；主要目标 = GitHub Pages + Cloudflare R2

---

## 汇总

| Phase | 名称 | 预计天数 | 依赖 |
|---|---|---|---|
| 0 | 项目引导 | 1 | — |
| 1 | Aceternity UI 安装 | 1 | 0 |
| 2 | 类型系统与配置 | 1 | 0 |
| 3 | 内容 Schema 与加载器 | 2 | 2 |
| 4 | 图片管道 | 2 | 2 |
| 5 | 公共组件 | 1 | 1, 3 |
| 6 | 首页 | 1.5 | 5 |
| 7 | 地理定位与定价系统 | 2 | 3 |
| 8 | 分类页 + 浏览全部 + 已售档案 | 2 | 6, 7 |
| 9 | 物品详情页 | 2 | 6, 7, 10 |
| 10 | 联系系统 | 1 | 5 |
| 11 | UI 槽位适配器（接线） | 1 | 1, 8, 9 |
| 12 | 国际化运行时 | 2 | 5, 6, 9 |
| 13 | SEO、搜索、无障碍与安全加固 | 1 | 11 |
| 14 | 部署 | 1 | 4, 13 |
| 15 | AI 技能文件（设置向导 + 物品生成器 + 物品翻译器） | 2 | 3 |
| **总计** | | **约 24 天** | |

**关键路径：** 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 13 → 14  
**可并行：** Phase 1 ∥ Phase 2；Phase 4 ∥ Phase 3；Phase 10 ∥ Phase 7；Phase 12（国际化）∥ Phase 10、11、13；Phase 15 ∥ Phase 5–14

---

## Phase 0 — 项目引导 ✅
**目标：** 干净、可运行的 Next.js 15 仓库，所有工具已配置。`pnpm dev` 无报错启动（空白页面即可）。

### 任务
- [x] `pnpm create next-app@latest usedExchange --typescript --tailwind --app --use-pnpm`
- [x] 删除 `app/` 中所有 Next.js 样板内容
- [x] 配置 Tailwind v4：在 `app/globals.css` 中添加 `@import "tailwindcss"` 和 `@plugin "@tailwindcss/typography"`；创建含 `{ plugins: { "@tailwindcss/postcss": {} } }` 的 `postcss.config.mjs`；除非需要主题自定义，否则省略 `tailwind.config.ts`
- [x] 按 TECH_REQUIREMENTS.md §5 配置 `tsconfig.json`（strict、noUncheckedIndexedAccess、`@/*` 别名、正确的 include）
- [x] 配置 `next.config.ts` 骨架（尚无 Aceternity remotePatterns——Phase 1 添加）
- [x] 按 TECH_REQUIREMENTS.md §16 配置 ESLint（包含 `scripts/` 的 no-console 覆盖）
- [x] 按 TECH_REQUIREMENTS.md §16 配置 Prettier
- [x] 验证 `.gitignore` 符合 TECH_REQUIREMENTS.md §18（content/items 图片、public/items/、public/contact/、public/search-index.json、.image-cache/）——注意：`lib/generated/image-manifest.json` 是 git 追踪文件，不得加入 gitignore
- [x] 安装生产依赖：`next react react-dom zod react-markdown remark-gfm clsx tailwind-merge fuse.js @vercel/analytics @vercel/speed-insights framer-motion @tabler/icons-react`
- [x] 安装开发依赖：`typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss @tailwindcss/typography eslint eslint-config-next prettier prettier-plugin-tailwindcss tsx next-sitemap vitest @vitest/coverage-v8`
  > `vitest` + `@vitest/coverage-v8` 是 Phase 3a 单元测试所必需（见 TECH_REQUIREMENTS.md §25.2）。同步在 `package.json` scripts 中添加 `"test": "vitest run"`、`"test:watch": "vitest"`、`"test:coverage": "vitest run --coverage"`。
- [x] 创建完整目录骨架（DESIGN.md §16 中所有文件夹，需要时添加空 `.gitkeep`）
- [x] 创建含占位 `config.ts` 和示例 `items/` 结构的 `content/` 文件夹
- [x] 验证 `pnpm dev` 无 TypeScript 或 lint 错误启动

### 验收标准
- `pnpm dev` → 空白页面，无控制台错误
- `pnpm type-check` → 0 个错误
- `pnpm lint` → 0 个警告

---

## Phase 1 — Aceternity UI 安装 ✅
**目标：** 所有 27 个受支持的 Aceternity 组件安装在 `components/ui/` 中并提交到 git。可与 Phase 2 并行运行。

### 任务
- [x] 编写含所有 27 个安装命令的 `scripts/setup-ui.sh`（TECH_REQUIREMENTS.md §21）
- [x] 在 `package.json` 中添加 `"setup-ui": "bash scripts/setup-ui.sh"`
- [x] 运行 `pnpm setup-ui`（需要网络，约 5 分钟）
- [x] 解决 Aceternity 安装带来的依赖冲突（peer dep 警告）
- [x] 提交所有生成的 `components/ui/*.tsx` 文件
- [x] 验证安装后 `pnpm type-check` 仍然通过

### 验收标准
- `components/ui/` 含所有 27 个组件文件（13 背景 + 3 网格 + 4 图库 + 7 卡片）
- `pnpm type-check` → 0 个错误
- 构建时无 Aceternity 导入错误

### 备注
- 每台机器只运行一次；后续克隆从 git 获取这些文件
- 部分 Aceternity 组件可能引入额外 peer 依赖（如 `three`、`d3`）——只安装组件真正需要的，而非完整 peer 列表

---

## Phase 2 — 类型系统与配置 ✅
**目标：** 所有 TypeScript 类型、`SiteConfig` 和 `content/config.ts` 已定义。尚无实现——只是每个后续 Phase 依赖的类型契约。

### 任务
- [x] 编写 `lib/ui/types.ts` — `BackgroundOption`、`ItemGridOption`、`GalleryOption`、`ItemCardOption`、`UIConfig`
- [x] 编写 `lib/config/types.ts` — `SiteConfig` 类型（DESIGN.md §13 的所有字段；包含 `UIConfig`）
- [x] 编写 `content/config.ts` — 含所有字段、注释、合理默认值的完整入门配置
- [x] 编写 `lib/content/types.ts` — `Item`、`Category`、`Price`、`PriceTier`、`Condition`、`Status`、`Dimensions`、`Weight`、`ResolvedDistance`、`GeolocationState`
- [x] 验证 `pnpm type-check` 通过（类型自洽）

### 验收标准
- 所有类型编译无错误
- `content/config.ts` 无错误导入和导出 `siteConfig`
- 无 `any` 类型

---

## Phase 3 — 内容 Schema 与加载器 ✅
**目标：** 数据层完整。`loadCategories()`、`loadItemsByCategory()`、`loadItem()`、`loadAllItems()` 均可对真实 `content/items/` 文件夹运行。**这是最重要的 Phase——所有页面都依赖它。**

### 任务

#### 3a — Zod Schema（`lib/content/schema.ts`）
- [x] 编写 `itemJsonSchema` — 含所有默认值的 Zod schema（TECH_REQUIREMENTS.md §6）
- [x] 编写 `categoryJsonSchema` — `_category.json` 的 Zod schema
- [x] 实现 `withDefaults<T>()` 辅助函数
- [x] 单元测试边缘情况：缺少 `name`（跳过物品）、无效枚举（默认为有效值）、null 数字（→ null）、零数字（→ 0，非 null）、负数（→ null）、无效 ISO 日期（→ null）

#### 3b — 纯工具函数（`lib/utils/`）
- [x] 编写 `lib/utils/haversine.ts` — `haversineInMiles(lat1, lng1, lat2, lng2)`
- [x] 编写 `lib/utils/pricing.ts` — 纯函数 `resolveItemPrice(price, resolved)`（可被服务器组件导入）
- [x] 编写 `lib/utils/date.ts` — `formatRelativeDate(isoDate: string | null, now?: Date): string`
- [x] 编写 `lib/utils/jsonld.ts` — `buildProductJsonLd(item, baseUrl)` 和 `buildBreadcrumbJsonLd(crumbs)`
- [x] 编写 `lib/utils/i18n.ts` — `getLocalizedField(item, field, locale)` 和 `t(key)`
- [x] 用已知坐标测试 `haversineInMiles`
- [x] 测试 `resolveItemPrice` 的所有分支：Infinity、精确匹配、间隙、空档位、开放式档位

#### 3c — 加载器（`lib/content/loader.ts`）
- [x] 实现 `loadCategories()` — 读取 `content/items/`，解析 `_category.json`，应用排序逻辑，排除 `_` 前缀文件夹
- [x] 实现 `loadItemsByCategory()` — 读取物品文件夹，应用可见性规则（排除草稿，检查已售+保留期），从清单解析图片 URL
- [x] 实现 `loadItem()` — 缺失时返回 `null`，不抛出异常
- [x] 实现 `loadAllItems()` — 仅 `available` 状态；按 `listedDate` 降序排列；上限为 `siteConfig.recentlyListedCount`。**仅用于首页最近上架区块。**
- [x] 实现 `loadSoldItems()` — 返回所有已售物品，不受 `soldItemRetentionDays` 限制；按 `soldDate` 降序（回退到 `listedDate`）；用于 `/sold` 档案页
- [x] 编写 `lib/search/index.ts` — `buildSearchIndex()`：读取所有可用物品，返回 `SearchIndexEntry[]`
- [x] 图片 URL 解析：`manifest[key] ?? "/items/{key}"` 回退
- [x] 图片排序：`filenames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))` ——显式排序，绝不依赖 `readdir` 顺序
- [x] 验证返回的 `Item` 类型中从不包含 `reserved_for` 字段

#### 3d — 种子数据与内容 CLI 脚本
- [x] 创建 2 个示例分类（`content/items/houseware/`、`content/items/electronics/`）
- [x] 创建 3–4 个涵盖所有状态值和边缘情况的示例 `item.json` 文件
- [x] 创建含 `{}` 的 `lib/generated/image-manifest.json`（空的起始值）
- [x] 编写 `scripts/mark-sold.ts`
- [x] 编写 `scripts/create-item.ts`
- [x] 编写 `scripts/create-template.ts`
- [x] 验证加载器为示例物品返回正确数据

### 验收标准
- 所有 4 个加载器函数从示例 `content/items/` 返回类型化数据
- 缺少 `item.json` → `loadItem()` 返回 `null`，不抛出
- 无效字段值 → 应用默认值，不崩溃
- `reserved_for` 不出现在任何返回的 `Item` 对象中
- 所有单元测试通过

---

## Phase 4 — 图片管道 ✅
**目标：** `pnpm dev` 显示 `content/items/` 的图片。`pnpm upload-images` 成功上传到 **Cloudflare R2**（推荐/主要提供商）并写入清单；Vercel Blob 路径并行实现为备用。可与 Phase 3 并行开发。

### 任务

#### 4a — 适配器接口
- [x] 编写 `lib/images/adapter.ts` — `ImageStorageAdapter` 接口

#### 4b — 提供商实现
- [x] 编写 `lib/images/local.ts` — 复制到 `public/items/`，返回 `/items/{key}`，跳过未更改文件
- [x] 编写 `lib/images/cloudflare-r2.ts`（主要）— SHA-256 比对，`@aws-sdk/client-s3 PutObjectCommand`，返回 CDN URL
- [x] 编写 `lib/images/vercel-blob.ts`（备用）— SHA-256 比对，`@vercel/blob put()`，返回 CDN URL；代码已实现，需单独安装包
- [x] 安装提供商开发依赖：`pnpm add -D @aws-sdk/client-s3`（Cloudflare R2——推荐）

#### 4c — 同步脚本（`scripts/sync-images.ts`）
- [x] 实现 `--mode upload`：扫描、SHA-256、上传新/已更改文件、清除过时清单条目、复制 contact/、写入清单、写入校验和缓存、打印备份提醒
- [x] 实现 `--mode dev-sync`：复制到 `public/items/`，复制 contact/，content/items/ 缺失时优雅处理
- [x] 实现 `--mode build-check`：本地提供商 → 本地复制；云提供商 → 验证清单存在；始终复制 contact/
- [x] 更新 `next.config.ts` 添加 Vercel Blob / R2 远程模式（Phase 0 已完成）

#### 4d — 集成测试
- [ ] `pnpm dev` → 示例图片出现在 `/items/houseware/item/cover.jpg`
- [ ] `pnpm upload-images` 设置 `CF_R2_*` → 图片上传到 R2；清单写入 R2 CDN URL
- [ ] 类 CI 环境（无本地图片）中 `pnpm build` → 读取清单以 build-check 模式，不尝试上传，构建成功

---

## Phase 5 — 公共组件
**目标：** 所有共享展示组件就绪。尚无页面。

### 任务
- [ ] `components/common/AdaptiveImage.tsx` — 基于 `deploymentMode` 的 `next/image` vs `<img>`
- [ ] `components/layout/SiteHeader.tsx` — 站点名称/Logo、导航占位符
- [ ] `components/layout/SiteFooter.tsx` — 站点名称、最后构建时间戳、ContactSection 槽位
- [ ] `components/layout/Breadcrumb.tsx` — 首页 → 分类 → 物品，正确的 href
- [ ] `components/item/StatusBadge.tsx` — 颜色编码标签，不能只依赖颜色（必须有文字标签）
- [ ] `components/item/ConditionBadge.tsx` — 同上约束
- [ ] `components/item/MetadataTable.tsx` — 渲染品牌、型号、尺寸、重量、原始来源（链接）、原始价格；隐藏任何 null/空字段

---

## Phase 6 — 首页
**目标：** `/` 完整渲染，含 Hero、分类网格和最近上架区块。分类和物品从 `content/` 加载。

### 任务
- [ ] `components/category/CategoryCard.tsx` — 图标、显示名称、可用物品数量、封面图背景
- [ ] `components/category/CategoryGrid.tsx` — `CategoryCard` 的响应式网格
- [ ] `components/item/ItemCard.tsx` — 封面图、名称、成色徽章、状态徽章、价格 prop（从父级接收解析价格）
- [ ] `components/home/RecentlyListedSection.tsx`（客户端组件）— 拥有 `useGeolocation()` + `useDistancePricing()` 状态；渲染含解析价格的物品卡片
- [ ] `app/layout.tsx` — 根布局、`BackgroundEffect` 包装、`SiteHeader`、`SiteFooter`、全局字体/元数据
- [ ] `components/common/RecentlyViewed.tsx`（客户端）— 读取 `sessionStorage`；渲染最近 5 件浏览物品的横向条；**为空时隐藏**
- [ ] `app/page.tsx` — Hero、`CategoryGrid`、`RecentlyListedSection`、`RecentlyViewed` 条
- [ ] 首页 OG 元数据（最近可用物品封面作为 og:image）

---

## Phase 7 — 地理定位与定价系统
**目标：** 完整的地理定位 + 距离定价栈在隔离环境中工作。在接线到页面前用 `pnpm dev` 测试。

### 任务

#### 7a — Hooks
- [ ] `components/pricing/useGeolocation.ts` — `idle → pending → granted/denied/unavailable`
- [ ] `components/pricing/useDistancePricing.ts` — `idle`/`pending` 时返回 `{ source: "fallback" }`；导出 `setManualMiles`

#### 7b — LocationPriceBar
- [ ] `components/pricing/LocationPriceBar.tsx`（客户端）— 所有 4 种渲染状态；内联距离输入；无障碍

#### 7c — PricingTable 与切换
- [ ] `components/item/PricingTable.tsx` — 展示式；渲染解析档位行 + `PricingTableToggle`；无档位时显示"联系询价"
- [ ] `components/item/PricingTableToggle.tsx`（客户端）— 展开/折叠；视觉突出解析档位行；键盘可访问

#### 7d — PricingSection 与 FilterBar
- [ ] `components/item/PricingSection.tsx`（客户端）— 拥有物品详情的地理+距离状态；接受 `initialResolvedTier`
- [ ] `components/filters/SortSelect.tsx`（客户端）— 排序下拉菜单
- [ ] `components/filters/useFilters.ts` — 成色标签、价格范围滑块、状态切换
- [ ] `components/filters/FilterBar.tsx`（客户端）— 渲染 useFilters 控件（含 `SortSelect`）

---

## Phase 8 — 分类页、浏览全部与已售档案
**目标：** `/[category]`、`/all` 和 `/sold` 全部渲染。筛选栏、物品网格和定位解析价格完整。

### 任务

#### 8a — 分类页
- [ ] `components/item/ItemGrid.tsx`（客户端）— 拥有 `resolvedDistance` 状态；渲染 `LocationPriceBar` + `FilterBar`（含 `SortSelect`）+ 物品卡片
- [ ] `app/[category]/page.tsx` — 来自 `loadCategories()` 的 `generateStaticParams`；含 OG 的 `generateMetadata`；渲染含物品的 `ItemGrid`
- [ ] 物品卡片上的已售物品遮罩（状态徽章 + 变暗）
- [ ] 分类页正文中的"浏览全部"突出链接——指向 `/all`
- [ ] 空分类（所有物品已售/草稿或所有已售已过期）→ 渲染空网格含"该分类当前无可用物品"消息

#### 8b — 浏览全部页（`/all`）
- [ ] `app/all/page.tsx` — 服务器组件；调用 `loadCategories()` 然后为每个分类调用 `loadItemsByCategory()` 并展平
- [ ] 验证：`available` + `reserved`/`pending` 均显示；已售物品默认隐藏，切换后可见；`draft` 物品不显示

#### 8c — 已售物品档案（`/sold`）
- [ ] `app/sold/page.tsx` — 服务器组件；调用 `loadSoldItems()`；渲染简单物品网格（无筛选栏、无定价、无联系方式）；按 `soldDate` 降序
- [ ] 验证所有已售物品显示，不受 `soldItemRetentionDays` 限制
- [ ] 验证无定价显示；无联系区块

---

## Phase 9 — 物品详情页
**目标：** `/[category]/[item]` 渲染，含图库、SSG 定价、联系区块和所有元数据。

> **⚠️ 顺序说明：** Phase 9 依赖 Phase 10（联系系统）。尽管在文档中先出现，Phase 10 必须在 Phase 9 接线前完成。先完成 Phase 10，再回到这里。

### 任务

#### 9a — 支持组件（在接线到页面前构建）
- [ ] `components/item/FreshnessLabel.tsx`（`"use client"`）— 使用 `useState<string|null>(null)` + `useEffect` 在挂载时针对访客实时浏览器时钟计算相对日期
- [ ] `components/item/QuantityBadge.tsx` — `item.quantity > 1` 时渲染"3 件在售"；否则隐藏
- [ ] `components/item/TextbookBadge.tsx` — 渲染"适用于 CS101 · 第3版"徽章 + "比价"链接；仅在存在 `isbn` 或 `course` 时显示
- [ ] `components/item/MakeOfferButton.tsx`（客户端）— `price.negotiable: true` 且设置 `min_acceptable_offer` 时渲染
- [ ] `components/item/ConditionGuide.tsx`（客户端）— 成色徽章旁的 `?` 图标；打开工具提示/弹窗；Escape 关闭；键盘可访问
- [ ] `components/common/ShareButton.tsx`（客户端）— 移动端 `navigator.share()`；桌面端 `navigator.clipboard.writeText()` 回退；显示"已复制！"提示 2 秒
- [ ] 将 `RecentlyViewed` 接线到物品详情页：传递 `itemSlug={item.itemSlug}` 以在挂载时记录到 `sessionStorage`
- [ ] `components/common/JsonLd.tsx` — 服务器组件；渲染 `<script type="application/ld+json">{JSON.stringify(data)}</script>`

#### 9b — 图库
- [ ] `components/item/ItemGallery.tsx`（客户端）— 简单默认值：大主图 + 缩略图条；点击切换

#### 9c — 物品详情页
- [ ] `app/[category]/[item]/page.tsx`：
  - [ ] 来自 `loadCategories()` + `loadItemsByCategory()` 的 `generateStaticParams`
  - [ ] `generateMetadata` — 标题、描述、og:image、og:title、Twitter 卡片、Pinterest 富 pin 元数据
  - [ ] 服务器端：调用 `resolveItemPrice(item.price, { source: "fallback" })` 获取 `initialResolvedTier`
  - [ ] 注入 `<JsonLd data={buildProductJsonLd(item, siteConfig.baseUrl)} />` 和 `<JsonLd data={buildBreadcrumbJsonLd(crumbs)} />`
  - [ ] 渲染：面包屑、图库、`FreshnessLabel`、状态+成色徽章、`QuantityBadge`、名称+描述、`TextbookBadge`、`PricingSection`（含 `MakeOfferButton`、付款按钮）、`MetadataTable`、`ContactSection`、标签、`ShareButton`、`RecentlyViewed`
  - [ ] 已售物品："已售"横幅突出；联系 CTA 禁用；显示 `sold_date`
- [ ] `app/not-found.tsx` — 站点头部、"页面未找到"消息、返回首页链接

---

## Phase 10 — 联系系统
**目标：** 联系区块在物品详情页和 footer 中正确渲染。二维码弹窗工作正常。

### 任务
- [ ] `components/contact/PlatformButton.tsx`（客户端）— 链接式：`<a>` 含按平台表格的正确 URL；二维码式：`<button>` 触发弹窗
- [ ] `components/contact/QRModal.tsx`（客户端）— `<dialog>`；点击背景或 Escape 关闭；打开时焦点捕获；关闭时恢复焦点
- [ ] `components/contact/ContactSection.tsx`（客户端）— `reveal_behavior: "click"` 切换；渲染平台按钮；`preferredPayment`/`contactNote` 为空时隐藏
- [ ] 接线到物品详情页和 `SiteFooter`

---

## Phase 11 — UI 槽位适配器（接线）
**目标：** 所有 4 个适配器文件完整接线。`content/config.ts` 的 `ui.*` 值在所有地方驱动正确的 Aceternity 组件。

### 依赖：Phase 1、8、9 必须完成。

### 任务
- [ ] `components/ui-adapters/BackgroundEffect.tsx` — 所有 13 个背景选项预导入，完整 `COMPONENTS` 映射，`⚠️ DO NOT EDIT` 头部
- [ ] `components/ui-adapters/ItemGridAdapter.tsx` — 所有 3 个网格选项 + `"simple"` 回退
- [ ] `components/ui-adapters/GalleryAdapter.tsx` — 所有 4 个图库选项 + `"simple"` 回退
- [ ] `components/ui-adapters/ItemCardAdapter.tsx` — 所有 8 个卡片选项 + `"simple"` 回退
- [ ] 将 `BackgroundEffect` 接线到 `app/layout.tsx`
- [ ] 将 `ItemGridAdapter` 接线到 `components/item/ItemGrid.tsx`
- [ ] 将 `GalleryAdapter` 接线到物品详情页
- [ ] 将 `ItemCardAdapter` 接线到 `ItemCard.tsx` 作为最外层包装
- [ ] 通过在 `content/config.ts` 中循环 2–3 个值测试每个槽位，验证无崩溃

---

## Phase 12 — 国际化运行时
**目标：** 访客通过 `SiteHeader` 中的 `LocaleSwitcher` 在运行时切换语言。物品名称（卡片 + 详情）和详情页 Markdown 描述无需刷新即以所选语区重新渲染；所选语区跨页面和跨刷新持久有效。SSG 仍输出 `defaultLocale` 内容。`availableLocales.length === 1` 时切换器隐藏，行为与单语区构建相同。

### 依赖
- Phase 3b（`lib/utils/i18n.ts` — `getLocalizedField`、`t`）必须完成
- Phase 5（SiteHeader）、Phase 6（`ItemCard`、`app/layout.tsx`）、Phase 9（物品详情页）

**可与 Phase 10、11、13 并行开发。**

### 任务

#### 12a — 国际化运行时组件
- [ ] `components/i18n/LocaleProvider.tsx`（客户端）— 暴露 `{ locale, setLocale }` 的 React context；挂载时读取 `localStorage.getItem("locale")`
- [ ] `components/i18n/useLocale.ts` — 从 `LocaleProvider` context 返回活跃语区的 hook
- [ ] `components/i18n/LocaleSwitcher.tsx`（客户端）— 每个可用语区一个控件；`availableLocales.length <= 1` 时返回 `null`

#### 12b — 本地化渲染
- [ ] `components/item/LocalizedItemContent.tsx`（客户端）— 渲染物品 `<h1>` 名称和 react-markdown + remark-gfm 描述；读取 `useLocale()` 并通过 `getLocalizedField` 解析
- [ ] 将 `components/item/ItemCard.tsx` 转换为 `"use client"`；通过 `useLocale()` + `getLocalizedField` 本地化卡片标题

#### 12c — 接线
- [ ] 用 `<LocaleProvider>` 包装 `app/layout.tsx` 的 children
- [ ] 在 `components/layout/SiteHeader.tsx` 中渲染 `<LocaleSwitcher />`
- [ ] 将 `app/[category]/[item]/page.tsx` 中的内联名称 + react-markdown 块替换为 `<LocalizedItemContent item={item} />`

---

## Phase 13 — SEO、搜索、无障碍与安全加固
**目标：** Lighthouse ≥ 80 性能，≥ 90 无障碍。全文搜索工作正常。所有 TECH_REQUIREMENTS.md §14 和 §15 检查通过。

### 任务

#### 全文搜索
- [ ] 编写 `scripts/build-search-index.ts` — 导入 `buildSearchIndex()`，写入结果到 `public/search-index.json`
- [ ] 更新 `package.json` 的 `prebuild` 脚本：`tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts`
- [ ] 编写 `components/search/SearchBar.tsx`（客户端）— 通过 `next/dynamic({ ssr: false })` 加载；挂载时获取 `/search-index.json`；防抖 150ms；内联显示结果
- [ ] 编写 `components/search/useSearch.ts`
- [ ] 在 `SiteHeader` 中接线 `SearchBar`（`siteConfig.search.enabled === true` 时显示）

#### SEO
- [ ] 验证每个路由有 `<title>` 和 `<meta name="description">`
- [ ] 验证所有 3 种路由类型（首页、分类、物品）的 OG 标签
- [ ] 验证 `sitemap.xml` + `robots.txt` 在 `siteConfig.sitemap.enabled` 时生成

#### 无障碍
- [ ] 所有图片有非空 `alt` 文字——用 axe 或浏览器 DevTools 审计
- [ ] 所有可交互元素有 `focus-visible:ring`——Tab 键浏览页面
- [ ] 正文颜色对比度 ≥ 4.5:1——用浏览器颜色选择器检查
- [ ] `QRModal` 焦点捕获已验证——Tab 键保持在弹窗内
- [ ] 状态/成色徽章验证有文字标签（不仅依赖颜色）

#### 安全
- [ ] 在渲染 HTML 中搜索 `reserved_for` → 不得出现
- [ ] 验证 `meta_description` 截断到 160 字符
- [ ] 验证 `original_link` 验证为 URL（无效 → 空，不渲染链接）
- [ ] 验证 `next.config.ts` 中的 `poweredByHeader: false`
- [ ] 验证所有外部链接有 `rel="noopener noreferrer"`

#### 性能
- [ ] 在分类页运行 Lighthouse 移动端 → 目标 ≥ 80
- [ ] 检查首次加载 JS 包 ≤ 150 KB（gzip 压缩后）
- [ ] 验证从地理定位待定 → 地理定位解析后价格变化无布局偏移

---

## Phase 14 — 部署
**目标：** 站点在 GitHub Pages 上通过自定义域名上线，图片在 Cloudflare R2，整个卖家工作流端到端验证通过。

### 任务

#### 一次性设置——Cloudflare R2
- [ ] Cloudflare Dashboard → R2 → 创建存储桶（如 `usedexchange-images`）
- [ ] 启用公共访问或附加自定义子域名（如 `images.your-domain.com`）
- [ ] 创建 R2 API 令牌：**对象读写**，仅限此存储桶
- [ ] 在存储桶上配置 CORS
- [ ] 复制 `.env.example` → `.env.local`；填写所有 `CF_R2_*` 值
- [ ] 配置 `content/config.ts`：`deploymentMode: "static"`，`imageStorage.provider: "cloudflare-r2"`，正确的 `baseUrl`，卖家 `location` 坐标

#### 一次性设置——GitHub Pages
- [ ] GitHub 仓库 → Settings → Pages → 来源：**GitHub Actions**
- [ ] GitHub 仓库 → Settings → Variables → Actions → 添加 `NEXT_PUBLIC_SITE_URL`
- [ ] 自定义域名：设置 `your-domain.com`；配置 DNS CNAME 到 `<username>.github.io`
- [ ] 验证 `.github/workflows/deploy.yml` 已提交（项目自带）

#### 初始内容与部署
- [ ] 将真实列表照片添加到 `content/items/` 文件夹
- [ ] 运行 `pnpm upload-images` → 验证 R2 上传成功；清单已写入
- [ ] 提交 `lib/generated/image-manifest.json` + `content/**/*.json`
- [ ] 推送到 `main` → GitHub Actions 触发 → 验证工作流通过（绿色勾选）
- [ ] 导航到部署 URL → 验证所有页面、图片和定价正常工作

---

## Phase 15 — AI 技能文件（设置向导 + 物品生成器 + 物品翻译器）
**目标：** 所有三个 Claude Code 技能完整、测试通过并随项目发布。使用 Claude Code（或任何有能力 AI 工具）的卖家可运行 `/setup`、`/update-items` 和 `/translate-items` 来生成 `content/config.ts`、生成 `item.json` 文件和添加语区翻译——无需编辑任何代码。

**无 API 密钥，无新依赖，无自定义脚本。** 交付物是三个 Markdown 指令文件。

**可与 Phase 5–14 并行开发。**

### 任务

#### 15a — 项目 CLAUDE.md
- [ ] 创建 `.claude/CLAUDE.md`，含项目上下文：项目是什么、`content/` 文件夹规则、常见卖家任务、相关 DESIGN.md 章节指针
- [ ] 测试：在项目目录中打开 Claude Code；确认 AI 无需进一步解释即有正确的项目上下文

#### 15b — `update-items.md` 技能
- [ ] 创建 `.claude/skills/update-items.md`
- [ ] 包含：触发描述、照片分析的视觉指令、描述文件格式支持、字段提取表（含置信度级别）、合并规则、输出规范（`status: "draft"`，绝不设置 `reserved_for`）、确认流程、范围指令
- [ ] 包含 DESIGN.md §5 中完整的 `item.json` schema 作为参考块
- [ ] 用 Claude Code 测试：创建含 2 张照片 + notes.txt 的测试物品文件夹 → 调用技能 → 验证生成的 JSON 通过 Zod schema 验证

#### 15c — `setup-wizard.md` 技能
- [ ] 创建 `.claude/skills/setup-wizard.md`
- [ ] 包含：所有 8 个问题组、位置解析指令、个性校准示例、分类骨架指令、幂等性指令
- [ ] 包含 DESIGN.md §13 中完整的 `content/config.ts` 模板作为输出参考

#### 15d — `translate-items.md` 技能
- [ ] 创建 `.claude/skills/translate-items.md`
- [ ] 包含 TECH_REQUIREMENTS.md §23.8 要求的所有内容

#### 15e — 验证与文档
- [ ] 在项目根目录创建 `SETUP_GUIDE.md`——纯英文、无代码、无终端术语、无 git 命令的卖家指南
- [ ] 在至少一个非 Claude AI 工具（Cursor 或 GitHub Copilot）中测试所有三个技能，验证兼容性
- [ ] 确认 `content/` 规则：AI 绝不修改 `content/` 之外的任何文件

---

## 风险登记册

| 风险 | 可能性 | 影响 | 缓解措施 |
|---|---|---|---|
| Aceternity 组件 API 在 CLI 安装和适配器代码之间发生变化 | 中 | 中 | 将 `@aceternity/*` 固定到安装版本；将 `components/ui/` 提交到 git 锁定版本 |
| Tailwind v4 与特定 Aceternity 组件不兼容 | 低 | 中 | Aceternity 组件通过 `npx shadcn@latest` 安装，针对当前 Tailwind 版本；`pnpm setup-ui` 后通过 `pnpm type-check` + `pnpm dev` 验证 |
| Vercel Blob 令牌在本地 `pnpm upload-images` 时不可用 | 低 | 低 | 本地上传使用 `.env.local` |
| `pnpm setup-ui` 中途失败（网络错误） | 中 | 低 | 脚本幂等；从失败组件重新运行 |
| 地理定位 API 被浏览器设置或企业代理阻止 | 中 | 低 | 回退到最高档位已实现；买家随时可手动输入距离 |
| AI 在技能输出中误识别物品或幻觉品牌/型号 | 中 | 低 | 技能始终指示 AI 显示确认预览；`status: "draft"` 直到卖家确认 |
| 生成的 `content/config.ts` 有 TypeScript 错误 | 低 | 中 | 技能指示 AI 对照类型定义验证；卖家以 `pnpm type-check` 作为最终门控 |

---

## 完成定义（每个 Phase）

一个 Phase **完成**当：
1. 所有复选框已勾选
2. `pnpm type-check` → 0 个错误
3. `pnpm lint` → 0 个警告
4. 该 Phase 的验收标准全部满足
5. 更改已以 Conventional Commit 消息提交到 git

项目**准备好 v1 发布**当：
1. 所有 15 个 Phase 完成（如果 AI 技能文件延迟，Phase 15 可在 Phase 0–14 之后稍晚发布）
2. AI 技能 `/setup` 生成有效的 `content/config.ts`——`pnpm type-check` 通过（Phase 15）
3. 至少存在一个完整的真实列表（通过 AI 技能 `/update-items` 生成）
4. 站点上线并通过 Lighthouse ≥ 80/90
5. 卖家已成功完成完整工作流：添加物品 → 上传照片 → 提交 → 推送 → 验证上线

---

## 开发者说明

### 从这里开始
```bash
git clone <repo>
pnpm install
pnpm setup-ui          # Phase 1——安装所有 Aceternity 组件
pnpm dev               # Phase 0 验证——Phase 0 后应可启动
```

### 关键设计文档交叉参考
| 实施问题 | 查看位置 |
|---|---|
| `item.json` 有哪些字段？ | DESIGN.md §5 |
| 已售物品保留如何工作？ | DESIGN.md §8 |
| 地理定位价格解析如何工作？ | DESIGN.md §17 |
| 哪个组件是 "use client"？ | DESIGN.md §12，TECH_REQUIREMENTS.md §20 |
| `resolveItemPrice` 如何工作？ | DESIGN.md §17，TECH_REQUIREMENTS.md §20 |
| 图片适配器如何工作？ | DESIGN.md §3，TECH_REQUIREMENTS.md §7 |
| `loadAllItems()` 筛选什么？ | TECH_REQUIREMENTS.md §8——仅 available，用于首页最近上架条 |
| /all 页面使用什么替代 loadAllItems()？ | DESIGN.md §11，TECH_REQUIREMENTS.md §8——聚合的 loadItemsByCategory() |
| UI 槽位如何接线？ | DESIGN.md §18，TECH_REQUIREMENTS.md §21 |
| 部署清单是什么？ | TECH_REQUIREMENTS.md §19 |

### 绝不违反这些不变量
1. `reserved_for` 任何页面上均不渲染
2. `content/config.ts` 不使用 Node.js API（它在浏览器包中）
3. `lib/utils/pricing.ts` 没有 `"use client"`（必须可被服务器组件导入）
4. `components/ui-adapters/` 文件以 `⚠️ DO NOT EDIT` 开头
5. 卖家绝不需要编辑 `content/` 之外的任何内容
6. `lib/generated/image-manifest.json` 是 git 追踪文件——绝不添加到 `.gitignore`
7. `public/search-index.json` 已 gitignore——由 `prebuild` 步骤中的 `scripts/build-search-index.ts` 生成；绝不提交到 git
