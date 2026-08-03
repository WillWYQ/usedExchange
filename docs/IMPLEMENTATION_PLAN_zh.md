# UsedExchange — 实施计划

**版本：** 1.7  
**日期：** 2026-08-02  
**基于：** DESIGN.md v0.10.0 · TECH_REQUIREMENTS.md v0.10.0  
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
| 16 | 运费计算器集成（可选） | 2 | 7, 12 |
| 17 | Facebook Marketplace 智能导出 | 1 | 3 |
| 18 | 卖家工作台（Seller Studio） | 4 | 4, 15 |
| **总计** | | **约 30.5 天** | |

**关键路径：** 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 13 → 14  
**可并行：** Phase 1 ∥ Phase 2；Phase 4 ∥ Phase 3；Phase 10 ∥ Phase 7；Phase 12（国际化）∥ Phase 10、11、13；Phase 15 ∥ Phase 5–14

---

## Phase 0 — 项目引导 ✅
**目标：** 干净、可运行的 Next.js 15 仓库，所有工具已配置。`pnpm dev` 无报错启动（空白页面即可）。

### 任务
- [x] `pnpm create next-app@latest usedExchange --typescript --tailwind --app --use-pnpm`
- [x] 删除 `app/` 中所有 Next.js 样板内容
- [x] 配置 Tailwind v4：在 `app/globals.css` 中添加 `@import "tailwindcss"` 和 `@plugin "@tailwindcss/typography"`；创建含 `{ plugins: { "@tailwindcss/postcss": {} } }` 的 `postcss.config.mjs`；除非需要主题自定义，否则省略 `tailwind.config.ts`。见 TECH_REQUIREMENTS.md §22.2
- [x] 按 TECH_REQUIREMENTS.md §5 配置 `tsconfig.json`（strict、noUncheckedIndexedAccess、`@/*` 别名、正确的 include）
- [x] 配置 `next.config.ts` 骨架（尚无 Aceternity remotePatterns——Phase 1 添加）
- [x] 按 TECH_REQUIREMENTS.md §16 配置 ESLint（包含 `scripts/` 的 no-console 覆盖）
- [x] 按 TECH_REQUIREMENTS.md §16 配置 Prettier
- [x] 验证 `.gitignore` 符合 TECH_REQUIREMENTS.md §18（content/items 图片、public/items/、public/contact/、public/search-index.json、.image-cache/）——注意：`lib/generated/image-manifest.json` 是 git 追踪文件，不得加入 gitignore
- [x] 安装生产依赖：`next react react-dom zod react-markdown remark-gfm clsx tailwind-merge fuse.js @vercel/analytics @vercel/speed-insights framer-motion @tabler/icons-react`
  > `@vercel/analytics` 和 `@vercel/speed-insights` 在 Vercel 之外为空操作；一并安装，以便日后无需重新安装即可启用。
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
- 部分 Aceternity 组件可能引入额外 peer 依赖（如 `three`、`d3`）——只安装组件需要的，而非完整 peer 列表

---

## Phase 2 — 类型系统与配置 ✅
**目标：** 所有 TypeScript 类型、`SiteConfig` 和 `content/config.ts` 已定义。尚无实现——只是每个后续 Phase 依赖的类型契约。

### 任务
- [x] 编写 `lib/ui/types.ts` — `BackgroundOption`、`ItemGridOption`、`GalleryOption`、`ItemCardOption`、`UIConfig`（TECH_REQUIREMENTS.md §21）
- [x] 编写 `lib/config/types.ts` — `SiteConfig` 类型（DESIGN.md §13 的所有字段；包含 `UIConfig`）
- [x] 编写 `content/config.ts` — 含所有字段、注释、合理默认值的完整入门配置（DESIGN.md §13）
- [x] 编写 `lib/content/types.ts` — `Item`、`Category`、`Price`、`PriceTier`、`Condition`、`Status`、`Dimensions`、`Weight`、`ResolvedDistance`、`GeolocationState`（TECH_REQUIREMENTS.md §8、§20）
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
- [x] 编写 `itemJsonSchema` — 含所有默认值的 Zod schema（TECH_REQUIREMENTS.md §6；安全默认值、`.safeParse()` 契约）
- [x] 编写 `categoryJsonSchema` — `_category.json` 的 Zod schema
- [x] 按 TECH_REQUIREMENTS.md §6.2 实现 `withDefaults<T>()` 辅助函数
- [x] 单元测试边缘情况：缺少 `name`（跳过物品）、无效枚举（默认为有效值）、null 数字（→ null）、零数字（→ 0，非 null）、负数（→ null）、无效 ISO 日期（→ null）

#### 3b — 纯工具函数（`lib/utils/`）
- [x] 编写 `lib/utils/haversine.ts` — `haversineInMiles(lat1, lng1, lat2, lng2)`（TECH_REQUIREMENTS.md §20）
- [x] 编写 `lib/utils/pricing.ts` — 纯函数 `resolveItemPrice(price, resolved)`（DESIGN.md §17；可被服务器组件导入）
- [x] 编写 `lib/utils/date.ts` — `formatRelativeDate(isoDate: string | null, now?: Date): string` → "Today" / "3 days ago" / ""（`now` 默认为 `new Date()`；仅在测试中显式传入——TECH_REQUIREMENTS.md §22.11）
- [x] 编写 `lib/utils/jsonld.ts` — `buildProductJsonLd(item, baseUrl)` 和 `buildBreadcrumbJsonLd(crumbs)`（TECH_REQUIREMENTS.md §22.4）
- [x] 编写 `lib/utils/i18n.ts` — `getLocalizedField(item, field, locale)` 和 `t(key)`（TECH_REQUIREMENTS.md §22.8）
- [x] 用已知坐标测试 `haversineInMiles`
- [x] 测试 `resolveItemPrice` 的所有分支：Infinity、精确匹配、间隙、空档位、开放式档位
- [x] **（2026-06-14 新增）** 编写 `lib/utils/units.ts` — `convertLength`/`convertWeight`、`resolveMeasurementUnit(locale, config)`（解析 `siteConfig.i18n.localeMeasurementUnits?.[locale] ?? siteConfig.measurementUnit`）、`formatDimensions`/`formatWeight`（将物品存储的尺寸/重量换算为解析出的单位制以供展示，四舍五入到 2 位小数）。无 `"use client"`——供 `MetadataTable.tsx` 使用

#### 3c — 加载器（`lib/content/loader.ts`）
- [x] 实现 `loadCategories()` — 读取 `content/items/`，解析 `_category.json`，应用排序逻辑（DESIGN.md §6），排除 `_` 前缀文件夹
- [x] 实现 `loadItemsByCategory()` — 读取物品文件夹，应用可见性规则（排除草稿，检查已售+保留期），从清单解析图片 URL
- [x] 实现 `loadItem()` — 缺失时返回 `null`，不抛出异常
- [x] 实现 `loadAllItems()` — 仅 `available` 状态；按 `listedDate` 降序排列；上限为 `siteConfig.recentlyListedCount`。**仅用于首页最近上架区块。**
- [x] 实现 `loadSoldItems()` — 返回所有已售物品，不受 `soldItemRetentionDays` 限制；按 `soldDate` 降序（回退到 `listedDate`）；用于 `/sold` 档案页（TECH_REQUIREMENTS.md §8）
- [x] 编写 `lib/search/index.ts` — `buildSearchIndex()`：读取所有非草稿、非已售物品（available/pending/reserved），返回 `SearchIndexEntry[]`，字段为：`categorySlug`、`itemSlug`、`name`、`description`、`brand`、`model`、`tags`、`course`、`isbn`、`edition`、`coverImage`。该函数只返回数组；调用方（`scripts/build-search-index.ts`，在 `prebuild` 中运行）将结果写入 `public/search-index.json`（而非 `lib/generated/`），以便 SearchBar 通过 HTTP 获取（TECH_REQUIREMENTS.md §22.1 与 §7）
- [x] 图片 URL 解析：`manifest[key] ?? "/items/{key}"` 回退（DESIGN.md §11）
- [x] 图片排序：`filenames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))` ——显式排序，绝不依赖 `readdir` 顺序（DESIGN.md §4）
- [x] 验证返回的 `Item` 类型中从不包含 `reserved_for` 字段
- [x] **（2026-06-14 新增）** `item.json`/`_category.json` 通过 `jsonc-parser` 以 JSONC 解析（`readJsonc()` 辅助函数，`allowTrailingComma: true`）——允许 `//` 注释和尾随逗号；纯 JSON 仍可零错误解析，因此现有文件不受影响

