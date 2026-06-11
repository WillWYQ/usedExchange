# UsedExchange — 当前功能（v1）

**基于：** DESIGN.md v0.9.1 · TECH_REQUIREMENTS.md v0.9.1 · IMPLEMENTATION_PLAN.md v1.4  
**日期：** 2026-06-03  
**状态：** 已实现——本文档描述的是 v1 的线上功能。

---

## 目标用户

### 主要用户——有 CS 背景的大学生
熟悉 git、终端和 JSON。希望在校园周边拥有一个精致的个人店铺来出售物品。运行 `pnpm upload-images` 和 `pnpm push` 毫无障碍。

**典型物品：** 教材、GPU、键盘、显示器、家具、自行车  
**典型联系方式：** Discord、Instagram、Venmo、Zelle、微信  
**出售节奏：** 学期末清仓（五月和十二月）

### 潜在用户——愿意尝试的非 CS 用户
由 CS 学生朋友一次性帮助设置。之后只需操作 `content/` 文件夹内的文件。CLI 工具（`pnpm mark-sold`、`pnpm create-item`）无需手动编辑 JSON。

---

## 内容管理

### `content/` 文件夹——卖家唯一需要操作的文件夹
卖家管理的所有内容都在 `content/` 内。日常操作无需打开应用代码。

```
content/
├── config.ts           ← 所有站点设置
├── items/
│   ├── <分类>/
│   │   ├── _category.json      ← 可选：显示名称、图标、排序顺序
│   │   └── <物品>/
│   │       ├── item.json       ← 每件物品唯一必需文件
│   │       ├── cover.jpg       ← 固定缩略图（可选命名约定）
│   │       └── photo1.jpg      ← 附加图库图片
└── contact/
    ├── wechat-qr.png           ← 联系平台二维码图片
    ├── zelle-qr.png
    └── venmo-qr.png
```

### 物品元数据（`item.json`）——所有字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `name` | 字符串（**必填**） | 显示名称 |
| `description` | Markdown 字符串 | 完整描述（支持 GFM） |
| `condition` | 枚举 | `new` / `like-new` / `good` / `fair` / `for-parts` |
| `brand` | 字符串 | 品牌/制造商 |
| `model` | 字符串 | 型号 |
| `age_years` | 数字 | 大致使用年限 |
| `dimensions` | 对象 | 长 × 宽 × 高，单位 cm 或 in |
| `weight` | 对象 | 数值 + 单位（kg 或 lb） |
| `color` | 字符串 | 主要颜色 |
| `quantity` | 整数 | 可用数量（> 1 时显示徽章） |
| `original_source` | 字符串 | 原始购买渠道 |
| `original_link` | URL | 原始商品链接 |
| `original_price` | 数字 | 卖家当初支付的价格 |
| `status` | 枚举 | `available` / `pending` / `reserved` / `sold` / `draft` |
| `listed_date` | 仅日期 YYYY-MM-DD | 上架日期；默认为构建日期 |
| `sold_date` | 仅日期 YYYY-MM-DD | 售出日期；用于保留期计算 |
| `reserved_for` | 字符串 | 买家姓名——**永不在页面上渲染** |
| `preferred_payment` | 字符串[] | 如 `["Venmo", "Zelle", "Cash"]` |
| `contact_note` | 字符串 | 物品专属联系说明 |
| `tags` | 字符串[] | 可搜索标签；在详情页显示为标签片 |
| `category_override` | 字符串 | 仅用于显示的分类标签覆盖 |
| `meta_description` | 字符串 | SEO；为空时从描述自动生成 |
| `no_lowball` | 布尔值 | 显示"价格不议"徽章 |
| `price_reduced` | 布尔值 | 显示"已降价"标签 |
| `previous_lowest_price` | 数字 | `price_reduced` 时显示删除线原价 |
| `min_acceptable_offer` | 数字 | 设置后 + `negotiable: true` 时启用"出价"按钮 |
| `stripe_payment_link` | URL | 显示"支付定金"按钮 |
| `venmo_payment_request` | URL | Venmo 付款请求链接→显示"通过 Venmo 支付"按钮 |
| `pickup_windows` | 字符串[] | 如 `["工作日晚间", "周六 10am–2pm"]` |
| `youtube_link` | URL | 演示视频；显示"观看演示"按钮 |
| `isbn` | 字符串 | 教材 ISBN；启用"比价"链接 |
| `course` | 字符串 | 如 "CS101"——显示为徽章，可搜索 |
| `edition` | 字符串 | 如 "第3版" |
| `semester_listed` | 字符串 | 如 "Spring 2026" |
| `name_zh` | 字符串 | 中文名称；访客选择 `zh` 语言时显示 |
| `description_zh` | 字符串 | 中文描述（同上条件） |
| `price` | 对象 | 距离分段定价（见定价部分） |

