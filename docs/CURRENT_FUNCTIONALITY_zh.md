# UsedExchange — 当前功能（v1.1）

**基于：** DESIGN.md v0.10.0 · TECH_REQUIREMENTS.md v0.10.0 · IMPLEMENTATION_PLAN.md v1.7  
**日期：** 2026-08-02  
**状态：** 已实现——本文档描述全部线上功能：v1 核心 + Phase 16–18（运费估算、Facebook Marketplace 导出、卖家工作台）。

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
| `dimensions` | 对象 | 长 × 宽 × 高，单位 cm 或 in——展示时会换算为访客解析出的单位制（`siteConfig.measurementUnit`，可按语区覆盖） |
| `weight` | 对象 | 数值 + 单位（kg 或 lb）——展示时同样换算 |
| `color` | 字符串 | 主要颜色 |
| `quantity` | 整数 | 可用数量（> 1 时显示徽章） |
| `original_source` | 字符串 | 原始购买渠道 |
| `original_link` | URL | 原始商品链接 |
| `original_price` | 数字 | 卖家当初支付的价格 |
| `status` | 枚举 | `available` / `pending` / `reserved` / `sold` / `draft` |
| `listed_date` | 仅日期 YYYY-MM-DD | 上架日期；默认为构建日期 |
| `sold_date` | 仅日期 YYYY-MM-DD | 售出日期；用于保留期计算。也接受完整 ISO 时间戳。 |
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
| `name_zh` | 字符串 | 中文名称；访客选择 `zh` 语言时显示（SSG 渲染 `defaultLocale`） |
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

### 运费估算（可选）
默认关闭——卖家通过 `siteConfig.shipping.enabled` 开启。开启后，对于落在开放式"邮寄"档位（即没有 `miles_max` 的档位）且设置了 `weight` 和 `dimensions` 的物品，会显示实时运费估算：

- **卖家承担运费**（`siteConfig.shipping.defaultPayer: "seller"`，或单品级 `price.shipping_payer: "seller"`）→ 显示"包邮（卖家承担运费）"，无需输入。
- **买家承担运费**（默认）→ 买家输入邮编；站点调用 Cloudflare Worker 代理，由其查询 Shippo 或 EasyPost 并返回最低实时运费。

运费服务商的 API 密钥仅存于 Cloudflare Worker（`workers/shipping-rate-proxy/`），绝不出现在静态站点构建产物中。详见 [DESIGN_zh.md §21](DESIGN_zh.md) 和 `.claude/commands/setup-shipping.md`。

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

### 照片隐私——自动剥离 EXIF/GPS 元数据
每张新增或变更的 JPEG/PNG/WebP 照片在 `pnpm upload-images` 上传到 CDN 之前，都会自动通过 `sharp`（`lib/images/stripMetadata.ts`）重新编码——移除全部 EXIF/IPTC/XMP 元数据（包括 GPS 位置），同时自动旋正方向以保证显示效果不变。GIF 原样透传。`content/items/` 中的原始文件不受影响；`pnpm dev` 与 `pnpm build`（dev-sync/build-check）也不受影响。从卖家工作台同步照片到 CDN 时同样执行此剥离。

---

## 页面

### 全局——所有页面
- **SiteHeader** — 站点名称/Logo、导航链接（首页、浏览全部 `/all`、新上架 `/newly-listed`，店铺配置完成后还有"关于" `/about`）+ 全文搜索栏（当 `siteConfig.search.enabled` 时）
- **SiteFooter** — 联系平台按钮、最后构建时间戳

### 首页（`/`）
- **Hero** — 站点名称、标语、CTA 按钮
- **分类网格** — 可见分类的卡片；每个分类的可用物品数量
- **最近上架** — 最近 N 件 `available` 状态物品，显示定位解析价格；地理解析后静默更新价格；为空时隐藏该区块
- **最近浏览** — 最近浏览的 5 件物品横向滚动条（sessionStorage）；为空时隐藏
- **未配置状态：** 当 `baseUrl` 仍是占位符/演示域名时，`/` 显示项目介绍（`ProjectIntro`）而非商品目录——卖家完成配置后目录才会出现