#### 3d — 种子数据与内容 CLI 脚本
- [x] 创建 2 个示例分类（`content/items/houseware/`、`content/items/electronics/`）
- [x] 创建 3–4 个涵盖所有状态值和边缘情况的示例 `item.json` 文件
- [x] 创建含 `{}` 的 `lib/generated/image-manifest.json`（空的起始值）
- [x] 编写 `scripts/mark-sold.ts` — 读取 `content/items/<cat>/<name>/item.json`，设置 `status: "sold"` 和 `sold_date: today (ISO 8601)`，原地写回文件；物品路径不存在时退出码为 1 并给出清晰错误（TECH_REQUIREMENTS.md §22.3）
- [x] 编写 `scripts/create-item.ts` — 创建 `content/items/<category>/<name>/` 文件夹，并从模板生成 `item.json`；设置了 `$EDITOR` 时打开编辑；验证分类存在（TECH_REQUIREMENTS.md §22.3）
- [x] 编写 `scripts/create-template.ts` — 创建 `content/items/<category>/_template.json`；无参数时创建全局 `content/items/_template.json`（TECH_REQUIREMENTS.md §22.3）
- [x] 提取 `scripts/lib/itemTemplate.ts`（`buildItemTemplate()`）作为脚手架的唯一数据源，供 `create-item.ts` 和 `create-template.ts` 共用——覆盖 DESIGN.md §5 中全部 36 个可脚手架字段（不含 `reserved_for`），其中 `dimensions`/`weight` 写入空结构占位符（`{ length: null, width: null, height: null, unit: "cm" }` / `{ value: null, unit: "kg" }`），未填写时通过现有的 Zod `.catch(null)` 逻辑自动归一为 `null`
- [x] 验证加载器为示例物品返回正确数据
- [x] **（2026-06-14 新增）** `buildItemTemplate(name, listedDate, measurementUnit)` ——`dimensions.unit`/`weight.unit` 占位符现在默认取自 `siteConfig.measurementUnit`（"metric" → cm/kg，"imperial" → in/lb），而非硬编码
- [x] **（2026-06-14 新增）** `scripts/lib/itemTemplate.ts` —— `renderItemTemplateJsonc()` 将模板写为 JSONC，并为 `condition`、`status`、`dimensions.unit`、`weight.unit` 附上列出所有可选值的 `// options: ...` 注释；`create-item.ts`/`create-template.ts` 写入此输出
- [x] **（2026-06-14 新增）** `scripts/lib/markSold.ts`（`applyMarkSold()`）——`mark-sold` 现在通过 `jsonc-parser` 的 `modify`/`applyEdits`（定向编辑指定 token）来更新 `status`/`sold_date`，而非完整 parse/stringify 往返，从而保留 `// options: ...` 注释和卖家的格式

### 验收标准
- 所有 4 个加载器函数从示例 `content/items/` 返回类型化数据
- 缺少 `item.json` → `loadItem()` 返回 `null`，不抛出
- 无效字段值 → 应用默认值，不崩溃
- `reserved_for` 不出现在任何返回的 `Item` 对象中
- 所有单元测试通过

### 参考
DESIGN.md §4、§5、§6、§8、§11 · TECH_REQUIREMENTS.md §6、§7、§8

---

## Phase 4 — 图片管道 ✅
**目标：** `pnpm dev` 显示 `content/items/` 的图片。`pnpm upload-images` 成功上传到 **Cloudflare R2**（推荐/主要提供商）并写入清单；Vercel Blob 路径并行实现为备用。可与 Phase 3 并行开发。

### 任务

#### 4a — 适配器接口
- [x] 编写 `lib/images/adapter.ts` — `ImageStorageAdapter` 接口（TECH_REQUIREMENTS.md §7）

#### 4b — 提供商实现
- [x] 编写 `lib/images/local.ts` — 复制到 `public/items/`，返回 `/items/{key}`，跳过未更改文件
- [x] 编写 `lib/images/cloudflare-r2.ts`（主要）— SHA-256 比对，`@aws-sdk/client-s3 PutObjectCommand`，返回 CDN URL；缺少 `CF_R2_*` 时报清晰错误
- [x] 编写 `lib/images/vercel-blob.ts`（备用）— SHA-256 比对，`@vercel/blob put()`，返回 CDN URL；缺少 `BLOB_READ_WRITE_TOKEN` 时报清晰错误
- [x] 安装提供商开发依赖：`pnpm add -D @aws-sdk/client-s3`（Cloudflare R2——推荐）。`@vercel/blob` 代码已实现；走该路径时另行安装。

#### 4c — 同步脚本（`scripts/sync-images.ts`）
- [x] 实现 `--mode upload`：扫描、SHA-256、上传新/已更改文件、清除过时清单条目、复制 contact/、写入清单、写入校验和缓存、打印备份提醒（TECH_REQUIREMENTS.md §7）
- [x] 实现 `--mode dev-sync`：复制到 `public/items/`，复制 contact/，content/items/ 缺失时优雅处理
- [x] 实现 `--mode build-check`：本地提供商 → 本地复制；云提供商 → 验证清单存在；始终复制 contact/
- [x] 更新 `next.config.ts` 添加 Vercel Blob / R2 远程模式（TECH_REQUIREMENTS.md §4）——Phase 0 已完成
- [x] 编写 `lib/images/stripMetadata.ts`（`sharp`，已提升为必需 devDependency）——在 `--mode upload` 中对新增/变更的 JPEG/PNG/WebP 剥离 EXIF/IPTC/XMP 元数据（含 GPS 位置）；先通过 `.rotate()` 自动旋正方向以保留显示效果；GIF 原样透传。`--mode dev-sync`/`build-check` 不受影响（本地复制保留原始字节）

#### 4d — 集成测试
- [x] `pnpm dev` → 示例图片出现在 `/items/houseware/item/cover.jpg`
- [x] `pnpm upload-images` 设置 `CF_R2_*` → 图片上传到 R2；清单写入 R2 CDN URL（如验证 Vercel Blob 路径，用 `BLOB_READ_WRITE_TOKEN` 重复）
- [x] 类 CI 环境（无本地图片）中 `pnpm build` → 读取清单以 build-check 模式，不尝试上传，构建成功

### 验收标准
- 本地开发：图片从 `public/items/` 提供
- 上传运行后：`lib/generated/image-manifest.json` 写入有效 CDN URL
- 云提供商 build-check：读取清单，不尝试上传
- 删除物品文件夹：下次上传运行时清除对应清单条目
- 任何不可恢复的错误退出码为 1

### 参考
DESIGN.md §3、§14 · TECH_REQUIREMENTS.md §7

---

## Phase 5 — 公共组件 ✅
**目标：** 所有共享展示组件就绪。尚无页面。

### 任务
- [x] `components/common/AdaptiveImage.tsx` — 基于 `deploymentMode` 的 `next/image` vs `<img>`（TECH_REQUIREMENTS.md §9）
- [x] `components/layout/SiteHeader.tsx` — 站点名称/Logo、导航占位符
- [x] `components/layout/SiteFooter.tsx` — 站点名称、最后构建时间戳、ContactSection 槽位
- [x] `components/layout/Breadcrumb.tsx` — 首页 → 分类 → 物品，正确的 href
- [x] `components/item/StatusBadge.tsx` — 颜色编码标签，不能只依赖颜色（必须有文字标签）
- [x] `components/item/ConditionBadge.tsx` — 同上约束
- [x] `components/item/MetadataTable.tsx` — 渲染品牌、型号、尺寸、重量、原始来源（链接）、原始价格；隐藏任何 null/空字段

### 验收标准
- 所有组件使用真实 `Item` 数据渲染时无运行时错误
- `AdaptiveImage` 在 vercel 模式下使用 `<Image>`；static 模式下使用 `<img>`
- 所有可交互元素有 `focus-visible:ring` 类
- 徽章显示文字标签（不只依赖颜色）

---

## Phase 6 — 首页 ✅
**目标：** `/` 完整渲染，含 Hero、分类网格和最近上架区块。分类和物品从 `content/` 加载。

### 任务
- [x] `components/category/CategoryCard.tsx` — 图标、显示名称、可用物品数量、封面图背景
- [x] `components/category/CategoryGrid.tsx` — `CategoryCard` 的响应式网格
- [x] `components/item/ItemCard.tsx` — 封面图、名称、成色徽章、状态徽章、价格 prop（从父级接收解析价格）。当前直接渲染 `item.name`；**Phase 12** 将其转换为 `"use client"` 语区消费者（本地化标题）——见 DESIGN.md §12
- [x] `components/home/RecentlyListedSection.tsx`（客户端组件）— 拥有 `useGeolocation()` + `useDistancePricing()` 状态；渲染含解析价格的物品卡片；不含 `LocationPriceBar`（价格静默更新）
- [x] `app/layout.tsx` — 根布局、`BackgroundEffect` 包装、`SiteHeader`、`SiteFooter`、全局字体/元数据
- [x] `components/common/RecentlyViewed.tsx`（客户端）— 读取 `sessionStorage`；渲染最近 5 件浏览物品的横向条；**为空时隐藏**（返回 `null`）。接受可选 `itemSlug?: string` prop——提供时在挂载时将该 slug 记录到 `sessionStorage`（供物品详情页使用）。在此（Phase 6）构建，因为该组件除 `sessionStorage` + `Item` 类型外无其他依赖；避免 Phase 9 → Phase 6 的反向依赖。
- [x] `app/page.tsx` — Hero、`CategoryGrid`、`RecentlyListedSection`、`RecentlyViewed` 条（首次访问隐藏；同一会话中浏览任一物品详情页后出现）
- [x] 首页 OG 元数据（DESIGN.md §10.1：最近可用物品封面作为 og:image）

