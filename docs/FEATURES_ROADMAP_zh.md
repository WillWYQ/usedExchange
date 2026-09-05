# UsedExchange — 功能路线图

**版本：** v1.6 · **日期：** 2026-09-05  
**范围：** v1 之后的功能。尚未承诺——优先级供规划讨论参考。

---

## ✅ v1 已包含

v1 已**全部实现并投入生产**——模板版本 1.4.2，Phase 0–18 全部完成（见 IMPLEMENTATION_PLAN_zh.md）。以下功能最初在路线图中，现已作为 v1 构建的一部分实现为代码（在 DESIGN.md / TECH_REQUIREMENTS.md 中指定）。"v1 已包含"在此表示已实现并上线。

| 功能 | 备注 |
|---|---|
| Discord 联系平台 🎓 | 仅支持私信（用户主页）链接 |
| 预填联系消息 🎓👤 | WhatsApp 和邮件预填物品名称 + 价格；Venmo 仅预填物品名称 |
| 原生分享 + 复制链接 🎓👤 | `navigator.share()` + 剪贴板回退 |
| 分类页排序选项 🎓👤 | 价格（低/高）、上架日期、成色 |
| "上架 X 天前"新鲜度 🎓👤 | 从 `listed_date` 推算 |
| 成色指南工具提示 👤 | `?` 图标解释每个成色枚举值 |
| JSON-LD 结构化数据（Product schema）🎓👤 | 富摘要 + BreadcrumbList |
| 数量指示器 🎓👤 | `quantity > 1` 时显示"3 件在售"徽章 |
| Schema 字段扩展 🎓 | stripe_payment_link、pickup_windows、no_lowball、price_reduced、youtube_link、isbn、course、edition、semester_listed、name_zh、description_zh、venmo_payment_request、min_acceptable_offer |
| 客户端全文搜索 🎓👤 | fuse.js；构建时索引；头部搜索栏 |
| 深色模式（自动 + 手动切换）🎓 | 默认跟随系统偏好（`prefers-color-scheme`）；页头 `ThemeToggle` 允许访客手动切换，由 `next-themes` 持久化 |
| 卖家 CLI 工具 🎓👤 | `pnpm create-item`、`pnpm create-template`、`pnpm new`、`pnpm mark-sold`；另有模板管理工具：`pnpm update-site`、`pnpm migrate-config`、`pnpm push`、`pnpm bump` |
| "浏览全部"跨分类页 🎓👤 | `/all` 路由，含完整筛选 + 排序 |
| "出价"流程 🎓👤 | 内联表单 + 预填联系消息；`min_acceptable_offer` 门槛 |
| 最近浏览物品 🎓👤 | 基于 `sessionStorage` 的横向条，显示在首页和详情页 |
| 照片质量警告 🎓 | `pnpm upload-images` 期间的建议性警告 |
| 站点地图 🎓👤 | `next-sitemap`；在 `postbuild` 中运行 |
| 已售物品档案页 🎓👤 | `/sold` 路由；不受保留期限制的所有已售物品；网格以 `siteConfig.soldArchiveDisplayLimit` 为上限（页头显示完整数量） |
| Twitter/X + Pinterest 富卡片 🎓👤 | `twitter:card: "summary_large_image"` + `product:price:amount` / `product:price:currency` 元标签（`og:type` 保持 `"website"`） |
| 教材专属字段和分类 🎓 | isbn、course、edition、semester_listed；比价链接 |
| 非技术用户设置指南 👤 | `SETUP_GUIDE.md`，纯英文；核心章节涉及 `content/` 物品管理，另有涉及终端/斜杠命令的可选章节（Seller Studio、运费 Worker、Facebook 导出） |
| 国际化——多语言支持 🎓👤 | 单次部署多语区（运行时 LocaleSwitcher）；`name_zh`/`description_zh` 模式；`defaultLocale` + `availableLocales` + `siteConfig.i18n.translations.{locale}`（109 个 UIStrings 键）；`useT()` hook；`/translate-items` 技能 |
| Venmo + Zelle 支付（二维码或链接）🎓👤 | Venmo：链接式或二维码；Zelle：仅二维码 |
| 计量单位切换 🎓👤 | `siteConfig.measurementUnit` + 按语区覆盖的 `i18n.localeMeasurementUnits`；`SiteHeader` 中的 `MeasurementUnitToggle` 将物品重量/尺寸显示在公制与英制之间转换 |
| 价格筛选策略 🎓 | 可选的 `ui.priceFilterStrategy`（`"none"` \| `"percentile"` \| `"logarithmic"` \| `"preset-buckets"` \| `"iqr"`）+ `ui.priceFilterBuckets`，由 FilterBar/ItemGrid 以 `?? "none"` 运行时默认值消费（遵循配置向后兼容规则） |
| 最新上架页 🎓👤 | `/newly-listed` 路由（`NewlyListedClient`），以渐进式展示呈现最新上架物品 |

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

- 私信（用户主页）链接：`https://discord.com/users/{user-id}`
- `PlatformButton` 始终构造用户主页 URL——**不**支持服务器邀请（`discord.gg`）链接

---

### 1.2 预填联系消息 🎓 👤 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

访客点击联系平台按钮时，外发消息自动预填物品名称和价格，减少从头撰写消息的摩擦。

