# UsedExchange — 功能路线图

**日期：** 2026-06-01  
**范围：** v1 之后的功能。尚未承诺——优先级供规划讨论参考。

---

## ✅ v1 已包含

以下功能最初在路线图中，现已纳入 **v1 范围**（在 DESIGN.md / TECH_REQUIREMENTS.md 中指定）。项目目前处于**设计阶段**——"v1 已包含"意味着"已为 v1 构建指定"，尚未实现代码。

| 功能 | 备注 |
|---|---|
| Discord 联系平台 🎓 | 完整支持：私信链接或服务器邀请 |
| 预填联系消息 🎓👤 | WhatsApp、邮件、Venmo 预填物品名称 + 价格 |
| 原生分享 + 复制链接 🎓👤 | `navigator.share()` + 剪贴板回退 |
| 分类页排序选项 🎓👤 | 价格（低/高）、上架日期、成色 |
| "上架 X 天前"新鲜度 🎓👤 | 从 `listed_date` 推算 |
| 成色指南工具提示 👤 | `?` 图标解释每个成色枚举值 |
| JSON-LD 结构化数据（Product schema）🎓👤 | 富摘要 + BreadcrumbList |
| 数量指示器 🎓👤 | `quantity > 1` 时显示"3 件在售"徽章 |
| Vercel Analytics + Speed Insights 🎓 | Hobby 计划免费；通过配置启用 |
| Schema 字段扩展 🎓 | stripe_payment_link、pickup_windows、no_lowball、price_reduced、youtube_link、isbn、course、edition、semester_listed、name_zh、description_zh、venmo_payment_request、min_acceptable_offer |
| 客户端全文搜索 🎓👤 | fuse.js；构建时索引；头部搜索栏 |
| 自动深色模式（系统设置）🎓 | Tailwind v4 默认（`prefers-color-scheme`）——无需切换按钮 |
| 卖家 CLI 工具 🎓👤 | `pnpm create-item`、`pnpm create-template`、`pnpm new`、`pnpm mark-sold` |
| "浏览全部"跨分类页 🎓👤 | `/all` 路由，含完整筛选 + 排序 |
| "出价"流程 🎓👤 | 内联表单 + 预填联系消息；`min_acceptable_offer` 门槛 |
| 最近浏览物品 🎓👤 | 基于 `sessionStorage` 的横向条，显示在首页和详情页 |
| 照片质量警告 🎓 | `pnpm upload-images` 期间的建议性警告 |
| 站点地图 🎓👤 | `next-sitemap`；在 `postbuild` 中运行 |
| 已售物品档案页 🎓👤 | `/sold` 路由；不受保留期限制的所有已售物品 |
| Twitter/X + Pinterest 富卡片 🎓👤 | `twitter:card: "summary_large_image"` + `og:type: "product"` |
| 教材专属字段和分类 🎓 | isbn、course、edition、semester_listed；比价链接 |
| 非技术用户设置指南 👤 | `SETUP_GUIDE.md`，纯英文；仅涉及 `content/` 操作 |
| 国际化——多语言支持 🎓👤 | 单次部署多语区（运行时 LocaleSwitcher）；`name_zh`/`description_zh` 模式；`/translate-items` 技能 |
| Venmo + Zelle 支付（二维码或链接）🎓👤 | Venmo：链接式或二维码；Zelle：仅二维码 |

---

工作量级别：XS（数小时）· S（1 天）· M（2–4 天）· L（1–2 周）· XL（重大范围）  
价值级别：⭐ 锦上添花 · ⭐⭐ 有意义的改进 · ⭐⭐⭐ 高影响  
用户标签：🎓 CS 学生（主要）· 👤 更广泛用户（潜在）

---

## 目标用户背景

| 用户群 | 设置能力 | 日常工作流 | 优先功能 |
|---|---|---|---|
| 🎓 **CS 学生（主要）** | 高——git、终端、JSON | `pnpm upload-images` + `git push` | Discord 联系、学期末工具、短程距离档位、教材/电子产品字段 |
| 👤 **非 CS 用户（潜在）** | 低——需要一次性设置帮助 | 仅 `content/` 文件夹 | CLI mark-sold 工具、本地仪表板、零代码状态更新 |