### 验收标准
- 首页使用 `content/items/` 的真实内容渲染
- 分类卡片显示正确的可用物品数量
- 最近上架最多显示 `recentlyListedCount` 件物品，且仅 `available` 状态
- 可用物品为零 → 最近上架区块隐藏
- `RecentlyViewed` 条首次访问隐藏（sessionStorage 为空）；浏览物品页后显示
- `pnpm type-check` → 0 个错误

---

## Phase 7 — 地理定位与定价系统 ✅
**目标：** 完整的地理定位 + 距离定价栈在隔离环境中工作。在接线到页面前用 `pnpm dev` 测试。

### 任务

#### 7a — Hooks
- [x] `components/pricing/useGeolocation.ts` — `idle → pending → granted/denied/unavailable`；所有渲染中 `idle` 与 `pending` 同等对待（DESIGN.md §17）*（Phase 6 中提前实现以支持 RecentlyListedSection）*
- [x] `components/pricing/useDistancePricing.ts` — `idle`/`pending` 时返回 `{ source: "fallback" }`；导出 `setManualMiles`；内部使用 `lib/utils/pricing.ts` 的 `resolveItemPrice`（调用方始终直接从该模块导入——此 hook 从不重新导出它）*（Phase 6 中提前实现）*
- [x] 验证 `useDistancePricing` 在 `{ source: "fallback" }` 时 → 以 fallback 调用 `resolveItemPrice` → 最高档位

#### 7b — LocationPriceBar
- [x] `components/pricing/LocationPriceBar.tsx`（客户端）— 所有 4 种渲染状态（idle/pending、已授权检测到、手动、回退）；内联距离输入；无障碍（切换支持 Enter/Space）
- [x] 在 dev 中临时强制每个 `geoState` 值，测试所有状态

#### 7c — PricingTable 与切换
- [x] `components/item/PricingTable.tsx` — 展示式；渲染解析档位行 + `PricingTableToggle`；无档位时显示"联系询价"
- [x] `components/item/PricingTableToggle.tsx`（客户端）— 展开/折叠；视觉突出解析档位行；键盘可访问；状态在距离变化后保留

#### 7d — PricingSection 与 FilterBar
- [x] `components/item/PricingSection.tsx`（客户端）— 拥有物品详情的地理+距离状态；在 `PricingTable` 上方渲染 `LocationPriceBar`；接受 `initialResolvedTier` 供 SSG 初始渲染
- [x] `components/filters/SortSelect.tsx`（客户端）— 排序下拉菜单：上架日期（最新）· 价格从低到高 · 价格从高到低 · 成色（最优优先）；`FilterBar` 的子组件；独立组件以便持有自己的下拉状态。**必须在 `FilterBar` 之前创建**（FilterBar 将 SortSelect 渲染为子组件）。
- [x] `components/filters/useFilters.ts` — 成色标签、价格范围滑块（基于解析价格的 `[min, max]`）、状态切换；无物品有档位时隐藏滑块；距离变化时重置滑块
- [x] `components/filters/FilterBar.tsx`（客户端）— 渲染 useFilters 控件（含 `SortSelect`）；接收 `resolvedDistanceMi` prop；source = fallback 时由父级传入 `Infinity`

### 验收标准
- 权限授予 → 显示正确距离；卡片价格更新
- 权限拒绝 → 显示回退价格；可见"输入距离"链接
- 手动输入距离 → 价格立即重新计算
- `idle`/`pending` → 显示回退价格；无内容缺失闪烁
- `resolveItemPrice` 可被服务器组件访问（`lib/utils/pricing.ts` 无 "use client"）
- `PricingTableToggle` 展开/折叠正常；切换状态在距离变化后保留

### 参考
DESIGN.md §17 · TECH_REQUIREMENTS.md §20

---

## Phase 8 — 分类页、浏览全部与已售档案 ✅
**目标：** `/[category]`、`/all` 和 `/sold` 全部渲染。筛选栏、物品网格和定位解析价格完整。

### 任务

#### 8a — 分类页
- [x] `components/item/ItemGrid.tsx`（客户端）— 拥有 `resolvedDistance` 状态；渲染 `LocationPriceBar` + `FilterBar`（含 `SortSelect`）+ 物品卡片；fallback 时向 FilterBar 传入 `resolvedDistanceMi={Infinity}`。Prop `browseAll?: boolean`——为 `true` 时每张 `ItemCard` 收到 `showCategoryChip: true`，卡片上出现"所在分类：{分类}"徽章（链接到 `/[category]`）；单个分类页省略或置 `false`。
- [x] `app/[category]/page.tsx` — 来自 `loadCategories()` 的 `generateStaticParams`；含 OG 的 `generateMetadata`；渲染含物品的 `ItemGrid`
- [x] 物品卡片上的已售物品遮罩（状态徽章 + 变暗）
- [x] 分类页正文中的"浏览全部"突出链接——与头部导航链接区分；指向 `/all`（DESIGN.md §10.2）
- [x] 空分类（所有物品已售/草稿或所有已售已过期）→ 渲染空网格含"该分类当前无可用物品"消息；路由仍会生成，因为 `loadCategories()` 不按物品可见性过滤（DESIGN.md §10.2；§15 管辖物品级可见性，而非路由生成）

#### 8b — 浏览全部页（`/all`）
- [x] `app/all/page.tsx` — 服务器组件；调用 `loadCategories()` 然后为每个分类调用 `loadItemsByCategory()` 并展平为单个 `Item[]`；渲染 `<ItemGrid browseAll={true} ...>`（为每张卡片添加"所在分类：{分类}"徽章），不带分类级标题（DESIGN.md §10.4）
- [x] 验证：`available` + `reserved`/`pending` 均显示；已售物品默认隐藏，切换后可见；`draft` 物品不显示
- [x] 验证：筛选栏成色标签、价格滑块、排序、状态切换均正常工作

#### 8c — 已售物品档案（`/sold`）
- [x] `app/sold/page.tsx` — 服务器组件；调用 `loadSoldItems()`；渲染简单物品网格（无筛选栏、无定价、无联系方式）；按 `soldDate` 降序；网格最多渲染 `siteConfig.soldArchiveDisplayLimit` 件物品（页头显示已售总数）；显示封面图、名称、成色徽章、售出日期、分类徽章（DESIGN.md §10.5）
- [x] 验证：`loadSoldItems()` 返回所有已售物品，不受 `soldItemRetentionDays` 限制；`/sold` 网格上限为 `siteConfig.soldArchiveDisplayLimit` 件，页头计数反映总数
- [x] 验证无定价显示；无联系区块

### 验收标准
- 所有分类路由在构建时静态生成
- 筛选栏：成色标签、价格滑块、状态切换彼此独立工作
- 已售物品显示"已售"遮罩但仍在网格中（直至保留期过期）
- `draft` 物品绝不渲染
- `/all` 页面显示带徽章的 `reserved`/`pending`；该页面不使用 `loadAllItems()`
- `/sold` 档案：`loadSoldItems()` 不应用保留期过滤；网格最多渲染 `soldArchiveDisplayLimit` 件物品，页头显示总数

---

## Phase 9 — 物品详情页 ✅
**目标：** `/[category]/[item]` 渲染，含图库、SSG 定价、联系区块和所有元数据。

> **⚠️ 顺序说明：** Phase 9 依赖 Phase 10（联系系统）。尽管在文档中先出现，Phase 10 必须在 Phase 9 接线前完成。先完成 Phase 10，再回到这里。

### 任务