- WhatsApp：`https://wa.me/{number}?text=Hi, I'm interested in your {item.name} ({price}). Is it still available?`——`{price}` 为解析出的档位价格，带货币符号格式化（如 `$250`）
- 邮件：`mailto:{address}?subject=Inquiry: {item.name}&body=Hi, I'm interested in your {item.name}...`
- 适用于任何支持深链预填的平台

**实现方式：** 扩展 `PlatformButton` 以接受可选的 `item` props；在 `ContactSection` 中构造预填 URL。

---

### 1.3 原生分享 + 复制链接 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

物品详情页上的"分享"按钮。
- 移动端：调用 `navigator.share({ title, text, url })` ——打开系统分享面板
- 桌面端：回退到 `navigator.clipboard.writeText(window.location.href)`，带"已复制！"提示
- 让买家可通过任意应用将物品转发给朋友

**实现方式：** 新增一个客户端组件 `ShareButton.tsx`。

---

### 1.4 分类页排序选项 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

按以下方式排序物品网格：价格低→高/高→低、上架日期（最新优先）、成色（全新优先）。纯客户端，无需重新构建。筛选栏中的一个下拉菜单。

---

### 1.5 "上架 X 天前"新鲜度指示器 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

在物品卡片和详情页显示物品已上架多久。从 `listed_date` 推算。  
示例："今天上架" · "3 天前上架" · "14 天前上架"——`lib/utils/date.ts` 只会返回"今天"或"N 天前"（没有按周/月归并的逻辑），所以上架很久的物品只会显示更大的天数，不会出现"2 周前"这种措辞。

无需任何 schema 变更即可增加紧迫感和透明度。

---

### 1.6 成色指南工具提示 👤 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

成色徽章旁的 `?` 图标，打开小型工具提示或弹窗，解释每个成色值的含义：
- **全新** — 从未使用，原包装
- **如新** — 使用一两次，无可见磨损
- **良好** — 正常使用，轻微外观瑕疵
- **一般** — 明显磨损，功能完全正常
- **零件机** — 功能不完整，按现状出售

降低买家的不确定性。共用一个 `ConditionGuide` 组件。

---

### 1.7 JSON-LD 结构化数据（Product Schema）✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐⭐

在物品详情页嵌入 `<script type="application/ld+json">`，类型为 `@type: "Product"`。Google 使用此数据在搜索结果中显示富摘要。同时**仅在物品详情页**添加 BreadcrumbList JSON-LD（分类页只有一个视觉上的 `Breadcrumb` 组件，没有对应的 JSON-LD；本文档之前的表述容易让人误以为分类页也有）。

**实现方式：** 由 `lib/utils/jsonld.ts` 中的服务端构建器生成，通过 `JsonLd` 组件（`components/common/JsonLd.tsx`）在页面主体中渲染。无需任何新数据。`buildProductJsonLd` 实际不会输出 `color` 字段。

---

### 1.8 数量指示器 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

`quantity > 1` 时在物品卡片和详情页显示"3 件在售"。为批量物品增加紧迫感。

---

### 1.9 Vercel Analytics + Speed Insights *（计划中——尚未实现）*
**工作量：** XS · **价值：** ⭐⭐

`app/layout.tsx` 中一个脚本组件。将显示：页面浏览量和最多访问物品、流量来源、每页 Core Web Vitals。

**状态：** `@vercel/analytics` 和 `@vercel/speed-insights` 包已作为依赖安装，但尚未接入——`app/` 和 `components/` 中没有任何代码导入或渲染它们。注意：站点部署在 GitHub Pages，而 Vercel Analytics 需要 Vercel 托管，因此启用它意味着迁移部署方式或选择其他分析服务。

**另见：** §1.13 Google Analytics（GA4）——已发布的替代方案，无需 Vercel 托管。

---

### 1.10 PWA Web App Manifest ✅ 已发布
**工作量：** XS · **价值：** ⭐⭐

`app/manifest.ts`（Next.js 文件约定路由，不是静态的 `public/manifest.json`）使站点可作为主屏幕应用安装到 iPhone 和 Android：名称/短名称取自 `siteConfig.name`、主题/背景色、`display: "standalone"`，以及从 `app/icon.svg` 用 `sharp` 生成的 192×192/512×512 图标集。在 `output: "export"` 下需要显式加 `export const dynamic = "force-static"`——否则 `next build` 会在收集这个 manifest 路由的页面数据时失败。

无 Service Worker——仅清单即可启用安装。

---

### 1.11 预先添加 Schema 字段（Phase 3 期间添加）🎓 👤 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐⭐

在 Phase 3（内容 Schema）期间添加这些字段零成本。之后补加需要编辑所有现有 `item.json` 文件。

```jsonc
"stripe_payment_link": "",    // Stripe Payment Link URL → "支付定金"按钮
"pickup_windows": [],         // ["Weekday evenings", "Saturdays 10am–2pm"]
"no_lowball": false,          // 在价格旁显示"价格不议"徽章
"price_reduced": false,       // 在卡片上显示"已降价"标签
"youtube_link": "",           // 演示视频 URL（电子产品、家电很有用）

// 🎓 CS 学生专属扩展：
"isbn": "",                   // 教材 ISBN（可生成比价链接）
"course": "",                 // 如 "CS101"、"MATH230"——可搜索，显示在教材详情页
"edition": "",                // 如 "3rd edition"
"semester_listed": ""         // 如 "Spring 2026"——帮助买家判断教材是否为当前版本
```