### 分类页（`/[category]`）
- 定位价格栏——检测到的距离 + "修改距离"覆盖
- **筛选栏** — 成色标签 + 价格范围滑块（可配置离群值策略 `ui.priceFilterStrategy`：none / percentile / logarithmic / preset-buckets / iqr） + 状态切换
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
- **定价区块** — 解析档位 + 切换 + "出价"按钮 + Stripe"支付定金"按钮 + "通过 Venmo 支付"按钮（设置 `venmo_payment_request` 时）
- **元数据表** — 品牌、型号、尺寸、重量、原始来源/价格
- **联系区块** — 平台按钮含预填消息、付款方式、联系说明
- **标签** — 不可交互的标签片（可通过搜索找到）
- **分享按钮** — 移动端原生分享；桌面端复制链接
- **JSON-LD** — Product schema + BreadcrumbList，用于 SEO 富摘要
- **已售状态** — 顶部"已售"横幅；联系 CTA 禁用；显示售出日期

### 浏览全部页（`/all`）
所有分类的非草稿物品汇聚在一个可滚动网格中：默认显示 `available` 物品；`reserved` 和 `pending` 带状态徽章显示；`sold` 默认隐藏，状态切换后可见。完整筛选 + 排序栏，与分类页相同。（数据源：`loadBrowseAllPageData()`——单次遍历的加载器，可见性规则与任意分类页相同。）

### 已售物品档案（`/sold`）
所有已售物品，不受 `soldItemRetentionDays` 限制；按售出日期降序排列。证明交易历史。无价格或联系方式。网格上限为 `siteConfig.soldArchiveDisplayLimit` 条（`0` = 不限）。

### 新上架页（`/newly-listed`）
将活跃（非已售）物品分为三个标签页：**自上次访问以来**（通过浏览器 `localStorage` 跟踪；首次访问时所有当前在售物品都算新上架）、**今天**、**本周**。每个标签页显示对应数量；某个时段为空时显示"暂无新上架"提示而非空白页。由 SiteHeader 链接进入。

### 关于页（`/about`）
项目介绍（`ProjectIntro`）的固定页面，拥有独立的 SEO 元数据。卖家配置店铺之前，`/` 显示的就是这份介绍而非商品目录；配置完成后 `/` 变为目录，`/about` 让介绍仍可访问。只有店铺配置完成后，页头才会出现"关于"链接。

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
| Facebook | `https://facebook.com/{username}` — 若粘贴完整主页链接（如 `profile.php?id=...`），会自动归一化为路径，不会被重复编码 |
| Instagram | `https://instagram.com/{handle}` |
| Snapchat | `https://snapchat.com/add/{username}` |
| Twitter/X | `https://x.com/{handle}` |
| TikTok | `https://tiktok.com/{handle}` |
| LinkedIn | `https://linkedin.com/{path}` — 会保留 `/`（不做 `%` 编码）；只填用户名时自动视为 `in/{handle}` |
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

四个 AI 辅助工作流以 **Claude Code 技能文件**形式提供，存放在 `.claude/commands/`。卖家使用已有的任何 AI 编程工具——Claude Code、Cursor、GitHub Copilot 或任何有能力的助手。**无需额外 API 密钥、环境变量或软件包。**

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

**支持的描述文件格式：** `.txt`、`.md`、`.yaml`、`.json`——放在物品文件夹中与照片并列的任何文本文件。