#### 9a — 支持组件（在接线到页面前构建）
- [x] `components/item/FreshnessLabel.tsx`（`"use client"`）— 使用 `useState<string|null>(null)` + `useEffect(() => { setLabel(formatRelativeDate(listedDate)) }, [listedDate])` 在挂载时针对访客实时浏览器时钟计算相对日期。hydration 前渲染 `null`（不显示陈旧的 SSG 日期）。（TECH_REQUIREMENTS.md §22.11）
- [x] `components/item/QuantityBadge.tsx` — `item.quantity > 1` 时渲染"3 件在售"；否则隐藏
- [x] `components/item/TextbookBadge.tsx` — 渲染"适用于 CS101 · 第3版"徽章 + "比价"链接（`bookfinder.com/search/?isbn={isbn}`）；仅在存在 `isbn` 或 `course` 时显示（DESIGN.md §10.3）
- [x] `components/item/MakeOfferButton.tsx`（客户端）— `price.negotiable: true` 且设置 `min_acceptable_offer` 时渲染；内联报价表单；提交时预填联系消息；低于阈值的报价在客户端拒绝（DESIGN.md §10.3）
- [x] `components/item/ConditionGuide.tsx`（客户端）— 成色徽章旁的 `?` 图标；打开工具提示/弹窗解释各成色值；Escape 关闭；键盘可访问
- [x] `components/common/ShareButton.tsx`（客户端）— 移动端 `navigator.share()`；桌面端 `navigator.clipboard.writeText()` 回退；显示"已复制！"提示 2 秒（TECH_REQUIREMENTS.md §22.10）
- [x] 将 `RecentlyViewed`（Phase 6 构建）接线到物品详情页：传递 `itemSlug={item.itemSlug}`，使组件在挂载时将当前物品记录到 `sessionStorage`。这样首次浏览物品后，首页和其他详情页的浏览条即会填充。
- [x] `components/common/JsonLd.tsx` — 服务器组件；渲染 `<script type="application/ld+json">{JSON.stringify(data)}</script>`（TECH_REQUIREMENTS.md §22.4）

#### 9b — 图库
- [x] `components/item/ItemGallery.tsx`（客户端）— 简单默认值：大主图 + 缩略图条；点击切换（供 `GalleryAdapter` 的 `"simple"` 配置使用）

#### 9c — 物品详情页
- [x] `app/[category]/[item]/page.tsx`：
  - [x] 来自 `loadCategories()` + `loadItemsByCategory()` 的 `generateStaticParams`
  - [x] `generateMetadata` — 标题、描述、og:image、og:title、Twitter 卡片、Pinterest 富 pin 元数据（TECH_REQUIREMENTS.md §22.5）
  - [x] 服务器端：调用 `resolveItemPrice(item.price, { source: "fallback" })` 获取 `initialResolvedTier`
  - [x] 注入 `<JsonLd data={buildProductJsonLd(item, siteConfig.baseUrl)} />` 和 `<JsonLd data={buildBreadcrumbJsonLd(crumbs)} />`
  - [x] 渲染：面包屑、图库（`GalleryAdapter`）、`FreshnessLabel`、状态+成色徽章（`ConditionGuide` 附着于 `ConditionBadge`）、`QuantityBadge`、名称+描述（react-markdown；**Phase 12** 将这两者包装进 `LocalizedItemContent` 以支持运行时语区切换）、`TextbookBadge`、`PricingSection`（含 `MakeOfferButton`、"支付定金" + "使用 Venmo 支付"按钮）、`MetadataTable`、`ContactSection`、标签、`ShareButton`、`RecentlyViewed`
  - [x] 付款按钮（内联于 `PricingSection`/页面）：设置 `stripe_payment_link` 时渲染"支付定金"，设置 `venmo_payment_request` 时渲染"使用 Venmo 支付"；各自在新标签页打开 URL 并带 `rel="noopener noreferrer"`；字段为空时均不渲染（DESIGN.md §10.3，TECH_REQUIREMENTS.md §22.9）
  - [x] 已售物品："已售"横幅突出；联系 CTA 禁用；显示 `sold_date`
- [x] `app/not-found.tsx` — 站点头部、"页面未找到"消息、返回首页链接

### 验收标准
- 所有物品详情路由静态生成
- 静态 HTML 显示最高档位价格（JS 加载前不空白）
- JS hydration 后显示地理定位解析档位
- 描述正确渲染 Markdown
- `reserved_for` 绝不出现在渲染 HTML 中（通过浏览器查看源代码确认）
- `og:image` 为物品的 `coverImage` URL
- `<head>` 中存在 JSON-LD Product schema（通过 Google Rich Results Test 验证）
- `FreshnessLabel` 显示访问时（而非部署时）计算的正确相对日期；服务端不渲染任何内容
- 触发条件缺失时 `QuantityBadge`、`TextbookBadge` 隐藏
- "支付定金"/"使用 Venmo 支付"按钮仅在设置 `stripe_payment_link` / `venmo_payment_request` 时渲染；各自新标签页打开；为空时隐藏
- `RecentlyViewed` 条首次访问隐藏（sessionStorage 为空）；挂载时记录当前物品 slug

---

## Phase 10 — 联系系统 ✅
**目标：** 联系区块在物品详情页和 footer 中正确渲染。二维码弹窗工作正常。

### 任务
- [x] `components/contact/PlatformButton.tsx`（客户端）— 链接式：`<a>` 含按平台表格的正确 URL（DESIGN.md §7）；二维码式：`<button>` 触发弹窗
- [x] `components/contact/QRModal.tsx`（客户端）— `<dialog>`；点击背景或 Escape 关闭；打开时焦点捕获；关闭时恢复焦点
- [x] `components/contact/ContactSection.tsx`（客户端）— `reveal_behavior: "click"` 切换；渲染平台按钮；`preferredPayment`/`contactNote` 为空时隐藏；footer 用法：传 `preferredPayment={[]}` 和 `contactNote=""`
- [x] 接线到物品详情页和 `SiteFooter`

### 验收标准
- 所有链接平台在新标签页打开且带 `rel="noopener noreferrer"`
- 微信/LINE 二维码弹窗可打开、获得焦点、Escape 关闭
- `reveal_behavior: "always"` 立即显示平台
- `reveal_behavior: "click"` 隐藏在切换按钮后
- footer 只显示平台按钮（无付款/备注区块）

---

## Phase 11 — UI 槽位适配器（接线）✅
**目标：** 所有 4 个适配器文件完整接线。`content/config.ts` 的 `ui.*` 值在所有地方驱动正确的 Aceternity 组件。

### 依赖：Phase 1、8、9 必须完成。

### 任务
- [x] `components/ui-adapters/BackgroundEffect.tsx` — 所有 13 个背景选项预导入，完整 `COMPONENTS` 映射，`⚠️ DO NOT EDIT` 头部
- [x] `components/ui-adapters/ItemGridAdapter.tsx` — 所有 3 个网格选项 + `"simple"` 回退，render prop 接口，按 TECH_REQUIREMENTS.md §21 做数据归一化
- [x] `components/ui-adapters/GalleryAdapter.tsx` — 所有 4 个图库选项 + `"simple"` 回退，数据归一化
- [x] `components/ui-adapters/ItemCardAdapter.tsx` — 所有 7 个卡片选项 + `"simple"` 回退，children 透传，数据归一化（direction-aware-hover 说明）
- [x] 将 `BackgroundEffect` 接线到 `app/layout.tsx`
- [x] 将 `ItemGridAdapter` 接线到 `components/item/ItemGrid.tsx`（替换原始网格 div）
- [x] 将 `GalleryAdapter` 接线到物品详情页（直接替换 `ItemGallery`）
- [x] 将 `ItemCardAdapter` 接线到 `ItemCard.tsx` 作为最外层包装
- [x] 通过在 `content/config.ts` 中循环 2–3 个值测试每个槽位，验证无崩溃

### 验收标准
- 修改 `content/config.ts` 中的 `ui.background` → 重新构建后渲染正确的 Aceternity 背景
- 未知配置值 → 静默回退到 `"simple"`/`"none"`（不崩溃、无 TypeScript 错误）
- 所有适配器文件以 `⚠️ DO NOT EDIT` 注释开头
- 所有适配器文件 `pnpm type-check` → 0 个错误

---

## Phase 12 — 国际化运行时 ✅
**目标：** 访客通过 `SiteHeader` 中的 `LocaleSwitcher` 在运行时切换语言。物品名称（卡片 + 详情）和详情页 Markdown 描述无需刷新即以所选语区重新渲染；所选语区跨页面和跨刷新持久有效。SSG 仍输出 `defaultLocale` 内容。`availableLocales.length === 1` 时切换器隐藏，行为与单语区构建相同。

### 依赖
- Phase 3b（`lib/utils/i18n.ts` — `getLocalizedField`、`t`）必须完成
- Phase 5（SiteHeader——承载 `LocaleSwitcher`）、Phase 6（`ItemCard`、`app/layout.tsx`）、Phase 9（物品详情页——承载 `LocalizedItemContent`）

**可与 Phase 10、11、13 并行开发。**

### 任务