所有字段可选，默认为空值/false。

---

### 1.12 学期末批量操作 🎓 ✅ 已发布
**工作量：** S · **价值：** ⭐⭐⭐

CS 学生大多在每学期末出售物品。一条命令准备清仓：

```bash
pnpm semester-end
```

此脚本：
1. 打印所有已上架超过 60 天的 `available` 物品（与 `pnpm stale-check`，§2.4，共用同一套"过时"判定，两者不会互相矛盾）
2. 对每件过时物品逐一提示（通过共用的 `scripts/lib/cliPrompt.ts`）：标记已售、降低最低档位价格，或保持不变
3. 如有变更则运行 `pnpm upload-images`
4. 打印建议的提交信息（`"chore: end-of-semester listing cleanup"`）以及使用该信息的完整 `git add`/`commit`/`push` 命令序列——或直接用 `pnpm push` 的替代方案

**更正（2026-09-05）：** 本文档之前的设想是打开 `$EDITOR` 编辑标记的 `item.json` 文件，且脚本会自动生成提交。实际上线版本改为逐项内联提示（更简单，不依赖 `$EDITOR`），并且刻意**不会**自己执行 `git commit`/`git push`——发布仍是一个由卖家主动触发的显式步骤（`pnpm push` 或打印出的手动命令序列），与项目里其他所有会修改内容的脚本保持一致。

---

### 1.13 Google Analytics（GA4）✅ 已发布
**工作量：** XS · **价值：** ⭐⭐

卖家将 GA4 测量 ID 粘贴到 `siteConfig.analytics.googleAnalyticsId`；
`<GoogleAnalytics />`（`@next/third-parties/google`）仅在该字段设置时才会
在根布局中渲染。之所以选择它作为 Vercel Analytics（§1.9）的替代/补充方案，
是因为它**不依赖任何托管方式**——可在 GitHub Pages 上运行，而 Vercel
Analytics 需要 Vercel 托管。可在 Seller Studio 的配置面板（Analytics
标签页）中编辑，并带有内联格式校验（必须为空或以 `G-` 开头）。

---

### 1.14 上传时剥离 EXIF/GPS 元数据 ✅ 已发布
**工作量：** XS · **价值：** ⭐⭐⭐

手机拍摄的照片通常在 EXIF 元数据中嵌入 GPS 坐标——对于卖家需要与买家线下见面的单卖家平台来说，未剥离的照片可能会向任何检查原始文件的人泄露卖家的家庭住址。`pnpm upload-images` 会在每张新增/变更的 JPEG/PNG/WebP 照片上传到 CDN 前，通过 `sharp`（`lib/images/stripMetadata.ts`）重新编码，移除所有 EXIF/IPTC/XMP 元数据（包括 GPS），同时自动旋转以保留正确朝向。GIF 原样通过（本身就没有 EXIF 段）。Seller Studio 的"同步到 CDN"走的是同一套剥离逻辑。详见 `docs/CURRENT_FUNCTIONALITY_zh.md`（"照片隐私——EXIF/GPS 剥离"）。

**更正（2026-09-05）：** 本文档上一版误将此功能记为 2026-09-04 那次 serverless/后端选项探讨中尚未实现的构想。实际上它早在那次探讨之前就已上线（`50d257e`，2026-06-11）——"不需要后端"这个结论是对的，但"尚未实现"这个前提是错的。

---

### 1.15 物品传单 PDF 下载 ✅ 已发布
**工作量：** S · **价值：** ⭐⭐

物品详情页上的"下载传单"按钮（`components/item/FlyerButton.tsx`）会生成一份可打印的单品 PDF（`lib/pdf/generateItemFlyer.ts` / `flyerContent.ts`），内含物品照片、价格，以及一个链回该商品实时页面的二维码——适合贴在实体布告栏上，或当面递给别人。

在 `cloudflare-r2` provider 下，这需要先跑一次性的 `pnpm configure-image-cors`（见 `docs/SCRIPTS_zh.md`）：传单按钮要跨域抓取图片字节以嵌入 PDF，跟站点其他地方用的 `<img>` 标签不同，所以需要 R2 显式允许这种跨域请求。

在 2026-09-05 的文档核查中发现——一个真实已上线、但此前完全没被写进路线图的功能。

---

## Tier 2 — 中期功能
*有意义的改进。每项独立且可独立发布。*

### 2.1 客户端全文搜索 🎓 👤 ✅ v1 已包含
**工作量：** M · **价值：** ⭐⭐⭐

`fuse.js` 在构建时从所有物品名称、描述、品牌、型号和标签构建索引。`SiteHeader` 中的搜索输入框——用户输入时显示结果。

已列入可扩展性注册表（DESIGN_zh.md §19）。无需后端。物品超过约 30 件后变得必不可少。

---

### 2.2 标签筛选 🎓 👤 ✅ 已发布
**工作量：** M · **价值：** ⭐⭐⭐

