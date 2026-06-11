# UsedExchange — 项目设计文档

**版本：** 0.9.1  
**日期：** 2026-06-01  
**状态：** 决策已解决——准备实施

---

## 1. 项目概述

UsedExchange 是一个静态生成的个人网络商店，用于列出待售的二手物品。内容完全通过本地文件系统管理——无数据库，无 CMS。卖家为每件物品添加一个文件夹，放入照片和 `item.json` 元数据文件，触发构建；站点自动重新生成。

UI 基于 [Aceternity UI](https://ui.aceternity.com)（React + Tailwind CSS）构建，提供精美的浏览体验。架构模块化，任何部分——部署目标、图片策略、联系平台——都可以在不重构代码库的情况下替换。

### 目标用户

#### 主要用户——有 CS 背景的大学生
设计目标用户。熟悉 git、终端、JSON 编辑和 git push → GitHub Pages 部署工作流（也支持 Vercel）。

**画像：**
- 出售学生生活常见物品：教材、电子产品（GPU、键盘、显示器、机械设备）、宿舍家具、自行车、游戏设备、学术软件许可证
- 在紧凑的地理范围内运营（校园 + 周边街区，通常 0–10 英里）
- 联系偏好倾向于：**Discord**（CS 社区主导平台）、Instagram、WhatsApp、微信（国际学生）、Venmo/Zelle 支付
- 出售节奏由学期驱动——主要清仓发生在每学期末（五月和十二月）
- 同网络中的价格敏感买家；口耳相传和 Discord 服务器分享是主要发现渠道
- 已为课程使用 Vercel 或 GitHub；免费 Hobby 计划自然适合
- 习惯以 `pnpm upload-images` 和 `git push` 作为工作流

#### 潜在用户——愿意尝试的非 CS 用户
项目获得知名度后可触达的更广泛受众（校园博客帖子、朋友推荐、CS 学生为父母或室友设置）。

**画像：**
- 任何想要个人、私密替代 Facebook Marketplace 或 OfferUp 的人
- 不熟悉：JSON 编辑、git 命令、终端、Vercel 仪表板
- 需要：由 CS 学生朋友一次性设置，之后只操作 `content/` 文件夹

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
- 用户认证或卖家仪表板 UI
- 服务器端地理定位或 IP 查找——访客距离完全在浏览器中计算；坐标不离开设备
- 多卖家或并发写入支持——这是**单卖家设计**

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

图片不应存放在 git 仓库或部署输出中。随着收藏增长，提交照片会使每次 `git push` 变慢。将其包含在构建输出中会使部署膨胀：100 件物品 × 5 张照片 × 2 MB = 1 GB——远超任何平台的舒适处理范围（GitHub Pages 推荐仓库 < 1 GB；Vercel Hobby 强制 100 MB 构建输出限制）。

#### 设计原则

**物品照片是仅本地源文件——不提交到 git。**

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

```jsonc
{
  // ── 身份 ──────────────────────────────────────────────────────────────────
  "name": "IKEA TRÅDFRI 台灯",          // 字符串，必填

  // ── 定价 ──────────────────────────────────────────────────────────────────
  "price": {
    "currency": "USD",
    "tiers": [
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
  "condition": "good",  // "new" | "like-new" | "good" | "fair" | "for-parts"；默认 "good"
  "brand": "IKEA",
  "model": "TRÅDFRI E14",
  "age_years": 2,
  "dimensions": { "length": 45, "width": 15, "height": 15, "unit": "cm" },
  "weight": { "value": 0.8, "unit": "kg" },
  "color": "白色",
  "quantity": 1,

  // ── 来源 ──────────────────────────────────────────────────────────────────
  "original_source": "IKEA",
  "original_link": "https://www.ikea.com/…",
  "original_price": 29.99,

  // ── 上架生命周期 ──────────────────────────────────────────────────────────
  "status": "available",  // "available" | "pending" | "reserved" | "sold" | "draft"
  "listed_date": "2026-05-25",
  "sold_date": "2026-05-28",
  "reserved_for": "",     // 买家姓名/联系方式——不在页面上渲染，保持私密

  // ── 联系偏好（物品级覆盖；站点配置是默认值）──────────────────────────────
  "preferred_payment": ["Venmo", "Cash"],
  "contact_note": "",

  // ── 分类 ──────────────────────────────────────────────────────────────────
  "tags": ["照明", "智能家居"],
  "category_override": "",  // 仅显示覆盖；不改变 URL 或物品在哪个分类页出现

  // ── SEO ───────────────────────────────────────────────────────────────────
  "meta_description": "",

  // ── 定价信号 ──────────────────────────────────────────────────────────────
  "no_lowball": false,
  "price_reduced": false,
  "previous_lowest_price": null,
  "min_acceptable_offer": null,

  // ── 付款链接 ──────────────────────────────────────────────────────────────
  "stripe_payment_link": "",
  "venmo_payment_request": "",

  // ── 物流 ──────────────────────────────────────────────────────────────────
  "pickup_windows": [],
  "youtube_link": "",

  // ── 教材专属 ──────────────────────────────────────────────────────────────
  "isbn": "",
  "course": "",
  "edition": "",
  "semester_listed": "",

  // ── 国际化 ────────────────────────────────────────────────────────────────
  "name_zh": "",
  "description_zh": ""
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
    { type: "whatsapp",  value: "+11234567890" },
    { type: "linkedin",  value: "in/your-name" },
    // ^ 个人主页用 "in/<id>"，公司主页用 "company/<id>"。
    //   只填 "your-name" 也可以，会自动当作 "in/your-name"；
    //   粘贴完整链接（如 "https://www.linkedin.com/in/your-name"）也可以。
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
| `whatsapp` | `https://wa.me/{value}`（去掉开头的 `+`） |
| `linkedin` | `https://linkedin.com/{value}` — 会保留 `/` 分隔符（不做 `%` 编码）；只填用户名时自动视为 `in/{value}` |
| `venmo`（链接） | `https://venmo.com/u/{value}` |
| `venmo`（二维码） | 打开含 `<img src={qr_image}>` 的弹窗 |
| `zelle` | 仅二维码弹窗——无公开主页 URL；需要 `qr_image` |
| `wechat` / `line` / 任何二维码类型 | 打开含 `<img src={qr_image}>` 的弹窗 |

### 预填联系消息
访客点击链接式联系按钮时，消息自动预填物品名称和**地理解析价格**，减少买家的摩擦。

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
       OR (effective_sold_date === null)           // 无可解析日期 → 始终保留
       OR (today − effective_sold_date ≤ soldItemRetentionDays)
```

过了保留期的物品完全从所有页面和 `generateStaticParams` 中排除——其详情页不再生成。

---

## 9. URL 结构

```
/                              首页——分类概览 + 最近上架
/all                           浏览全部——所有非草稿物品，跨分类（已售可切换），含筛选 + 排序
/sold                          已售档案——所有已售物品，不受保留窗口限制
/[category]                    分类页——含筛选、排序、搜索的物品网格
/[category]/[item]             物品详情——图库、定价、元数据、联系方式、分享
```

所有路由在构建时静态生成。

---

## 10. 页面规范

### 全局 — SiteHeader
站点头部出现在所有页面上，包含：站点名称/Logo、**搜索栏**（`siteConfig.search.enabled === true` 时显示）、导航链接

### 10.1 首页（`/`）
- **Hero** — 站点名称、标语、CTA 按钮
- **分类网格** — 每个可见分类一张卡片（可见 = 至少有一件 `available`/`reserved`/`pending` 物品）
- **最近上架** — 最近 N 件 `available` 物品，按 `listed_date` 降序（默认 6 件）。零件物品 → 区块隐藏
- **最近浏览** — 访客在此浏览器会话中浏览的最近 5 件物品（存储在 `sessionStorage`）；为空时隐藏
- **Footer** — 联系平台链接、最后构建时间戳、站点名称

### 10.2 分类页（`/[category]`）
- 分类标题、图标、描述
- **定位价格栏** — `📍 ~{N} 英里` 或 `📍 位置不可用` + "修改距离"覆盖
- **筛选 + 排序栏**（客户端）：成色标签（多选，默认全选）、排序选择、价格范围滑块、状态切换
- **"浏览全部"链接** — 指向 `/all` 页面的突出链接
- **物品网格** — 含定位解析价格的卡片

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
- **定价区块**（`PricingSection` 客户端组件）：`LocationPriceBar`、`PricingTable`（含"查看全部"切换）、`MakeOfferButton`、"支付定金"按钮、"通过 Venmo 支付"按钮
- **元数据表** — 品牌、型号、年龄、尺寸、重量、颜色、原始来源（链接）、原始价格
- **联系区块** — 含预填消息的平台按钮；`preferred_payment` 列表；`contact_note`
- **标签** — 不可交互标签片（通过 fuse.js 搜索可找到）
- **分享按钮** — 移动端原生分享；桌面端复制链接回退
- **JSON-LD** — `<script type="application/ld+json">`，类型 `@type: "Product"`；`BreadcrumbList`
- **已售状态** — 页面顶部"已售"横幅；联系 CTA 禁用；显示 `sold_date`

### 10.4 浏览全部页（`/all`）
一个网格中所有分类的所有非草稿物品——`available` 默认显示；`reserved`/`pending` 带状态徽章显示；`sold` 被状态切换隐藏（切换后可见）。完整筛选 + 排序栏（与分类页相同）。每张卡片有"所属：{分类}"标签片。

### 10.5 已售物品档案（`/sold`）
所有 `sold` 物品，不受保留窗口限制。按 `sold_date` 降序排列。无定价显示；无联系区块。

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
  ├── loadAllItems()                → Item[]（仅 available；首页最近上架条专用）
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
│   └── LocalizedItemContent.tsx   ← 客户端；本地化名称 <h1> + Markdown 描述
│
├── contact/
│   ├── ContactSection.tsx         ← 显示包装 + 平台列表
│   ├── PlatformButton.tsx         ← 单个平台按钮（链接或二维码触发）
│   └── QRModal.tsx                ← 含二维码图片的弹窗（客户端）
│
├── pricing/
│   ├── LocationPriceBar.tsx       ← 客户端；权限请求 + 距离显示 + 覆盖
│   ├── useGeolocation.ts          ← hook
│   └── useDistancePricing.ts      ← hook
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
│   ├── SearchBar.tsx              ← 客户端；SiteHeader 中的 fuse.js 输入
│   └── useSearch.ts
│
├── i18n/
│   ├── LocaleProvider.tsx         ← 客户端；活跃语区的 React context
│   ├── LocaleSwitcher.tsx         ← 客户端；SiteHeader 中的语区切换按钮
│   └── useLocale.ts
│
└── common/
    ├── AdaptiveImage.tsx          ← next/image vs <img> 切换
    ├── ShareButton.tsx            ← 客户端
    ├── JsonLd.tsx                 ← 服务器组件
    └── RecentlyViewed.tsx         ← 客户端；基于 sessionStorage 的最近浏览条
```

### 组件规则
- `ui/` — Aceternity 原版；通过包装扩展，绝不就地修改
- Prop 类型从 `lib/content/types.ts` 派生；不向组件传递原始 JSON 对象
- 访客坐标**绝不传出浏览器**——所有距离计算在 `useDistancePricing.ts` 中运行
- **`content/config.ts` 由客户端组件导入**，因此不得使用任何仅 Node.js API
- **UI 字符串由两种方式解析：**
  - 客户端组件（包括 `SiteHeader`、`MetadataTable`、`ConditionBadge`、`StatusBadge`、`PricingTable`、`ConditionGuide` 等所有渲染 UI 标签的组件）调用 `useT()` hook，返回当前语区的 UIStrings 字典。任何调用 `useT()` 的组件都必须标注 `"use client"`。
  - 服务器组件（`app/*/page.tsx`）调用 `getTranslations()`（来自 `lib/i18n/getTranslations.ts`），始终返回 `defaultLocale` 的字典。
- 所有其他组件是 React 服务器组件

---

## 13. 配置 — `content/config.ts`

此文件与物品和二维码位于 `content/` 内。这是卖家编辑的唯一 TypeScript 文件。

> ⚠️ **`content/config.ts` 由客户端组件导入**，因此成为浏览器包的一部分。所有字段值必须是静态、可序列化的常量。不要在模块级别使用 Node.js API。

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
  //   1. UI 字符串 — 67 个按钮/标签/徽章文本，在 translations.{locale} 中定义
  //   2. 物品内容 — 各 item.json 中的 name_{locale} / description_{locale}；
  //                 运行 /translate-items 批量填充
  //
  // 如果某语区在 availableLocales 中但 translations 条目缺失或键不完整，
  // 构建将失败（check-config）。
  i18n: {
    defaultLocale: "en",
    availableLocales: ["en"],
    showLocaleSwitcher: true,
    translations: {
      en: {
        // ── 导航 ──────────────────────────────────────────────────────────
        home: "Home",
        about: "About",
        browseAll: "Browse All",
        // ── 板块标题 ────────────────────────────────────────────────────────
        recentlyListed: "Recently Listed",
        recentlyViewed: "Recently Viewed",
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
      },
      // 启用中文时，取消注释并翻译全部 67 个键，并将 "zh" 加入 availableLocales：
      // zh: { home: "首頁", about: "關於", browseAll: "瀏覽全部", ... },
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

── 添加新物品（放入新照片时运行）────────────────────────────────────────
将照片放入 content/items/<category>/<item-name>/
添加可选描述文件（notes.txt、info.yaml 等）
在项目目录中打开 AI 编程工具
  /update-items（或"为我的新物品生成 item.json"）
  AI 读取照片 + 描述 → 生成每个文件夹的 item.json

── 卖家机器 ─────────────────────────────────────────────────────────────
pnpm upload-images          （添加/更改照片后运行）
  └── 扫描 content/items/**/*.{jpg,jpeg,png,webp,gif}
  └── 上传新/已更改文件到配置的提供商（R2 / Blob）
  └── 写入 lib/generated/image-manifest.json  ← 提交此文件

然后：
  git add content/**/*.json lib/generated/image-manifest.json
  git push    ← GitHub Actions 触发构建 + 部署

── CI 构建（GitHub Actions / Vercel）────────────────────────────────────
pnpm build
  ├── [prebuild]
  │     ├── scripts/sync-images.ts（build-check 模式）
  │     │     ├── content/items/ 中无图片文件（gitignore——CI runner 上不存在）
  │     │     ├── 读取已提交的 lib/generated/image-manifest.json
  │     │     └── 日志："manifest present (N entries) — skipping upload"
  │     └── scripts/build-search-index.ts → public/search-index.json
  │
  └── next build
        加载器读取清单 → 所有图片 URL 解析到 CDN
        所有非草稿、未过期物品的 generateStaticParams 运行
        所有页面渲染为静态 HTML + JSON
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
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx
│   ├── all/page.tsx
│   ├── sold/page.tsx
│   ├── [category]/page.tsx
│   ├── [category]/[item]/page.tsx
│   └── not-found.tsx
│
├── components/                    ← 见 §12
│
├── lib/
│   ├── content/（loader.ts、schema.ts、types.ts）
│   ├── images/（adapter.ts、local.ts、vercel-blob.ts、cloudflare-r2.ts）
│   ├── utils/（haversine.ts、pricing.ts、date.ts、jsonld.ts、i18n.ts）
│   ├── search/index.ts
│   ├── generated/image-manifest.json  ← ✓ git 追踪
│   ├── config/types.ts
│   └── ui/types.ts
│
├── .claude/
│   ├── CLAUDE.md
│   └── skills/
│       ├── update-items.md
│       ├── setup-wizard.md
│       └── translate-items.md
│
├── scripts/
│   ├── sync-images.ts
│   ├── build-search-index.ts
│   ├── postbuild.ts
│   ├── setup-ui.sh
│   ├── create-item.ts
│   ├── mark-sold.ts
│   └── create-template.ts
│
├── .github/workflows/deploy.yml
├── next-sitemap.config.js
├── SETUP_GUIDE.md
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
                                  如果多个开放式档位，使用数组顺序中的第一个
                                  如果无开放式档位，使用金额最高的档位
resolveDistanceMi = D         →  找第一个满足以下条件的档位：
                                    (miles_min ?? 0) ≤ D ≤ (miles_max ?? Infinity)
                                  如果没有档位匹配 D（档位之间有间隙），使用
                                    miles_max 最接近 D 且从下方接近的档位
                                  如果 price.tiers 为空 → 显示"联系询价"
```

### 价格档位显示规则

默认只显示解析后的档位。所有其他档位隐藏。

| 上下文 | 默认显示 | 可展开？ |
|---|---|---|
| 物品卡片（分类网格、首页） | 仅解析档位价格 | 否——卡片太紧凑 |
| 物品详情页定价表 | 仅解析档位行 | 仅当 `price.show_tiers` 为 `true` 时——"查看所有价格档位 ▼"折叠切换 |

`price.show_tiers` 默认为 `false`：买家只能看到解析档位行，不会得知其他档位的存在。卖家可能不希望买家比较各档位（例如看出自提比邮寄便宜很多，从而压价）。卖家可逐件物品设置 `price.show_tiers: true` 来开启切换功能。

切换功能开启后，无论定位状态如何（已授权、已拒绝或手动输入）都会显示。展开时列出所有档位，已解析档位视觉高亮（加粗或强调色）；折叠后返回单行视图。

### 隐私保证

- 访客坐标仅存于 React 组件状态（`useState`）中
- 绝不写入 `localStorage`、`sessionStorage`、cookies 或任何网络请求
- 卖家坐标（`content/config.ts`）是静态包的一部分，有意公开

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
| 添加新语区 | 向 `siteConfig.i18n.availableLocales` 添加语区；扩展 Zod schema + `Item` 类型；运行 `/translate-items` AI 技能 |
| RSS feed | 在 postbuild 中聚合 `loadItemsByCategory()` 生成 `feed.xml` |
| 卖家仪表板（本地 GUI） | 本地专用 Next.js dev 模式路由或 Electron/Tauri 应用 |
| 多卖家支持 | 需要完整架构重新设计 |

---

## 20. AI 辅助内容生成——基于技能的方法

三个 AI 辅助工作流以 **Claude Code 技能**形式提供（见 `.claude/skills/`）。卖家使用已有的任何 AI 编程工具——Claude Code、Cursor、GitHub Copilot 或任何有能力的助手。**无需额外 API 密钥、环境变量或包安装。**

### 设计原则

> 技能是**指令文件，不是代码**。它们告诉 AI 助手项目结构是什么样子、要读取哪些文件、确切应该生成什么。AI 使用其内置能力和用户的现有订阅完成工作。

### 技能 1 — 物品 JSON 生成器

**调用：** Claude Code 中的 `/update-items`，或粘贴技能文件内容到任何 AI 助手。

```
1. 创建 content/items/<category>/<item-name>/
2. 放入照片（cover.jpg、photo1.jpg……）
3. 可选添加描述文件（任意文本格式）
4. 在项目中打开 Claude Code（或类似 AI 工具）
5. 输入：/update-items
6. 审阅 AI 显示的 item.json 建议
7. 确认 → AI 将 item.json 写入文件夹
8. pnpm upload-images    ← 照常上传照片到 CDN
```

### 技能 2 — 站点设置向导

**调用：** Claude Code 中的 `/setup`，或描述任务："帮我设置我的 UsedExchange 配置文件。"

AI 询问 8 个方面并生成完整配置：身份（名称、标语）、位置（AI 查找经纬度）、物品类型（分类 `_category.json` 文件）、联系方式（平台 + 用户名）、定价、距离档位、视觉风格、语言。

### 技能 3 — 物品翻译器

**调用：** Claude Code 中的 `/translate-items`，或描述任务："将我的物品列表翻译成中文。"

```
1. 在 siteConfig.i18n.availableLocales 中添加目标语区（如 ["en", "zh"]）
2. 在项目目录中打开 Claude Code（或类似 AI 工具）
3. 输入：/translate-items
4. AI 扫描 content/items/ 中缺少翻译的 item.json
5. 审阅每件物品显示的翻译建议
6. 确认 → AI 将 name_zh / description_zh 写入每个 item.json
```

**翻译内容：**
- `name` → `name_{locale}`（是）
- `description` → `description_{locale}`（是）
- `brand`、`model`、`color`、`tags`、`course`、`isbn`、价格字段、日期、状态（否）

**`content/` 规则维持**：翻译技能仅写入 `content/items/*/item.json`。不接触任何应用代码。

### 兼容性

| AI 工具 | 使用方式 |
|---|---|
| **Claude Code** | `/update-items`、`/setup` 或 `/translate-items` ——技能从 `.claude/skills/` 自动加载 |
| **Cursor** | 打开技能文件 → Cmd+L → 粘贴到聊天中，并附上照片 |
| **GitHub Copilot（聊天）** | 打开技能文件 → 粘贴为上下文 → 附上照片 |
| **Claude.ai** | 粘贴技能文件内容 + 上传照片 → 要求 AI 按指令操作 |
| **任何有能力的 AI** | 粘贴技能文件 + 描述需求；指令是自包含的 |

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