#### 12a — 国际化运行时组件
- [x] `components/i18n/LocaleProvider.tsx`（客户端）— 暴露 `{ locale, setLocale }` 的 React context；挂载时读取 `localStorage.getItem("locale")`，缺失或不在 `availableLocales` 中时回退到 `siteConfig.i18n.defaultLocale`；`setLocale` 通过 `localStorage.setItem("locale", …)` 持久化（TECH_REQUIREMENTS.md §22.8）
- [x] `components/i18n/useLocale.ts` — 从 `LocaleProvider` context 返回活跃语区（及 `setLocale`）的 hook
- [x] `components/i18n/LocaleSwitcher.tsx`（客户端）— 每个 `availableLocale` 一个控件；调用 `setLocale()`；**当 `siteConfig.i18n.availableLocales.length <= 1` 时返回 `null`**（DESIGN.md §12）

#### 12b — 本地化渲染
- [x] `components/item/LocalizedItemContent.tsx`（客户端）— 渲染物品 `<h1>` 名称和 react-markdown + remark-gfm 描述；读取 `useLocale()` 并通过 `getLocalizedField(item, "name"/"description", locale)` 解析；两者均在语区变化时重新渲染（DESIGN.md §10.3、§12；TECH_REQUIREMENTS.md §22.8）
- [x] 将 `components/item/ItemCard.tsx` 转换为 `"use client"`；通过 `useLocale()` + `getLocalizedField(item, "name", locale)` 本地化卡片标题

#### 12c — 接线
- [x] 用 `<LocaleProvider>` 包装 `app/layout.tsx` 的 children（`<body>` 内最外层客户端 provider），使所有页面共享一个语区 context
- [x] 在 `components/layout/SiteHeader.tsx` 中渲染 `<LocaleSwitcher />`（配置为单语区时自动隐藏）
- [x] 将 `app/[category]/[item]/page.tsx` 中的内联名称 + react-markdown 块替换为 `<LocalizedItemContent item={item} />`
- [x] 确认仅服务端表面（`generateMetadata`、`<title>`、OG、JSON-LD、面包屑叶子）继续读取 `siteConfig.i18n.defaultLocale`——有意不做运行时切换（TECH_REQUIREMENTS.md §22.8 SEO 说明）

### 验收标准
- `availableLocales: ["en"]` → `LocaleSwitcher` 隐藏；与非 i18n 构建行为一致
- `availableLocales: ["en","zh"]` 且有已翻译物品 → 切换到 `zh` 时卡片标题、详情 `<h1>` 和 Markdown 描述无需刷新即更新；未翻译物品回退到英文（不空白、不崩溃）
- 所选语区跨导航持久，并在页面刷新后保留（localStorage）
- 冷加载查看源代码显示 `defaultLocale` 文本（SSG）——确认爬虫看到默认语言
- `pnpm type-check` → 0 个错误

### 参考
DESIGN.md §10.3、§12、§13 · TECH_REQUIREMENTS.md §22.8

---

## Phase 13 — SEO、搜索、无障碍与安全加固 ✅
**目标：** Lighthouse ≥ 80 性能，≥ 90 无障碍。全文搜索工作正常。所有 TECH_REQUIREMENTS.md §14 和 §15 检查通过。

### 任务

#### 全文搜索
- [x] 编写 `scripts/build-search-index.ts` — 导入 `buildSearchIndex()`，写入结果到 `public/search-index.json`，记录条目数，出错退出 1。（fuse.js 及其类型已在 Phase 0 安装；fuse.js v7 自带 TypeScript 类型，无需 `@types/fuse.js`）
- [x] 更新 `package.json` 的 `prebuild` 脚本为链式：`tsx scripts/check-config.ts && tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts`（`check-config` 门控——占位 `baseUrl` 或不完整 `UIStrings` 翻译时构建失败——为后续补充；完整 scripts 块见 TECH_REQUIREMENTS.md §7）
- [x] 验证：`pnpm build` 在 `next build` 渲染任何页面之前生成 `public/search-index.json`（索引在 prebuild 中构建一次，而非每页构建）
- [x] 编写 `components/search/SearchBar.tsx`（客户端）— 通过 `next/dynamic({ ssr: false })` 加载；挂载时获取 `/search-index.json`；优雅处理 404（空索引、不崩溃——见 TECH_REQUIREMENTS.md §22.1）；防抖 150ms；内联显示结果，含封面图、名称、分类、价格徽章；点击跳转详情页
- [x] 编写 `components/search/useSearch.ts` — 挂载时加载索引，管理查询+结果状态
- [x] 在 `SiteHeader` 中接线 `SearchBar`（`siteConfig.search.enabled === true` 时显示）
- [ ] 验证：搜索品牌名、标签、课程代码、ISBN、版本——均有结果返回
- [ ] 验证：`pnpm dev` 未先构建时——SearchBar 无结果、不崩溃

#### SEO
- [x] 验证每个路由有 `<title>` 和 `<meta name="description">`
- [x] 验证所有 3 种路由类型（首页、分类、物品）的 OG 标签
- [x] 验证 `sitemap.xml` + `robots.txt` 在 `siteConfig.sitemap.enabled` 时生成（v1 功能，默认开启；可按 TECH_REQUIREMENTS.md §22.7 通过配置切换；`scripts/postbuild.ts` 在构建后运行 `next-sitemap`，禁用时打印跳过提示）

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
- [x] 验证 `next.config.ts` 中的 `poweredByHeader: false`
- [ ] 验证所有外部链接有 `rel="noopener noreferrer"`

#### 性能
- [ ] 在分类页运行 Lighthouse 移动端 → 目标 ≥ 80
- [ ] 检查首次加载 JS 包 ≤ 150 KB（gzip 压缩后）
- [ ] 验证从地理定位待定 → 地理定位解析后价格变化无布局偏移

### 验收标准
- Lighthouse Performance ≥ 80（移动端）
- Lighthouse Accessibility ≥ 90
- 任何渲染 HTML 中 `reserved_for` 出现次数为 0
- 所有外部链接：`target="_blank" rel="noopener noreferrer"`

---

## Phase 14 — 部署 ✅
**目标：** 站点在 GitHub Pages 上通过自定义域名上线，图片在 Cloudflare R2，整个卖家工作流端到端验证通过。

### 任务

#### 一次性设置——Cloudflare R2
- [ ] Cloudflare Dashboard → R2 → 创建存储桶（如 `usedexchange-images`）
- [ ] 启用公共访问或附加自定义子域名（如 `images.your-domain.com`）
- [ ] 创建 R2 API 令牌：**对象读写**，仅限此存储桶
- [ ] 在存储桶上配置 CORS（Cloudflare Dashboard → R2 → 存储桶 → Settings → CORS）：
  ```json
  [{ "AllowedOrigins": ["https://your-domain.com"], "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
  ```
- [ ] 复制 `.env.example` → `.env.local`；填写所有 `CF_R2_*` 值
- [ ] 配置 `content/config.ts`：`deploymentMode: "static"`，`imageStorage.provider: "cloudflare-r2"`，正确的 `baseUrl`，卖家 `location` 坐标

#### 一次性设置——GitHub Pages
- [ ] GitHub 仓库 → Settings → Pages → 来源：**GitHub Actions**
- [ ] GitHub 仓库 → Settings → Variables → Actions → 添加 `NEXT_PUBLIC_SITE_URL = https://your-domain.com`
- [ ] 自定义域名：GitHub 仓库 → Settings → Pages → Custom domain → 设置 `your-domain.com`；配置 DNS CNAME 到 `<username>.github.io`
- [x] 验证 `.github/workflows/deploy.yml` 已提交（项目自带）

#### 初始内容与部署
- [ ] 将真实列表照片添加到 `content/items/` 文件夹
- [ ] 运行 `pnpm upload-images` → 验证 R2 上传成功；清单已写入
- [ ] 提交 `lib/generated/image-manifest.json` + `content/**/*.json`
- [ ] 推送版本 tag（`git tag v1.0.0 && git push origin --tags`）→ `release-seller.yml` 创建 `release` 分支 → `deploy.yml` 触发 → 验证工作流通过（绿色勾选）
- [ ] 导航到部署 URL → 验证所有页面、图片和定价正常工作
- [ ] 验证 HTTPS（Geolocation API 需要 HTTPS——由 GitHub Pages + 自定义域名强制）

#### 最终检查
- [ ] 打开 DevTools → Network 标签 → 确认图片 URL 指向 `CF_R2_PUBLIC_URL` 域名
- [ ] 完成最后的照片编辑后再次运行 `pnpm upload-images` → 提交 → 推送 → 验证上线
- [ ] 端到端验证卖家工作流：添加 item.json + 照片 → 上传 → 提交 → 推送 → 上线

### 验收标准
- 站点通过自定义域名以 HTTPS 上线
- 所有图片从 Cloudflare R2 CDN 提供（通过 DevTools Network → R2 URL 验证）
- 分类页 + 物品页出现地理定位权限提示
- GitHub Actions 工作流在未配置任何 secret 时通过（CI 中无 CDN 凭据）
- 卖家机器上 `pnpm upload-images` → 推送后物品出现在线上站点