`lib/content/loader.ts` 的 `loadTagIndex()` 只用一次 `loadAllItemsRaw()` 遍历就建好"slug → 物品列表"映射；`FilterBar.tsx`/`useFilters.ts` 新增了多选（AND 匹配）标签筛选条（形态和 §2.15 的课程筛选一致，但因为一件物品可以同时有意义地带多个标签，所以是多选）；`app/tags/[tag]/page.tsx` 是完全静态的 `generateStaticParams()` 路由，列出跨所有分类中带该标签的每件可见物品。物品详情页上每个标签徽章都链接到对应的 `/tags/{tag}` 页面。两个不同拼写的标签如果 slug 化后撞车（极少见的边界情况），会连同警告一起从索引中一并丢弃，而不是让其中一个悄悄"胜出"。

此前已列入可扩展性注册表。

---

### 2.3 深色模式 🎓 ✅ v1 已包含
**工作量：** M · **价值：** ⭐⭐

`SiteHeader` 中的 `ThemeToggle` 按钮 + `next-themes`（class 方式）：默认跟随访客的操作系统/浏览器偏好，并将明确选择持久化到 `localStorage`。所有 Aceternity 组件均支持深色模式。

---

### 2.4 卖家 CLI 工具 🎓 👤 ✅ 已发布
**工作量：** S–M · **价值：** ⭐⭐⭐

减少手动编辑 `item.json` 的脚本。CS 学生将其作为高效工具使用；非技术用户依赖这些工具避免直接打开 JSON 文件。

**v1 已包含（模板 v1.4.2）：** `pnpm create-item` / `pnpm new`（生成 36 字段的 `item.json` 脚手架）、`pnpm create-template`（带注释的 `_template.json`）、`pnpm mark-sold`（以 JSONC 精确编辑更新状态 + `sold_date`）、`pnpm upload-images`（CDN 同步）、`pnpm configure-image-cors`（一次性 R2 CORS 设置，让物品传单 PDF §1.15 能跨域抓取照片字节）、`pnpm fb-export`（§3.4）、`pnpm studio`（§3.8），以及下游站点的模板管理工具：`pnpm update-site`（拉取模板版本且不触碰 `content/`）、`pnpm migrate-config`（自动注入新的可选配置字段）、`pnpm push`（提交 + 推送 `content/` 和 `lib/generated/image-manifest.json`）、`pnpm bump`（交互式版本升级 + GitHub 发布）。

**2026-09-05 发布**（均采用与 `mark-sold.ts` 相同的"`scripts/lib/` 纯逻辑 + 轻量 CLI 包装"模式，各自带单元测试）：

| 脚本 | 功能 | 用户 |
|---|---|---|
| `pnpm mark-available houseware/ikea-lamp` | 将 `status` 从任意状态重置为 `available`，清空 `sold_date`；若已是 `available` 则不做任何事 | 🎓 👤 |
| `pnpm duplicate houseware/ikea-lamp houseware/ikea-lamp-2` | 复制文件夹 + 照片，副本上的 `status`/`listed_date`/`sold_date`/`price_reduced`/`previous_lowest_price`/`min_acceptable_offer` 均重置，并直接剥离 `reserved_for`（Iron Rule 4——私密备注不应流入无关的新商品） | 🎓 |
| `pnpm inventory` | 打印所有物品（不分状态）的 Markdown 表格：名称、分类、状态、最低解析价格、上架天数 | 🎓 👤 |
| `pnpm stale-check [--days N]` | 列出已 `available` 超过 N 天（默认 60）的物品 | 🎓 |
| `pnpm audit-listings` | 报告（已售物品除外）缺少推荐字段的物品：无照片、描述为空、无标签、开放式运送档位但缺重量/尺寸，或没有任何价格档位——判定标准写在脚本文件头部 | 🎓 |
| `pnpm export-csv` | 将所有物品导出为一份扁平 CSV 到 `exports/listings.csv`，供卖家自己记录用（与 Facebook 格式的 `pnpm fb-export` 不同） | 🎓 👤 |
| `pnpm semester-end` | 批量审阅 + 清理（见 §1.12） | 🎓 |

---

### 2.5 "浏览全部"跨分类页 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

`/all` 路由，在一个可滚动网格中显示所有分类的非草稿物品，含完整筛选 + 排序栏。

**实现说明（v0.8.1）：** 该页面使用单遍加载的 `loadBrowseAllPageData()`（`app/all/page.tsx`），只解析每件物品一次，并从中派生跨分类的可见物品列表；首页最近上架横条由 `loadHomePageData()`（`app/page.tsx`）提供。`loadAllItems()` 不再被任何页面调用。/all 页面显示 `available`、`reserved`/`pending`（带徽章）以及可切换显示的 `sold` 物品。

---

### 2.6 Stripe 支付链接集成 ✅ 已实现
**工作量：** S（仅 schema + UI）· **价值：** ⭐⭐⭐

`stripe_payment_link` 是 `item.json` schema（`lib/content/schema.ts`）的一部分，物品详情页会渲染一个**"支付定金"**按钮，链接到 `itemData.stripePaymentLink`（当设置了 `venmo_payment_request` 时，与"Pay with Venmo"按钮并列显示）。

无需后端，Stripe 处理支付，卖家在本地完成交易。消除了买家仅为付款而必须先联系卖家的摩擦。

---

### 2.7 取货预约链接 ✅ 已发布
**工作量：** XS（仅 schema + UI）· **价值：** ⭐⭐