除 `name` 外所有字段均为可选；缺省时应用安全默认值。

---

## 定价系统

### 距离分段定价
每件物品可设置多个价格档位，每档可设置可选的距离范围。访客距离决定显示哪个档位。

```jsonc
"price": {
  "currency": "USD",
  "tiers": [
    { "label": "自提", "miles_max": 5,  "amount": 15 },
    { "label": "附近", "miles_min": 5,  "miles_max": 15, "amount": 20 },
    { "label": "邮寄", "miles_min": 30, "amount": 35 }
  ],
  "negotiable": true   // 价格后添加 "可议"
}
```

### 自动访客定位
1. 页面加载时浏览器请求定位权限
2. **已授权** → 在客户端用 haversine 公式计算距离 → 显示匹配档位
3. **已拒绝** → 显示最高价格档位作为回退
4. 访客可随时输入自定义距离覆盖

访客坐标不会离开浏览器。卖家坐标在静态包中（有意公开——如介意隐私可使用地标）。

### 价格显示
- **物品卡片：** 仅显示解析后的档位价格；不可展开
- **物品详情：** 默认显示解析后的档位 → "查看所有档位"开关展开完整列表
- **静态 HTML：** 始终显示最高档位（JS 加载前不会留空）
- **待定状态：** 显示回退（最高）价格——卡片级别无加载占位符

---

## 照片图库与图片存储

照片**不提交到 git**（避免超过 Vercel 100 MB 部署限制）。通过 `pnpm upload-images` 上传到云端 CDN。

### 三种存储提供商
| `imageStorage.provider` | 适用场景 | 所需配置 |
|---|---|---|
| `"cloudflare-r2"` *（推荐）* | GitHub Pages、任意静态主机——零出站费用 | `.env.local` 中设置 5 个环境变量（仅本地） |
| `"vercel-blob"` | Vercel 部署 | 一个环境变量（`BLOB_READ_WRITE_TOKEN`） |
| `"local"` | 本地开发/自托管 | 无 |

### 照片质量警告
`pnpm upload-images` 期间会打印建议性警告（不阻断上传）：
- 图片宽度 < 800px（可能模糊）
- 图片 > 8 MB（不必要地大）
- 物品文件夹中没有名为 `cover.*` 的图片
- 物品文件夹中完全没有图片

---

## 页面

### 全局——所有页面
- **SiteHeader** — 站点名称/Logo + 全文搜索栏（当 `siteConfig.search.enabled` 时）
- **SiteFooter** — 联系平台按钮、最后构建时间戳

### 首页（`/`）
- **Hero** — 站点名称、标语、CTA 按钮
- **分类网格** — 可见分类的卡片；每个分类的可用物品数量
- **最近上架** — 最近 N 件 `available` 状态物品，显示定位解析价格；地理解析后静默更新价格；为空时隐藏该区块
- **最近浏览** — 最近浏览的 5 件物品横向滚动条（sessionStorage）；为空时隐藏

### 分类页（`/[category]`）
- 定位价格栏——检测到的距离 + "修改距离"覆盖
- **筛选栏** — 成色标签 + 价格范围滑块 + 状态切换
- **排序选择** — 价格低/高 · 上架日期 · 成色
- **"浏览全部"链接** — 导航到 `/all`
- 物品网格，显示定位解析价格

