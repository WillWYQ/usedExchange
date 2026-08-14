# UsedExchange — 项目设计文档

**版本：** 0.10.0  
**日期：** 2026-08-02  
**状态：** 决策已解决——实现已上线（0–18 阶段全部交付）

---

## 1. 项目概述

UsedExchange 是一个静态生成的个人网络商店，用于列出待售的二手物品。内容完全通过本地文件系统管理——无数据库，无 CMS。卖家为每件物品添加一个文件夹，放入照片和 `item.json` 元数据文件，触发构建；站点自动重新生成。

UI 基于 [Aceternity UI](https://ui.aceternity.com)（React + Tailwind CSS）构建。架构模块化，任何部分——部署目标、图片策略、联系平台——都可以在不重构代码库的情况下替换。

### 目标用户

#### 主要用户——有 CS 背景的大学生
设计目标用户。熟悉 git、终端、JSON 编辑和 git push → GitHub Pages 部署工作流（也支持 Vercel）。他们接触到的这个项目是一个实用、值得写进作品集、自己真正能用的工具。

**画像：**
- 出售学生生活常见物品：教材、电子产品（GPU、键盘、显示器、机械设备）、宿舍家具、自行车、游戏设备、学术软件许可证
- 在紧凑的地理范围内运营（校园 + 周边街区，通常 0–10 英里）
- 联系偏好倾向于：**Discord**（CS 社区主导平台）、Instagram、WhatsApp、微信（国际学生）、Venmo/Zelle 支付
- 出售节奏由学期驱动——主要清仓发生在每学期末（五月和十二月）
- 同网络中的价格敏感买家；口耳相传和 Discord 服务器分享是主要发现渠道
- 已为课程使用 Vercel 或 GitHub；免费 Hobby 计划自然适合
- 习惯以 `pnpm upload-images` 和 `git push` 作为工作流

**这对设计意味着什么：**
- 基于 git 的工作流可以接受（不是障碍）
- 终端脚本（`pnpm mark-sold`、`pnpm create-item` 等）受欢迎
- Discord 必须是受支持的联系平台
- 默认距离档位应为短途（自提优先）
- `content/` 单文件夹规则保护非代码文件免遭意外破坏

#### 潜在用户——愿意尝试的非 CS 用户
项目获得知名度后可触达的更广泛受众（校园博客帖子、朋友推荐、CS 学生为父母或室友设置）。这些用户对代码或终端不熟悉。

**画像：**
- 任何想要个人、私密替代 Facebook Marketplace 或 OfferUp 的人
- 不熟悉：JSON 编辑、git 命令、终端、Vercel 仪表板
- 需要：由 CS 学生朋友一次性设置，之后只操作 `content/` 文件夹

**这对设计意味着什么：**
- `content/` 单文件夹规则是核心的易用性特性——他们接触的一切都在同一个地方，无需写代码
- CLI 工具（`pnpm mark-sold` 等）进一步降低门槛——常见操作无需编辑 JSON
- 仅本地的 **Seller Studio**（`pnpm studio`，见 §22）是这一群体的易用性突破口——同一 `content/` 文件夹之上的浏览器 GUI，无需编辑 JSON
- 文档和错误信息必须假设用户具备零终端知识

---

## 2. 目标与非目标

### 目标
- 零数据库，文件系统驱动的内容管理
- 构建时静态生成；输出可托管在 GitHub Pages、Vercel 或任何静态主机上
- 模块化部署适配器：默认针对 GitHub Pages 优化，通过配置开关支持 Vercel 和自托管
- 优雅的 Schema 降级：缺少可选 JSON 字段不会使构建或页面崩溃
- 每件物品的距离分段定价，支持自动访客位置检测（浏览器 Geolocation API，仅客户端）
- 每件物品的照片图库，从物品文件夹获取
- 丰富的、注重隐私的联系区块，含社交平台链接和二维码支持
- 简洁、可扩展的代码库，设计用于二次开发
- 4 个独立槽位（背景、物品网格布局、照片图库、物品卡片效果）可配置 Aceternity UI 视觉组件——每个槽位通过单行配置可切换

### v1 非目标
- 不重建的实时库存更新
- 面向买家的结账或支付处理（Stripe 支付*链接*作为外部链接支持，非应用内结账）
- 用户认证或买家账户（卖家端管理由仅本地的 Seller Studio 提供——见 §22；它是单用户本地工具，而非托管的多用户仪表板）
- 服务器端地理定位或 IP 查找——访客距离完全在浏览器中计算；坐标不离开设备
- 多卖家或并发写入支持——这是**单卖家设计**。清单与配置文件由一个人维护。在两台机器上并发运行 `pnpm upload-images` 属于未定义行为；最后写入者生效。

---

## 3. 技术栈

| 层次 | 选择 | 原因 |
|---|---|---|
| 框架 | **Next.js 15（App Router）** | 通过 `generateStaticParams` 在构建时读取文件系统；两种输出模式 |
| 语言 | **TypeScript 5** | 类型安全的 Schema 解析；编译时缺少字段检测 |
| UI 库 | **Aceternity UI** | 预构建动画组件；基于 Tailwind |
| 样式 | **Tailwind CSS v4** | Aceternity 需要；实用优先 |
| Schema 验证 | **Zod 3** | 带默认值的 `.safeParse()`；不会对错误输入抛出 |
| Markdown | **react-markdown + remark-gfm** | 渲染 `description` 字段 |
| 包管理器 | **pnpm** | 快速安装，磁盘高效 |
| 代码检查 | **ESLint + Prettier** | 一致的代码风格 |
| 主要部署 | **GitHub Pages** | 通过 GitHub Actions 静态导出；免费，无供应商锁定 |
| 备用部署 | **Vercel Hobby** 或任何静态服务器 | Vercel 模式还支持 `next/image` 优化 |

### 部署模式

应用支持两种模式，通过 `content/config.ts` 中单个配置值切换：

| 模式 | `deploymentMode` | Next.js 配置 | 图片策略 |
|---|---|---|---|
| 静态 / GitHub Pages **（默认）** | `"static"` | `output: 'export'` | 通过 `AdaptiveImage` 使用普通 `<img>`——图片直接从 CDN 提供 |
| Vercel | `"vercel"` | 默认（允许服务器函数） | 带 Vercel 优化的 `next/image` |

`<AdaptiveImage>` 组件根据 `deploymentMode` 内部切换——切换模式时无需更改调用点。

### 图片存储架构

#### 问题

图片不应存放在 git 仓库或部署输出中。随着收藏增长，提交照片会使每次 `git push` 变慢。将其包含在构建输出中会使部署膨胀：100 件物品 × 5 张照片 × 2 MB = 1 GB——远超任何平台的舒适处理范围（GitHub Pages 推荐仓库 < 1 GB；Vercel Hobby 强制 100 MB 构建输出限制）。实际站点的 HTML/CSS/JS 本身非常小。

简单的解决方案（构建时把图片复制到 `public/`）在任何平台上都会因规模而失效。对卖家不友好的解决方案（手动把图片上传到存储控制台）违背了文件系统优先的设计。正确的解决方案是一个在构建期间透明运行的**自动图片存储适配器**。

#### 设计原则

**物品照片是仅本地源文件——不提交到 git。**

提交照片会：(a) 随着照片收藏增长使每次 `git push` 变慢；(b) 仍无法解决 100 MB 部署限制——照片最终同样会在仓库中超限。因此：

- **JSON 元数据文件**保留在 git 中——它们是微小的文本文件，即库存目录
- **照片**保留在卖家机器上，通过一条命令直接上传到云存储
- **图片清单**（`lib/generated/image-manifest.json`）被提交——它将每张照片映射到其 CDN URL。这是 CI 构建（GitHub Actions 或 Vercel）唯一需要的产物
- **二维码图片**位于 `content/contact/`（git 追踪，微小 < 50 KB）。同步脚本将其复制到 `public/contact/`

**所有卖家管理的文件都在一个文件夹中：`content/`。** 对于常规上架更新、配置更改或添加新分类，无需接触应用代码。

#### 卖家工作流

```
添加新物品：
  1. 创建 content/items/category/my-item/ 含 item.json + 照片
  2. pnpm upload-images              上传照片 → CDN，更新清单
  3. git add content/items/<category>/my-item/item.json lib/generated/image-manifest.json
  4. git push                        GitHub Actions 构建并部署；图片已在 CDN 上

更新照片：
  1. 在 content/items/category/my-item/ 中替换/添加照片
  2. pnpm upload-images              检测校验和变化，只重新上传已更改文件
  3. git add lib/generated/image-manifest.json && git push

仅代码更改（无照片编辑）：
  1. 编辑 content/items/**/item.json 或 content/config.ts
  2. git add ... && git push         CI 构建；清单不变，无需上传
```

#### 图片存储层次

| `imageStorage.provider` | 最适合 | 部署大小 | 卖家工作量 |
|---|---|---|---|
| `"cloudflare-r2"` *（推荐）* | GitHub Pages，任意静态主机——零出站费用 | 图片排除——从 R2 CDN 提供 | 5 个环境变量，一次性 |
| `"vercel-blob"` | Vercel 部署 | 图片排除——从 Blob CDN 提供 | 1 个环境变量，一次性 |
| `"local"` | 本地开发/自托管（无大小顾虑） | 图片包含在输出中 | 无 |

#### 工作原理

```
本地机器 — pnpm upload-images
  │
  ├── 扫描 content/items/** 中的图片文件（gitignore；仅存在于卖家机器）
  ├── 加载 .image-cache/checksums.json
  │
  ├── [provider: "vercel-blob"]  SHA-256 比对 → 跳过未变更 → 经 @vercel/blob 上传 → 记录 CDN URL
  ├── [provider: "cloudflare-r2"] SHA-256 比对 → 跳过未变更 → 经 @aws-sdk/client-s3 上传 → 记录 CDN URL
  │
  ├── 复制 content/contact/** → public/contact/（二维码图片；小，始终本地）
  ├── 清除 content/items/ 中已不存在的图片对应的过期清单条目
  │     （处理已删除的物品文件夹——CDN blob 不删除，只删除 URL 引用）
  ├── 写入 lib/generated/image-manifest.json  ← 提交到 git
  │     { "houseware/ikea-desk-lamp/cover.jpg": "https://cdn.example/cover.jpg", … }
  ├── 写入 .image-cache/checksums.json        ← gitignore（本地加速缓存）
  │
  └── ⚠️  打印备份提醒（确切输出见 TECH_REQUIREMENTS.md §7）

CI 构建（GitHub Actions / Vercel）— pnpm build（无照片；读取已提交清单）
  │
  ├── prebuild: scripts/sync-images.ts
  │     ├── content/items/ 中无图片（gitignore——不在 CI runner 上）
  │     ├── 清单已提交 → 读取现有清单，不上传
  │     ├── content/contact/** 存在（git 追踪）→ 复制到 public/contact/
  │     └── 日志："manifest present (N entries) — skipping upload"
  │
  └── next build
        loader.ts 读取清单 → 所有图片 URL 解析到 CDN
        所有页面以正确的 CDN 图片 URL 静态生成

本地开发 — pnpm dev
  │
  ├── sync-images.ts（始终以 "local" 模式运行，与 provider 配置无关）
  │     content/items/ 照片 → 复制到 public/items/
  │     content/contact/    → 复制到 public/contact/
  │
  └── next dev — 图片从 public/items/ 和 public/contact/ 提供
```

#### 图片 URL 解析（位于 `lib/content/loader.ts`）

```
对于 content/items/ 文件夹中找到的每个图片文件名：
  key = "{categorySlug}/{itemSlug}/{filename}"
  url = manifest[key]       // CDN URL（来自已提交清单）
      ?? "/items/{key}"     // 本地回退，用于开发 / "local" provider
```

在 CI runner（GitHub Actions 或 Vercel）上，`manifest[key]` 总是有值（清单已提交）。回退路径仅在本地开发、且该图片尚未运行 `pnpm upload-images` 时使用。

#### 增量上传

`.image-cache/checksums.json` 为每张曾上传的图片存储 `{ relativePath: sha256 }`。下次 `pnpm upload-images` 时，仅重新上传变更或新增的文件。该缓存仅存在于卖家机器上（gitignore），可随时删除——删除后下次运行会重新上传全部图片。

#### 隐私：上传时自动剥离 EXIF/GPS 元数据

手机相机会在 JPEG/PNG/WebP 文件中嵌入 EXIF 元数据——包括拍摄地点的 GPS 坐标。`pnpm upload-images` 在上传任何新增或变更的图片前，会通过 `sharp`（`lib/images/stripMetadata.ts`）对其重新编码：

- 应用 EXIF 方向标签（确保图片显示方向不变），然后丢弃该标签。
- 剥离其余所有 EXIF/IPTC/XMP 元数据，包括 GPS 经纬度。
- GIF 原样透传——GIF 本身没有 EXIF 段，且重新编码动图会导致其坍缩为单帧。

此处理仅在 `pnpm upload-images`（图片真正离开卖家设备的环节）发生。`content/items/` 中的本地文件以及 `pnpm dev` 使用的 `public/items/` 副本不受影响。每次运行后的汇总行会报告剥离的图片数量，例如 `🔒 stripped EXIF/GPS metadata from 3/3 uploaded image(s)`。

#### 备份策略

> ⚠️ **卖家有责任备份其 `content/` 文件夹（尤其是照片）。**
>
> 照片**不在 git 中**（gitignore），云存储（Blob/R2）是**分发层，而非备份**。云存储可能被意外清空。脚本每次上传后都会打印提醒——确切输出见 **TECH_REQUIREMENTS.md §7**。该节是提醒文本的唯一权威来源。

#### 哪些保留在 Git 中

| 内容 | 是否 git 追踪？ | 原因 |
|---|---|---|
| `content/**/*.json` | **是** | 库存元数据与配置；微小文本文件 |
| `content/config.ts` | **是** | 站点配置 |
| `content/contact/*.png` | **是** | 二维码图片；微小，很少变更 |
| `content/items/**/*.jpg/png/…` | **否** —— 仅本地 | 体积大；推送慢；单独上传到 CDN |
| `lib/generated/image-manifest.json` | **是** | CDN URL 映射；Vercel/CI 构建需要它 |
| `.image-cache/checksums.json` | **否** —— 仅本地 | 增量上传加速缓存 |
| `public/items/` | **否** —— 生成物 | 仅由本地开发同步填充 |
| `public/contact/` | **否** —— 生成物 | 由同步脚本从 `content/contact/` 复制 |

---

## 4. 文件系统内容模型

> **规则：卖家曾接触的所有内容都在 `content/` 内。日常操作无需打开项目中的任何其他内容。**

```
content/                            ← ★ 卖家唯一需要接触的文件夹
│
├── config.ts                       ← ✓ git 追踪  站点名称、URL、联系方式、定价默认值
│
├── items/                          ← ✓ JSON git 追踪  ✗ 照片 gitignore（本地 + CDN）
│   │
│   ├── houseware/                  ← 分类文件夹（卖家创建，任意名称）
│   │   ├── _category.json          ← ✓ 可选分类显示名称、图标、排序顺序
│   │   ├── ikea-desk-lamp/         ← 单个物品文件夹（任意名称 → 成为 URL slug）
│   │   │   ├── item.json           ← ✓ 必填——物品名称、价格、描述、状态…
│   │   │   ├── cover.jpg           ← ✗ gitignore——固定缩略图（可选约定）
│   │   │   └── photo1.jpg          ← ✗ gitignore——附加图库图片
│   │   └── cast-iron-pan/
│   │       ├── item.json           ← ✓ git 追踪
│   │       └── pan.jpg             ← ✗ gitignore
│   │
│   └── electronics/
│       ├── _category.json          ← ✓ git 追踪
│       └── iphone-14-pro/
│           ├── item.json           ← ✓ git 追踪
│           ├── front.jpg           ← ✗ gitignore
│           └── back.jpg            ← ✗ gitignore
│
└── contact/                        ← ✓ git 追踪  二维码图片（微小，< 50 KB 每张）
    └── wechat-qr.png               ← 已提交；同步脚本复制 → public/contact/
```

### 文件夹与文件规则

| 规则 | 详情 |
|---|---|
| 内容根目录 | `content/` ——卖家唯一需要了解的目录 |
| 配置文件 | `content/config.ts` ——站点级设置 |
| 分类 slug | `content/items/` 下的分类文件夹名称；自动首字母大写，连字符 → 空格 |
| 物品 slug | 物品文件夹名称；成为 URL 路径段 |
| 图库图片 | 物品文件夹中所有 `.jpg .jpeg .png .webp .gif`——gitignore；本地 + CDN |
| 缩略图 | 命名为 `cover.*` 的文件固定为缩略图；否则加载器排序剩余文件名（`filenames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))`）并使用第一个结果 |
| 其他文件 | 静默忽略（不崩溃）。加载器只读取字面命名为 `item.json` 的文件——物品文件夹中的所有其他 `.json` 文件被忽略 |
| 保留前缀 | 以 `_` 开头的文件夹/文件是元数据——绝不作为物品/分类处理 |
| 二维码图片 | 放在 `content/contact/`；git 追踪；同步脚本复制到 `public/contact/` |

---

## 5. JSON Schema — `item.json`

只有 `name` 是必填的。其他所有字段都是可选的；缺失时构建应用安全默认值。

Schema（`lib/content/schema.ts`）定义了 **36 个顶层字段**；若计入私有的 `reserved_for` 备注（下文有说明，但被 Zod schema 有意剥离、绝不渲染），则共 **37 个顶层条目**。

`item.json` 是 **JSONC**（允许 `//` 注释和尾随逗号，通过 `jsonc-parser` 解析）——
严格来说是 JSON 的超集，所以现有的纯 JSON `item.json` 文件无需修改即可继续使用。
`pnpm create-item` / `pnpm create-template` 会在每个有固定取值范围的字段
（`condition`、`status`、`dimensions.unit`、`weight.unit`）旁写入
`// options: ...` 注释，方便你无需查阅本文档即可看到所有可选值。
`pnpm mark-sold` 只会原地修改 `status`/`sold_date` 这两个值，因此这些注释会保留下来。

```jsonc
{
  // ── 身份 ──────────────────────────────────────────────────────────────────
  "name": "IKEA TRÅDFRI 台灯",          // 字符串，必填

  // ── 定价 ──────────────────────────────────────────────────────────────────
  "price": {
    "currency": "USD",
    // ^ ISO 4217。优先级：物品级 price.currency 覆盖 siteConfig.currency。
    //   缺失时回退到 siteConfig.currency（默认 "USD"）。
    "tiers": [
      // 每个档位至少需要 label 和 amount。
      // miles_min / miles_max 均为可选（开放式档位 = 完全省略 miles_max 字段）。
      // "开放式"指 miles_max JSON 字段缺失（而不是一个很大的数字）。
      // ⚠️  档位边界必须连续。5.5 英里的访客会落在 max=5 与 min=6 之间的
      //     间隙里。解析器会回退到"miles_max 最接近的档位"。
      //     卖家应使用包含/重叠的边界以避免间隙。
      { "label": "自提 / ≤ 5 英里", "miles_max": 5,   "amount": 15 },
      { "label": "6 – 15 英里",     "miles_min": 5,   "miles_max": 15, "amount": 20 },
      { "label": "16 – 30 英里",    "miles_min": 15,  "miles_max": 30, "amount": 25 },
      { "label": "邮寄",            "miles_min": 30,  "amount": 35 }
    ],
    "negotiable": true,   // 布尔值，默认 false；价格后渲染"可议"
    "show_tiers": false,  // 布尔值，默认 false；买家是否可在物品详情页展开
                          //   "查看所有价格档位"。默认关闭——卖家可能不希望
                          //   买家看到例如自提比邮寄便宜多少。
    "shipping_payer": "buyer"  // "seller" | "buyer"，可选；覆盖
                          //   siteConfig.shipping.defaultPayer。
                          //   仅在 siteConfig.shipping.enabled 为 true 时有意义。见 §21。
  },

  // ── 物品详情 ──────────────────────────────────────────────────────────────
  "description": "功能完好。两年前购入。",
  // ^ 字符串；支持 GitHub 风格 Markdown；默认 ""

  "condition": "good",
  // ^ 枚举："new" | "like-new" | "good" | "fair" | "for-parts"；默认 "good"

  "brand": "IKEA",                            // 字符串；默认 ""
  "model": "TRÅDFRI E14",                     // 字符串；默认 ""
  "age_years": 2,                             // 数字，约数；默认 null
  "dimensions": { "length": 45, "width": 15, "height": 15, "unit": "cm" },  // "cm" | "in"；默认取自 siteConfig.measurementUnit
  "weight": { "value": 0.8, "unit": "kg" },  // "kg" | "lb"；默认取自 siteConfig.measurementUnit
  // ^ dimensions/weight 按卖家填写时的单位存储。在物品详情页，
  //   lib/utils/units.ts 会将其换算为当前访客语区解析出的单位制
  //   （见 §13 measurementUnit / localeMeasurementUnits）——无需让所有
  //   物品使用统一单位。
  "color": "白色",                            // 字符串；默认 ""
  "quantity": 1,                              // 整数 ≥ 1；默认 1

  // ── 来源 ──────────────────────────────────────────────────────────────────
  "original_source": "IKEA",                  // 字符串；例如 "Amazon"、"Costco"
  "original_link": "https://www.ikea.com/…",  // URL 字符串
  "original_price": 29.99,                    // 数字；默认 null

  // ── 上架生命周期 ──────────────────────────────────────────────────────────
  "status": "available",
  // ^ 枚举："available" | "pending" | "reserved" | "sold" | "draft"
  //   默认 "available"

  "listed_date": "2026-05-25",               // 仅日期 YYYY-MM-DD；默认：构建日期
  "sold_date": "2026-05-28",                 // 仅日期 YYYY-MM-DD；用于保留期计算
  // ^ 若 status 为 "sold" 且 sold_date 缺失，则以 listed_date 作为回退
  // ^ pnpm mark-sold 写入 YYYY-MM-DD。完整 ISO 时间戳也可接受并正确解析。

  "reserved_for": "",
  // ^ 字符串；买家姓名/联系方式——不在页面上渲染，在 json 中保持私密

  // ── 联系偏好（物品级覆盖；站点配置是默认值）──────────────────────────────
  "preferred_payment": ["Venmo", "Cash"],     // 字符串数组；默认 []
  "contact_note": "",                         // 字符串；显示在物品页联系链接下方

  // ── 分类 ──────────────────────────────────────────────────────────────────
  "tags": ["照明", "智能家居"],
  // ^ string[]；默认 []。标签会被全文搜索引擎（fuse.js）索引，
  //   买家可按标签找到物品。物品详情页上的标签片在 v1 中是不可交互的
  //   <span> 元素（专门的标签筛选页是未来特性）。
  "category_override": "",
  // ^ 仅显示覆盖。若非空，在面包屑与物品卡片的分类标签中替换
  //   由文件夹派生的分类名称——但不改变：
  //   - URL（仍由文件夹 slug 派生）
  //   - 物品出现在哪个分类页（始终是其物理文件夹的页面）
  //   - 首页分类卡片（物品始终计入其物理文件夹）
  //   面包屑 href 始终指向物理分类 URL（例如 /misc）。
  //   用例：不移动文件的情况下重命名显示标签。

  // ── SEO ───────────────────────────────────────────────────────────────────
  "meta_description": "",
  // ^ 为空时自动取 description 的前 160 个字符生成

  // ── 定价信号 ──────────────────────────────────────────────────────────────
  "no_lowball": false,
  // ^ 显示"价格不议"徽章；补充 price.negotiable: false
  "price_reduced": false,
  // ^ 在物品卡片与详情页显示"已降价"标签
  "previous_lowest_price": null,
  // ^ 数字；若 price_reduced 为 true 且此字段已设置，以删除线显示在当前价格旁
  "min_acceptable_offer": null,
  // ^ 数字；若已设置且 price.negotiable 为 true，启用"出个价"按钮。
  //   低于此阈值的出价会在客户端显示委婉的拒绝消息。

  // ── 付款链接 ──────────────────────────────────────────────────────────────
  "stripe_payment_link": "",
  // ^ Stripe Payment Link URL；在物品详情页显示"支付定金"按钮
  "venmo_payment_request": "",
  // ^ 可选：针对特定金额的 Venmo 付款请求 URL。非空时在物品详情页渲染
  //   "通过 Venmo 支付"按钮（与 Stripe "支付定金"按钮并列）。
  //   格式：https://venmo.com/?txn=pay&recipients={username}&amount={price}&note={item.name}
  //   为空时不显示按钮；Venmo 联系平台链接（主页）仍然可用。

  // ── 物流 ──────────────────────────────────────────────────────────────────
  "pickup_windows": [],
  // ^ string[]；例如 ["Weekday evenings 6–9pm", "Saturday 10am–2pm"]
  "youtube_link": "",
  // ^ 演示视频 URL；在物品详情页显示为"观看演示"按钮

  // ── 教材专属（全部可选，非教材物品会优雅忽略）────────────────────────────
  "isbn": "",
  // ^ ISBN-10 或 ISBN-13；通过 bookfinder.com 启用"比价"链接
  "course": "",
  // ^ 例如 "CS101"、"MATH230"——显示为徽章，可通过全文搜索找到
  "edition": "",
  // ^ 例如 "3rd Edition"
  "semester_listed": "",
  // ^ 例如 "Spring 2026"——帮助买家确认教材是否为当前版本

  // ── 国际化 ────────────────────────────────────────────────────────────────
  "name_zh": "",
  // ^ 中文显示名称；活跃语区为 "zh" 时显示（运行时通过 LocaleSwitcher 选择；SSG 渲染 siteConfig.i18n.defaultLocale）。见 TECH §22.8。
  "description_zh": ""
  // ^ 中文描述；条件相同。
  // 模式：name_{locale} / description_{locale}。v1 在 Zod schema（TECH §6）与
  // Item 类型（TECH §8）中具体携带 _zh 变体。添加另一语区（如 "es"）意味着
  // 也要在那里添加其 name_{locale}/description_{locale} 字段；否则
  // getLocalizedField 回退到英文。见 TECH §22.8。
}
```

### 字段默认值汇总

| 字段 | 默认值 |
|---|---|
| `price.currency` | `"USD"` |
| `price.tiers` | `[]` → 显示"联系询价" |
| `price.negotiable` | `false` |
| `price.show_tiers` | `false` → 对买家隐藏"查看所有价格档位"切换 |
| `price.shipping_payer` | 缺失时回退到 `siteConfig.shipping.defaultPayer`（见 §21） |
| `condition` | `"good"` |
| `quantity` | `1` |
| `status` | `"available"` |
| `listed_date` | 构建日期（ISO 字符串） |
| `sold_date` | 缺失且状态为 `"sold"` 时回退到 `listed_date` |
| `tags` | `[]` |
| 所有其他字符串 | `""` |
| 所有其他数字 | `null`（为 null 时不渲染） |

---

## 6. 可选分类元数据 — `_category.json`

```jsonc
{
  "display_name": "家居与厨房",
  "description": "锅碗瓢盆、台灯及其他家居用品。",
  "icon": "🏠",
  "sort_order": 1  // 整数；值越小越靠前
}
```

### 分类排序逻辑

1. 定义了 `sort_order` 的分类 → 按 `sort_order` 升序排序
2. 平局处理：两个分类共享同一 `sort_order` → 在该组内按文件夹名称字母顺序排序
3. 没有 `sort_order` 的分类 → 按文件夹名称字母顺序排序，附加在已排序组之后
4. 没有分类定义 `sort_order` → 所有分类按字母顺序排序（纯默认）

---

## 7. 联系平台配置

在 `content/config.ts` 中配置。支持两种平台类型：

**链接式平台** — 渲染为图标 + 标签按钮，点击后显示 URL。

**二维码式平台**（如微信）— 渲染为图标 + 标签按钮，点击后打开显示二维码图片的弹窗。

```ts
contact: {
  reveal_behavior: "click",  // "click" | "always"
  platforms: [
    { type: "email",     value: "you@example.com" },
    { type: "discord",   value: "123456789012345678" },
    { type: "facebook",  value: "your.username" },
    // ^ 也可以直接粘贴完整主页链接（例如没有自定义用户名时的
    //   "https://www.facebook.com/profile.php?id=..."）——两种写法效果相同。
    { type: "instagram", value: "your_handle" },
    { type: "snapchat",  value: "your_username" },
    { type: "whatsapp",  value: "+11234567890" },   // E.164 格式
    { type: "twitter",   value: "your_handle" },
    { type: "tiktok",    value: "@your_handle" },
    { type: "linkedin",  value: "in/your-name" },
    // ^ 个人主页用 "in/<id>"，公司主页用 "company/<id>"。
    //   只填 "your-name" 也可以，会自动当作 "in/your-name"；
    //   粘贴完整链接（如 "https://www.linkedin.com/in/your-name"）也可以。
    { type: "youtube",   value: "@your_channel" },
    { type: "venmo",     value: "your_username" },
    { type: "zelle",     qr_image: "/contact/zelle-qr.png", label: "Zelle" },
    { type: "wechat",    qr_image: "/contact/wechat-qr.png", label: "WeChat" },
    { type: "line",      qr_image: "/contact/line-qr.png",   label: "LINE" },
  ],
}
```

### 各平台 URL 构建

| `type` | URL 模式 |
|---|---|
| `email` | `mailto:{value}` |
| `discord` | `https://discord.com/users/{value}` — 在浏览器或 Discord 应用中打开私信 |
| `facebook` | `https://facebook.com/{value}` — 若粘贴完整主页链接，会自动归一化为其路径（如 `profile.php?id=...`），不会被重复编码 |
| `instagram` | `https://instagram.com/{value}` |
| `snapchat` | `https://snapchat.com/add/{value}` |
| `whatsapp` | `https://wa.me/{value}`（去掉开头的 `+`） |
| `twitter` | `https://x.com/{value}` |
| `tiktok` | `https://tiktok.com/{value}` |
| `linkedin` | `https://linkedin.com/{value}` — 会保留 `/` 分隔符（不做 `%` 编码）；只填用户名时自动视为 `in/{value}` |
| `youtube` | `https://youtube.com/{value}` |
| `venmo`（链接） | `https://venmo.com/u/{value}` |
| `venmo`（二维码） | 打开含 `<img src={qr_image}>` 的弹窗 |
| `zelle` | 仅二维码弹窗——无公开主页 URL；需要 `qr_image` |
| `wechat` / `line` / 任何二维码类型 | 打开含 `<img src={qr_image}>` 的弹窗 |

### 预填联系消息
访客点击链接式联系按钮时，消息自动预填物品名称和**地理解析价格**（与屏幕上显示的同一档位），减少买家的摩擦。若未解析出档位（`price.tiers` 为空），则只包含物品名称。

| 平台 | 预填方式 |
|---|---|
| `whatsapp` | URL 查询参数：`?text=Hi, I'm interested in your {name} ({price}). Is it still available?` —— `{price}` 为地理解析的档位金额（如 `$35`）；未定义档位时省略 |
| `email` | `?subject=Inquiry: {name}&body=Hi, I'm interested in your {name} listed at {price}...` —— `{price}` 同上；未定义档位时省略 |
| `discord` | 不支持（Discord 深链接不接受预填文本） |
| `venmo`（链接） | 在主页 URL 后追加 `?txn=pay&audience=private&note={name}` |
| 其他所有平台 | 不预填（平台不支持深链接预填） |

预填在 `PlatformButton` 调用点应用（当提供了 `item` 和 `resolvedPrice` 时）。物品详情页的 `ContactSection` 总是同时传入两者——它独立调用 `useGeolocation()` + `useDistancePricing()` 解析价格（浏览器通过 `maximumAge: 300_000` 立即返回缓存位置，因此不会有第二次权限弹窗）。Footer 的 `ContactSection` 不接收物品上下文，从不预填。

---

## 8. 已售物品保留

```ts
// content/config.ts
soldItemRetentionDays: 3,   // 默认；设为 0 永久保留，-1 立即隐藏
```

在构建时，加载器应用：

```
visible = (status !== "sold")
       OR (soldItemRetentionDays === 0)            // 0 = 永久保留；特殊情况
       OR (effective_sold_date === null)           // 无可解析日期 → 始终保留（见注释）
       OR (today − effective_sold_date ≤ soldItemRetentionDays)

其中 effective_sold_date：
  = sold_date    若存在且为有效的 ISO 8601
  = listed_date  若 sold_date 缺失或解析失败
  = null         若 listed_date 也缺失或解析失败
  // 注：TECH_REQUIREMENTS.md §6.3 规定无效日期 → null。
  //     上面的显式 null 检查会在算术运算之前短路为"保留"，
  //     因为在 JavaScript 中 (today − null) 的求值结果是 NaN，
  //     而 NaN ≤ 任何数恒为 false——若没有这道防护，null 日期
  //     会错误地隐藏物品而不是保留。
  //     卖家若未填 sold_date 就标记售出，物品将持续可见，
  //     直到手动删除或补上明确的 sold_date。
```

`soldItemRetentionDays: -1` 使 `today − date ≤ -1` 恒为 false → 立即隐藏。
`soldItemRetentionDays: 0` 是特殊情况：`=== 0` 使公式短路 → 永久保留。

过了保留期的物品完全从所有页面和 `generateStaticParams` 中排除——其详情页不再生成。

---

## 9. URL 结构

```
/                              首页——分类概览 + 最近上架
/all                           浏览全部——所有非草稿物品，跨分类（已售可切换），含筛选 + 排序
/sold                          已售档案——不受保留窗口限制；网格受 soldArchiveDisplayLimit 上限约束
/about                         关于——ProjectIntro 概览（见 §10.6）
/newly-listed                  最近上架——按上次访问分组（见 §10.7）
/[category]                    分类页——含筛选、排序、搜索的物品网格
/[category]/[item]             物品详情——图库、定价、元数据、联系方式、分享
```

所有路由在构建时静态生成。`/sold` 网格最多渲染 `siteConfig.soldArchiveDisplayLimit` 件最近的已售物品（`0` = 不设上限）；更早的物品仍保留在 `content/` 中并计入头部总数，但不渲染。此上限与 `soldItemRetentionDays` 是不同的设置（见 §8 和 §15）。

`app/not-found.tsx` 渲染 404 页面，包含站点头部、"页面未找到"消息以及返回首页的链接。当用户访问构建时未生成的任何 URL（例如已删除物品的原 URL）时显示该页面。

---

## 10. 页面规范

### 全局 — SiteHeader
站点头部出现在所有页面上，包含：站点名称/Logo、**搜索栏**（`siteConfig.search.enabled === true` 时显示）、导航链接

### 10.1 首页（`/`）
- **Hero** — 站点名称、标语、CTA 按钮（可在 `content/config.ts` 中配置）
- **分类网格** — 每个可见分类一张卡片（可见 = 至少有一件 `available`/`reserved`/`pending` 物品）。每张卡片：图标、显示名称、仅 `available` 物品的数量、第一件 `available` 物品的封面图。
- **最近上架** — 最近 N 件 `available` 物品，按 `listed_date` 降序（默认 6 件）。没有物品时 → 区块隐藏。每张卡片显示定位解析价格。不显示 `LocationPriceBar`——价格静默更新。包装在 `RecentlyListedSection` 客户端组件中。
- **最近浏览** — 访客在此浏览器会话中浏览过的最近 5 件物品的横向条（存储在 `sessionStorage`）；为空时隐藏。客户端组件，零服务器端改动。
- **Footer** — 联系平台链接、最后构建时间戳、站点名称
- **OG 元数据** — `og:title` = 站点名称；`og:image` = 最近一件 `available` 物品的封面图（回退到 Logo）

### 10.2 分类页（`/[category]`）
- 分类标题、图标、描述
- **定位价格栏** — `📍 ~{N} 英里` 或 `📍 位置不可用` + "修改距离"覆盖；由 `ItemGrid` 持有
- **筛选 + 排序栏**（客户端）：
  - **成色标签** — 多选，默认全选
  - **排序选择** — 价格从低到高 · 价格从高到低 · 上架日期（最新优先）· 成色（最佳优先）；默认 = 上架日期
  - **价格范围滑块** — 基于定位解析价格；无物品含档位时隐藏；距离变化时重置。其离群值处理由 `ui.priceFilterStrategy` 决定（见 §13），可选 `lib/utils/priceFilterStrategies.ts` 实现的五种策略：
    - `"none"` *（默认）* — 解析价格的原始最小/最大值
    - `"percentile"` — 滑块裁剪至 P5–P95 区间，忽略极端离群值
    - `"logarithmic"` — 非线性滑块刻度，适合价格跨度大的场景
    - `"preset-buckets"` — 快速点选价格区间按钮；分界点来自 `ui.priceFilterBuckets`（如 `[50, 100, 300]` → "< $50"、"$50–$100"、"$100–$300"、"$300+"）。"全部价格"按钮文案为 `t.filterPriceBucketAll`。
    - `"iqr"` — 通过四分位距裁剪滑块
    当策略隐藏了范围外物品时，栏内显示 `t.filterPriceIncludesOutliers`（"+ 范围外商品"）提示。
  - **状态切换** — 已售物品默认隐藏
- **"浏览全部"链接** — 指向 `/all` 页面的突出链接
- **物品网格** — 含定位解析价格的卡片，排序与筛选在客户端应用
- **OG 元数据** — `og:title` = 分类显示名称；`og:image` = 第一件 `available` 物品的封面
- **空分类** — 若分类中所有物品都是 `draft` 或已超过保留期的 `sold`，路由仍会生成（`loadCategories()` 返回所有分类文件夹，与物品可见性无关）。页面渲染空的物品网格，并显示"该分类暂无可购买物品"消息。首页分类卡片仅在不存在任何非 `draft` 状态物品时隐藏（见 §15 首页规则）；分类路由本身始终存在。

### 10.3 物品详情页（`/[category]/[item]`）
- **面包屑** — 首页 → 分类 → 物品名称
- **照片图库**（由 `ui.gallery` 槽位控制）
- **新鲜度标签** — "3 天前上架" / "今天上架"，从 `listed_date` 推算
- **状态 + 成色徽章** — `ConditionBadge` 有 `?` 工具提示（`ConditionGuide`）解释每个成色值
- **数量徽章** — `quantity > 1` 时显示"3 件在售"
- **价格信号** — `price_reduced: true` 时的"已降价"标签；`no_lowball: true` 时的"价格不议"徽章
- **名称 + 描述** — 由 `LocalizedItemContent`（客户端）渲染：本地化 `<h1>` 名称和 GitHub Flavored Markdown 描述，访客通过头部 `LocaleSwitcher` 切换语区时重新渲染
- **教材区块**（仅当存在 `isbn` 或 `course` 时）：课程徽章、"比价"链接（`bookfinder.com`）、`semester_listed`
- **YouTube 演示** — 存在 `youtube_link` 时显示"观看演示"按钮
- **取货时段** — `pickup_windows` 非空时显示为列表
- **定价区块**（`PricingSection` 客户端组件）：
  - `LocationPriceBar`（距离指示器 + 覆盖）
  - `PricingTable`（默认显示解析档位；"查看全部"切换展开完整列表）
  - **"出个价"按钮** — 当 `price.negotiable: true` 且设置了 `min_acceptable_offer` 时显示。打开内联表单供买家输入金额，然后预填联系平台消息："I'd like to offer $X for {name}."。低于 `min_acceptable_offer` 的出价在客户端显示委婉的拒绝消息，不发送任何内容。
  - **"支付定金"按钮** — `stripe_payment_link` 非空时显示；在新标签页打开 Stripe 链接
  - **"通过 Venmo 支付"按钮** — `venmo_payment_request` 非空时显示；在新标签页打开 Venmo 付款请求 URL（与"支付定金"并列）。为空时不渲染按钮；Venmo 联系平台链接在联系区块中仍然可用。
  - **初始 SSG 状态** — 静态 HTML 显示最高档位（`resolveItemPrice` 作为纯函数在服务器端调用 → 以 `initialResolvedTier` 传给 `PricingSection`）
  - **社交媒体说明** — 爬虫始终看到最高档位价格（有意为之）
- **元数据表** — 品牌、型号、年龄、尺寸、重量、颜色、原始来源（链接）、原始价格。尺寸/重量会按访客解析出的单位制换算显示（`lib/utils/units.ts`；见 §13 `measurementUnit` / `localeMeasurementUnits`）。
- **运费估算器** — `ShippingEstimator`（客户端）在 `siteConfig.shipping` 启用、物品含 `weight` + `dimensions`、且解析档位为开放式邮寄档位时，显示实时承运商运费估算。完整架构见 §21（Cloudflare Worker 代理）。
- **联系区块** — 含预填消息的平台按钮；`preferred_payment` 列表；`contact_note`
- **标签** — 不可交互标签片（通过 fuse.js 搜索可找到）
- **分享按钮** — 移动端原生分享；桌面端复制链接回退
- **最近浏览** — 页面挂载时将本物品 slug 写入 `sessionStorage`
- **JSON-LD** — `<script type="application/ld+json">`，类型 `@type: "Product"`；`BreadcrumbList`
- **已售状态** — 页面顶部"已售"横幅；联系 CTA 禁用；显示 `sold_date`
- **OG 元数据** — `og:title` = 物品名；`og:image` = 封面图；`og:type: "product"`
- **Twitter 卡片** — `twitter:card: "summary_large_image"`；`twitter:image` = 封面图
- **Pinterest** — `product:price:amount` 与 `product:price:currency` meta 标签（富媒体 pin 支持）

### 10.4 浏览全部页（`/all`）
- 一个网格中所有分类的所有非草稿物品——`available` 默认显示；`reserved`/`pending` 带状态徽章显示；`sold` 被状态切换隐藏（切换后可见）。与分类页相同的可见性集合（通过 `loadBrowseAllPageData()` 加载——见 §15）
- 完整筛选 + 排序栏（与分类页相同）
- `LocationPriceBar` + 距离解析定价
- 无分类筛选（显示全部）；成色、排序、价格、状态筛选可用
- 每张卡片有"所属：{分类}"标签片（链接到分类页）

### 10.5 已售物品档案（`/sold`）
- 所有 `sold` 物品，不受保留窗口限制（从不按日期过滤）
- **渲染网格有上限**：最多渲染 `siteConfig.soldArchiveDisplayLimit` 件最近的已售物品（`0` = 不设上限）。超出上限的物品仍保留在 `content/` 中并计入头部总数，但不渲染。此显示上限与 `soldItemRetentionDays`（控制全站可见性——见 §8/§15）是相互独立的设置。
- 按 `sold_date` 降序排列；无 `sold_date` 的按 `listed_date` 排序
- 无定价显示（已售）；无联系区块
- 显示：封面图、名称、成色徽章、售出日期、分类
- 对买家的社交证明："看看最近卖出了什么"
- 无筛选栏（只读档案）

### 10.6 关于页（`/about`）
- 渲染 `ProjectIntro` 组件（`components/intro/ProjectIntro.tsx`，客户端）——项目整体概览。
- 当站点被检测为未配置的模板/演示时，首页会**改显示 `ProjectIntro` 而非商品目录**。`lib/utils/templateStatus.ts` 负责这一门控：只要 `baseUrl` 仍是占位域名或演示域名，首页就展示 `ProjectIntro`，避免新克隆发布出一个空荡的门面。卖家设置真实 `baseUrl` 后即渲染目录。（`check-config`——见 §14——会在占位域名仍存在时使生产构建失败。）

### 10.7 最近上架页（`/newly-listed`）
- 服务器外壳渲染 `NewlyListedClient`（`components/newly-listed/NewlyListedClient.tsx`，客户端），将可购买物品相对访客上次访问进行分组：**自上次访问以来**、**今天**、**本周**。
- 上次访问时间戳存储在浏览器（`localStorage`）中；**首次访问**（无存储时间戳）时，页面显示欢迎态（`t.newlyListedFirstVisit`）而非空的"自上次访问"分组。空分组显示 `t.newlyListedNoneInPeriod`。
- 数据来自 `loadBrowseAllPageData()`（与 `/all` 共用——见 §11）；坐标不离开设备，访问数据也不会发送到任何服务器。

---

## 11. 数据加载架构

```
content/  (文件系统，仅构建时)
  │
  ├── scripts/sync-images.ts       图片同步（3 种模式）
  │
  ▼
lib/content/loader.ts
  ├── loadCategories()              → Category[]
  ├── loadItemsByCategory(slug)     → Item[]
  ├── loadItem(catSlug, itemSlug)   → Item | null
  ├── loadHomePageData()            → { categories, recentItems }
  │                                     （首页 /page.tsx 使用——一次解析各分类，
  │                                       同时返回分类卡片与最近上架条）
  ├── loadBrowseAllPageData()       → { items: Item[]; categories: Category[] }
  │                                     （/all 与 /newly-listed 使用——一次聚合
  │                                       所有分类的非草稿物品，避免重复解析）
  ├── loadAllItemsRaw()             → Item[]（所有状态、不设上限——供 Facebook 导出使用；
  │                                     勿用于页面渲染）
  ├── loadAllItems()                → Item[]（仅 available，上限为 recentlyListedCount；
  │                                     为向后兼容保留——页面渲染优先使用上面的
  │                                     loadHomePageData / loadBrowseAllPageData 入口）
  └── loadSoldItems()               → Item[]（所有已售；/sold 档案页）
  │
  ▼
lib/content/schema.ts              Zod schema；.safeParse() + 默认值合并
  │
  ▼
lib/content/types.ts               导出的 TS 类型（Category、Item、PriceTier……）
  │
  ▼
app/…/page.tsx                     generateStaticParams() + React 服务器组件
```

### 加载器保证
- 所有 `fs` 调用限制在 `lib/content/loader.ts`；没有页面组件直接访问文件系统
- `loadItem()` 返回 `null`（不抛出）如果物品文件夹或 `item.json` 缺失
- `generateStaticParams` 在创建路由前过滤掉 `null` 结果
- 图片 URL 首先通过清单解析，然后回退到 `/items/{category}/{item}/{filename}`

---

## 12. 组件架构

```
components/
├── ui/                            ← Aceternity UI（通过 CLI 安装——绝不直接编辑）
│
├── layout/
│   ├── SiteHeader.tsx
│   ├── SiteFooter.tsx
│   └── Breadcrumb.tsx
│
├── home/
│   └── RecentlyListedSection.tsx  ← 客户端；拥有首页卡片的地理+距离状态
│
├── category/
│   ├── CategoryCard.tsx
│   └── CategoryGrid.tsx
│
├── item/
│   ├── ItemCard.tsx               ← 客户端；通过 useLocale() 本地化标题
│   ├── ItemGrid.tsx               ← 客户端；持有距离状态、排序状态
│   ├── ItemGallery.tsx            ← 照片轮播（客户端）
│   ├── PricingSection.tsx         ← 客户端；拥有地理+距离状态
│   ├── PricingTable.tsx           ← 展示式
│   ├── PricingTableToggle.tsx     ← 客户端；展开/折叠状态
│   ├── MakeOfferButton.tsx        ← 客户端；内联出价表单
│   ├── MetadataTable.tsx
│   ├── StatusBadge.tsx
│   ├── ConditionBadge.tsx
│   ├── ConditionGuide.tsx         ← 客户端；工具提示/弹窗解释每个成色值
│   ├── FreshnessLabel.tsx         ← 客户端；查看时计算的"3 天前上架"
│   ├── QuantityBadge.tsx
│   ├── TextbookBadge.tsx
│   ├── LocalizedItemContent.tsx   ← 客户端；本地化名称 <h1> + Markdown 描述
│   └── ShippingEstimator.tsx      ← 客户端；ZIP 输入 + 实时承运商运费估算（见 §21）
│
├── contact/
│   ├── ContactSection.tsx         ← 显示包装 + 平台列表
│   ├── PlatformButton.tsx         ← 单个平台按钮（链接或二维码触发）
│   └── QRModal.tsx                ← 含二维码图片的弹窗（客户端）
│
├── pricing/
│   ├── LocationPriceBar.tsx       ← 客户端；权限请求 + 距离显示 + 覆盖
│   ├── DistancePricingContext.tsx ← 客户端；共享的地理/距离 context provider
│   ├── useGeolocation.ts          ← hook
│   ├── useDistancePricing.ts      ← hook
│   └── useShippingRate.ts         ← hook（客户端）；POST 到运费 Worker，返回最便宜费率（见 §21）
│
├── filters/
│   ├── FilterBar.tsx              ← 客户端
│   ├── SortSelect.tsx             ← 客户端
│   └── useFilters.ts              ← hook
│
├── ui-adapters/                   ← Aceternity 槽位适配器
│   ├── BackgroundEffect.tsx
│   ├── ItemGridAdapter.tsx
│   ├── GalleryAdapter.tsx
│   └── ItemCardAdapter.tsx
│
├── search/
│   ├── SearchBar.tsx              ← 客户端；SiteHeader 中的搜索 UI
│   ├── SearchBarClient.tsx        ← 客户端；fuse.js 输入（动态导入，ssr:false）
│   └── useSearch.ts
│
├── i18n/
│   ├── LocaleProvider.tsx         ← 客户端；活跃语区的 React context
│   ├── LocaleSwitcher.tsx         ← 客户端；SiteHeader 中的语区切换按钮
│   ├── useLocale.ts
│   └── useT.ts                    ← hook；返回当前语区的 UIStrings 字典（客户端组件）
│
├── intro/
│   ├── ProjectIntro.tsx           ← 客户端；项目整体概览（关于页 + 模板/演示首页；见 §10.6）
│   ├── UISlotPlayground.tsx       ← 客户端；§18 UI 槽位选项的实时预览
│   └── projectIntro.dictionary.ts ← intro 文案
│
├── newly-listed/
│   └── NewlyListedClient.tsx      ← 客户端；/newly-listed 的按上次访问分组（见 §10.7）
│
├── theme/
│   ├── ThemeProvider.tsx          ← 客户端；深色/浅色主题 context（持久化）
│   └── ThemeToggle.tsx            ← 客户端；SiteHeader 中的主题切换
│
├── units/
│   ├── MeasurementUnitProvider.tsx← 客户端；按语区解析的公制/英制 context（lib/utils/units.ts）
│   ├── MeasurementUnitToggle.tsx  ← 客户端；面向访客的单位切换
│   └── useMeasurementUnit.ts      ← hook；读取当前单位制
│
└── common/
    ├── AdaptiveImage.tsx          ← next/image vs <img> 切换
    ├── ShareButton.tsx            ← 客户端
    ├── JsonLd.tsx                 ← 服务器组件
    ├── RecentlyViewed.tsx         ← 客户端；基于 sessionStorage 的最近浏览条
    └── useIncrementalReveal.ts    ← 客户端 hook；网格的渐进显现动画
```

> `components/` 根目录下另有六个服务器渲染的 `*-demo.tsx` 展示文件（`grid-background-demo.tsx`、`apple-cards-carousel-demo.tsx`、`background-beams-demo.tsx`、`background-boxes-demo.tsx`、`infinite-moving-cards-demo.tsx`、`shooting-stars-and-stars-background-demo.tsx`），供 `UISlotPlayground` 使用；`components/ui/` 存放已安装的 Aceternity 槽位组件（27 个受支持——见 §18——均为客户端）。

### 组件规则
- `ui/` — Aceternity 原版；通过包装扩展，绝不就地修改
- Prop 类型从 `lib/content/types.ts` 派生；不向组件传递原始 JSON 对象
- 以下组件标注 `"use client"`：`RecentlyListedSection`、`ItemGrid`、`PricingSection`、`ItemGallery`、`FilterBar`、`SortSelect`、`ContactSection`、`PlatformButton`、`QRModal`、`LocationPriceBar`、`PricingTableToggle`、`PricingTable`、`MakeOfferButton`、`ConditionGuide`、`SearchBar`、`SearchBarClient`、`ShareButton`、`RecentlyViewed`、`FreshnessLabel`、`ItemCard`、`LocalizedItemContent`、`LocaleProvider`、`LocaleSwitcher`、`SiteHeader`、`MetadataTable`、`ConditionBadge`、`StatusBadge`、`ShippingEstimator`、`DistancePricingContext`、`useShippingRate`、`ProjectIntro`、`UISlotPlayground`、`NewlyListedClient`、`ThemeProvider`、`ThemeToggle`、`MeasurementUnitProvider`、`MeasurementUnitToggle`，以及 `useIncrementalReveal` / `useT` / `useMeasurementUnit` / `useGeolocation` / `useDistancePricing` / `useFilters` / `useSearch` / `useLocale` 各 hook
  - `lib/utils/pricing.ts`（`resolveItemPrice`）与 `lib/utils/shipping.ts` 有意**不带** `"use client"`，因此可同时被服务器与客户端组件导入（Iron Rule 6）。
  - `PlatformButton` 需要 `"use client"`，因为它接收 `onClick` 函数 prop（来自 `ContactSection` 的状态 setter）——函数 prop 无法跨服务器/客户端边界序列化。
  - `SearchBar` 通过 `next/dynamic({ ssr: false })` 加载，避免 fuse.js 引起的水合不匹配。
  - `ShareButton` 使用 `navigator.share()` 与 `navigator.clipboard`——仅浏览器 API。
  - `RecentlyViewed` 在挂载时读写 `sessionStorage`——仅浏览器 API。
  - `MakeOfferButton` 管理出价表单状态并预填联系平台消息。
  - `ConditionGuide` 管理工具提示/弹窗的开合状态。
  - `SortSelect` 管理排序下拉状态（渲染于 `FilterBar` 内，其本身也是客户端组件）。
  - `FreshnessLabel` 相对访客浏览器的实时时钟（`new Date()`）计算相对日期——而非 SSG 构建时间。使用 `useState`/`useEffect` 在挂载后设置标签；effect 触发前不渲染任何内容，因此标签绝不会因部署日期而过时。
  - `LocaleProvider` 在挂载时读取 `localStorage.getItem("locale")`，并通过 React context 提供当前语区。必须标注 `"use client"`——`localStorage` 是仅浏览器 API。
  - `LocaleSwitcher` 在用户交互时调用 `LocaleProvider` context 的 `setLocale()`。当 `siteConfig.i18n.availableLocales.length <= 1` 时隐藏。
  - `ItemCard` 调用 `useLocale()` 本地化标题。它始终渲染在客户端父组件（`ItemGrid` / `RecentlyListedSection`）内，因此访客切换语区时卡片标题立即更新。
  - `LocalizedItemContent` 渲染物品详情页的 `<h1>` 名称与 react-markdown 描述，读取 `useLocale()`。名称与 Markdown 正文在语区切换时无需刷新页面即重新渲染。react-markdown 在此于客户端运行；SSG 仍会将 `defaultLocale` 的描述写入静态 HTML。
  - `SiteHeader`、`MetadataTable`、`ConditionBadge`、`StatusBadge`、`PricingTable`、`ConditionGuide` 都调用 `useT()` 渲染随语区变化的 UI 标签。任何调用 `useT()` 的组件都必须标注 `"use client"`，因为 `useT()` 调用 `useLocale()`（React context hook）。服务器组件改用 `lib/i18n/getTranslations.ts` 的 `getTranslations()`。
- 所有其他组件是 React 服务器组件
- 访客坐标**绝不传出浏览器**——所有距离计算在 `useDistancePricing.ts` 中运行
- **`content/config.ts` 由客户端组件导入**（如 `AdaptiveImage`、`PricingSection`），因此不得使用任何仅 Node.js API（`fs`、`path`、模块级 `process.env`）。所有值必须是静态、可序列化的常量。
- **本地化字段在客户端组件中渲染。** 所有面向访客的 `name` / `description` 渲染（`ItemCard`、`LocalizedItemContent`）都调用 `getLocalizedField(item, …, locale)`，`locale` 来自 `useLocale()`。所有 UI 标签（按钮、徽章、头部）在客户端组件中通过 `useT()`、在服务器组件中通过 `getTranslations()` 解析——两者都取自 `siteConfig.i18n.translations`。SSG 期间渲染 `siteConfig.i18n.defaultLocale`（`LocaleProvider` 的初始值），因此静态 HTML——以及爬虫、OG 标签、JSON-LD——始终携带默认语言；非默认语区只在 hydration 之后、由访客选择时才出现。仅服务器端的出口（`generateMetadata`、`<title>`、OG、JSON-LD、面包屑叶节点）调用 `getTranslations()`，有意保持 `defaultLocale`。见 TECH_REQUIREMENTS.md §22.8。
- **跨文件夹依赖：** `components/filters/useFilters.ts` 从 `lib/utils/pricing.ts` 导入 `resolveItemPrice`。此跨包导入是有意为之且已记录在案。
- **`resolveItemPrice` 性能：** 每次距离变化时对每件物品调用 `resolveItemPrice` 会重新渲染整个物品列表。该函数有意保持轻量（简单数组扫描）。典型收藏（< 100 件）无需 `useMemo`。若大型收藏出现性能问题，可在 `ItemGrid`/`RecentlyListedSection` 中用 `useMemo([items, resolvedDistance])` 缓存。
- **`FilterBar` 回退 prop 类型：** 当 `resolved.source === "fallback"`（无位置）时，`ItemGrid` 向 `FilterBar` 传入 `resolvedDistanceMi={Infinity}`。滑块随后以回退（最高）价格初始化——这是保守的最大值。

---

## 13. 配置 — `content/config.ts`

此文件与物品和二维码位于 `content/` 内。这是卖家编辑的唯一 TypeScript 文件。

> ⚠️ **`content/config.ts` 由客户端组件导入**，因此成为浏览器包的一部分。所有字段值必须是静态、可序列化的常量。不要在模块级别使用 Node.js API。

> 🔁 **向后兼容（模板更新）。** `content/config.ts` 由卖家持有——`pnpm update-site` 绝不覆盖它（见 §22）。在原始核心之后新增的每个配置字段（`defaultPriceTiers?`、`measurementUnit?`、`shipping?`、`i18n.localeMeasurementUnits?`、`ui.priceFilterStrategy?`、`ui.priceFilterBuckets?`、`soldArchiveDisplayLimit?`）都是 **TypeScript 可选（`?`）**，且在消费点带运行时 `??` 默认值，因此拉取新模板代码但未更新配置的下游站点仍能通过类型检查并运行。`pnpm migrate-config`（由 `update-site` 自动调用）可依据 `scripts/lib/configDefaults.ts` 将这些可选字段拼接进旧配置。

```ts
export const siteConfig: SiteConfig = {
  name: "Will's Used Exchange",
  tagline: "优质二手物品——优先本地自提。",
  logo: "",

  deploymentMode: "static",
  baseUrl: "https://your-domain.com",

  imageStorage: {
    provider: "cloudflare-r2",
  },

  location: {
    lat: 37.7749,
    lng: -122.4194,
    label: "San Francisco, CA",
  },

  currency: "USD",
  recentlyListedCount: 6,
  soldItemRetentionDays: 3,
  // 必填——限制 /sold 网格渲染多少件最近的已售物品（0 = 不设上限，渲染全部）。
  // 更早的物品仍保留在 content/ 中并计入头部总数，但不渲染。
  // 与 soldItemRetentionDays 不同（保留期 = 可见性窗口；此字段 = /sold 显示上限）。
  soldArchiveDisplayLimit: 200,

  // 可选——`pnpm create-item` 写入每个新 item.json 的默认价格档位。
  // 含 miles_max 的档位是自提；不含的是邮寄。缺省时使用内置 3 档默认
  // （自提 ≤5 英里 / 6–15 英里 / 邮寄）。
  // defaultPriceTiers: [
  //   { label: "本地自提（≤ 15 英里）", miles_max: 15, amount: 0 },
  //   { label: "邮寄（买家承担）", amount: 0 },
  // ],

  measurementUnit: "metric",  // "metric"（cm/kg）| "imperial"（in/lb）——可选
  // ^ 新建 item.json（pnpm create-item）中 dimensions/weight 的默认单位，
  //   也是物品详情页的回退显示单位（lib/utils/units.ts 会将每个物品存储的
  //   dimensions/weight 换算为该单位制）。可通过下方
  //   i18n.localeMeasurementUnits 按语区覆盖。

  // ── 运费计算器（可选）────────────────────────────────────────────────────
  // 不设置或 enabled: false → 完全不影响站点。见 §21。
  // shipping: {
  //   enabled: true,
  //   proxyUrl: "https://shipping-rate-proxy.<your-subdomain>.workers.dev",
  //   defaultPayer: "buyer",  // "seller" | "buyer"
  //   origin: { zip: "94103", country: "US" },
  // },

  contact: {
    reveal_behavior: "click",
    platforms: [
      { type: "email",     value: "you@example.com" },
      { type: "instagram", value: "your_handle" },
      { type: "wechat",    qr_image: "/contact/wechat-qr.png", label: "WeChat" },
    ],
  },

  hero: {
    cta_label: "浏览物品",
    cta_href: "#categories",
  },

  meta: {
    description: "个人二手商城。",
    twitterHandle: "",
  },

  ui: {
    background: "none",
    itemGrid:   "simple",
    gallery:    "simple",
    itemCard:   "simple",
    // 价格筛选离群值策略：
    //   "none"           — 原始最小/最大值（默认）
    //   "percentile"     — 滑条裁剪至 P5/P95
    //   "logarithmic"    — 非线性滑条刻度
    //   "preset-buckets" — 快速点选价格区间按钮
    //   "iqr"            — 通过四分位距裁剪滑条
    priceFilterStrategy: "none",
    // "preset-buckets" 的自定义分界点（选填）。
    // priceFilterBuckets: [50, 100, 300],
  },

  analytics: {
    vercel:        false,
    speedInsights: false,
  },

  search: {
    enabled:     true,
    placeholder: "搜索物品...",
  },

  sitemap: {
    enabled: true,
  },

  // ── 国际化 ──────────────────────────────────────────────────────────────────
  // 两层翻译体系：
  //   1. UI 字符串 — UIStrings（lib/config/types.ts）的约 87 个按钮/标签/徽章文本，
  //                 在 translations.{locale} 中定义
  //   2. 物品内容 — 各 item.json 中的 name_{locale} / description_{locale}；
  //                 运行 /translate-items 批量填充
  //
  // 如果某语区在 availableLocales 中但 translations 条目缺失或缺少 73 个必需键中的
  // 任何一个（UIStrings 的核心子集），构建将失败（check-config，见 §14）。
  // 其余键（shipping*、newlyListed*、filterPriceBucketAll、filterPriceIncludesOutliers）
  // 为可选，会回退。
  //
  // 安全网：运行时 getTranslations()（服务器）与 useT()（客户端）会在 EN_FALLBACK
  // （lib/i18n/translations.ts）与默认语区之上合并当前字典，因此不完整的语区字典
  // 仍能渲染，而不会显示空白。
  i18n: {
    defaultLocale: "en",
    availableLocales: ["en"],
    showLocaleSwitcher: true,
    // 可选：按语区覆盖 measurementUnit，例如
    // localeMeasurementUnits: { en: "imperial", zh: "metric" },
    translations: {
      en: {
        // ── 导航 ──────────────────────────────────────────────────────────
        home: "Home",
        about: "About",
        browseAll: "Browse All",
        // ── 板块标题 ────────────────────────────────────────────────────────
        recentlyListed: "Recently Listed",
        recentlyViewed: "Recently Viewed",
        categoriesHeading: "Browse by Category",
        // ── 联系 ──────────────────────────────────────────────────────────
        contactSeller: "Contact Seller",
        itemSold: "Item sold",
        preferredPayment: "Preferred payment",
        // ── 出价表单 ────────────────────────────────────────────────────────
        makeOffer: "Make an Offer",
        yourOffer: "Your offer",
        send: "Send",
        belowMinimumOffer: "That offer is below the minimum we can accept. Please try a higher amount.",
        // ── 分享按钮 ────────────────────────────────────────────────────────
        share: "Share",
        copied: "Copied!",
        linkCopied: "Link copied!",
        // ── 物品元数据标签 ──────────────────────────────────────────────────
        brand: "Brand",
        model: "Model",
        age: "Age",
        color: "Color",
        dimensions: "Dimensions",
        weight: "Weight",
        originalSource: "Original Source",
        originalPrice: "Original Price",
        // ── 成色徽章标签 ────────────────────────────────────────────────────
        conditionNew: "New",
        conditionLikeNew: "Like New",
        conditionGood: "Good",
        conditionFair: "Fair",
        conditionForParts: "For Parts",
        // ── 状态徽章标签 ────────────────────────────────────────────────────
        statusAvailable: "Available",
        statusPending: "Pending",
        statusReserved: "Reserved",
        statusSold: "Sold",
        statusDraft: "Draft",
        // ── 筛选/排序栏 ─────────────────────────────────────────────────────
        filterShowSold: "Show sold",
        filterPrice: "Price",
        filterPriceBucketAll: "All prices",
        filterPriceIncludesOutliers: "+ items outside range",
        sortBy: "Sort by",
        sortNewestFirst: "Newest first",
        sortPriceLow: "Price: low → high",
        sortPriceHigh: "Price: high → low",
        sortConditionBest: "Condition: best first",
        // ── 新鲜度标签 ──────────────────────────────────────────────────────
        listed: "Listed",
        // ── 页面标题与横幅 ──────────────────────────────────────────────────
        soldBanner: "This item has been sold",
        soldArchiveTitle: "Sold Archive",
        // ── 成色说明面板 ────────────────────────────────────────────────────
        conditionGuideTitle: "Condition Guide",
        conditionNewDesc: "Unopened, unused. Original packaging intact.",
        conditionLikeNewDesc: "Used briefly. No visible wear. May be without original box.",
        conditionGoodDesc: "Normal signs of use. Fully functional. Minor cosmetic marks.",
        conditionFairDesc: "Visible wear or light damage. Works as expected.",
        conditionForPartsDesc: "Not fully functional. Sold as-is for repair or parts.",
        // ── 位置/距离价格栏 ─────────────────────────────────────────────────
        detectingLocation: "Detecting location…",
        fromSeller: "from seller",
        locationDetected: "Location detected",
        enterManually: "Enter manually",
        distanceManualLabel: "(manual)",
        distanceUnit: "mi",
        distanceInputLabel: "Distance in miles",
        apply: "Apply",
        pricesAtPickupRate: "Prices shown at pickup rate",
        enterDistance: "Enter distance",
        edit: "Edit",
        clear: "Clear",
        // ── 定价表 ──────────────────────────────────────────────────────────
        contactForPrice: "Contact seller for pricing details.",
        contactForPricingShort: "Contact seller for pricing",
        pricingLabelHeader: "Label",
        pricingDistanceHeader: "Distance",
        pricingPriceHeader: "Price",
        pickup: "Pickup",
        obo: "OBO",
        hidePricingTiers: "Hide pricing tiers",
        viewAllPricingTiers: "View all pricing tiers",
        // ── 运费估算器（可选——见 §21）──────────────────────────────────────
        shippingEstimateLabel: "Estimated shipping",
        shippingZipPlaceholder: "ZIP code",
        shippingCalculating: "Calculating shipping…",
        shippingUnavailable: "Shipping estimate unavailable",
        shippingIncludedBySeller: "Free shipping (included by seller)",
        shippingEstimateSuffix: "shipping",
        // ── 移动端导航抽屉 ─────────────────────────────────────────────────
        menuOpen: "Open menu",
        menuClose: "Close menu",
        // ── 最近上架页（见 §10.7）─────────────────────────────────────────
        newlyListed: "Newly Listed",
        newlyListedSinceLastVisit: "Since Last Visit",
        newlyListedToday: "Today",
        newlyListedThisWeek: "This Week",
        newlyListedFirstVisit: "Welcome! Everything here is new to you.",
        newlyListedNoneInPeriod: "No new items in this period.",
      },
      // 启用中文时，取消注释并翻译全部约 87 个键（至少覆盖 check-config 要求的 73 个），
      // 并将 "zh" 加入 availableLocales：
      // zh: { home: "首页", about: "关于", browseAll: "浏览全部", ... },
    },
  },
};
```

---

## 14. 构建流程

三个卖家交互流程，加上平台构建。

```
── 初始设置（仅首次，只运行一次）────────────────────────────────────────
在项目目录中打开 AI 编程工具（Claude Code、Cursor 等）
  /setup（或用自然语言描述任务）
  AI 提问 → 生成 content/config.ts + 分类骨架
  需要：任意 AI 编程工具（Claude Code 订阅、Cursor 等）

── 添加新物品（放入新照片时运行）────────────────────────────────────────
将照片放入 content/items/<category>/<item-name>/
添加可选描述文件（notes.txt、info.yaml 等）
在项目目录中打开 AI 编程工具
  /update-items（或"为我的新物品生成 item.json"）
  AI 读取照片 + 描述 → 生成每个文件夹的 item.json
  保存前由卖家确认
  需要：任意具备视觉能力的 AI 编程工具
```

两个独立流程：**卖家端上传**（本地机器）与**平台构建**（GitHub Actions CI 或 Vercel）。

```
── 卖家机器 ─────────────────────────────────────────────────────────────
pnpm upload-images          （添加/更改照片后运行）
  │
  ├── 扫描 content/items/**/*.{jpg,jpeg,png,webp,gif}（本地存在，gitignore）
  ├── 复制 content/contact/** → public/contact/
  ├── 加载 .image-cache/checksums.json
  ├── 上传新/已更改文件到配置的提供商（R2 / Blob）
  ├── 写入 lib/generated/image-manifest.json  ← 提交此文件
  ├── 写入 .image-cache/checksums.json        ← 不要提交
  └── ⚠️  打印备份提醒

然后：
  git add content/**/*.json lib/generated/image-manifest.json
  git push    ← GitHub Actions 自动触发构建 + 部署

── CI 构建（GitHub Actions / Vercel）────────────────────────────────────
pnpm build
  │
  ├── [prebuild]
  │     ├── scripts/check-config.ts  ← 使构建失败（exit 1），当：
  │     │     ├── siteConfig.baseUrl 仍含占位域名（https://your-domain.com）——
  │     │     │   否则 canonical/OG/JSON-LD URL 会悄悄指向占位域名（SEO 陷阱）
  │     │     └── availableLocales 中某语区在 i18n.translations 中缺失，或缺少
  │     │         73 个必需 UIStrings 键中的任何一个（可回退到默认语区条目）——见 §13
  │     │
  │     ├── scripts/sync-images.ts（build-check 模式）
  │     │     ├── content/items/ 中无图片文件（gitignore——CI runner 上不存在）
  │     │     ├── content/contact/** 存在（git 追踪）→ 复制到 public/contact/
  │     │     ├── 读取已提交的 lib/generated/image-manifest.json
  │     │     └── 日志："manifest present (N entries) — skipping upload"
  │     │     ⚠️  无需 CDN 凭证——build-check 从不上传
  │     │
  │     └── scripts/build-search-index.ts
  │           ├── 调用 lib/search/index.ts 的 buildSearchIndex()
  │           └── 写入 public/search-index.json（gitignore；运行时由 SearchBar 获取）
  │
  ├── next build
  │     加载器读取清单 → 所有图片 URL 解析到 CDN
  │     所有非草稿、未过期物品的 generateStaticParams 运行
  │     所有页面渲染为静态 HTML + JSON
  │     deploymentMode === "static"（默认）→ output: 'export' → out/
  │
  └── [postbuild]  scripts/postbuild.ts
        若 siteConfig.sitemap.enabled → next-sitemap → sitemap.xml + robots.txt
        若 siteConfig.sitemap.enabled === false → 跳过（打印提示，exit 0）

  GitHub Actions：上传 out/ → GitHub Pages（见 .github/workflows/deploy.yml）
  Vercel：自动提供输出（deploymentMode: "vercel" 时省略 output:'export'）

── 本地构建（imageStorage.provider === "local"，卖家机器）─────────────────
pnpm build
  │
  ├── [prebuild]
  │     ├── scripts/sync-images.ts（build-check 模式——local provider 分支）
  │     │     本地存在照片 → 复制到 public/items/（与 dev-sync 相同）
  │     │     content/contact/ → 复制到 public/contact/
  │     │     图片包含在构建输出（out/）中——适合自托管服务器
  │     │     ⚠️  不要在 GitHub Actions 或 Vercel 上使用此模式（照片在 CI 上被 gitignore）
  │     │
  │     └── scripts/build-search-index.ts → public/search-index.json
  │
  └── next build → out/ 包含全部图片；将整个 out/ 部署到静态主机

── 本地开发 ─────────────────────────────────────────────────────────────
pnpm dev
  │
  ├── sync-images.ts（无论 provider 配置如何，始终以 "local" 模式运行）
  │     content/items/ 照片 → 复制到 public/items/
  │     content/contact/ → 复制到 public/contact/
  │     content/items/ 中没有图片时优雅回退
  │
  └── next dev --turbo
        图片从 public/items/ 和 public/contact/ 提供
```

---

## 15. 状态与可见性规则

| 状态 | 首页最近上架 | 首页分类卡片 | `/[category]` 页 | `/all` 页 | `/sold` 档案 | 详情页 | 备注 |
|---|---|---|---|---|---|---|---|
| `available` | 是 | 卡片可见 | 是 | 是 | 否 | 是 | |
| `reserved` | **否** | 卡片可见 | 是 + 徽章 | 是 + 徽章 | 否 | 是 | 买家信息保持私密 |
| `pending` | **否** | 卡片可见 | 是 + 徽章 | 是 + 徽章 | 否 | 是 | |
| `sold` | 否 | 卡片可见（未超过保留期） | 是 + 遮罩（切换隐藏） | 是（切换隐藏） | **始终** | 是（未超过保留期） | `soldItemRetentionDays` 后从 detail page 排除 |
| `draft` | 否 | 否 | 否 | 否 | 否 | 否 | 从不生成路由 |

**关于"首页最近上架"的说明：** 最近上架条现在由 `loadHomePageData()` 提供（见 §11），仅返回 `available` 状态并限制为 `siteConfig.recentlyListedCount` 件。`reserved` 和 `pending` 物品不出现于该条。

**关于"首页分类卡片"的说明：** 当分类中至少有 1 件状态为 `available`、`reserved`、`pending` 或（`sold` 且未超过 `soldItemRetentionDays`）的物品时，分类卡片可见。状态为 `draft` 或（`sold` 且已超过保留期）的物品从不计入卡片可见性。卡片上显示的物品数量仅统计 `available` 物品。封面图使用第一件 `available` 物品的封面。

**关于 `/[category]` 与 `/all` 页面的说明：** 两个页面都展示所有非草稿、已售未过保留期的物品——`/[category]` 通过 `loadItemsByCategory()` 加载，`/all` 通过 `loadBrowseAllPageData()` 加载（一次聚合）。已售物品默认被状态切换隐藏，切换开启后可见。

**关于 `/sold` 档案的说明：** 使用 `loadSoldItems()`。显示 `sold` 物品不受 `soldItemRetentionDays` 限制——此处不应用保留期过滤。但**渲染网格有上限**：最多渲染 `siteConfig.soldArchiveDisplayLimit` 件最近的已售物品（`0` = 不设上限）；超出上限的物品仍保留在 `content/` 中并计入头部总数，但不渲染。保留期（可见性窗口）与此显示上限是相互独立的设置。

---

## 16. 目录布局

```
usedExchange/
│
├── content/                       ← ★ 卖家管理——卖家唯一接触的文件夹
│   ├── config.ts
│   ├── items/
│   │   ├── houseware/
│   │   │   ├── _category.json
│   │   │   └── ikea-desk-lamp/
│   │   │       ├── item.json      ← ✓ git 追踪
│   │   │       └── cover.jpg     ← ✗ gitignore
│   │   └── electronics/ …
│   └── contact/
│       └── wechat-qr.png
│
├── public/
│   ├── contact/                   ← ✗ gitignore；从 content/contact/ 复制
│   ├── items/                     ← ✗ gitignore；由 pnpm dev 从 content/items/ 复制
│   └── search-index.json          ← ✗ gitignore；由预构建步骤写入
│
├── .image-cache/                  ← ✗ gitignore；增量上传速度缓存
│
├── app/
│   ├── layout.tsx                 ← 组合客户端 provider（LocaleProvider、ThemeProvider、
│   │                                MeasurementUnitProvider）+ BackgroundEffect、Analytics
│   ├── globals.css
│   ├── page.tsx                   ← 首页（目录；未配置模板时显示 ProjectIntro——见 §10.6）
│   ├── all/page.tsx
│   ├── sold/page.tsx              ← 已售档案（网格受 soldArchiveDisplayLimit 上限约束）
│   ├── about/page.tsx             ← 关于——ProjectIntro（见 §10.6）
│   ├── newly-listed/page.tsx      ← 最近上架——服务器外壳 → NewlyListedClient（见 §10.7）
│   ├── [category]/page.tsx
│   ├── [category]/[item]/page.tsx
│   └── not-found.tsx
│
├── components/                    ← 见 §12
│
├── studio/                        ← Seller Studio SPA（仅本地；见 §22）。Vite 应用 + API 中间件；
│                                    只编辑 content/ + lib/generated/image-manifest.json
│
├── workers/
│   └── shipping-rate-proxy/       ← 独立部署的 Cloudflare Worker（见 §21）；将承运商 API 密钥
│                                    保留在服务端；有自己的 package.json + wrangler.toml
│
├── lib/
│   ├── content/（loader.ts、schema.ts、types.ts）
│   ├── images/（adapter.ts、local.ts、vercel-blob.ts、cloudflare-r2.ts）
│   ├── utils/（haversine.ts、pricing.ts、shipping.ts、priceFilterStrategies.ts、units.ts、
│   │          slug.ts、templateStatus.ts、date.ts、jsonld.ts、concurrency.ts、index.ts、i18n.ts）
│   ├── search/index.ts
│   ├── generated/image-manifest.json  ← ✓ git 追踪
│   ├── config/types.ts
│   └── ui/types.ts
│
├── .claude/                       ← Claude Code 项目配置
│   ├── CLAUDE.md                  ← 由 Claude Code 自动加载；项目上下文 + content/ 规则
│   └── commands/                  ← AI 技能文件（见 §20）；适用于 Claude Code + 其他 AI 工具
│       ├── setup.md               ← 技能：交互式站点配置设置向导（/setup）
│       ├── setup-shipping.md      ← 技能：运费计算器引导设置（/setup-shipping，见 §21）
│       ├── translate-items.md     ← 技能：批量翻译物品字段到其他语区
│       └── update-items.md        ← 技能：从照片 + 描述文件生成 item.json
│
├── scripts/
│   ├── sync-images.ts             ← 图片上传管线（3 种模式：upload / dev-sync / build-check）
│   ├── check-config.ts            ← 预构建门：占位域名 + 翻译完整性（见 §14）
│   ├── build-search-index.ts
│   ├── postbuild.ts
│   ├── setup-ui.sh
│   ├── create-item.ts             ← pnpm create-item <category>/<name>（别名：pnpm new）
│   ├── mark-sold.ts
│   ├── create-template.ts
│   ├── studio.ts                  ← pnpm studio——Seller Studio 启动器（见 §22）
│   ├── export-facebook.ts         ← pnpm fb-export——Facebook Marketplace CSV 导出（见 §22）
│   ├── update-site.ts             ← pnpm update-site——拉取模板版本而不触碰 content/（见 §22）
│   ├── migrate-config.ts          ← pnpm migrate-config——从 configDefaults.ts 拼接可选配置字段
│   ├── bump-version.ts            ← pnpm bump——交互式版本号升级 + GitHub release
│   └── lib/                       ← 共享支持模块（imageSync、itemEdit、itemFields、itemTemplate、
│                                    markSold、configDefaults、studioApi/Git/Images/Sync、loadEnv 等）+ 其测试
│
├── .github/workflows/deploy.yml
├── next-sitemap.config.js
├── SETUP_GUIDE.md
├── postcss.config.mjs             ← Tailwind v4 PostCSS 插件（必需）；见 TECH_REQUIREMENTS.md §22.2
├── tailwind.config.ts             ← v4 中可选——仅在扩展主题时使用；否则省略
├── docs/                          ← 文档（本文件位于此处）
│   ├── DESIGN.md / DESIGN_zh.md
│   ├── TECH_REQUIREMENTS.md / TECH_REQUIREMENTS_zh.md
│   ├── ARCHITECTURE.md / CURRENT_FUNCTIONALITY.md  ← Studio + 数据流细节见此（§22）
│   └── …
├── next.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 17. 地理定位与距离定价架构

### 定义

| 术语 | 含义 |
|---|---|
| **卖家** | 部署此站点的人。在 `content/config.ts` 中一次性配置。 |
| **访客** | 浏览已部署站点的任何人。位置在其浏览器中运行时检测。 |

### 卖家位置

存储在 `content/config.ts` 中，作为 `location: { lat, lng, label }`。在构建时嵌入静态站点。**在页面源代码中公开可见**。如介意隐私，卖家应使用附近的路口或地标。

### 访客位置检测流程

```
访客加载分类或物品页面
  │
  ├── [状态：idle]  ← 第一次 useEffect 触发前的初始状态；在所有渲染代码中与"pending"相同处理
  │
  ├── 浏览器调用 navigator.geolocation.getCurrentPosition()（在 useEffect 中）
  │   → 状态变为"pending"
  │
  ├── [状态：pending]
  │     UI 显示："🔍 正在检测你的位置…"，LocationPriceBar 中带骨架占位符
  │     物品卡片显示回退（最高）价格——无卡片级骨架
  │
  ├── [状态：granted]
  │     访客坐标已接收（仅留在浏览器内存中）
  │     Haversine 距离计算：D = haversineInMiles(seller, visitor)
  │
  └── [状态：denied | unavailable | timeout]
        → resolveDistanceMi = Infinity（触发最高价回退）
        UI 显示："📍 位置不可用——显示最高价格"

距离覆盖（始终可用，不受权限状态影响）：
  访客点击"修改距离" → 输入数字 → resolveDistanceMi = 输入值
  所有价格和筛选栏立即重新计算
```

### 价格档位解析

给定 `resolveDistanceMi` 和物品的 `price.tiers` 数组：

```
resolveDistanceMi = Infinity  →  使用 miles_max 字段缺失（开放式）的档位
                                  "开放式"指 JSON 中 miles_max 键缺失——
                                  很大的数值（如 99999）不是开放式
                                  如果多个开放式档位，使用数组顺序中的第一个
                                  如果无开放式档位，使用金额最高的档位
                                  （最高金额并列时：使用数组顺序中的第一个）
resolveDistanceMi = D         →  找第一个满足以下条件的档位：
                                    (miles_min ?? 0) ≤ D ≤ (miles_max ?? Infinity)
                                  如果没有档位匹配 D（档位之间有间隙），使用
                                    miles_max 最接近 D 且从下方接近的档位
                                  如果 price.tiers 为空 → 显示"联系询价"
```

> **距离单位：** `item.json` 中所有 `miles_min`、`miles_max` 值以及所有运行时距离计算都使用**英里（miles）**。这是 v1 的固定约束。公里切换列于 §19 可扩展性登记册。

> ⚠️ **卖家应确保档位边界连续以避免间隙。** 见 §5 `price.tiers` 示例中的推荐重叠约定。

`resolveItemPrice` 是一个纯函数（无 hooks、无副作用、完全可测试）。它位于 **`lib/utils/pricing.ts`** ——一个不带 `"use client"` 的独立文件，因此可同时被服务器组件（物品详情页 SSG 初始渲染）与客户端组件（`PricingSection`、`ItemGrid`、`RecentlyListedSection`、`useFilters.ts`）导入。

### 价格档位显示规则

默认只显示解析后的档位。所有其他档位隐藏。

| 上下文 | 默认显示 | 可展开？ |
|---|---|---|
| 物品卡片（分类网格、首页） | 仅解析档位价格 | 否——卡片太紧凑 |
| 物品详情页定价表 | 仅解析档位行 | 仅当 `price.show_tiers` 为 `true` 时——"查看所有价格档位 ▼"折叠切换 |

`price.show_tiers` 默认为 `false`：买家只能看到解析档位行，不会得知其他档位的存在。卖家可能不希望买家比较各档位（例如看出自提比邮寄便宜很多，从而压价）。卖家可逐件物品设置 `price.show_tiers: true` 来开启切换功能。

切换功能开启后，无论定位状态如何（已授权、已拒绝或手动输入）都会显示。展开时列出所有档位，已解析档位视觉高亮（加粗或强调色）；折叠后返回单行视图。

### 状态架构

距离状态由 `ItemGrid`（分类页）与 `PricingSection`（物品详情页）持有，并作为 prop 传递给子组件。`LocationPriceBar` 是受控组件——它通过回调读写，从不自己持有状态。

```
分类页（/[category]/page.tsx —— 服务器组件）
  └── ItemGrid  （客户端，持有：resolvedDistance、setResolvedDistance）
        ├── LocationPriceBar  ← 读取 resolvedDistance；覆盖时调用 setter
        ├── FilterBar         ← 接收 resolvedDistance 作为价格区间基准
        └── ItemCard[]        ← 各自接收 resolvedPrice = resolveItemPrice(item.price, resolvedDistance)

物品详情页（/[category]/[item]/page.tsx —— 服务器组件）
  └── PricingSection  （客户端，持有：resolvedDistance、setResolvedDistance）
        ├── LocationPriceBar  ← 同一组件，同一模式
        └── PricingTable      ← 接收 resolvedTier = resolveItemPrice(item.price, resolvedDistance)
              └── PricingTableToggle  ← 展开/折叠；接收所有档位 + 已解析档位索引

首页（/page.tsx —— 服务器组件）
  └── RecentlyListedSection  （客户端，持有：resolvedDistance、setResolvedDistance）
        └── ItemCard[]        ← 各自接收 resolvedPrice；首页不显示 LocationPriceBar
```

> **首页 LocationPriceBar 决策：** 首页**不渲染** `LocationPriceBar`。"最近上架"卡片的价格会在地理定位解析时静默更新。在 Hero/分类网格的语境下显示距离指示器会造成视觉噪声。想查看距离并覆盖的买家应访问分类页或物品详情页。

> **按页状态说明：** 地理定位状态仅存于 `useState` —— 不会跨 Next.js 页面导航持久化。从首页 → 分类页 → 物品详情页导航时，每次挂载都会触发 `useGeolocation()`。浏览器会立即从权限缓存返回（`maximumAge: 300_000 ms` 内），因此首次解析后没有可见延迟。这是预期行为；无需也未实现跨页状态持久化。

### 隐私保证

- 访客坐标仅存于 React 组件状态（`useState`）中
- 绝不写入 `localStorage`、`sessionStorage`、cookies 或任何网络请求
- 卖家坐标（`content/config.ts`）是静态包的一部分，有意公开

### Hook 规范

#### `useGeolocation()`
```ts
type GeolocationState =
  | { status: "idle" }       // 第一次 useEffect 之前；在所有 UI 代码中与 "pending" 同等对待
  | { status: "pending" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "unavailable" };   // 浏览器不支持 navigator.geolocation

// 返回当前地理定位状态。
// 在第一次 useEffect 调用中触发 navigator.geolocation.getCurrentPosition()。
// "idle" 是 useState 初始值；hook 立即转换到 "pending"。
// 所有渲染代码中 "idle" 必须与 "pending" 同等对待。
// 拒绝后不自动重试。
export function useGeolocation(): GeolocationState;
```

#### `useDistancePricing(sellerLocation, geoState)`
```ts
type ResolvedDistance =
  | { source: "detected"; miles: number }
  | { source: "manual";   miles: number }
  | { source: "fallback" };               // denied / unavailable / idle / pending → 最高价

// 当 geoState.status 为 "idle" 或 "pending" 时，返回 { source: "fallback" }，
// 使所有渲染代码都能用回退价继续，而无需对 "pending" 做特殊处理。
// geoState 转换到 granted/denied 时自动更新。
export function useDistancePricing(
  sellerLocation: { lat: number; lng: number },
  geoState: GeolocationState
): {
  resolved: ResolvedDistance;
  setManualMiles: (miles: number | null) => void;  // null = 清除覆盖，回到 detected/fallback
};
```

#### `resolveItemPrice(price, resolved)` —— 位于 `lib/utils/pricing.ts`
```ts
// 纯函数。无 hooks。无副作用。无 "use client" 指令。
// 文件：lib/utils/pricing.ts  ← 可被服务器组件与客户端组件导入
// 使用方：服务器页（SSG 初始渲染）、ItemCard、PricingTable、PricingSection、useFilters.ts
// 不调用 haversineInMiles() —— 距离已由 useDistancePricing() 预先解析。
// 返回适用的 PriceTier；若未定义档位则返回 null。
export function resolveItemPrice(
  price: Price,
  resolved: ResolvedDistance
): PriceTier | null;
```

---

## 18. UI 组件配置

### 概述

站点有**四个视觉槽位**，其 Aceternity UI 组件可以在 `content/config.ts` 中通过一行代码切换。如果组件尚未安装，所有槽位优雅回退到普通实现。

| 槽位 | 配置键 | 应用于 | 默认 |
|---|---|---|---|
| 背景 | `ui.background` | 整个站点——包装 `app/layout.tsx` | `"none"` |
| 物品网格 | `ui.itemGrid` | 分类页物品列表布局 | `"simple"` |
| 图库 | `ui.gallery` | 物品详情页照片图库/轮播 | `"simple"` |
| 物品卡片 | `ui.itemCard` | 每张物品卡片（分类网格 + 首页最近上架） | `"simple"` |

---

### 槽位 1 — 背景（`ui.background`）

包装 `app/layout.tsx` 中的 `<body>`。所选组件渲染在所有页面内容之后。

| 配置值 | Aceternity 组件 | 安装命令 |
|---|---|---|
| `"none"` *（默认）* | 无背景效果 | — |
| `"aurora"` | Aurora Background | `npx shadcn@latest add @aceternity/aurora-background` |
| `"background-beams"` | Background Beams | `npx shadcn@latest add @aceternity/background-beams-demo` |
| `"background-beams-collision"` | Background Beams With Collision | `npx shadcn@latest add @aceternity/background-beams-with-collision` |
| `"background-gradient-animation"` | Background Gradient Animation | `npx shadcn@latest add @aceternity/background-gradient-animation` |
| `"background-boxes"` | Background Boxes | `npx shadcn@latest add @aceternity/background-boxes-demo` |
| `"wavy"` | Wavy Background | `npx shadcn@latest add @aceternity/wavy-background` |
| `"vortex"` | Vortex | `npx shadcn@latest add @aceternity/vortex` |
| `"shooting-stars"` | Shooting Stars & Stars Background | `npx shadcn@latest add @aceternity/shooting-stars-and-stars-background-demo` |
| `"meteors"` | Meteors | `npx shadcn@latest add @aceternity/meteors` |
| `"grid-and-dot"` | Grid and Dot Backgrounds | `npx shadcn@latest add @aceternity/grid-background-demo` |
| `"background-lines"` | Background Lines | `npx shadcn@latest add @aceternity/background-lines` |
| `"spotlight"` | Spotlight | `npx shadcn@latest add @aceternity/spotlight` |
| `"spotlight-new"` | Spotlight New | `npx shadcn@latest add @aceternity/spotlight-new` |

---

### 槽位 2 — 物品网格（`ui.itemGrid`）

控制分类页物品网格所用的布局组件，替代默认 CSS 网格。

| 配置值 | Aceternity 组件 | 特点 | 安装命令 |
|---|---|---|---|
| `"simple"` *（默认）* | 普通 CSS 网格（Tailwind） | 响应式 2–4 列网格 | — |
| `"bento-grid"` | Bento Grid | 瀑布流式、可变尺寸卡片 | `npx shadcn@latest add @aceternity/bento-grid` |
| `"layout-grid"` | Layout Grid | 以图片为主、悬停显现的网格 | `npx shadcn@latest add @aceternity/layout-grid` |
| `"focus-cards"` | Focus Cards | 悬停时调暗其他卡片、聚焦所选 | `npx shadcn@latest add @aceternity/focus-cards` |

---

### 槽位 3 — 图库（`ui.gallery`）

控制物品详情页的照片图库/轮播，替代默认缩略图条。

| 配置值 | Aceternity 组件 | 特点 | 安装命令 |
|---|---|---|---|
| `"simple"` *（默认）* | 静态图片条，点击放大 | 极简、快速 | — |
| `"apple-cards-carousel"` | Apple Cards Carousel | 横向滚动，带 3D 景深 | `npx shadcn@latest add @aceternity/apple-cards-carousel-demo` |
| `"images-slider"` | Images Slider | 全宽交叉淡入滑块 | `npx shadcn@latest add @aceternity/images-slider` |
| `"carousel"` | Carousel | 经典分页轮播 | `npx shadcn@latest add @aceternity/carousel` |
| `"parallax-scroll"` | Parallax Scroll | 双列交错视差网格 | `npx shadcn@latest add @aceternity/parallax-scroll parallax-scroll-2` |

---

### 槽位 4 — 物品卡片（`ui.itemCard`）

控制应用于每张物品卡片的悬停/视觉效果。卡片内容（图片、名称、价格、徽章）始终由 `ItemCard.tsx` 渲染；适配器负责包装。

| 配置值 | Aceternity 组件 | 特点 | 安装命令 |
|---|---|---|---|
| `"simple"` *（默认）* | 普通带边框卡片（Tailwind） | 干净、快速 | — |
| `"card-hover-effect"` | Card Hover Effect | 悬停时动画边框辉光 | `npx shadcn@latest add @aceternity/card-hover-effect` |
| `"card-spotlight"` | Card Spotlight | 径向聚光灯跟随光标 | `npx shadcn@latest add @aceternity/card-spotlight` |
| `"3d-card"` | 3D Card Effect | 鼠标移动时透视倾斜 | `npx shadcn@latest add @aceternity/3d-card` |
| `"evervault-card"` | Evervault Card | 悬停时加密文本噪点 | `npx shadcn@latest add @aceternity/evervault-card` |
| `"wobble-card"` | Wobble Card | 悬停时弹性摇摆 | `npx shadcn@latest add @aceternity/wobble-card` |
| `"direction-aware-hover"` | Direction Aware Hover | 从鼠标进入方向滑入遮罩 | `npx shadcn@latest add @aceternity/direction-aware-hover` |
| `"glare-card"` | Glare Card | 眩光反射跟随光标 | `npx shadcn@latest add @aceternity/glare-card` |

---

### 核心原则：卖家只接触 `content/`

> **卖家绝不编辑 `content/` 之外的任何文件。** 更改 UI 组件只需在 `content/config.ts` 中改一个配置值。无需编辑代码，无需 CLI 命令，无需取消注释步骤。

为此，所有 27 个受支持的 Aceternity 组件**由开发者在初始项目设置期间一次性安装**并**提交到仓库**。适配器文件随所有导入激活和所有选项接线一起发布。之后，UI 更改无需进一步开发者干预。

### 一次性开发者设置

```bash
pnpm setup-ui
```

此脚本在单条命令中将所有 27 个受支持的 Aceternity 组件安装到 `components/ui/`。**将生成的 `components/ui/` 文件提交到 git。** 从那时起，卖家可以使用上表中的任何配置值，无需进一步设置。

### 适配器架构

每个适配器文件完整接线——所有受支持的组件预导入，所有情况已处理。**适配器文件是应用代码；卖家绝不编辑它们。**

```tsx
// components/ui-adapters/BackgroundEffect.tsx
// ⚠️  DO NOT EDIT — 卖家配置只在 content/config.ts 中修改
"use client";

import { siteConfig } from "@/content/config";
import { AuroraBackground } from "@/components/ui/aurora-background";
// ... 所有受支持的导入

const COMPONENTS = {
  "aurora": AuroraBackground,
  // ... 所有选项
} as const;

export function BackgroundEffect({ children }: { children: React.ReactNode }) {
  const { background } = siteConfig.ui;
  if (background === "none") return <>{children}</>;
  const Component = COMPONENTS[background as keyof typeof COMPONENTS];
  if (!Component) return <>{children}</>;
  return <Component>{children}</Component>;
}
```

### 优雅降级

| 场景 | 行为 |
|---|---|
| `ui.background: "none"` | children 无包装渲染——无背景效果 |
| `ui.*: "simple"` | 内置 Tailwind 实现——不使用 Aceternity 组件 |
| 有效配置值（如 `"aurora"`） | 对应的预安装 Aceternity 组件渲染 |
| 未知/未来值（COMPONENTS 映射中尚不存在） | 静默回退到 `"none"` / `"simple"` |

站点**绝不因 UI 配置值在运行时崩溃**。

---

## 19. 可扩展性登记册

| 未来功能 | 指定扩展点 |
|---|---|
| 联系表单/询问 | 无服务器函数；`ContactSection` 有保留槽位 |
| 标签筛选页 | `/tags/{tag}` 路由 + 加载器中的标签索引 |
| 草稿预览 | Next.js middleware 在 `/preview/[category]/[item]` |
| 距离单位切换（英里 ↔ 公里） | 在 `siteConfig.i18n` 中添加 `distanceUnit: "mi" \| "km"` |
| 跨导航缓存位置 | `sessionStorage` 可选，位于 `siteConfig.cacheLocationInSession: true` 后，需要同意 |
| 本地图片优化 | 添加 `sharp` devDependency；向 `scripts/sync-images.ts --mode upload` 添加 `preprocess` 步骤 |
| `pnpm clean-storage` | 调和孤立 CDN blob 与清单的脚本 |
| 添加新 UI 组件选项 | 通过 `npx shadcn@latest add ...` 安装；向适配器添加导入 + 条目；更新 `lib/ui/types.ts` |
| 添加新 UI 槽位 | 向 `UIConfig` 添加键；在 `components/ui-adapters/` 新建适配器；在 §18 中记录 |
| 添加新语区 | 向 `siteConfig.i18n.availableLocales` 添加语区；扩展 Zod schema + `Item` 类型；运行 `/translate-items` AI 技能 |
| RSS feed | 在 postbuild 中聚合 `loadItemsByCategory()` 生成 `feed.xml` |
| 多卖家支持 | 需要完整架构重新设计；每个卖家获得一个独立的 `content/` 文件夹 |

> ✅ **本登记册编写之后已实现：** 本地卖家仪表板现已是 **Seller Studio**（`pnpm studio`，第 18 阶段）——见 §22。Facebook Marketplace 导出（`pnpm fb-export`，第 17 阶段）与模板更新工作流（`pnpm update-site` / `pnpm migrate-config`）也已上线；见 §22。

---

## 20. AI 辅助内容生成——基于技能的方法

四个 AI 辅助工作流以 **Claude Code 技能**形式提供（见 `.claude/commands/`）。卖家使用已有的任何 AI 编程工具——Claude Code、Cursor、GitHub Copilot 或任何有能力的助手。**无需额外 API 密钥、环境变量或包安装。** 卖家只需在项目目录中打开其 AI 工具并调用技能。

### 设计原则

> 技能是**指令文件，不是代码**。它们告诉 AI 助手项目结构是什么样子、要读取哪些文件、确切应该生成什么。AI 使用其内置能力和用户的现有订阅完成工作。

这种方式：
- 对卖家零额外设置要求
- 适用于任何能读取文件、写入 JSON 的 AI 编程助手
- 优雅降级：若卖家没有 AI 工具，可改用 `pnpm create-item`
- 不向 `package.json` 添加任何依赖
- 不引入任何 API 密钥管理

### 技能文件

项目附带四个技能文件：

```
.claude/
└── commands/
    ├── setup.md             ← 技能：交互式站点配置设置
    ├── setup-shipping.md    ← 技能：运费计算器引导设置（见 §21）
    ├── translate-items.md   ← 技能：批量翻译物品字段到其他语区
    └── update-items.md      ← 技能：从照片 + 描述生成 item.json
```

它们遵循标准 Claude Code 技能格式，可在 Claude Code 中通过 `/update-items`、`/setup`、`/setup-shipping`、`/translate-items` 调用。其他 AI 工具可直接将其作为提示词指令读取。

---

### 技能 1 — 物品 JSON 生成器

**调用：** Claude Code 中的 `/update-items`，或粘贴技能文件内容到任何 AI 助手。

**卖家做什么：**

卖家将照片放入物品文件夹（可选附带描述文件），然后运行此技能。AI 使用其视觉能力分析照片、读取描述文件，生成完整的 `item.json`——并在保存前请卖家确认。

```
1. 创建 content/items/<category>/<item-name>/
2. 放入照片（cover.jpg、photo1.jpg……）
3. 可选添加描述文件（任意文本格式——见下文）
4. 在项目中打开 Claude Code（或类似 AI 工具）
5. 输入：/update-items（或用自然语言描述任务）
6. 审阅 AI 显示的 item.json 建议
7. 确认 → AI 将 item.json 写入文件夹
8. pnpm upload-images    ← 照常上传照片到 CDN
```

#### 触发条件

当以下任一条件为真时，技能处理该文件夹：
- 存在图片但没有 `item.json`
- `item.json` 存在且 `status: "draft"`
- 描述文件比现有 `item.json` 更新（以更新的信息重新生成）
- 卖家明确指定某个文件夹："只更新 electronics/iphone-14 文件夹"

#### 描述文件

在物品文件夹中照片旁放置任意基于文本的文件。技能会检测并读取以下任意格式：

| 格式 | 示例文件名 | 内容风格 |
|---|---|---|
| 纯文本 | `notes.txt`、`description.txt` | 自由格式笔记——"2024 年购于 Amazon，几乎没用，含充电器" |
| Markdown | `README.md`、`notes.md` | 结构化或自由格式 Markdown |
| YAML | `info.yaml`、`info.yml` | 与 item.json 字段名对应的键值对 |
| 部分 JSON | `info.json` | 部分 `item.json`——AI 将其与视觉分析结果合并 |

若未找到描述文件，技能仅凭照片工作。

**`notes.txt` 示例：**
```
Bought from Best Buy in Spring 2023 for $89.
Used for one semester. Textbook is CS101 at State University.
Minor pen marks on a few pages.
Willing to take $30.
```

**`info.yaml` 示例：**
```yaml
original_source: Best Buy
original_price: 89
course: CS101
edition: 3rd Edition
condition: fair
min_acceptable_offer: 25
```

#### 视觉模型提取的内容

| 字段 | 来源 | 置信度 |
|---|---|---|
| `name` | 文件夹名（人性化处理）+ 照片文字识别 | 高 |
| `description` | 视觉分析 + 描述文件 | 中–高 |
| `condition` | 照片目视检查 | 中 |
| `brand` | 照片中 Logo/标签识别 | 中 |
| `model` | 照片中可见的型号 | 中 |
| `color` | 视觉 | 高 |
| `dimensions` | 依据照片中的比例参照物估算 | 低（标注为估算值） |
| `tags` | 物品类型推断 | 中 |
| `course` / `isbn` | 教材上的文字识别 | 可见时高 |

AI **无法**从照片确定的字段（保留默认值或交互式询问）：
- `price.tiers` —— AI 依据品类惯例给出建议，但请卖家确认
- `pickup_windows` —— 总是询问
- `preferred_payment` —— 取自 `siteConfig` 默认值
- `listed_date` —— 设为今天

#### 交互确认流程

```
AI: 📦 Analysing 3 photos in content/items/electronics/iphone-14...

  Proposed item.json:
  ┌─────────────────────────────────────────────────────────┐
  │ name:        iPhone 14 Pro (Space Black, 256 GB)        │
  │ condition:   good                                       │
  │ brand:       Apple                                      │
  │ model:       iPhone 14 Pro                              │
  │ color:       Space Black                                │
  │ description: Used iPhone 14 Pro in good condition.      │
  │              Minor scratches on the back. Screen is     │
  │              pristine. Includes original charger.       │
  │ tags:        [electronics, phone, apple, iphone]        │
  │ price.tiers: [Pickup $420, Shipping $450] (suggested)   │
  │ status:      draft                                      │
  └─────────────────────────────────────────────────────────┘

  [C] Confirm and save    [E] Edit in $EDITOR    [S] Skip    [Q] Quit
```

除非卖家明确要求 `"available"`，AI 以 `status: "draft"` 保存。这防止意外发布。

AI 可以在单次会话中处理一个文件夹、一个分类或所有符合条件的文件夹——卖家用自然语言描述范围（"更新我所有的 electronics 物品" / "只处理 iphone 文件夹"）。

---

### 技能 2 — 站点设置向导

**调用：** Claude Code 中的 `/setup`，或描述任务："帮我设置我的 UsedExchange 配置文件。"

**卖家做什么：**
```
1. 在项目目录中打开 Claude Code（或类似工具）
2. 输入：/setup（或"帮我设置 content/config.ts"）
3. 在聊天中回答 AI 的问题
4. AI 写入 content/config.ts 和初始分类骨架
```

AI 询问 8 个方面并生成完整配置：

| 方面 | 问题 | 输出 |
|---|---|---|
| 身份 | 店铺名称、标语风格 | `name`、`tagline` |
| 位置 | 自由描述的地点 → AI 查找经纬度 | `location.*` |
| 物品类型 | 打算卖什么？ | 分类 `_category.json` 文件 |
| 联系方式 | 哪些平台 + 用户名 | `contact.platforms[]` |
| 定价 | 一口价还是可议；货币 | `currency`、卖家备注 |
| 距离档位 | 校园本地 / 全城 / 仅自提 | item.json 档位的参考 |
| 视觉风格 | 背景 + 卡片效果 | `ui.background`、`ui.itemCard` |
| 语言 | 语区选择；设置 `defaultLocale` + `availableLocales` | `i18n.defaultLocale`、`i18n.availableLocales` |

AI 读取卖家的写作风格并建议匹配的标语（示例：随意风格用 "Good stuff finding new homes 📦"；极简风格用 "Pre-owned. Priced fairly."）。卖家可接受或改写。

**重新运行：** 卖家可以说"只更新配置里的联系信息"或"换个背景效果"——AI 读取现有 `content/config.ts`，做有针对性的更改，其余保持原样。

---

### 技能 3 — 物品翻译器

**调用：** Claude Code 中的 `/translate-items`，或描述任务："将我的物品列表翻译成中文。"

**卖家做什么：**
```
1. 在 siteConfig.i18n.availableLocales 中添加目标语区（如 ["en", "zh"]）
2. 在项目目录中打开 Claude Code（或类似 AI 工具）
3. 输入：/translate-items（或"把我的物品翻译成 zh"）
4. AI 扫描 content/items/ 中缺少翻译的内容
5. 审阅每件物品显示的翻译建议
6. 确认 → AI 将 name_zh / description_zh 写入每个 item.json
```

**触发条件**

当以下任一条件为真时，技能处理该物品：
- `item.json` 中 `name_{locale}` 字段缺失或为空字符串
- `description_{locale}` 字段缺失或为空字符串
- 卖家明确指定某个文件夹："只翻译 electronics/iphone-14 这件物品"
- 卖家给出范围："翻译所有缺少中文的物品" / "仅 houseware 分类"

**AI 翻译的内容**

| 字段 | 是否翻译？ | 说明 |
|---|---|---|
| `name` → `name_{locale}` | **是** | 产品名称；型号、品牌名、尺寸数值原样保留 |
| `description` → `description_{locale}` | **是** | 完整保留 Markdown；行内代码、URL、型号字符串不翻译 |
| `brand`、`model`、`color` | 否 | 技术性字符串——与语区无关 |
| `tags` | 否 | 用于 fuse.js 搜索；为一致性保留英文 |
| `course`、`isbn`、`edition` | 否 | 学术标识符——与语区无关 |
| 价格字段、日期、状态 | 否 | 从不作为翻译内容 |

**手动覆盖**

卖家也可以不使用技能，直接在 `item.json` 中输入翻译：
```jsonc
{
  "name": "IKEA Desk Lamp",
  "name_zh": "宜家台灯",
  "description": "Works perfectly. Minor scratch on base.",
  "description_zh": "功能完好，底座有轻微划痕。"
}
```
AI 技能与手动编辑完全兼容——技能会跳过已有非空翻译的字段。

**交互确认流程**

```
AI: 🌐 Translating 3 items into zh...

  content/items/houseware/ikea-desk-lamp/item.json
  ┌──────────────────────────────────────────────────┐
  │ name_zh:        "宜家 TRÅDFRI 台灯"               │
  │ description_zh: "工作正常，两年前购入。底座轻微划痕。" │
  └──────────────────────────────────────────────────┘
  [C] Confirm  [E] Edit  [S] Skip  [Q] Quit all

  content/items/electronics/iphone-14-pro/item.json
  ┌──────────────────────────────────────────────────┐
  │ name_zh:        "iPhone 14 Pro 深空黑 256GB"      │
  │ description_zh: "成色良好，屏幕无划痕，含原装充电器。" │
  └──────────────────────────────────────────────────┘
  [C] Confirm  [E] Edit  [S] Skip  [Q] Quit all
```

AI 逐件确认，或接受批量确认（"不再询问，翻译其余所有物品"）。

**语区范围**

卖家在调用时指定目标语区。无歧义时技能从 `siteConfig.i18n.availableLocales` 推断（例如 `availableLocales: ["en", "zh"]` 时以 `zh` 为目标）。有三个或更多语区时，AI 会询问以哪个语区为目标。

**`content/` 规则——维持**

翻译技能仅写入 `content/items/*/item.json`。它读取 `content/config.ts` 获取语区配置但不修改。不接触任何应用代码。

---

### 技能文件格式

每个技能文件都是存储在 `.claude/commands/` 中的 Markdown 文档，包含：
1. **触发描述** —— 技能做什么（显示在 Claude Code 的技能列表中）
2. **上下文** —— 与任务相关的项目结构摘要
3. **分步指令** —— AI 应执行的确切步骤
4. **Schema 参考** —— 完整的 `item.json` 字段列表与 `content/config.ts` 结构
5. **输出规范** —— 写入哪些文件、以什么格式
6. **示例** —— 输入 → 输出示例对

技能文件人类可读。卖家在文本编辑器中打开即可理解要求 AI 做什么。它们也可以原样用作任何 AI 聊天界面（ChatGPT、Claude.ai 等）的提示词——粘贴技能文件内容并附上照片。

### 文件位置

```
.claude/
└── commands/
    ├── setup.md            ← 描述如何生成 content/config.ts
    ├── setup-shipping.md   ← 描述如何启用并配置运费计算器（§21）
    ├── translate-items.md  ← 描述如何批量翻译物品字段到其他语区
    └── update-items.md     ← 描述如何从照片生成 item.json
```

### 兼容性

| AI 工具 | 使用方式 |
|---|---|
| **Claude Code** | `/update-items`、`/setup`、`/setup-shipping` 或 `/translate-items` ——技能从 `.claude/commands/` 自动加载 |
| **Cursor** | 打开技能文件 → Cmd+L → 粘贴到聊天中，并附上照片 |
| **GitHub Copilot（聊天）** | 打开技能文件 → 粘贴为上下文 → 附上照片 |
| **Claude.ai** | 粘贴技能文件内容 + 上传照片 → 要求 AI 按指令操作 |
| **任何有能力的 AI** | 粘贴技能文件 + 描述需求；指令是自包含的 |

### `content/` 规则——维持

四个技能都指示 AI 只写入 `content/config.ts`、`content/items/*/item.json` 和 `content/items/*/_category.json`（翻译器只触碰 `item.json` 的语区字段；`setup-shipping` 只写入 `content/config.ts` 的 `shipping` 块以及可选的物品 `weight`/`dimensions`/`shipping_payer` 字段——见 §21）。不接触任何应用代码。AI 被明确指示不要修改 `content/` 之外的任何文件。

---

## 21. 运费计算器集成（可选）

> 实现 `docs/FEATURES_ROADMAP.md` §4.3 中描述的 v3 路线图项目。

### 概述

默认情况下，开放式"邮寄"价格档位（`miles_max` 缺失的档位——见 §17）显示卖家在
`item.json` 中手填的固定金额。本节新增一个**可选**的实时运费估算功能，数据来源
为承运商运费聚合服务（Shippo 或 EasyPost），基于买家的邮递区号（ZIP code）和物品
的 `weight`/`dimensions` 计算。

该功能**默认关闭**，对未配置的站点**零影响**：`siteConfig.shipping` 为
`undefined`，`ShippingEstimator` 渲染为 `null`，不发送任何网络请求。

### 为何需要 Cloudflare Worker

UsedExchange 是完全静态导出的站点，没有服务器，CI 中也不持有任何凭证（§3「部署
模式」）。承运商运费 API（Shippo、EasyPost）需要密钥，该密钥**绝不能**进入浏览器
打包文件。解决方案是一个独立部署的小型 **Cloudflare Worker** ——
`workers/shipping-rate-proxy/`——通过 `wrangler secret` 持有密钥，并暴露一个受
CORS 限制的 POST 端点。卖家已经为 R2 图床注册了 Cloudflare 账号（§3「图片存储架
构」），因此这复用了现有基础设施，而非引入新的服务商。

### 架构

```
买家在物品详情页的 ShippingEstimator 中输入 ZIP code
   │
   ▼
useShippingRate()（components/pricing/useShippingRate.ts，client）
   │  POST { destinationZip, destinationCountry, weight, dimensions, currency }
   ▼
Cloudflare Worker — workers/shipping-rate-proxy/
   │  以 wrangler secret 持有 SHIPPO_API_KEY / EASYPOST_API_KEY
   │  调用 Shippo 或 EasyPost Rates API；返回最便宜的费率
   ▼
{ amount, currency, carrier, service, estimatedDays }
   │
   ▼
ShippingEstimator 显示估算结果（payer = "buyer"）
   或显示"免运费（卖家负担）"（payer = "seller"）
```

`resolveItemPrice()`（§17，`lib/utils/pricing.ts`）**保持不变**——运费估算是
附加的展示元素，不会修改已解析档位的价格。

### 配置 — `siteConfig.shipping`

```ts
shipping?: {
  enabled: boolean;
  proxyUrl: string;               // Cloudflare Worker URL
  defaultPayer: "seller" | "buyer";
  origin: { zip: string; country: string }; // ISO 3166-1 alpha-2
};
```

不设置或 `enabled: false` → 功能完全不生效。完整模板见 §13（默认注释掉）。

### 单件物品覆盖 — `price.shipping_payer`

```jsonc
"price": {
  "tiers": [ /* ... */ ],
  "shipping_payer": "buyer" // "seller" | "buyer"，可选
}
```

为单件物品覆盖 `siteConfig.shipping.defaultPayer`——例如卖家通常承担运费，但希望
某件较重/超大的物品改为买家承担运费。

### 显示条件——估算器何时出现

`canEstimateShipping()`（`lib/utils/shipping.ts`）要求**同时满足**：

1. `siteConfig.shipping.enabled === true`
2. 该物品同时设置了 `weight` 和 `dimensions`
3. 买家的**已解析价格档位**是开放式的"邮寄"档位（`miles_max` 缺失——与 §17 约定一致）

自提档位永远不受影响。

### 按付款方显示

| `resolveShippingPayer()` 结果 | 买家看到的内容 |
|---|---|
| `"buyer"` | ZIP 输入框 + 实时估算："+ $12.50 shipping (USPS Priority Mail, ~2d)" |
| `"seller"` | 静态文字："免运费（卖家负担）"——无 ZIP 输入框，不暴露具体费率 |

### 隐私与优雅降级

- 买家的 ZIP code 仅存在于 `ShippingEstimator` 的组件 state 中——绝不写入
  `localStorage`、cookie 或任何持久化存储。与访客地理位置（§17「隐私保证」）的
  保证一致。
- 若 Worker 不可达、配置错误或未返回任何费率，`useShippingRate` 会解析为
  `{ status: "error" }`，`ShippingEstimator` 显示 `t.shippingUnavailable`
  （"无法取得运费估算"）——页面其余部分不受影响。

### 部署

完整设置流程见
[`workers/shipping-rate-proxy/README.md`](../workers/shipping-rate-proxy/README.md)
（获取 API 密钥、配置 `wrangler.toml`、`wrangler secret put`、`wrangler deploy`），
或运行 `/setup-shipping` 获取对话式引导。

### 新增 i18n 字符串

新增 6 个 `UIStrings` key（加入定价表相关分组）：
`shippingEstimateLabel`、`shippingZipPlaceholder`、`shippingCalculating`、
`shippingUnavailable`、`shippingIncludedBySeller`、`shippingEstimateSuffix`。

---

## 22. Seller Studio、导出与模板更新（指引）

> 本规范早于这些功能编写；此处不重写规范，而是指向权威细节。完整架构与数据流见
> [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)，当前功能清单见
> [`docs/CURRENT_FUNCTIONALITY.md`](CURRENT_FUNCTIONALITY.md)。三者均已在生产交付。

### Seller Studio（`pnpm studio`，第 18 阶段）
一个**仅本地**的浏览器 GUI，无需编辑 JSON 即可管理 `content/`。运行 `pnpm studio`
（可选 `--port <n>`，默认 `5174`）。
- 仅绑定 **127.0.0.1** —— 绝不暴露到网络。
- 只编辑 `content/items/**` 与 `lib/generated/image-manifest.json`。它从不读取、写入或
  渲染私有的 `reserved_for` 字段（Iron Rule 1 与 4）。
- 物品编辑使用保留注释的 JSONC 写入（`scripts/lib/itemEdit.ts`），因此卖家的格式与
  `// options:` 注释得以保留；严格字段语法由 `scripts/lib/itemFields.ts` 强制执行。
- 其 git **发布**只暂存 `content/` + `lib/generated/image-manifest.json`（与 `pnpm push`
  一致），**绝不**使用 `git add -A`，因此 `.env.local`（CDN 凭证）绝不会被误提交。
- 物品创建使用与 `pnpm create-item` 相同的 36 字段模板；内置照片上传/排序/删除与
  CDN 同步（SSE 进度）。
- 商品默认值存放在稀疏的 `_defaults.json` 文件中：全站级为 `content/items/_defaults.json`，
  分类级为 `content/items/<category>/_defaults.json`，在 Defaults 面板中管理，建 item 时按
  "模板 ← 全站 ← 分类" 叠加，最后强制重新写入 `name`/`listed_date`/`status`。
  `pnpm create-item` 走同一套合并逻辑（`scripts/lib/itemDefaults.ts`）；
  `reserved_for` 和逐 item 字段会被拒绝写入。
- 价格档位同样可以设为默认值：Defaults 面板带有 **Price tiers** 区块（一个启用复选框加上与
  物品编辑表单相同的档位编辑器）。保存的档位写入该作用域 `_defaults.json` 的 `price.tiers`，
  建 item 时整体替换模板中的档位——完整层级为 `siteConfig.content.defaultPriceTiers`
  （或内置的三档模板）← 站点级默认值 ← 分类级默认值。
- 批量操作 **Apply default tiers**（选择工具栏，`POST /api/items/bulk-apply-tiers`）会把每个
  选中物品的 `price.tiers` 覆写为该物品所属分类合并后的默认值。无默认档位、或档位已一致的
  物品会被跳过并提示；失败按物品报告、不会中断整批；只写入 `price.tiers`。

### Seller Studio i18n —— 界面跟随语言切换器
工作台的界面元素（按钮、标签、页签、状态、筛选栏、编辑表单、配置面板、就绪清单等）
与顶栏语言切换器使用同一个 `displayLocale` —— 一次切换同时驱动商品内容语言与界面语言。
- **混合词典：** 模板在 `studio/src/i18n/` 内置词典（`strings.en.ts` 是完整的权威来源，
  涵盖工作台可能渲染的全部文案；`strings.zh.ts` 是内置中文覆盖，缺失的键回退英文）。
  卖家可选通过 `content/config.ts` 的 `siteConfig.studio.translations`（一个
  `语言 → 键 → 文案` 的映射）按语言覆盖个别键。该字段为 TypeScript 可选、读取时用
  `?? {}`（Iron Rule 8）；作为纯覆盖项，它有意不出现在上游 `content/config.ts` 中，
  也不登记进 `scripts/lib/configDefaults.ts`。
- **语言来源：** 切换器提供站点自身的 `siteConfig.i18n.availableLocales`，仅在配置了
  多种语言时渲染。卖家覆盖随 `GET /api/items` 响应体（`studioTranslations`）下发到客户端。
- **Context provider + hook：** `StudioI18nProvider`（React Context）以当前语言与覆盖项
  包裹整个应用；每个面板调用 `useStudioT()` → `{ t, locale }`。`t(key, params?)` 以 EN
  词典定类型（`StudioKey = keyof typeof EN`），键名写错会在编译期报错。
- **合并顺序**（优先级从高到低）：当前语言的卖家覆盖 → 当前语言的内置词典 → 内置英文，
  由 `resolveStudioStrings()` 在每次切换语言时解析一次。
- **键名命名空间：** 扁平的点分隔键，按组件分组 —— `app.*`、`header.*`、`sync.*`、
  `gettingStarted.*`、`filter.status.*` / `filter.*`、`bulk.*`、`publish.*`、`itemList.*`、
  `newItem.*`、`drawer.*`、`editForm.*`、`field.*` / `fieldGroup.*` / `fieldValue.*` /
  `editFormProblem.*`、`configPane.*`、`defaults.*`、`imagePane.*`、`tierEditor.*`、
  `statusBadge.*`、`emptyState.*`、`readiness.*`、`localeSwitcher.*`、`themeToggle.*`、
  `common.*`。
- **带参数字符串：** 动态值使用 `{param}` 插值（如 `"{count} selected"`）。英文复数通过
  `{plural}` 词元实现：计数 ≠ 1 时展开为 `"s"`，等于 1 时为空串；其他语言整体覆盖模板
  字符串（忽略 `{plural}`），语法不受限制。
- **就绪清单本地化：** `/api/readiness` 返回的每个 `ReadinessItem`
  （`scripts/lib/siteReadiness.ts`，与 `pnpm doctor` 共用）保留英文 `title`/`detail`
  表述作为回退，并额外携带可选的结构化 `params` 字段（`{ variant, …values }`）。
  客户端按 `readiness.<id>.<variant>` 取词典中的模板并插入 `params`；当前语言没有对应
  键时回退英文 `detail`。该改动是纯增量的 —— `pnpm doctor` 直接读 `title`/`detail`，
  不受影响。
- 底层 `StudioError` 消息与自动解析的配置字段说明按设计保持英文。

### Facebook Marketplace 导出（`pnpm fb-export`，第 17 阶段）
交互式 CLI，将 available/pending/reserved 物品导出为 Facebook Marketplace 批量上传 CSV
（每批 50 件、标题 ≤150 字符、≤10 个 photo 列、使用 CDN URL）。支持跳过上次已导出、
按分类/手动选择，以及价格档位策略（最低 / 最高 / 自提 / 邮寄）。写入 `exports/`
（gitignore），其中 `.export-history.json` 用于去重。

### 模板更新与配置迁移（`pnpm update-site`、`pnpm migrate-config`）
`pnpm update-site [tag]` 将上游模板的某个版本拉入本仓库，**不触碰 `content/`**
（卖家数据绝不被覆盖），恢复已提交的 `image-manifest.json`（Iron Rule 5），迁移
`content/config.ts`，校验并提交。新配置字段以 **TypeScript 可选、带运行时 `??` 默认值**
的方式添加，并登记在 `scripts/lib/configDefaults.ts`，使 `migrate-config` 能将其拼接进
旧配置——即 §13 所述的向后兼容契约。详见 `docs/UPDATE_GUIDE.md`。