`siteConfig.contact.schedulingUrl`（可选，站点级别——不是按物品设置）会在物品详情页显示一个"预约查看"按钮，点击后在新标签页打开外部预约链接（Calendly、Cal.com、Google 日历预约页面），采用和现有 Stripe/Venmo 支付按钮一样的条件渲染方式。

无需后端。省去反复沟通确定看货时间的麻烦。

---

### 2.8 "出价"流程 🎓 👤 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

`price.negotiable: true` **且** `min_acceptable_offer` 已设置时，在物品详情页显示"出价"（Make an Offer）按钮（本文档之前写的是"发送出价"按钮、且只提到 `negotiable` 这一个条件——实际按钮文案和门槛条件如此处所述）。小型内联表单询问买家出价金额，然后打开配置的联系平台并预填消息："我愿意出 $X 购买 {物品名称}。"

无需后端——表单只是构造一条深链消息。

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

已列入可扩展性注册表。

---

### 2.12 已售物品档案页 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐

`/sold` 路由，列出所有 `status: "sold"` 的物品，不受保留期限制。充当"过往交易展示"——提供信任证明，帮助买家了解典型价位。渲染网格以 `siteConfig.soldArchiveDisplayLimit` 为上限；页头仍显示完整的已售物品数量。

---

### 2.13 Twitter/X + Pinterest 富卡片 ✅ v1 已包含
**工作量：** XS · **价值：** ⭐⭐

- **Twitter 卡片：** `twitter:card: "summary_large_image"` 使用物品封面图
- **Pinterest 富 pin：** `product:price:amount` + `product:price:currency` 元标签（`og:type` 保持 `"website"`）

---

### 2.14 距离单位切换（英里 ↔ 公里）
**工作量：** S · **价值：** ⭐⭐

在站点配置中添加 `distanceUnit: "mi" | "km"`。`useDistancePricing` 仅在显示时转换。所有 `miles_min` / `miles_max` 字段在内部仍以英里表示。

已列入可扩展性注册表。

---

### 2.15 教材专属字段与分类 🎓 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐⭐

CS 学生出售大量教材。教材的一流支持使站点对该用户群体更有价值。

**Schema 扩展：** `isbn`、`course`、`edition`、`semester_listed`

**UI 扩展：**
- 存在 `isbn` 时显示"比价"按钮，链接到 `bookfinder.com/search/?isbn={isbn}`——✅ 已上线（`TextbookBadge.tsx`）
- `course` 显示为徽章（如"适用于 CS101"）——✅ 已上线
- 分类页按 `course` 代码筛选——✅ **2026-09-05 发布**。`FilterBar`/`useFilters.ts` 中的单选课程筛选条，仅在当前分类存在带非空 `course` 字段的物品时才渲染（与成色筛选条一样的条件渲染方式）。之所以是单选，是因为一本教材只属于一门课程，跟多选的标签（§2.2）不同。

**实现方式：** 纯增量——所有新 schema 字段均为可选，所有新 UI 均以字段存在为前提。

---

### 2.16 非技术用户设置指南 👤 ✅ v1 已包含
**工作量：** S · **价值：** ⭐⭐⭐

清晰、图文并茂的 `SETUP_GUIDE.md`，为由朋友帮助设置的非 CS 用户编写。核心章节涉及 `content/` 文件夹，内容包括：
1. 如何添加新物品（创建文件夹 → 添加 item.json → 添加照片 → 运行 `pnpm upload-images`）
2. 如何将物品标记为已售（`pnpm mark-sold category/item-name`）
3. 如何修改价格（编辑 `item.json` 中的 `amount` 字段）
4. 如何拍摄并命名一张好的封面照片
5. 出问题时怎么办（技术问题该找谁）

**更正（2026-09-05）：** 本文档之前称该指南"仅涉及 `content/` 操作"、"全文不使用任何代码/终端术语"——这对上面的核心章节成立，但指南其实还包含站点设置（`/setup`）、Seller Studio（`pnpm studio`）、运费 Worker（`/setup-shipping`，需要部署一个 Cloudflare Worker）、Facebook 导出（`pnpm fb-export`）这几个可选章节，它们都涉及运行终端或斜杠命令。假定 CS 学生朋友负责处理 git 相关问题。

---

## Tier 3 — 较大功能
*有意义的范围。每项需要仔细的架构规划。*

> **后端架构选项（2026-09-04 探讨）。** 下面（及 Tier 4）的几项功能都需要某种无服务器函数或自建服务。它们不是同一个项目——每一项的动机和代价都不同：
>
> | 类别 | 涉及 | 是否需要持久存储？ | 是否符合现有架构？ |
> |---|---|---|---|
> | **通知转发** | §3.1 联系表单/询问系统——将买家的消息或出价转发给卖家（邮件、Discord、Telegram） | 否——无状态转发 | ✅ 2026-09-05 已构建——`workers/contact-form-proxy/`，与 `workers/shipping-rate-proxy/` 同构 |
> | **本地上传前加固** | 剥离照片 EXIF/GPS 元数据（§1.14） | 否 | ✅ 符合——而且发现它其实早已作为 `pnpm upload-images` 的一个步骤上线；从来就不需要服务器 |
> | **需要状态的互动功能** | §3.2 物品浏览计数器、§4.2 无需重建的实时库存更新、§4.4 买家预订系统 | **是**——需要 Cloudflare KV/D1 之类 | ⚠️ 这是唯一真正打破本项目"零数据库"原则的类别。三项各自独立、各有代价；应该在开始其中任何一项之前，就是否接受持久状态做一次明确的、一次性的架构决策——而不是在实现第一项时被动地默认接受 |
> | **AI 工作流上云** | 将 `/update-items`、`/translate-items` 做成托管函数，而不是本地 Claude Code 会话 | 否 | ❌ 目前不推荐——Seller Studio 加本地技能已经很好地覆盖了这个场景；只有在未来某个卖家无法/不愿在本地运行 Claude Code 时才值得重新考虑 |
>
> 这是当初探讨中确认的最值得做的后端候选——它复用了已验证过的 Worker 代理模式、不需要持久存储，并且填补了一个真实存在的缺口（卖家此前在买家联系或出价时完全收不到任何站内通知）。现在它已经建好了——见下方 §3.1。