### 物品详情页（`/[category]/[item]`）
- **面包屑** — 首页 → 分类 → 物品名称
- **照片图库**（通过 `ui.gallery` 槽位配置）
- **新鲜度标签** — "上架 3 天前"
- **状态 + 成色徽章** — 成色徽章带 `?` 工具提示解释每个值
- **数量徽章** — 数量 > 1 时显示"3 件在售"
- **价格信号** — "已降价"标签；"价格不议"徽章；删除线原价
- **名称 + 描述**（Markdown 渲染）
- **教材区块**（存在 `isbn`/`course` 时）— 课程徽章、比价链接、版本、学期
- **YouTube 演示** — 设置 `youtube_link` 时显示"观看演示"按钮
- **取货时段** — `pickup_windows` 非空时显示
- **定价区块** — 解析档位 + 切换 + "出价"按钮 + Stripe"支付定金"按钮 + "通过 Venmo 支付"按钮
- **元数据表** — 品牌、型号、尺寸、重量、原始来源/价格
- **联系区块** — 平台按钮含预填消息、付款方式、联系说明
- **标签** — 不可交互的标签片（可通过搜索找到）
- **分享按钮** — 移动端原生分享；桌面端复制链接
- **JSON-LD** — Product schema + BreadcrumbList，用于 SEO 富摘要
- **已售状态** — 顶部"已售"横幅；联系 CTA 禁用；显示售出日期

### 浏览全部页（`/all`）
所有分类的非草稿物品汇聚在一个可滚动网格中：默认显示 `available` 物品；`reserved` 和 `pending` 带状态徽章显示；`sold` 默认隐藏，状态切换后可见。完整筛选 + 排序栏，与分类页相同。

### 已售物品档案（`/sold`）
所有已售物品，不受保留期限制；按售出日期降序排列。证明交易历史。无价格或联系方式。

### 404 页面
站点头部 + "页面未找到" + 返回首页链接。

---

## 联系系统

### 支持的平台

**链接式**（存在物品上下文时预填消息）：
| 平台 | URL |
|---|---|
| Discord | `https://discord.com/users/{id}`（私信）或 `https://discord.gg/{invite}`（服务器） |
| Email | `mailto:{address}?subject=...&body=...`（预填） |
| WhatsApp | `https://wa.me/{number}?text=...`（预填） |
| Venmo | `https://venmo.com/u/{username}?txn=pay&note={item}`（预填） |
| Facebook | `https://facebook.com/{username}` |
| Instagram | `https://instagram.com/{handle}` |
| Snapchat | `https://snapchat.com/add/{username}` |
| Twitter/X | `https://x.com/{handle}` |
| TikTok | `https://tiktok.com/{handle}` |
| LinkedIn | `https://linkedin.com/{path}` |
| YouTube | `https://youtube.com/{channel}` |

**二维码弹窗式**（无公开个人主页链接）：
| 平台 | 说明 |
|---|---|
| Zelle | 仅二维码——无个人主页链接；从银行 App 生成 |
| Venmo | 可选二维码替代个人主页链接 |
| 微信 | 仅二维码 |
| LINE | 仅二维码 |

### 显示行为
- `reveal_behavior: "click"` — 隐藏在"显示联系方式"切换后（默认）
- `reveal_behavior: "always"` — 始终可见

---

## AI 辅助内容生成

三个 AI 辅助工作流以 **Claude Code 技能文件**形式提供，存放在 `.claude/skills/`。卖家使用已有的任何 AI 编程工具——Claude Code、Cursor、GitHub Copilot 或任何有能力的助手。**无需额外 API 密钥、环境变量或软件包。**

### 技能 1 — 物品 JSON 生成器（`/update-items`）

将照片放入物品文件夹（可选加一个描述文件），然后在 AI 工具中调用此技能。