**描述文件示例（`notes.txt`）：**
```
Bought from Best Buy 2023, used one semester.
CS101 textbook, 3rd edition. Minor pen marks.
Asking $30.
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

AI 按 8 个问题组提问：站点身份、部署（网址 + 托管方式）、图片存储提供商、位置（从描述解析经纬度）、联系平台、内容默认值（货币、最近上架数量、已售物品保留天数）、视觉偏好、语言/语区。检测卖家个性并自动生成匹配的标语。可针对单项需求重新运行（如"只更新联系信息""更换背景特效"）。

### 技能 3 — 物品翻译器（`/translate-items`）

批量将物品列表翻译成其他语言。在 `siteConfig.i18n.availableLocales` 中添加语区后调用此技能。

```
1. 将目标语区代码加入 siteConfig.i18n.availableLocales（如 ["en", "zh"]）
2. 在 content/config.ts 中添加 translations.{locale} 块，翻译全部 87 个 UI 字符串键
3. 在项目目录中打开 Claude Code（或类似 AI 工具）
4. 输入：/translate-items（或"将我的物品翻译成中文"）
5. 审阅 AI 为每件物品显示的翻译建议
6. 确认 → AI 将 name_{locale} / description_{locale} 写入每个 item.json
```

仅翻译 `name` → `name_{locale}` 和 `description` → `description_{locale}`；品牌、型号、标签、价格、日期以及所有 Markdown 语法均原样保留。已有非空翻译的物品会被跳过。只写入 `content/items/*/item.json`。

> **注意：** `/translate-items` 仅处理物品级别的 `name_{locale}` / `description_{locale}` 字段——UI 字符串（按钮、徽章、标题等，共 87 个键）的翻译需要在 `content/config.ts` 中手动填写 `translations.{locale}` 块（或重新运行 `/setup`）后才能运行此技能。

### 技能 4 — 运费配置向导（`/setup-shipping`）

启用并配置**可选的**实时运费估算（见定价系统 → 运费估算）。可重复运行：再次运行时会列出当前 `shipping` 配置，并可修改承担方、发货地址、代理 URL——或关闭该功能。

```
1. 在项目目录中打开 Claude Code（或类似 AI 工具）
2. 输入：/setup-shipping（或"启用运费估算"）
3. 回答 AI 的问题（是否启用？承运服务商、默认承担方、发货邮编/国家）
4. 如需部署 shipping-rate-proxy Cloudflare Worker（终端步骤由卖家自己在
   workers/shipping-rate-proxy/ 中执行——技能只读取部署后的 Worker URL）
5. AI 在 content/config.ts 中写入 shipping 配置块，必要时还会为特定
   content/items/*/item.json 补充 weight/dimensions/shipping_payer
```

只写入 `content/`；卖家拒绝启用或保持关闭时不做任何更改。

### 无需 API 密钥

所有四个技能都是 Markdown 指令文件，不是代码。AI 工具使用其内置能力和用户的现有订阅——无需 `ANTHROPIC_API_KEY`，无需额外软件包，无需新环境变量。四个技能只写入 `content/`。

---

## 多语言（语区切换）

访客可用多种语言浏览列表，并可随时切换。

- **对访客：** 配置了多个语区时，站点头部会出现语言切换器（`LocaleSwitcher`）。切换语言会立即更新物品名称、描述以及所有 UI 标签（按钮、徽章、标题）——无需刷新页面。所选语言保存在浏览器 `localStorage` 中，跨页面和跨访问持久有效。
- **对卖家：** 添加新语言需要两步：
  1. 将语区代码加入 `siteConfig.i18n.availableLocales`（如 `["en", "zh"]`），**并**在 `content/config.ts` 中添加包含全部 87 个 UI 字符串键（已翻译）的 `translations.{locale}` 块。该块缺失或不完整时构建将失败。
  2. 为每件物品填写 `name_zh` / `description_zh`——手动填写或使用 `/translate-items` AI 技能。
- **回退：** 没有翻译的物品显示默认语言——不会留空或报错。任何缺失的 UI 字符串键回退到内置英文默认值。
- **单次部署：** 所有语言在同一次构建中发布；没有独立的多语言站点。
- **保留默认语言的内容：** 页面 `<title>`、社交分享（OG）标签和搜索引擎结构化数据以 `defaultLocale` 渲染——爬虫索引的是这个版本。页面内切换是阅读便利功能；多语言 URL 是未来增强。

只配置一个语区时，切换器隐藏，站点行为与单语言构建完全相同。

---

## 全文搜索

在编译时使用 `fuse.js` 构建。搜索范围：名称、描述、品牌、型号、标签、课程、ISBN、版本。通过 `siteConfig.search.enabled: true` 启用。搜索栏位于 `SiteHeader`，用户输入时实时显示结果。已售和草稿物品不进入索引；available、pending 和 reserved 物品可被搜索到。

---

## 卖家 CLI 工具

脚本在卖家机器上运行。所有列表内容变更只写入 `content/`（外加生成的图片清单）；`upload-images` 还会写入清单和校验和缓存，`fb-export` 写入 `exports/`。

| 命令 | 功能 |
|---|---|
| `pnpm upload-images` | 上传照片到 CDN，更新清单，打印备份提醒 |
| `pnpm push` | 暂存 `content/` 和清单文件、提交（默认消息）并推送 |
| `pnpm mark-sold <cat>/<name>` | 将 `status` 设为 `"sold"` 并记录 `sold_date`，无需手动编辑 JSON——原地修改 JSONC，保留所有 `// options: ...` 注释 |
| `pnpm create-item <cat>/<name>` | 创建新物品文件夹 + 预填全部 36 个模板字段（完整物品 schema；私有字段 `reserved_for` 有意不生成）的 `item.json`（参见 DESIGN.md §5），以 JSONC 格式写入，并为 `condition`、`status`、`dimensions.unit`、`weight.unit` 附上列出所有可选值的 `// options: ...` 提示 |
| `pnpm new <cat>/<name>` | `create-item` 的简写 |
| `pnpm create-template [cat]` | 为某分类（或全局）创建 `_template.json`——与 `create-item` 相同的 JSONC + `// options: ...` 提示 |
| `pnpm fb-export` | 交互式将 `available` / `pending` / `reserved` 物品导出为 Facebook Marketplace 批量上传 CSV。引导式提示：选择全部 / 按分类 / 单独物品（支持逗号列表和 `1-4` 区间）；选择价格策略（最低价 / 最高价 / 本地自提档位 / 邮寄档位——后两项仅在存在匹配物品时出现）；超过 50 条自动分批（FB 上限），写入 `exports/facebook-marketplace.csv`（分批时为 `exports/facebook-marketplace-<N>.csv`）。强制 FB 限制：标题 ≤150 字符、描述 ≤5000 字符。智能分类映射根据物品标签、品牌和名称推断 FB 分类层级，无需手动配置。**导出历史：** 第二次运行时会出现步骤 0，提供跳过已导出物品的选项；历史记录保存于 `exports/.export-history.json`（已加入 gitignore）。**照片：** CSV 的 PHOTO 列保存 CDN `https://` 链接（每件物品最多 10 个——FB 上限；上传 CSV 时由 Facebook 自动抓取），因此请先运行 `pnpm upload-images`，否则这些列为空且脚本会发出警告。作为手动上传的备用方案（例如 CDN 链接变更时），本地照片还会复制到 `exports/facebook-marketplace-photos/NNN_category-item/`。 |