### 3.1 联系表单/询问系统 👤 ✅ 已发布
**工作量：** L · **价值：** ⭐⭐⭐

`workers/contact-form-proxy/`——一个与 `workers/shipping-rate-proxy/` 架构完全一致的 Cloudflare Worker（无状态转发、密钥通过 `wrangler secret` 持有、`ALLOWED_ORIGIN` 限制 CORS、不使用任何持久存储、不做限速/CAPTCHA——具体原因及卖家日后可在 Cloudflare 控制台层面自行添加的方案见其 README 的"未实现"一节）。物品详情页新增的 `EnquiryForm.tsx` 会把 `{ itemCategory, itemSlug, itemName, buyerName, buyerContact, message, offerAmount?, honeypot }` POST 给它；Worker 通过可插拔的 `NOTIFICATION_PROVIDER`（`"discord" | "telegram" | "email"`，模仿 `SHIPPING_PROVIDER` 的模式）转发一条格式化通知，每种方式各有自己的密钥。

**防垃圾信息：** 一个屏幕外的蜜罐字段（不用 `display:none`——部分机器人专门识别并跳过这种写法）。填了蜜罐字段的提交会收到和正常提交完全一样的 `200 {ok:true}` 响应——如果"蜜罐被填"和"字段缺失"这两种情况返回不同的响应，机器人就能学出是哪个检查被触发了。

**配置：** `siteConfig.notifications?: { enabled: boolean; proxyUrl: string }`——可选，默认禁用，已按 Iron Rule 8 注册进 `scripts/lib/configDefaults.ts`。卖家配置指南见 `.claude/commands/setup-contact-form.md`（模仿 `/setup-shipping`）。

**更正（2026-09-05）：** 本节之前称"`ContactSection` 组件已为此预留了插槽"——这不属实，`ContactSection.tsx` 里没有任何占位或扩展点。实际是在物品详情页给 `ContactSection` 加了一个平级的 `EnquiryForm` 组件。

---

### 3.2 物品浏览计数器
**工作量：** M · **价值：** ⭐⭐

使用注重隐私的分析服务（GoatCounter——免费、开源、可自托管）的轻量级每物品浏览计数器。作为未来"最多浏览"区块的数据来源。

---

### 3.3 离线缓存（PWA Service Worker）
**工作量：** M · **价值：** ⭐⭐

缓存最近访问的物品页面和图片的 Service Worker。允许买家在没有网络连接时查看之前访问过的物品——在网络信号差的车库跳蚤市场很有用。

建立在 PWA manifest（Tier 1.10）之上。

---

### 3.4 跨平台发布导出模板——Facebook Marketplace ✅ 已实现
**工作量：** M · **价值：** ⭐⭐

`pnpm fb-export` 交互式将在售 / 待处理 / 已预留（available / pending / reserved）物品导出为 Facebook Marketplace 批量上传 CSV。引导式界面：

0. **导出历史** *（仅第 2 次及以后运行时出现）* — 跳过已导出物品、查看历次运行记录，或全部导出（见下方"智能导出历史"）
1. **物品选择** — 全部物品、单个分类，或手动挑选子集（逗号列表或 `1-4` 区间写法）
2. **价格档位** — 5 选项菜单：`[1]` 所有档位中的最低价（默认；推荐）、`[2]` 所有档位中的最高价、`[3]` 最低价与最高价的平均值、`[4]` 本地自取价（仅限有里程限制的档位）、`[5]` 运送价（仅限开放式档位）。选项 4 和 5 仅当所选物品中存在相应档位时才显示；无匹配档位的物品分别回退到最低价/最高价。（2026-09-05 更正——本文档之前只写了 4 个选项，漏掉了 `scripts/export-facebook.ts` 里的"平均值"选项。）

随后 CSV 写入和照片文件夹复制自动完成（没有交互式的"输出"步骤）：写入 `exports/facebook-marketplace.csv`（超过 50 条时自动分批输出编号文件 `facebook-marketplace-<N>.csv`——FB 每次上传上限），并将本地照片复制到 `exports/facebook-marketplace-photos/NNN_category-item/`（按行号命名）供手动上传。导出前，CLI 会警告没有 CDN 照片的物品，并建议先运行 `pnpm upload-images`。