```
1. 创建 content/items/<分类>/<物品名称>/
2. 将照片放入文件夹（cover.jpg、photo1.jpg……）
3. 可选添加描述文件（notes.txt、info.yaml 等）
4. 在项目中打开 Claude Code（或类似 AI 工具）
5. 输入：/update-items（或用自然语言描述任务）
6. 在聊天中审阅 AI 提议的 item.json 预览
7. 确认 → AI 写入 item.json（状态始终为 "draft"，直到卖家修改）
8. pnpm upload-images    ← 照常将照片上传到 CDN
```

**触发条件：** 文件夹有照片但没有 `item.json`；`item.json` 存在且 `status: "draft"`；或描述文件比现有 `item.json` 更新。

### 技能 2 — 站点设置向导（`/setup`）

**首次**项目设置时运行。

```
1. 在项目目录中打开 Claude Code（或类似 AI 工具）
2. 输入：/setup（或"帮我设置 content/config.ts"）
3. 在聊天中回答 AI 的问题
4. AI 写入 content/config.ts 和初始分类骨架
```

AI 会询问 8 个方面：店铺名称、位置（从描述解析经纬度）、出售物品类型（创建 `_category.json` 骨架）、联系平台、定价风格、视觉偏好、语言/语区。检测卖家个性并自动生成匹配的标语。

### 技能 3 — 物品翻译器（`/translate-items`）

批量将物品列表翻译成其他语言。在 `siteConfig.i18n.availableLocales` 中添加语区后调用此技能。

```
1. 将目标语区代码加入 siteConfig.i18n.availableLocales（如 ["en", "zh"]）
2. 在 content/config.ts 中添加 translations.{locale} 块，翻译全部 71 个 UI 字符串键
3. 在项目目录中打开 Claude Code（或类似 AI 工具）
4. 输入：/translate-items（或"将我的物品翻译成中文"）
5. 审阅 AI 为每件物品显示的翻译建议
6. 确认 → AI 将 name_{locale} / description_{locale} 写入每个 item.json
```

注意：`/translate-items` 仅处理物品级别的 `name_{locale}` / `description_{locale}` 字段——UI 字符串（按钮、徽章、标题等）的翻译需要手动填写 `translations.{locale}` 块，或通过 `/setup` 重新配置。

### 无需 API 密钥

所有三个技能都是 Markdown 指令文件，不是代码。AI 工具使用其内置能力和用户的现有订阅——无需 `ANTHROPIC_API_KEY`，无需额外软件包，无需新环境变量。三个技能只写入 `content/`。

---

## 多语言（语区切换）

访客可用多种语言浏览列表，并可随时切换。

- **对访客：** 配置了多个语区时，站点头部会出现语言切换器（`LocaleSwitcher`）。切换语言会立即更新物品名称、描述以及所有 UI 标签（按钮、徽章、标题）——无需刷新页面。所选语言保存在浏览器 `localStorage` 中，跨页面和跨访问持久有效。
- **对卖家：** 添加新语言需要两步：
  1. 将语区代码加入 `siteConfig.i18n.availableLocales`（如 `["en", "zh"]`），**并**在 `content/config.ts` 中添加包含全部 71 个 UI 字符串键（已翻译）的 `translations.{locale}` 块。该块缺失或不完整时构建将失败。
  2. 为每件物品填写 `name_zh` / `description_zh`——手动填写或使用 `/translate-items` AI 技能。
- **优雅回退：** 没有翻译的物品显示默认语言——不会留空或报错。任何缺失的 UI 字符串键回退到内置英文默认值。
- **单次部署：** 所有语言在同一次构建中发布；没有独立的多语言站点。
- **保留默认语言的内容：** 页面 `<title>`、社交分享（OG）标签和搜索引擎结构化数据以 `defaultLocale` 渲染——爬虫索引的是这个版本。页面内切换是阅读便利功能；多语言 URL 是未来增强。

只配置一个语区时，切换器隐藏，站点行为与单语言构建完全相同。

---

## 全文搜索