---

## 卖家工作台（Seller Studio）

一个仅在本地运行的网页图形界面，用于在浏览器中管理在售物品——替代手动编辑 `item.json`。运行 `pnpm studio` 启动（用 `pnpm studio --port 3000` 更换端口；接受 1024–65535 之间的任意整数，默认 **5174**），然后打开终端输出的网址。它完全运行在卖家自己的电脑上：不会进入构建产物、不会部署、站点访客永远无法访问。若缺少 Vite 或工作台应用，启动器会立即报错并提示运行 `pnpm update-site`；它会自动加载 `.env.local`，CDN 凭据无需另行配置。它采用与店面一致的品牌配色，提供浅色/深色两套主题，可在顶栏切换，选择会被记住。

一个页面，八种操作：

| 操作 | 功能 |
|---|---|
| 新建物品 | 添加新物品：选择分类并输入 kebab-case 名称——自动创建文件夹和完整的模板 `item.json`（与 `pnpm create-item` 相同的 36 字段模板） |
| 上手引导 | 新站点的就绪清单：还缺什么（站点身份、CDN 凭据、第一个商品、git、联系方式）以及每项去哪里处理。核心步骤未完成时自动展开，完成后收起为顶栏一个按钮 |
| 搜索与筛选 | 状态页签（Active 默认隐藏已售出）、按名称/分类/标签的模糊搜索、分类下拉、按名称/价格/上架日期排序 —— 全部在浏览器内即时计算。表格/卡片切换按钮可在紧凑表格和以照片为主的卡片网格之间切换商品列表，选择会被记住 |
| 默认值 | 管理全站级和分类级的默认字段值（`content/items/` 下的稀疏 `_defaults.json`）；新建商品时按模板叠加默认值，新建弹窗可勾选关闭。价格档位通过专门的"Price tiers"区块设置（一个复选框控制整个数组）。 |
| 站点配置 | 在浏览器里编辑 `content/config.ts` —— 站点名、标语、货币、位置、联系方式、UI 插槽等。文件里的注释在每次保存后原样保留；每次写入都会先做类型检查，会破坏构建的改动直接丢弃 |
| 照片 | 将文件拖到物品上上传照片（文件名自动规范化、按魔数嗅探类型）、拖拽排序、删除，并以实时进度将变更推送到 CDN |
| 批量改状态 | 一次性为多个物品修改 `status`（available / reserved / pending / sold / draft），逐项报告失败；已处于目标状态的物品会被跳过并提示 |
| 批量应用默认档位 | 用各物品自身合并后的默认值（站点级 ← 分类级）覆盖所选物品的 `price.tiers`；无默认档位或已一致的物品会被跳过并提示 |
| 编辑表单 | 用由 schema 驱动的两级分组表单编辑任意物品的字段：日常要动的组默认展开，其余一次点击可达；只写回你修改过的字段，并保留 JSONC 注释 |
| 发布 | 查看未提交变更、填写提交信息，将 `content/` 和图片清单一并提交并推送 |
| 目录 PDF 导出 | 直接在 Studio 中生成并下载一份合并的 PDF 目录，涵盖所有公开可见商品（封面页、目录、按分类分节、每件商品一页并附带在线链接） |