---

## Phase 15 — AI 技能文件（设置向导 + 物品生成器 + 物品翻译器）✅
**目标：** 所有三个 Claude Code 技能完整、测试通过并随项目发布。使用 Claude Code（或任何有能力 AI 工具）的卖家可运行 `/setup`、`/update-items` 和 `/translate-items` 来生成 `content/config.ts`、生成 `item.json` 文件和添加语区翻译——无需编辑任何代码。

**无 API 密钥，无新依赖，无自定义脚本。** 交付物是 Markdown 指令文件和一个 CI 工作流。

**架构：** 技能按受众拆分。开发者上下文位于 `.claude/`（develop 分支）。面向卖家的技能位于 `.claude/commands/`——Claude Code 的斜杠命令约定（`/setup`、`/update-items`、`/translate-items`，外加 Phase 16 的 `/setup-shipping`）——在 `develop` 和 `release` 两个分支上以完全相同的形式发布。`.claude/seller/` 仅存放卖家视角的 `CLAUDE.md`。卖家 fork/clone `release` 分支。

**可与 Phase 5–14 并行开发。**

### 依赖
- Phase 3（内容 Schema 与加载器）必须完成——技能引用完整的 `item.json` schema，且必须与其保持同步
- Phase 2（类型系统与配置）必须完成——技能引用 `content/config.ts` 的字段名与类型

### 任务

#### 15a — 项目 CLAUDE.md
- [x] `.claude/CLAUDE.md`（开发者视角）已存在，含项目上下文、铁规则和文档引用
- [x] 创建 `.claude/seller/CLAUDE.md` ——卖家视角上下文：`content/` 文件夹规则、三个技能入口、常见任务表、状态/定价参考
- [x] 测试：在项目目录中打开 Claude Code；确认 AI 无需进一步解释即有正确的项目上下文

#### 15b — `update-items.md` 技能
- [x] 创建 `.claude/commands/update-items.md`（斜杠命令 `/update-items`；随 `develop` 和 `release` 两个分支发布）
- [x] 包含：触发描述、照片分析的视觉指令、描述文件格式支持（`.txt`、`.md`、`.yaml`、`.json`，按优先级排序）、字段提取表（含置信度级别）、合并规则（描述文件覆盖视觉）、输出规范（`status: "draft"`，绝不设置 `reserved_for`）、确认流程（确认/编辑/跳过/全部接受）、范围指令（自然语言目标）
- [x] 包含 DESIGN.md §5 中完整的 `item.json` schema 作为参考块
- [ ] 用 Claude Code 测试：创建含 2 张照片 + notes.txt 的测试物品文件夹 → 调用技能 → 验证生成的 JSON 通过 Zod schema 验证
- [ ] 测试范围定向："只更新 electronics 文件夹"
- [ ] 测试无描述文件（仅照片）
- [ ] 测试部分 `info.yaml`（部分字段已填写的描述文件）

#### 15c — `setup.md` 技能
- [x] 创建 `.claude/commands/setup.md`（斜杠命令 `/setup`；随 `develop` 和 `release` 两个分支发布）
- [x] 包含：所有 8 个问题组、位置解析指令（AI 根据自身知识建议经纬度并展示以供确认）、分类骨架指令、幂等性指令（在提问前读取现有配置）、部分重跑支持（"只更新我的联系方式"）
- [x] 包含 DESIGN.md §13 中完整的 `content/config.ts` 模板作为输出参考
- [x] 包含写入前所有字段的验证规则
- [ ] 用 Claude Code 测试：从零运行 `/setup` → 验证生成的 `content/config.ts` 编译通过（`pnpm type-check`）
- [ ] 测试幂等性：config 已存在时再次运行 → 验证 AI 读取现有值并预填
- [ ] 测试部分重跑："只更新我的联系方式"

#### 15d — `translate-items.md` 技能
- [x] 创建 `.claude/commands/translate-items.md`（斜杠命令 `/translate-items`；随 `develop` 和 `release` 两个分支发布）
- [x] 包含：触发、从 `siteConfig.i18n.availableLocales` 动态检测语区（非硬编码到任何特定语言）、要翻译的字段（`name`→`name_{locale}`、`description`→`description_{locale}`）、逐字保留的字段（品牌、型号、颜色、标签、课程、isbn、版本、价格、日期、状态、URL）、Markdown 保留（含示例）、逐物品确认流程（确认/编辑/跳过/全部接受/重新翻译）、自然语言范围、状态过滤（翻译所有状态含草稿/已售）、输出规则（只写语区字段；完整保留其他字段）
- [x] 包含 Zod schema 前置条件：技能验证 `lib/content/schema.ts` 中是否存在 `name_{locale}`/`description_{locale}`；缺失时打印需添加的精确 Zod + `Item` 类型片段并停止
- [x] 包含各语区翻译质量指南（zh：默认简体；es：中立拉丁美洲西班牙语；fr/ja/ko 说明）
- [ ] 用 Claude Code 测试：向 `availableLocales` 添加 `"zh"` → 运行 `/translate-items` → 写入 `name_zh`/`description_zh`，其他字段不变，Markdown 保留
- [ ] 测试幂等性：有非空现有翻译的物品被跳过（不覆盖）

#### 15e — 验证与文档
- [x] 在项目根目录创建 `SETUP_GUIDE.md`——纯英文卖家指南，含：(1) 添加新物品，(2) 标记已售，(3) 从模板创建，(4) 修改价格，(5) 上传新照片，(6) 备份内容，(7) 出问题联系谁。包含 AI 写入文件后的 `pnpm type-check` 步骤。
- [x] 创建 `.github/workflows/release-seller.yml`——由 `v*` tag 触发的 CI 工作流；将 `release` 分支重置到打标签的提交；用 `.claude/seller/CLAUDE.md` 替换 `.claude/CLAUDE.md`；强制推送 `release`。卖家技能通过 `.claude/commands/` 在两个分支上原样发布（工作流中的 `.claude/skills/` 复制步骤为空操作——`.claude/seller/` 仅含 `CLAUDE.md`）。支持 `workflow_dispatch` 手动运行。
- [ ] 在至少一个非 Claude AI 工具（Cursor 或 GitHub Copilot）中测试所有三个技能，验证兼容性
- [ ] 确认 `content/` 规则：AI 绝不修改 `content/` 之外的任何文件

### 验收标准
- Claude Code 中 `/update-items` → 生成有效 `item.json`；Zod schema 验证通过
- Claude Code 中 `/setup` → 生成 `content/config.ts`；`pnpm type-check` 通过
- Claude Code 中 `/translate-items` → 只写入 `name_{locale}`/`description_{locale}`；其他字段不变；现有翻译不被覆盖；语区从 `siteConfig.i18n.availableLocales` 检测（非硬编码）
- CI：推送 `v*` tag 重新生成 `release` 分支，其 `.claude/CLAUDE.md` 为卖家视角版本；卖家技能通过 `.claude/commands/` 在两个分支上发布
- 无新增 npm 依赖
- 无需 API 密钥
- 不写入 `content/` 之外的任何文件

---

## Phase 16 — 运费计算器集成（可选）✅
**目标：** 卖家可选择性地为处于开放式"邮寄"价格档位的物品启用实时运费估算（Shippo/EasyPost），运费承担方（卖家或买家）可在站点级和单品级配置。默认关闭——未开启的站点不受任何影响。API 密钥绝不进入静态构建产物，由独立部署的 Cloudflare Worker 持有。

**架构：** 纯函数辅助模块（`lib/utils/shipping.ts`，与 `lib/utils/pricing.ts` 同理——禁止 `"use client"`）负责判断可用性和承担方。客户端 hook + 组件（`useShippingRate`、`ShippingEstimator`）调用 Cloudflare Worker 代理（`workers/shipping-rate-proxy/`，独立部署，不参与根目录 tsconfig/eslint/测试范围），由其以 `wrangler secret` 形式持有服务商 API 密钥。

### 依赖
- Phase 7（地理定位与定价系统）——复用 `PriceTier`/`Price` 类型及开放式档位惯例
- Phase 12（国际化运行时）——新增 `UIStrings` 键

### 任务

#### 16a — 类型与 Schema
- [x] `lib/utils/shipping.ts`——`isShippingTier()`、`resolveShippingPayer()`、`canEstimateShipping()`；纯函数，禁止 `"use client"`
- [x] `lib/utils/shipping.test.ts`——覆盖三个函数的 10 个单元测试
- [x] `lib/content/types.ts` 和 `lib/content/schema.ts` 新增 `Price.shipping_payer?: "seller" | "buyer"`（`z.enum(...).optional().catch(undefined)`）
- [x] `lib/config/types.ts` 新增 `SiteConfig.shipping?`（`enabled`、`proxyUrl`、`defaultPayer`、`origin`）
- [x] `lib/config/types.ts`、`lib/i18n/translations.ts`（`EN_FALLBACK`）和 `content/config.ts`（英文 + 注释掉的中文模板）新增 6 个 `UIStrings` 键