标有 🎓 的功能主要为 CS 学生档案驱动。标有 👤 的功能主要降低非技术用户的门槛。

---

## Tier 1 — 快速成效
*工作量小，可立即实施。许多可在 Phase 13（加固）或 Phase 10（联系）期间添加。*

### 1.1 Discord 联系平台 🎓 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

Discord 是 CS 学生的主导通讯平台——校园社区、社团服务器和班级 Discord 频道都在这里。已是 v1 主要用户的核心功能，应与邮件、Instagram 一同发布。

---

### 1.2 预填联系消息 🎓 👤 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

访客点击联系平台按钮时，外发消息自动预填物品名称和价格，减少从头撰写消息的摩擦。

---

### 1.3 原生分享 + 复制链接 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

物品详情页上的"分享"按钮。
- 移动端：调用 `navigator.share({ title, text, url })` ——打开系统分享面板
- 桌面端：回退到 `navigator.clipboard.writeText(window.location.href)`，带"已复制！"提示

---

### 1.4 分类页排序选项 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

按以下方式排序物品网格：价格低→高/高→低、上架日期（最新优先）、成色（全新优先）。纯客户端，无需重新构建。

---

### 1.5 "上架 X 天前"新鲜度指示器 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

在物品卡片和详情页显示物品已上架多久。从 `listed_date` 推算。  
示例："今天上架" · "3 天前上架" · "2 周前上架"

---

### 1.6 成色指南工具提示 👤 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

成色徽章旁的 `?` 图标，打开小型工具提示或弹窗，解释每个成色值的含义：
- **全新** — 从未使用，原包装
- **如新** — 使用一两次，无可见磨损
- **良好** — 正常使用，轻微外观瑕疵
- **一般** — 明显磨损，功能完全正常
- **零件机** — 功能不完整，按现状出售

---

### 1.7 JSON-LD 结构化数据（Product Schema）✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐⭐

在物品详情页嵌入 `<script type="application/ld+json">`，类型为 `@type: "Product"`。Google 使用此数据在搜索结果中显示富摘要。同时添加 BreadcrumbList JSON-LD。

---

### 1.8 数量指示器 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

`quantity > 1` 时在物品卡片和详情页显示"3 件在售"。为批量物品增加紧迫感。

---

### 1.9 Vercel Analytics + Speed Insights ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

`app/layout.tsx` 中一个脚本组件。Vercel Hobby 免费。显示：页面浏览量和最多访问物品、流量来源、每页 Core Web Vitals。

---

### 1.10 PWA Web App Manifest
**工作量：** XS · **价值：** ⭐⭐

`public/manifest.json` 文件使站点可作为主屏幕应用安装到 iPhone 和 Android。包含：应用名称、主题颜色、图标集（192×192 和 512×512）、`display: "standalone"` 实现全屏体验。v1 无需 Service Worker——仅清单即可启用安装。

---

### 1.11 预先添加 Schema 字段（Phase 3 期间添加）🎓 👤 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

在 Phase 3（内容 Schema）期间添加这些字段零成本。之后补加需要编辑所有现有 `item.json` 文件。

---

### 1.12 学期末批量操作 🎓
**工作量：** S · **价值：** ⭐⭐⭐

CS 学生大多在每学期末出售物品。一条命令准备清仓：

```bash
pnpm semester-end
```

此脚本：
1. 打印所有已上架超过 60 天的 `available` 物品（可能是过时列表）
2. 提示："将这些标记为已售、降价还是保持不变？"
3. 同时打开所有标记需要编辑的 `item.json` 文件（使用 `$EDITOR`）
4. 运行 `pnpm upload-images` 并生成 git 提交消息：`"chore: end-of-semester listing cleanup"`

---

## Tier 2 — 中期功能
*有意义的改进。每项独立且可独立发布。*