**智能分类映射**（`scripts/lib/fbCategoryMap.ts`）：40+ 条关键词规则（目前 49 条）将物品标签、名称、品牌、型号匹配到 FB 的 `"顶级//子级//叶级"` 分类格式。覆盖 GPU/CPU/RAM、教材、家具、音频、手机、游戏、服装等品类。无匹配时回退到分类 slug（FB 将提示卖家手动选择）。

**字段映射：**

| item.json 字段 | FB CSV 列 | 说明 |
|---|---|---|
| `name`（+ 品牌/型号前缀） | TITLE | 截断至 150 字符；品牌/型号仅在名称中未包含时才前置 |
| 最低/最高 `price.tiers[].amount` | PRICE | 四舍五入为整数；档位由交互式选择决定 |
| `condition` | CONDITION | `good→"Used - Good"`, `like-new→"Used - Like New"`, `new→"New"`, `fair/for-parts→"Used - Fair"` |
| `description` + 元数据块 | DESCRIPTION | 附加品牌、型号、颜色、年限、原价、标签、ISBN、edition 为 `[key: value]` 页脚；截断至 5000 字符 |
| 关键词规则 | CATEGORY | 自动从语料库检测 |
| CDN 图片 URL | PHOTO 1…PHOTO 10 | 最多 10 列，填入 CDN（`https://`）URL；本地 `/items/` 路径被跳过——没有 CDN 照片的物品会被标记并提示运行 `pnpm upload-images` |
| `weight`（转换为磅） | SHIPPING WEIGHT | 仅当存在运送档位（无 `miles_max`）时填写 |
| 存在运送档位且 `price.shipping_payer === "seller"` | OFFER FREE SHIPPING | Yes/No |
| 存在开放式档位 | OFFER SHIPPING | Yes/No |

**智能导出历史** (`scripts/lib/exportHistory.ts`)：第二次运行时，步骤 0 会询问是否跳过上次已导出的物品。历史记录以 `{categorySlug}/{itemSlug}`（稳定的文件系统路径）为键，保存于 `exports/.export-history.json`（已加入 gitignore）。每次运行会追加一条 `ExportRun` 记录，包含时间戳、价格策略、物品数量、CSV 文件路径，以及每件物品的 slug、名称和价格。卖家可仅导出新上架物品，不必担心与 FB 已有发布重复。

**其余平台**（Craigslist、OfferUp、eBay）仍为路线图待办项，留待未来迭代。

---

### 3.5 "捆绑优惠"多物品联系
**工作量：** M · **价值：** ⭐⭐

作为 v2 schema 扩展，在 `item.json` 中添加 `bundle_with`（它**不属于** v1 schema）。物品详情页显示"可与 {物品 X} 捆绑"区块，列出关联物品及合计价格。"联系捆绑购买"按钮预填包含所有物品和合计金额的联系消息。

---

### 3.6 降价跟踪（历史记录）
**工作量：** M · **价值：** ⭐⭐

**v1 已包含 Schema + UI：** `price_reduced` 和 `previous_lowest_price` 是 v1 `item.json` 字段（DESIGN_zh.md §5）；"已降价"标签和删除线原价已在物品卡片和详情页渲染（DESIGN_zh.md §10.3）。**只有**价格历史*日志*是未来（v2）新增内容。

未来的 `pnpm price-history` 可以为每件物品维护一个本地 `price-history.json`，记录历次价格变动——帮助卖家了解物品在不同价位下的成交周期。

---

### 3.7 国际化——多语言支持 ✅ v1 已包含
**工作量：** L · **价值：** ⭐⭐

为 `item.json` 的文本字段添加语言变体（`name_zh`、`description_zh`），并提供 `i18n.defaultLocale` / `i18n.availableLocales` 配置键。单次部署多语区：所有语区变体在一次部署中发布；访客通过页头的 `LocaleSwitcher` 在运行时切换语言（选择持久化在 `localStorage`；SSG HTML 渲染 `defaultLocale`）。未翻译的字段自动回退到英文。`/translate-items` AI 技能可批量填充翻译。

已列入可扩展性注册表（Extensibility Register）。

---

### 3.8 卖家工作台（Seller Studio，`pnpm studio`）👤 ✅ 已实现
**工作量：** L · **价值：** ⭐⭐⭐

**这是非 CS 用户群体的主要无障碍功能。** 通过 `pnpm studio` 启动的仅本地浏览器界面（默认端口 5174，可用 `--port <1024–65535>` 覆盖），让卖家可视化管理物品——无需直接编辑 JSON 文件。它通过 `pnpm update-site` 分发到下游站点，三个实现部分均已完成：**Phase 18a**（物品表格 + 批量状态）、**Phase 18b**（照片 + CDN 同步）、**Phase 18c**（编辑表单 + 物品创建 + git 发布）。

**架构：** `studio/` 中的 Vite SPA，由 `tsx scripts/studio.ts` 启动，仅绑定 **127.0.0.1**（从不部署）。与最初的计划不同，它**确实**有后端：`studio/vite.config.ts` 中的 `studioApiPlugin` 中间件将所有 `/api/*` 请求路由到 `scripts/lib/studioApi.ts` 中与框架无关的处理器（Zod 校验、slug 白名单 + 针对 `content/items/` 的路径约束）。CSRF 防护（`studio/csrfGuard.ts`）要求所有非 GET/HEAD 请求携带 `Content-Type: application/json` 且 `Origin` 匹配。

**已实现功能：**