在编译时使用 `fuse.js` 构建。搜索范围：名称、描述、品牌、型号、标签、课程、ISBN、版本。通过 `siteConfig.search.enabled: true` 启用。搜索栏位于 `SiteHeader`，用户输入时实时显示结果。

---

## 卖家 CLI 工具

脚本在卖家机器上运行。所有命令只写入 `content/`。

| 命令 | 功能 |
|---|---|
| `pnpm upload-images` | 上传照片到 CDN，更新清单，打印备份提醒 |
| `pnpm push` | 暂存 `content/` 和清单文件、提交（默认消息）并推送 |
| `pnpm mark-sold <cat>/<name>` | 将 `status` 设为 `"sold"` 并记录 `sold_date`，无需手动编辑 JSON |
| `pnpm create-item <cat>/<name>` | 从模板创建新物品文件夹 + `item.json` |
| `pnpm new <cat>/<name>` | `create-item` 的简写 |
| `pnpm create-template [cat]` | 为某分类（或全局）创建 `_template.json` |

---

## 物品状态与可见性

| 状态 | 首页最近上架 | 首页分类卡片 | `/[category]` 页 | `/all` 页 | `/sold` 档案 | 详情页 | 备注 |
|---|---|---|---|---|---|---|---|
| `available` | 是 | 卡片可见 | 是 | 是 | 否 | 是 | |
| `reserved` | **否** | 卡片可见 | 是 + 徽章 | 是 + 徽章 | 否 | 是 | `reserved_for` 永不渲染 |
| `pending` | **否** | 卡片可见 | 是 + 徽章 | 是 + 徽章 | 否 | 是 | |
| `sold` | 否 | 卡片可见（保留期内） | 是 + 遮罩（切换） | 是（切换） | **始终** | 是（保留期内） | `soldItemRetentionDays` 后详情页不再生成 |
| `draft` | 否 | 否 | 否 | 否 | 否 | 否 | 不生成路由 |

**重要说明：** 首页最近上架区块使用 `loadAllItems()`，仅返回 `available` 状态。`reserved` 和 `pending` 物品**不**出现在该区块，但仍保持首页分类卡片可见。

---

## UI 自定义——4 个可配置槽位

在 `content/config.ts` 中设置任意选项。所有 27 个 Aceternity 组件由开发者通过 `pnpm setup-ui` 一次性安装。卖家只需修改配置值——无需编辑代码。

| 槽位 | 配置键 | 选项 |
|---|---|---|
| 背景 | `ui.background` | `"none"` + 13 个 Aceternity 背景 |
| 物品网格 | `ui.itemGrid` | `"simple"` + bento-grid、layout-grid、focus-cards |
| 图库 | `ui.gallery` | `"simple"` + apple-cards-carousel、images-slider、carousel、parallax-scroll |
| 物品卡片 | `ui.itemCard` | `"simple"` + 8 个 Aceternity 卡片效果 |

---

## 站点配置（`content/config.ts`）

| 区块 | 字段 |
|---|---|
| 身份 | `name`、`tagline`、`logo` |
| 部署 | `deploymentMode`、`baseUrl` |
| 图片存储 | `imageStorage.provider` |
| 卖家位置 | `location.lat`、`location.lng`、`location.label` |
| 内容默认值 | `currency`、`recentlyListedCount`、`soldItemRetentionDays` |
| 联系方式 | `contact.reveal_behavior`、`contact.platforms[]` |
| Hero | `hero.cta_label`、`hero.cta_href` |
| SEO | `meta.description`、`meta.twitterHandle` |
| UI 槽位 | `ui.background`、`ui.itemGrid`、`ui.gallery`、`ui.itemCard` |
| 深色模式 | 页头切换按钮（浅色/深色/跟随系统，由 `next-themes` 持久化）；`darkMode` 配置字段已废弃，不再生效 |
| 分析 | `analytics.vercel`、`analytics.speedInsights` |
| 搜索 | `search.enabled`、`search.placeholder` |
| 站点地图 | `sitemap.enabled` |
| 国际化 | `i18n.defaultLocale`、`i18n.availableLocales`、`i18n.showLocaleSwitcher`、`i18n.translations.{locale}.*`（71 个 UI 字符串键） |