### 2.1 客户端全文搜索 🎓 👤 ✅ v1 已包含
**工作量：** M · **价值：** ⭐⭐⭐

`fuse.js` 在构建时从所有物品名称、描述、品牌、型号和标签构建索引。`SiteHeader` 中的搜索输入框——用户输入时显示结果。物品超过约 30 件后变得必不可少。

---

### 2.2 标签筛选 🎓 👤
**工作量：** M · **价值：** ⭐⭐⭐

标签已存在于每件物品上。在加载时构建标签索引。在分类页筛选栏添加标签筛选，并添加 `/tags/{tag}` 路由，列出跨分类的所有带该标签的物品。

---

### 2.3 深色模式 🎓
**工作量：** M · **价值：** ⭐⭐

`tailwind darkMode: 'class'` + `SiteHeader` 中的切换按钮 + 首次加载时的系统偏好检测。所有 Aceternity 组件均支持深色模式。

---

### 2.4 卖家 CLI 工具 🎓 👤
**工作量：** S–M · **价值：** ⭐⭐⭐

减少手动编辑 `item.json` 的脚本。CS 学生将其作为高效工具使用；非技术用户依赖这些工具避免直接打开 JSON 文件。

| 脚本 | 功能 | 用户 |
|---|---|---|
| `pnpm mark-sold houseware/ikea-lamp` | 设置 `status: "sold"` 和 `sold_date: today`——**v1 已包含** | 🎓 👤 |
| `pnpm mark-available houseware/ikea-lamp` | 将状态重置为 `available` | 🎓 👤 |
| `pnpm duplicate houseware/ikea-lamp houseware/ikea-lamp-2` | 复制文件夹 + item.json，将副本设为 `draft` | 🎓 |
| `pnpm inventory` | 打印所有物品的 Markdown 表格：名称、状态、价格、上架天数 | 🎓 👤 |
| `pnpm stale-check` | 列出已 `available` 超过 N 天的物品 | 🎓 |
| `pnpm audit-listings` | 报告缺少推荐字段的物品 | 🎓 |
| `pnpm export-csv` | 将所有物品导出为 CSV 以备记录 | 🎓 👤 |
| `pnpm semester-end` | 批量审阅 + 清理（见 1.12） | 🎓 |

---

### 2.5 "浏览全部"跨分类页 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

`/all` 路由，在一个可滚动网格中显示所有分类的非草稿物品，含完整筛选 + 排序栏。

---

### 2.6 Stripe 支付链接集成
**工作量：** S（仅 schema + UI）· **价值：** ⭐⭐⭐

在物品详情页显示"支付定金"或"立即购买"按钮，打开 Stripe 支付链接。无需后端，Stripe 处理支付，卖家在本地完成交易。

---

### 2.7 取货预约链接
**工作量：** XS（仅 schema + UI）· **价值：** ⭐⭐

在站点配置或物品 `item.json` 中添加 `scheduling_url`。物品详情页上的"预约查看"按钮打开外部预约链接（Calendly、Cal.com、Google 日历预约页面）。

---

### 2.8 "出价"流程 🎓 👤 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

`price.negotiable: true` 时，在物品详情页显示"发送出价"按钮。小型内联表单询问买家出价金额，然后打开配置的联系平台并预填消息："我愿意出 $X 购买 {物品名称}。"

---

### 2.9 最近浏览物品 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

在 `sessionStorage` 中存储最近查看的 5 件物品。在首页底部和物品详情页底部显示"最近浏览"横排。零服务器变更；一个客户端组件。

---

### 2.10 照片质量警告 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

`pnpm upload-images` 期间警告（不阻断）：任意图片 < 800px 宽、任意图片 > 8 MB、物品文件夹有图片但无 `cover.*`、物品文件夹完全没有图片。

---

### 2.11 站点地图 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

`next-sitemap` 在 `postbuild` 步骤生成 `sitemap.xml` 和 `robots.txt`。显著提升搜索引擎可爬取性。

---

### 2.12 已售物品档案页 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