#### 16b — 客户端 Hook 与组件
- [x] `components/pricing/useShippingRate.ts`（客户端）——`{ status: idle|loading|ready|error }` 状态机；`AbortController` 在重新请求时取消进行中的请求
- [x] `components/item/ShippingEstimator.tsx`（客户端）——`!canEstimateShipping()` 时返回 `null`；根据 `resolveShippingPayer()` 渲染"包邮"提示或邮编输入框 + 实时运费
- [x] 接入 `components/item/PricingSection.tsx` 和 `app/[category]/[item]/page.tsx`（传递 `weight`/`dimensions`）

#### 16c — Cloudflare Worker 代理
- [x] `workers/shipping-rate-proxy/`——独立子项目（自有 `package.json`、`tsconfig.json`、`wrangler.toml`）
- [x] `src/index.ts`——CORS 限制的 `POST` 处理函数；`getShippoRate()` / `getEasyPostRate()`；以 `RateResponseBody` 返回最低运费
- [x] `.dev.vars.example` 记录所需密钥（`SHIPPO_API_KEY` / `EASYPOST_API_KEY`）
- [x] `README.md`——部署指南（获取 API 密钥、`wrangler secret put`、`wrangler deploy`、在 `content/config.ts` 中启用）+ API 约定
- [x] 根目录 `tsconfig.json` 的 `exclude` 和 `eslint.config.mjs` 的 `ignores` 已更新以排除 `workers/`
- [x] `.gitignore` 已更新：忽略 `.dev.vars`、`.wrangler/`；保留 `.dev.vars.example`

#### 16d — 验证与文档
- [x] `pnpm type-check`、`pnpm lint`、`pnpm test` 全部通过（Phase 16 快照：21 个文件共 216 个测试）
- [x] `pnpm exec tsx scripts/check-config.ts` 通过（功能默认注释关闭——模板仍然有效）
- [x] DESIGN.md / DESIGN_zh.md §21——完整功能设计（配置、单品覆盖、可用性判断、按承担方展示、隐私、部署）
- [x] ARCHITECTURE.md / ARCHITECTURE_zh.md——模块参考、数据流图、组件表、关键不变性、目录结构
- [x] TECH_REQUIREMENTS.md / TECH_REQUIREMENTS_zh.md §29——实现约定（类型、hook/组件 API、Worker 请求/响应格式、测试用例、安全性）
- [x] FEATURES_ROADMAP.md / FEATURES_ROADMAP_zh.md §4.3 标记为已实现
- [x] CURRENT_FUNCTIONALITY.md / CURRENT_FUNCTIONALITY_zh.md——面向卖家的功能说明
- [x] `.claude/commands/setup-shipping.md`——用于启用/配置该功能的卖家技能

### 验收标准
- `siteConfig.shipping` 缺失或 `enabled: false` → `ShippingEstimator` 不渲染任何内容；与 Phase 16 之前行为一致
- 卖家承担运费的物品 → 显示"包邮（卖家承担运费）"，不发起网络请求
- 买家承担运费且设置了重量+尺寸的"邮寄"档位物品 → 显示邮编输入框；输入有效邮编后从 Worker 返回实时运费
- 运费 API 密钥不会出现在 `out/`（静态导出）或任何客户端构建产物中
- `lib/utils/shipping.ts` 禁止 `"use client"`，可同时被服务端和客户端代码导入
- `workers/` 不影响主应用的 `pnpm type-check` / `pnpm lint` / `pnpm test`

### 参考
DESIGN.md §21 · TECH_REQUIREMENTS.md §29 · ARCHITECTURE.md（lib/ 模块参考、运费估算数据流）· `workers/shipping-rate-proxy/README.md`

---

## Phase 17 — Facebook Marketplace 智能导出 ✅

**目标：** `pnpm fb-export` 通过交互式三步 CLI 将在售物品导出为 Facebook Marketplace 批量上传 CSV。智能导出历史可防止重复运行时生成重复发布。

**版本：** v1.3.0

### 任务

#### 17a — 分类映射器
- [x] `scripts/lib/fbCategoryMap.ts` — 50+ 条正则规则，将物品语料（名称 + 标签 + 品牌 + 型号 + 分类 slug）映射为 FB `"Top//Sub//Leaf"` 分类字符串；为未匹配分类提供 slug 回退映射

#### 17b — 导出脚本
- [x] `scripts/export-facebook.ts` — 交互式三步 CLI（步骤 0：第二次及以后运行时显示历史过滤；步骤 1：全部/按分类/多选，支持逗号列表和区间 `1-4`；步骤 2：价格档位：最低价（lowest）/最高价（highest）/自提（pickup，限里程档位）/邮寄（shipping，开放式档位））
- [x] FB CSV 字段映射：`name`→TITLE（150 字符）、`price`→PRICE、`condition`→CONDITION、`description`→DESCRIPTION（5000 字符）、分类→CATEGORY、重量→SHIPPING WEIGHT（磅；按物品存储单位换算）、运费标志→OFFER FREE SHIPPING / OFFER SHIPPING
- [x] PHOTO 列：每行最多 10 列，使用图片清单中的 CDN URL；无 CDN 照片的物品会收到先运行 `pnpm upload-images` 的警告，其本地照片被复制到 `exports/facebook-marketplace-photos/` 供手动上传（v1.3.0 后增强）
- [x] 物品超过 50 条时自动拆分为编号文件（FB 单次上传上限）
- [x] 每次成功写入后将 `ExportRun` 追加至导出历史

#### 17c — 导出历史
- [x] `scripts/lib/exportHistory.ts` — `loadHistory()`、`allExportedSlugs()`、`lastRun()`、`appendRun()`、`formatRunDate()`
- [x] 历史记录保存于 `exports/.export-history.json`（已加入 gitignore）；`exports/.gitkeep` 追踪目录
- [x] 身份键：`{categorySlug}/{itemSlug}` — 重命名后仍保持稳定

#### 17d — 接入与文档
- [x] `package.json` 新增 `"fb-export"` 脚本；版本升至 `1.3.0`
- [x] `.gitignore` 更新：整体忽略 `exports/`；保留追踪 `exports/.gitkeep` 以确保目录存在
- [x] `.claude/CLAUDE.md` — 常用卖家任务表格新增 `pnpm fb-export` 行
- [x] `docs/CURRENT_FUNCTIONALITY.md` / `_zh` — 卖家 CLI 工具表格记录 fb-export 及导出历史
- [x] `docs/FEATURES_ROADMAP.md` / `_zh` — §3.4 补充导出历史说明
- [x] `README.md` / `README_zh.md` — 卖家工作流新增 fb-export
- [x] `SETUP_GUIDE.md` — 新增 §8「导出至 Facebook Marketplace」（面向卖家的白话说明）
- [x] `pnpm type-check`、`pnpm lint` 通过（CI 绿灯）

### 验收标准
- `pnpm fb-export` 在 TTY 下交互运行，引导完成所有步骤无报错
- 输出 CSV 列顺序符合 Facebook Marketplace 批量上传模板
- 物品超过 50 条时自动拆分为 `facebook-marketplace-1.csv`、`facebook-marketplace-2.csv`……
- 第二次运行显示步骤 0，含已导出物品数量；选择「跳过」后自动过滤
- 历史文件写入后若损坏，回退至 `{ runs: [] }` 而不崩溃

---

## Phase 18 — 卖家工作台（Seller Studio）✅

**目标：** `pnpm studio` 启动一个仅在本地运行的网页图形界面（不进入构建产物、从不部署），让卖家在浏览器中管理在售物品：照片上传/排序/CDN 推送、批量改状态、Schema 驱动的编辑表单、创建物品、一键发布——无需手动编辑 `item.json`。

**版本：** 未发布——v1.4.2 之后合并于 `develop`（尚无包含它的发布 tag）

### 任务

#### 18a — 物品表格与批量改状态（Part 1）
- [x] `studio/vite.config.ts` + `studio/index.html` + `studio/src/main.tsx` — Vite 开发应用；`studio/` 对 `next build` 不可达
- [x] `scripts/studio.ts` — `pnpm studio` 启动器：在同一个本地端口上同时提供前端和 API，仅绑定 127.0.0.1；`--port` 校验 1024–65535（默认 5174）；自动加载 `.env.local`；CDN 图片适配器按每次同步运行构建，缺少凭据时表现为同步错误而非启动失败；`studio/vite.config.ts` 缺失时给出清晰的「请运行 `pnpm update-site`」错误
- [x] `studio/src/App.tsx` + `studio/src/panes/{ItemList,Drawer,BulkToolbar}.tsx` — 物品表格、单物品抽屉、批量改状态（available / reserved / pending / sold / draft）
- [x] `studio/csrfGuard.ts` + `studio/vite.config.ts` 中的中间件接线 — API 的 CSRF 防护：所有非 GET/HEAD 方法要求 `Content-Type: application/json`（否则 415），存在 `Origin` 头时必须与服务器自身源一致（否则 403）；按方法失败关闭，未来新增的 PUT/PATCH/DELETE 路由自动受保护；单元测试见 `studio/csrfGuard.test.ts`
- [x] `GET /api/items` 返回每个物品及其图片文件；`reserved_for` 从不被读取、写入或发送到客户端