---

## 构建流程

**卖家上传照片**（`pnpm upload-images`）：
照片 → CDN，更新清单，打印备份提醒，显示照片质量警告。

**CI 构建 — GitHub Actions / Vercel**（`pnpm build`）：
预构建：读取清单 + 构建搜索索引 → `next build` 生成所有页面 → 构建后生成站点地图。

**本地开发**（`pnpm dev`）：
照片本地复制 → 带热重载的开发服务器。

### 开发者脚本（运行一次）

| 脚本 | 用途 |
|---|---|
| `pnpm setup-ui` | 安装所有 27 个 Aceternity 组件 |

---

## SEO 与元数据

- 每个页面的 `<title>` 和 `<meta name="description">`
- 所有路由的 Open Graph 标签
- 物品详情页的 **JSON-LD Product schema**（Google 富摘要）
- 物品 + 分类页的 **JSON-LD BreadcrumbList**
- 物品详情页的 **Twitter card**（`summary_large_image`）
- 物品详情页的 **Pinterest 富 pin**（`og:type: "product"` + 价格元数据）
- 构建时生成 `sitemap.xml` + `robots.txt`（启用时）

---

## 深色模式

页头的太阳/月亮切换按钮（`ThemeToggle`）让访客在浅色与深色主题之间切换。默认跟随访客的操作系统/浏览器偏好（`system`），一旦访客做出明确选择，会通过 `next-themes` 以 class 方式持久化（存储于 `localStorage`）。所有 Aceternity 组件均支持深色模式。`content/config.ts` 中的 `darkMode` 字段已废弃，应用不再读取该值。

---

## 分析

- **Vercel Analytics** — 页面浏览量、流量来源、热门页面（免费、注重隐私）
- **Vercel Speed Insights** — 每页 Core Web Vitals（免费）

两者均通过 `siteConfig.analytics.*` 启用。在 Vercel 之外均为空操作。

---

## 无障碍访问

- 所有图片有 `alt` 文字（最低为物品名称）
- 所有可交互元素有 `focus-visible:ring` 焦点样式
- 正文颜色对比度 ≥ 4.5:1，大文字 ≥ 3:1
- 状态和成色徽章包含文字标签（不仅依赖颜色）
- `QRModal` 捕获焦点；关闭时恢复焦点
- 成色指南工具提示可通过键盘访问

---

## 安全与隐私

| 关切 | 缓解措施 |
|---|---|
| `reserved_for` 字段 | 任何页面上均不渲染 |
| 访客地理坐标 | 仅存于 `useState`；不发送到服务器 |
| 卖家坐标 | 在静态包中；有意公开 |
| 外部链接 | 所有链接均含 `rel="noopener noreferrer"` |
| 联系信息 | 默认点击后显示 |
| `X-Powered-By` 头 | 已抑制 |
| 卖家 CLI 工具 | 所有脚本只写入 `content/` |

---

## 技术栈

| 层次 | 选择 |
|---|---|
| 框架 | Next.js 15（App Router），完全静态 |
| 语言 | TypeScript 5（严格模式） |
| UI 组件 | Aceternity UI（27 个组件，预安装） |
| 样式 | Tailwind CSS v4 + @tailwindcss/typography |
| Schema 验证 | Zod 3 |
| Markdown | react-markdown + remark-gfm |
| 搜索 | fuse.js（客户端，构建时索引） |
| 分析 | @vercel/analytics + @vercel/speed-insights |
| 站点地图 | next-sitemap |
| 动画 | framer-motion |
| 图标 | @tabler/icons-react |
| 包管理器 | pnpm |
| 主要部署 | GitHub Pages（通过 GitHub Actions） |
| 图片 CDN | Cloudflare R2（推荐）或 Vercel Blob |