`/sold` 路由，列出所有 `status: "sold"` 的物品，不受保留期限制。充当"过往交易展示"——提供信任证明，帮助买家了解典型价位。

---

### 2.13 Twitter/X + Pinterest 富卡片 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

- **Twitter 卡片：** `twitter:card: "summary_large_image"` 使用物品封面图
- **Pinterest 富 pin：** `og:type: "product"` 含价格元数据

---

### 2.14 距离单位切换（英里 ↔ 公里）
**工作量：** S · **价值：** ⭐⭐

在站点配置中添加 `distanceUnit: "mi" | "km"`。`useDistancePricing` 仅在显示时转换。所有 `miles_min` / `miles_max` 字段在内部仍以英里表示。

---

### 2.15 教材专属字段与分类 🎓 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐⭐

CS 学生出售大量教材。教材的一流支持使站点对该用户群体更有价值。

**Schema 扩展：** `isbn`、`course`、`edition`、`semester_listed`

**UI 扩展：**
- 存在 `isbn` 时显示"比价"按钮，链接到 `bookfinder.com/search/?isbn={isbn}`
- `course` 显示为徽章（如"适用于 CS101"）——买家按课程而非物品名称搜索
- 分类页筛选：存在该字段时按 `course` 代码筛选

---

### 2.16 非技术用户设置指南 👤 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐⭐

清晰、图文并茂的 `SETUP_GUIDE.md`，为由朋友帮助设置的非 CS 用户编写。

---

## Tier 3 — 较大功能
*有意义的范围。每项需要仔细的架构规划。*

### 3.1 联系表单/询问系统 👤
**工作量：** L · **价值：** ⭐⭐⭐

接受买家姓名、消息和物品引用的无服务器函数，然后通过邮件或通知联系卖家。消除了公开暴露任何联系方式的需要。需要限速以防垃圾信息。

---

### 3.2 物品浏览计数器
**工作量：** M · **价值：** ⭐⭐

使用注重隐私的分析服务（GoatCounter——免费、开源、可自托管）的轻量级每物品浏览计数器。作为未来"最多浏览"区块的数据来源。

---

### 3.3 离线缓存（PWA Service Worker）
**工作量：** M · **价值：** ⭐⭐

缓存最近访问的物品页面和图片的 Service Worker。允许买家在没有网络连接时查看之前访问过的物品——在网络信号差的车库跳蚤市场很有用。

---

### 3.4 跨平台发布导出模板
**工作量：** M · **价值：** ⭐⭐

`pnpm export-marketplace houseware/ikea-lamp` 生成格式化文字块，可直接粘贴到 Facebook Marketplace、Craigslist、OfferUp / Letgo、eBay（描述模板）。

---

### 3.5 "捆绑优惠"多物品联系
**工作量：** M · **价值：** ⭐⭐

在物品详情页显示"可与 {物品 X} 捆绑"区块，列出关联物品及合计价格。"联系捆绑购买"按钮预填包含所有物品和合计金额的联系消息。

---

### 3.6 降价跟踪（历史记录）
**工作量：** M · **价值：** ⭐⭐

**v1 已包含 Schema + UI：** `price_reduced` 和 `previous_lowest_price` 是 v1 字段；"已降价"标签和删除线原价已在物品卡片和详情页渲染。**只有**价格历史*日志*是未来（v2）新增内容。

---

### 3.7 国际化——多语言支持 ✅ v1 已包含
**工作量：** L · **价值：** ⭐⭐

见已包含功能列表。

---

### 3.8 卖家仪表板（仅本地）👤
**工作量：** L · **价值：** ⭐⭐⭐

**这是非 CS 用户群体可访问性的主要突破。** 仅在本地运行（仅 `localhost`，从不部署）的网页界面，让卖家可视化管理物品：添加/编辑 `item.json` 字段、更改状态、触发上传——无需直接编辑 JSON 文件。

---

## Tier 4 — 重大架构变更
*需要大量重新设计。认真评估后再承诺。*