**默认视图不显示已售出商品。** Studio 打开时停在 **Active** 页签，显示除 `sold` 之外的全部商品 —— 也就是卖家日常真正要处理的那批。已售出的商品在自己的页签里，**All** 则显示全部。批量操作只作用于当前可见的行：带着筛选条件全选，选中的就只是筛选后的那些；切换任一筛选条件会清空选择，避免操作波及已经看不见的行。刚被改过状态的行会留在原位直到下次切换筛选，这样 SOLD 印章不会被它自己触发的筛选立刻扫走。表格视图的表头自带全选框；卡片视图没有共用的表头行，所以它的全选框改放在筛选栏里，只在卡片视图打开时出现。

**照片缩略图与卡片视图。** 表格的 Photo 列显示每个商品的封面图（若存在 `cover.*` 则优先使用，否则按字母顺序取第一张——与线上站点使用的规则完全一致），尺寸 40×40 像素；商品还没有照片，或图片加载失败时，显示相机加斜线的占位图标。同一张封面图会以更大的 4:3 比例出现在卡片视图里——想凭照片而不是名称认商品时，用筛选栏里的表格/卡片切换按钮切过去即可。

**多语言站点的语言切换器。** 当 `content/config.ts` 里 `availableLocales` 配置了不止一种语言时，顶栏主题切换按钮旁会出现一个语言切换器。切换它只改变商品列表里名称的显示语言（还没有对应翻译的商品会回退显示默认语言的名称）；选择会被记住。它本身不编辑任何内容——翻译名称和描述仍然在商品抽屉里已有的 **Translations** 分组中编辑。单语言站点上，这个切换器完全不会渲染。

**界面元素跟随语言切换器。** 工作台的界面元素（按钮、标签、页签、状态、筛选栏、编辑表单、配置面板等）跟随语言切换器切换 —— 内置 EN 与 ZH 两套词典，可选通过 `content/config.ts` 由卖家覆盖。

**仅本地服务器 + CSRF 防护。** 工作台服务器只绑定 `127.0.0.1`——网络上的其他设备无法访问。所有写操作请求都有防护（默认拒绝）：必须携带 `Content-Type: application/json`（否则 HTTP 415），且存在 `Origin` 头时必须与服务器自身的 host 一致（否则 HTTP 403）。GET/HEAD 请求不受限制。

**带实时进度的 CDN 同步。** "同步到 CDN"通过服务器推送事件（SSE）流式传输进度（progress / done / error），在同步栏实时显示；同一时间只允许一个同步运行，同步进行中拒绝发布。同步执行与 `pnpm upload-images` 相同的 EXIF/GPS 剥离，重写已提交的图片清单（`lib/generated/image-manifest.json`，保留在 git 中），并刷新内存中的清单缓存，使物品列表立即显示最新的 CDN 链接。缺少 CDN 凭据只会表现为流内错误，不影响启动。

**编辑表单把常改的字段放在最前面。** Details 标签页把 43 个字段输入分成八组，按卖家实际改动的频率排序。**Listing**（名称、状态、成色、数量、描述、标签）和 **Price** 打开即展开——价格档位编辑器也搬进了 Price 组，就在币种下面，不再排在整张表单的最末尾。Translations、Specs、Payment & pickup、Books & courses、Extras、Dates 默认折叠；每个折叠组的标题右侧带一个徽标，显示它藏着几处未保存改动，或者组里已经有几个字段填了值——不用逐个点开就知道哪组有数据。`listed_date` 和 `sold_date` 被特意移进折叠的 Dates 组：这两个值由 `pnpm mark-sold` 和批量状态操作维护，手改正是「卖出日期和状态对不上」的成因。