#### 18b — 照片与 CDN 同步（Part 2A）
- [x] `scripts/lib/studioImages.ts` — 列出物品的图片文件；提供图片文件；通过 API 上传、排序、删除
- [x] `scripts/lib/studioSync.ts` — 图片同步运行器，带同步互斥锁（一次只允许一次同步）和 SSE 进度流
- [x] `studio/src/panes/{ImagePane,SyncBar}.tsx` — 拖拽上传、拖动排序、带实时进度的 CDN 推送；变更失败后自动重新同步状态

#### 18c — 编辑表单、创建物品与发布（Part 2B）
- [x] `scripts/lib/itemEdit.ts` + `itemFields.ts` — `item.json` 编辑的严格字段语法；每次写入都对照 schema 校验；拒绝 `reserved_for`
- [x] `scripts/lib/studioApi.ts` — `GET`/`PATCH /api/items/:cat/:name`（仅写回修改过的字段）、`POST /api/items`（从模板创建）
- [x] `scripts/lib/studioGit.ts` — `publishChanges()`：提交前重新读取变更清单；图片同步进行中拒绝发布；只暂存可发布路径（`content/` + `lib/generated/image-manifest.json`，绝不 `git add -A`，以防 `.env.local` 被连带提交）
- [x] `studio/src/fields.ts` + `studio/src/api.ts` — 驱动编辑表单的声明式 `FIELD_GROUPS`（路径必须与 `scripts/lib/itemFields.ts` 权威一致）以及所有 `/api/*` 路由的 fetch 封装，含基于 fetch/ReadableStream 的 SSE `streamSync` 解析器（不使用 EventSource——需要 POST）
- [x] `studio/src/panes/{EditForm,NewItemDialog,PublishPane}.tsx` — 分组编辑表单、创建物品对话框、发布面板（未提交变更数量在页头最醒目）
- [x] 测试覆盖：`scripts/lib/studioApi.test.ts` / `studioImages.test.ts` / `studioSync.test.ts` / `studioGit.test.ts` / `itemEdit.test.ts` / `itemFields.test.ts`，外加 `scripts/studioFields.test.ts`（EditForm↔itemFields 漂移测试）和 `studio/csrfGuard.test.ts`（仅后端——无 React 测试）

#### 18d — 分发与文档
- [x] `scripts/update-site.ts` 的 `TEMPLATE_PATHS` 新增 `studio`，使 `pnpm update-site` 能将其分发给下游站点
- [x] `docs/UPDATE_GUIDE.md` / `_zh` — 两个语言版本的手动 `git checkout` 路径列表均新增 `studio`
- [x] `scripts/update-site.test.ts` — 漂移测试，保证 `TEMPLATE_PATHS` 与两份 UPDATE_GUIDE 路径列表保持同步
- [x] `docs/CURRENT_FUNCTIONALITY.md` / `_zh` — 两个语言版本均新增「卖家工作台」章节
- [x] `docs/FEATURES_ROADMAP.md` / `_zh` — 两个语言版本均将「卖家仪表板（仅本地 GUI）」标记为 ✅
- [x] `.claude/CLAUDE.md` — 常用卖家任务表格新增 `pnpm studio` 行

### 验收标准
- `pnpm studio` 在本地启动 GUI；四种操作（照片、批量改状态、编辑表单、发布）端到端可用
- 工作台只写入 `content/` 和 `lib/generated/image-manifest.json`；`reserved_for` 从不被读取或写入
- `pnpm build` 后，所有 studio 标记（Seller Studio、studio-api、`handleStudioRequest`、`StudioError`、carbon-pale、bulk-status、ImagePane、EditForm、PublishPane、stamp-press、fontsource、`publishChanges`）均不出现在 `out/` 中
- `pnpm update-site` 会复制 `studio/`；若 `TEMPLATE_PATHS` 与任一份 UPDATE_GUIDE 路径列表不一致，漂移测试即失败

---

## Phase 19 — Seller Studio 商品默认值 ✅

- [x] `scripts/lib/itemDefaults.ts`：两级稀疏 `_defaults.json`（全站 + 分类）的解析/校验/合并；
      拒绝 `reserved_for` 与逐 item 字段；在 `buildItemTemplate()` 之上合并，
      最后重新写入 `name`/`listed_date`/`status`
- [x] Studio API：`GET/PUT /api/defaults?scope=…`（保存为空即删除文件；PUT 自动创建缺失的分类目录）；
      `POST /api/items` 新增 `applyDefaults`（默认 true）
- [x] `pnpm create-item` 应用同一套合并
- [x] Studio 界面：Defaults 面板（作用域切换、逐字段启用开关、Price/Platform 置顶、全站继承提示）、
      从 EditForm 抽出 FieldInput、新建弹窗的"应用默认值"开关
- [x] 文档同步（DESIGN、CURRENT_FUNCTIONALITY、ARCHITECTURE、SCRIPTS、本计划），中英双语

---

## 风险登记册

| 风险 | 可能性 | 影响 | 缓解措施 |
|---|---|---|---|
| Aceternity 组件 API 在 CLI 安装和适配器代码之间发生变化 | 中 | 中 | 将 `@aceternity/*` 固定到安装版本；将 `components/ui/` 提交到 git 锁定版本 |
| Tailwind v4 与特定 Aceternity 组件不兼容 | 低 | 中 | Aceternity 组件通过 `npx shadcn@latest` 安装，针对当前 Tailwind 版本；`pnpm setup-ui` 后通过 `pnpm type-check` + `pnpm dev` 验证；若某组件渲染异常，在组件更新前对该槽位使用 `"simple"` 回退 |
| Vercel Blob 令牌在本地 `pnpm upload-images` 时不可用 | 低 | 低 | 本地上传使用 `.env.local`；已在 TECH_REQUIREMENTS.md §3 明确记录 |
| `pnpm setup-ui` 中途失败（网络错误） | 中 | 低 | 脚本幂等；从失败组件重新运行；部分安装不会破坏现有代码 |
| 地理定位 API 被浏览器设置或企业代理阻止 | 中 | 低 | 回退到最高档位已实现；买家随时可手动输入距离 |
| 部分 Aceternity 组件需要额外 peer 依赖（如 3D Globe 的 `three.js`） | 低 | 中 | 只安装所选 27 个组件实际需要的依赖；`setup-ui` 后验证 `pnpm type-check` |
| 物品照片超出 Vercel Blob 免费额度（500 MB） | 低（早期） | 中 | 在 Vercel Dashboard 跟踪 Blob 用量；升级套餐或迁移到 Cloudflare R2（配置切换仅一行） |
| Haversine 距离在非美国地区有偏差 | 低 | 低 | 公式为标准 WGS84；发布前用已知城市对做单元测试 |
| AI 在技能输出中误识别物品或幻觉品牌/型号 | 中 | 低 | 技能始终指示 AI 显示确认预览；`status: "draft"` 直到卖家确认；宁可留空字符串也不猜测 |
| 技能文件格式与特定 AI 工具不兼容 | 中 | 低 | 技能文件为纯 Markdown——普遍兼容；发布前在 Claude Code + 另一工具中测试 |
| 生成的 `content/config.ts` 有 TypeScript 错误 | 低 | 中 | 技能指示 AI 对照类型定义验证；卖家以 `pnpm type-check` 作为最终门控 |
| 卖家没有 AI 编码工具 | 低 | 低 | `pnpm create-item` 和 `pnpm create-template` 提供非 AI 回退；技能文件也可作为粘贴到 Claude.ai 的提示词 |

---

## 完成定义（每个 Phase）

一个 Phase **完成**当：
1. 所有复选框已勾选
2. `pnpm type-check` → 0 个错误
3. `pnpm lint` → 0 个警告
4. 该 Phase 的验收标准全部满足
5. 更改已以 Conventional Commit 消息提交到 git

项目**准备好 v1 发布**当：
1. 所有 16 个核心 Phase（0–15）完成（如果 AI 技能文件延迟，Phase 15 可在 Phase 0–14 之后稍晚发布）
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
| PricingSection 如何获得初始档位？ | DESIGN.md §10.3，TECH_REQUIREMENTS.md §21 |
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