### 4.1 多卖家支持
**工作量：** XL · **价值：** ⭐⭐⭐（如市场需求支持）

每个卖家有自己的 `content/` 文件夹、独立的 `config.ts`，可能有独立的子域名。需要身份验证、命名空间内容目录、共享构建基础设施、每个卖家的独立图片存储桶。

**实施前需要架构决策：** 如果多卖家在范围内，`content/` 结构、加载器函数和路由都需要从头重新设计。

---

### 4.2 无需重建的实时库存更新
**工作量：** XL · **价值：** ⭐⭐

状态变更（可用 → 已售）无需完整重建即反映在实时站点上。需要实时数据层（Vercel KV + Server-Sent Events，或 Supabase Realtime）。

对个人二手销售站点来说优先级低；重新触发 Vercel 构建需约 30 秒，更简单。

---

### 4.3 运费计算器集成
**工作量：** L · **价值：** ⭐⭐

对于有"邮寄"价格档位的物品：集成 USPS/UPS/FedEx API，根据买家邮编、物品尺寸和重量计算实际运费。需要无服务器函数代理运费 API 调用（API 密钥不得在浏览器包中）。

---

### 4.4 买家预订系统
**工作量：** L · **价值：** ⭐⭐

自动化 `status` 管理：买家完成联系/定金流程后，物品自动转为 `pending`。交易完成后转为 `sold`。目前所有状态变更都需手动编辑 `item.json`。需要无服务器后端和持久状态（KV 存储）。

---

## Phase 3 中预先添加的 Schema 字段

这些字段在初始 schema 实现期间（Phase 3）添加是免费的。之后补加意味着需要编辑每个现有的 `item.json`。

```jsonc
// 这些字段包含在 v1 item.json schema 中（DESIGN.md §5）。
// 在 Phase 3（内容 Schema）期间添加——事后补加需要编辑每个现有 item.json。
// 所有字段可选，所有字段有优雅默认值。

"stripe_payment_link": "",          // Stripe 支付链接，用于即时定金
"pickup_windows": [],               // ["工作日晚间", "周六 10am–2pm"]
"no_lowball": false,                // "价格不议"徽章
"price_reduced": false,             // "已降价"标签
"previous_lowest_price": null,      // 用于显示降价幅度
"youtube_link": "",                 // 演示视频 URL
```

> **`scheduling_url` 不是 v1 字段。** 它在 §2.7 和优先级表中列为 v1.1 功能。不要将其添加到 Phase 3 schema 中。

---

## 功能 × 优先级汇总——仅 v1 后路线图

🎓 = 主要服务 CS 学生 · 👤 = 主要服务非 CS 用户 · 🎓👤 = 两者均服务

| 功能 | 用户 | 状态 |
|---|---|---|
| PWA manifest（可安装） | 🎓👤 | v1.1 |
| 学期末批量操作（`pnpm semester-end`） | 🎓 | v1.1 |
| 取货预约链接（Calendly/Cal.com 字段） | 🎓👤 | v1.1 |
| 标签筛选页（`/tags/{tag}`） | 🎓👤 | v1.1 |
| 距离单位切换（英里 ↔ 公里） | 🎓 | v1.1 |
| 跨平台发布导出模板 | 🎓 | v2 |
| 捆绑优惠多物品联系 | 🎓👤 | v2 |
| 联系表单（无服务器，隐藏联系信息） | 👤 | v2 |
| 物品浏览计数器（GoatCounter） | 🎓 | v2 |
| 离线缓存（PWA Service Worker） | 🎓👤 | v2 |
| 降价跟踪（历史记录） | 🎓👤 | v2 |
| 手动深色模式切换 | 🎓 | v2 |
| **卖家仪表板（仅本地 GUI）** | 👤 | v2——非 CS 用户增长的关键突破 |
| 多卖家支持 | 👤 | v3 / 需要架构重新设计 |
| 无需重建的实时库存 | 👤 | v3 |
| 运费计算器（USPS/UPS API） | 🎓👤 | v3 |
| 买家预订系统 | 👤 | v3 |