**打进去的东西不会丢。** 改动过的字段在标签旁带标记；抽屉底部常驻一条操作栏，显示未保存改动的实时计数，并提供 **Save changes** 与 **Discard**；切到 Photos 标签页再切回来，草稿还在——有未保存内容时 Details 标签本身也带标记。保存被拒绝时，出错字段所在的折叠组会自动展开，错误信息指向的是屏幕上看得见的字段。保存成功后表单会重新读盘，你看到的就是写进去的。

**严格的编辑表单校验。** 编辑表单由严格的字段语法驱动，与物品 schema 精确对应（无静默类型转换）：可选性和取值范围与磁盘上的 schema 一致，非法值会被拒绝而非悄悄改写。写入采用 JSONC 外科手术式编辑——卖家的注释（`// options: ...`）和格式在每次保存后都得以保留。

**发布安全。** 发布面板显示未提交变更的数量（同时在工作台顶部栏显示）、变更文件列表和提交信息输入框（必填，≤500 字符）。发布时**仅**暂存 `content/` 和 `lib/generated/image-manifest.json`——与 `pnpm push` 暂存的内容完全一致，绝不使用 `git add -A`，因此 `.env.local`（含 CDN 凭据）绝不会被连带提交。它会拒绝带外暂存的文件、拒绝 detached HEAD 状态，并在提交时重新读取变更列表。

与 CLI 脚本一样，工作台只写入 `content/` 和图片清单。它从不读取或写入 `reserved_for`——买家隐私信息完全不进入这个工具。

---

## 物品状态与可见性

| 状态 | 首页最近上架 | 首页分类卡片 | `/[category]` 页 | `/all` 页 | `/sold` 档案 | 详情页 | 备注 |
|---|---|---|---|---|---|---|---|
| `available` | 是 | 卡片可见 | 是 | 是 | 否 | 是 | |
| `reserved` | **否** | 卡片可见 | 是 + 徽章 | 是 + 徽章 | 否 | 是 | `reserved_for` 永不渲染 |
| `pending` | **否** | 卡片可见 | 是 + 徽章 | 是 + 徽章 | 否 | 是 | |
| `sold` | 否 | 卡片可见（保留期内） | 是 + 遮罩（切换） | 是（切换） | **是** | 是（保留期内） | `soldItemRetentionDays` 后详情页不再生成；`/sold` 档案不受保留期限制展示所有已售物品，上限由 `soldArchiveDisplayLimit` 控制（0 = 不限） |
| `draft` | 否 | 否 | 否 | 否 | 否 | 否 | 不生成路由 |

**重要说明：** 首页最近上架区块由 `loadHomePageData()` 派生，仅返回 `available` 物品（按上架日期降序，上限为 `recentlyListedCount`）。`reserved` 和 `pending` 物品**不**出现在该区块，但仍保持首页分类卡片可见。

---

## UI 自定义——4 个可配置槽位 + 价格筛选

在 `content/config.ts` 中设置任意选项。所有 27 个 Aceternity 组件由开发者通过 `pnpm setup-ui` 一次性安装。卖家只需修改配置值——无需编辑代码。

| 槽位 | 配置键 | 选项 |
|---|---|---|
| 背景 | `ui.background` | `"none"` + 13 个 Aceternity 背景 |
| 物品网格 | `ui.itemGrid` | `"simple"` + bento-grid、layout-grid、focus-cards |
| 图库 | `ui.gallery` | `"simple"` + apple-cards-carousel、images-slider、carousel、parallax-scroll |
| 物品卡片 | `ui.itemCard` | `"simple"` + 7 个 Aceternity 卡片效果 |
| 价格筛选 | `ui.priceFilterStrategy` | `"none"`（预设）、percentile、logarithmic、preset-buckets、iqr |

---

## 站点配置（`content/config.ts`）

标注**（可选）**的字段在 TypeScript 中为可选类型，并带有运行时默认值——缺少这些字段的旧 `content/config.ts` 在模板更新后仍可正常工作（也可用 `pnpm migrate-config` 自动注入）。