- **物品表格** — 每件物品带缩略图、最低档位价格和货币；单个物品的加载错误相互隔离；每次写入后完整重新读取服务端数据
- **批量状态** — 对选中项批量标记 available / reserved / pending / sold / draft，逐项报告失败，带动画"已售"印章
- **图片面板** — 拖放上传（按魔数嗅探内容类型：jpg/png/webp/gif）、拖拽重排、删除
- **CDN 同步** — 将新增/变更的照片上传到配置的 CDN，以 Server-Sent-Events 流式显示进度；一次只能运行一个同步（互斥锁）；同步运行期间拒绝发布
- **编辑表单** — schema 驱动的分组字段；仅发送变更字段；保留注释的 JSONC 写入，卖家格式和 `// options:` 注释不会丢失（`reserved_for` 从不被读取或写入）
- **物品创建对话框** — 分类选择 + kebab-case 名称，基于 36 字段模板生成
- **Git 发布面板** — 未提交变更计数、提交消息输入、推送。**仅**暂存 `content/` 和 `lib/generated/image-manifest.json`（绝不使用 `git add -A`，因此含 CDN 凭据的 `.env.local` 永远不会被误提交），与 `pnpm push` 一致
- **PDF 商品目录导出** — `ExportPdfDialog` 生成当前全部在售商品的多页 PDF 目录：封面、目录页、按分类汇总的价格摘要，以及每件商品链接到联系方式的二维码（`scripts/lib/pdfCatalog/`）。此前完全没被写进路线图——2026-09-05 文档核查时补上。与 §1.15 的单品传单下载是两个不同的功能。

非技术用户的工作流完全由 GUI 驱动：`pnpm studio`（唯一一条终端命令），然后填表单、拖照片、点击同步和发布。对他们而言，没有 JSON，也没有 git 命令。

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

### 4.3 运费计算器集成 ✅ 已实现（可选）
**工作量：** L · **价值：** ⭐⭐

对于有"邮寄"价格档位的物品：集成 Shippo/EasyPost API，根据买家邮编、物品尺寸和重量计算实际运费，将固定的"邮寄：$档位金额"替换为实时估算结果。

实现为完全可选的开关功能（`siteConfig.shipping.enabled`），运费承担方可配置（卖家或买家，支持站点级默认值 + 通过 `price.shipping_payer` 的单品覆盖）。API 密钥通过独立部署的 Cloudflare Worker（`workers/shipping-rate-proxy/`）代理，绝不会出现在浏览器构建产物中。完整设计见 [DESIGN_zh.md §21](DESIGN_zh.md)，卖家配置指南见 `.claude/commands/setup-shipping.md`。

**显示条件：** 估算器仅在 `siteConfig.shipping` 启用、物品有重量 + 尺寸、且解析出的价格档位为开放式运送档位时渲染。Worker 返回最低费率（`{amount, currency, carrier, service, estimatedDays}`），并按承运商 API 需要换算单位（kg→lb/oz，cm→in）。

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

v1 已发布的功能已移至本文档顶部的"v1 已包含"部分。

🎓 = 主要服务 CS 学生 · 👤 = 主要服务非 CS 用户 · 🎓👤 = 两者均服务

| 功能 | 用户 | 状态 |
|---|---|---|
| PWA manifest（可安装） | 🎓👤 | ✅ 已实现 |
| 上传时剥离 EXIF/GPS 元数据（`pnpm upload-images`） | 🎓👤 | ✅ 已实现 |
| 学期末批量操作（`pnpm semester-end`） | 🎓 | ✅ 已实现 |
| 取货预约链接（Calendly/Cal.com 字段） | 🎓👤 | ✅ 已实现 |
| 标签筛选页（`/tags/{tag}`） | 🎓👤 | ✅ 已实现 |
| 卖家 CLI 工具包（mark-available/duplicate/inventory/stale-check/audit-listings/export-csv） | 🎓👤 | ✅ 已实现 |
| 距离单位切换（英里 ↔ 公里） | 🎓 | v1.1 |
| Stripe 支付链接按钮（"支付定金"） | 🎓👤 | ✅ 已实现 |
| 物品传单 PDF 下载（`FlyerButton`，§1.15） | 🎓👤 | ✅ 已实现 |
| Facebook Marketplace 导出（`pnpm fb-export`） | 🎓 | ✅ 已实现 |
| 跨平台导出（Craigslist / OfferUp / eBay） | 🎓 | v2 |
| 捆绑优惠多物品联系 | 🎓👤 | v2 |
| 联系表单（Cloudflare Worker 转发，隐藏联系信息） | 👤 | ✅ 已实现 |
| 物品浏览计数器（GoatCounter） | 🎓 | v2 |
| 离线缓存（PWA Service Worker） | 🎓👤 | v2 |
| 降价跟踪（历史记录） | 🎓👤 | v2 |
| Vercel Analytics + Speed Insights | 🎓 | v2（依赖已安装但未接入；需要 Vercel 托管） |
| Google Analytics（GA4） | 🎓👤 | ✅ 已实现 |
| **卖家工作台（Seller Studio，`pnpm studio`）** | 👤 | ✅ 已实现 |
| 多卖家支持 | 👤 | v3 / 需要架构重新设计 |
| 无需重建的实时库存 | 👤 | v3 |
| 买家预订系统 | 👤 | v3 |