| 区块 | 字段 |
|---|---|
| 身份 | `name`、`tagline`、`logo` |
| 部署 | `deploymentMode`、`baseUrl` |
| 图片存储 | `imageStorage.provider` |
| 卖家位置 | `location.lat`、`location.lng`、`location.label` |
| 内容默认值 | `currency`、`recentlyListedCount`、`soldItemRetentionDays`、`soldArchiveDisplayLimit?`**（可选）**——限制 `/sold` 网格条数；`0` = 不限，默认 `200`、`defaultPriceTiers?`**（可选）**——`create-item` 使用的档位模板、`measurementUnit?`**（可选）**——`"metric"` / `"imperial"`，默认 `"metric"` |
| 运费**（可选区块）** | `shipping.enabled`、`shipping.proxyUrl`、`shipping.defaultPayer`（`"seller"` / `"buyer"`）、`shipping.origin.zip`、`shipping.origin.country` |
| 联系方式 | `contact.reveal_behavior`、`contact.platforms[]` |
| Hero | `hero.cta_label`、`hero.cta_href` |
| SEO | `meta.description`、`meta.twitterHandle` |
| UI 槽位 | `ui.background`、`ui.itemGrid`、`ui.gallery`、`ui.itemCard`、`ui.priceFilterStrategy?`**（可选）**、`ui.priceFilterBuckets?`**（可选）** |
| 深色模式 | 页头切换按钮（浅色/深色/跟随系统，由 `next-themes` 持久化） |
| 分析 | `analytics.vercel`、`analytics.speedInsights` |
| 搜索 | `search.enabled`、`search.placeholder` |
| 站点地图 | `sitemap.enabled` |
| 国际化 | `i18n.defaultLocale`、`i18n.availableLocales`、`i18n.showLocaleSwitcher`、`i18n.translations.{locale}.*`（共 87 个 UI 字符串键；任一已列语区缺少必需键时预构建失败，缺失键回退到默认语区）、`i18n.localeMeasurementUnits?`**（可选）**——按语区覆盖单位制 |

---

## 构建流程

**卖家上传照片**（`pnpm upload-images`）：
照片 → CDN，更新清单，打印备份提醒，显示照片质量警告。

**CI 构建 — GitHub Actions / Vercel**（`pnpm build`）：
预构建：占位符 `baseUrl` 或不完整的语区翻译会导致构建失败；校验图片清单（云存储提供商）或复制照片（本地提供商）；构建搜索索引 → `next build` 生成所有页面 → 构建后生成 `sitemap.xml` + `robots.txt`（当 `sitemap.enabled` 时）。

**本地开发**（`pnpm dev`）：
照片本地复制 → 带热重载的开发服务器。

### 开发者与维护者脚本

| 脚本 | 用途 |
|---|---|
| `pnpm setup-ui` | （运行一次）将所有 27 个 Aceternity 组件安装到 `components/ui/` |
| `pnpm update-site [tag] [--list] [--skip-verify]` | 将上游模板的新版本拉入本仓库且不触碰 `content/`（默认最新 tag；`--list` 列出可用版本），随后自动迁移配置、校验（install + type-check + build）并提交 |
| `pnpm migrate-config` | 模板升级后将新的可选配置字段以默认值拼入 `content/config.ts`——只做增量添加；绝不修改已有值 |
| `pnpm bump` | （维护者）交互式版本升级 + GitHub 发布：更新 `package.json` 版本、等待 CI、打 tag 并通过 `gh` 创建发布 |

开发者工具：`pnpm type-check`、`pnpm lint`（零警告）、`pnpm format`，以及 `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`（Vitest）。`pnpm studio` 见上文专属章节。

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

页头的太阳/月亮切换按钮（`ThemeToggle`）让访客在浅色与深色主题之间切换。默认跟随访客的操作系统/浏览器偏好（`system`），一旦访客做出明确选择，会通过 `next-themes` 以 class 方式持久化（存储于 `localStorage`）。所有 Aceternity 组件均支持深色模式。

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
| 卖家 CLI 工具 | 列表内容变更只写入 `content/`（外加生成的图片清单） |
| 卖家工作台 | 仅绑定 `127.0.0.1`；写操作请求有 CSRF 防护；发布时只暂存 `content/` + 图片清单（绝不使用 `git add -A`，因此 `.env.local` 不可能被暂存）；从不触碰 `reserved_for` |
| 图片清单 | `lib/generated/image-manifest.json` 提交到 git，CI 构建因此无需 CDN 凭据 |

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
| 动画 | motion（framer-motion） |
| 图标 | @tabler/icons-react |
| 包管理器 | pnpm |
| 主要部署 | GitHub Pages（通过 GitHub Actions） |
| 图片 CDN | Cloudflare R2（推荐）或 Vercel Blob |
