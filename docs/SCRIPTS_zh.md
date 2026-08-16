# UsedExchange — 脚本与工具参考

**版本：** 1.0
**日期：** 2026-08-02
**包版本：** 1.4.2（见 `package.json`）

> 本文档为仓库中所有 npm 脚本、独立 CLI 及支撑模块的完整参考。架构与数据流见 [ARCHITECTURE_zh.md](ARCHITECTURE_zh.md)；完整设计规范见 [DESIGN_zh.md](DESIGN_zh.md)；非技术卖家操作指南见 [../SETUP_GUIDE.md](../SETUP_GUIDE.md)。
>
> 🇺🇸 English version: [SCRIPTS.md](SCRIPTS.md)

---

## 概述

- 所有 CLI 均位于 `scripts/`，通过 **tsx** 执行（Node.js 环境——无浏览器 API），属于生产级工具，而非仅开发期辅助。
- 根目录 `package.json` 共定义 **22 个 npm 脚本**；`new` 是 `create-item` 的完全别名，另有三个脚本（`upload-images`、`dev`、`prebuild`）是 `scripts/sync-images.ts` 三种模式的轻量封装。
- **卖家只需手动编辑 `content/` 内的文件。** 下文的 CLI 会*代你*读写 `content/`——你无需亲自打开 `app/`、`lib/` 或 `scripts/`。
- `workers/shipping-rate-proxy/` 是一个**独立部署**的 Cloudflare Worker 包，拥有自己的 `package.json`；它不在根级 tsconfig / ESLint / Vitest 的作用域内。
- `lib/generated/image-manifest.json` **提交到 git**（铁律 #5）。脚本负责写入它；CI 直接读取它，无需任何 CDN 凭据。

---

## npm 脚本

### 卖家工作流

| 脚本 | 实际执行 | 用途 |
|---|---|---|
| `pnpm upload-images` | `tsx scripts/sync-images.ts --mode upload` | 将新增/变更的照片上传至 CDN，去除 EXIF/GPS 信息，写入已提交的图片清单 |
| `pnpm create-item <category>/<name>` | `tsx scripts/create-item.ts` | 先应用全站/分类 `_defaults.json`，再生成 36 字段的草稿 `item.json` |
| `pnpm new <category>/<name>` | `tsx scripts/create-item.ts` | `create-item` 的完全别名 |
| `pnpm create-template [category]` | `tsx scripts/create-template.ts` | 写入带完整注释的 `_template.json`，供卖家复制使用 |
| `pnpm mark-sold <category>/<item>` | `tsx scripts/mark-sold.ts` | 设置 `status="sold"` + `sold_date=today`，并保留 JSONC 注释 |
| `pnpm setup-check` | `tsx scripts/setup-check.ts` | 打印就绪清单：还缺什么，以及每一步对应的命令或面板。核心步骤未完成时以 1 退出 |
| `pnpm fb-export` | `tsx scripts/export-facebook.ts` | 交互式导出 Facebook Marketplace CSV |
| `pnpm push` | `git add content lib/generated/image-manifest.json && git commit -m 'chore: update listings' && git push` | 提交并推送卖家内容与图片清单 |
| `pnpm studio [--port <n>]` | `tsx scripts/studio.ts` | 仅本地（127.0.0.1）的浏览器管理界面，用于管理 `content/` —— 编辑物品、管理照片、CDN 同步、git 发布 |

### 开发者 / 维护

| 脚本 | 实际执行 | 用途 |
|---|---|---|
| `pnpm setup-ui` | `bash scripts/setup-ui.sh` | 一次性安装全部 27 个受支持的 Aceternity UI 组件 |
| `pnpm update-site [tag] [--list] [--skip-verify]` | `tsx scripts/update-site.ts` | 将上游模板的指定版本拉入下游站点，且不触碰 `content/` |
| `pnpm migrate-config` | `tsx scripts/migrate-config.ts` | 模板升级后，向 `content/config.ts` 注入缺失的可选配置字段（带默认值） |
| `pnpm bump` | `tsx scripts/bump-version.ts` | 交互式版本号提升 + 等待 CI + 打 git 标签 + 创建 GitHub Release（仅上游使用） |

### 构建流水线

| 脚本 | 实际执行 | 用途 |
|---|---|---|
| `pnpm dev` | `tsx scripts/sync-images.ts --mode dev-sync && next dev --turbo` | 将照片与联系文件复制到 `public/` 供本地访问，随后启动 Next.js 开发服务器（Turbopack） |
| `pnpm prebuild` | `tsx scripts/check-config.ts && tsx scripts/sync-images.ts --mode build-check && tsx scripts/build-search-index.ts` | 构建前置关卡：配置检查 → 图片校验/复制 → 搜索索引（`build` 前自动运行） |
| `pnpm build` | `next build` | 静态生产构建 → `out/`（prebuild 会先自动运行） |
| `pnpm postbuild` | `tsx scripts/postbuild.ts` | 若 `siteConfig.sitemap.enabled` 为真，则生成 `sitemap.xml` + `robots.txt`（`build` 后自动运行） |

### 测试与代码检查

| 脚本 | 实际执行 | 用途 |
|---|---|---|
| `pnpm type-check` | `tsc --noEmit` | 不产出文件的 TypeScript 类型检查；`update-site` 的验证步骤也会用到 |
| `pnpm lint` | `eslint . --max-warnings 0` | 全仓库 ESLint 检查，零警告容忍 |
| `pnpm format` | `prettier --write .` | 使用 Prettier 就地格式化整个仓库 |
| `pnpm test` | `vitest run` | 单次运行 Vitest 测试套件（36 个测试文件 / 约 585 个用例，含全部 `scripts/lib/*.test.ts`） |
| `pnpm test:watch` | `vitest` | Vitest 监听模式 |
| `pnpm test:coverage` | `vitest run --coverage` | Vitest + v8 覆盖率报告（写入 `coverage/`） |

---

## CLI 入口文件（`scripts/*.ts` + `setup-ui.sh`）

### `studio.ts` —— Seller Studio 启动器

- **命令：** `pnpm studio [--port <n>]`（或 `tsx scripts/studio.ts [--port <n>]`）
- **参数：** `--port <n>` —— 整数 **1024–65535**，默认 **5174**（`DEFAULT_PORT`，`strictPort=false`，即端口被占用时 Vite 自动顺延到下一个空闲端口）。
- **用途：** 校验前置条件（若未安装 `vite` 则快速失败并提示运行 `pnpm install`；若缺少 `studio/vite.config.ts` 则提示运行 `pnpm update-site`），加载 `.env.local`，注册 CDN 同步执行器，并启动仅绑定 **127.0.0.1** 的 Studio Vite 开发服务器。
- **环境变量：** `.env.local`（自动加载）；`CF_R2_*` 或 `BLOB_READ_WRITE_TOKEN` —— 仅在触发 CDN 同步时需要。图片适配器在*每次同步运行时*才构建，因此缺少 CDN 凭据只会表现为 SSE 错误事件，不会导致启动失败。
- **触碰的文件：** 读取 `studio/vite.config.ts`；读写 `content/items/**/item.json` 及物品照片目录（经由 `scripts/lib/studioApi.ts`、`itemEdit.ts`、`itemFields.ts`、`studioImages.ts`）；git status/add/commit/push 仅限 `content/` + `lib/generated/image-manifest.json`（`studioGit.ts` —— 与 `pnpm push` 保持一致，绝不使用 `git add -A`）；CDN 同步写入 `lib/generated/image-manifest.json` 与 `.image-cache/checksums.json`（`studioSync.ts` —— 同时只允许一次同步的互斥锁，SSE 进度推送）。
- **API 面**（由 `scripts/lib/studioApi.ts` 路由）：`GET /api/items`、`POST /api/items`、`POST /api/items/bulk-status`、`GET|PATCH /api/items/<cat>/<item>`、`GET /api/items/<cat>/<item>/images`、`GET …/images/<filename>`（文件服务，`no-store`）、`POST …/images`（base64 上传）、`POST …/images/reorder`、`DELETE …/images/<filename>`、`POST /api/sync-images`（SSE progress/done/error 事件）、`GET /api/changes`、`POST /api/publish`（同步进行中返回 409）。非 GET/HEAD 请求须通过 `studio/csrfGuard.ts` 校验（要求 `Content-Type: application/json` → 否则 415；`Origin` 必须与服务器自身源一致 → 否则 403）。

> **目录 PDF 导出**（Seller Studio 中的"导出 PDF"按钮）通过 headless Chromium 渲染。首次使用需要执行一次：`npx playwright install chromium`。

### `sync-images.ts` —— 统一图片流水线

- **命令：** `tsx scripts/sync-images.ts --mode <upload|dev-sync|build-check>`（`--mode` 缺失或非法时退出码为 1）。
- **三种模式：**
  - `upload`（= `pnpm upload-images`）—— 将新增/变更的照片上传到已配置的 CDN（Cloudflare R2 / Vercel Blob / local），去除 EXIF/GPS 元数据，写入 `lib/generated/image-manifest.json`（git 跟踪）与 `.image-cache/checksums.json`（sha256 缓存，gitignore），复制 `content/contact/*` → `public/contact/*`，并输出提示性的质量警告（文件 >8 MB、宽度 <800 px、缺少 `cover.*`、物品文件夹无图片）。单文件失败**不会**使整批作废；若有任何失败，脚本最终退出码为 1 —— 重新运行即可重试。
  - `dev-sync`（= `pnpm dev` 中 `next dev` 之前）—— 将物品照片从 `content/items/` 复制到 `public/items/`（通过 `copyIfChanged` 按 mtime+size 比较），联系文件复制到 `public/contact/`。若 `content/items/` 缺失则跳过图片复制，但联系文件仍会复制。
  - `build-check`（= `pnpm prebuild` 的一部分）—— 始终复制 `content/contact/` → `public/contact/`；`provider=local` 时将物品照片复制到 `public/items/`；云端 provider 时仅检查 `lib/generated/image-manifest.json` 是否存在（缺失只警告，不失败）。
- **环境变量：** `.env.local`；`provider=cloudflare-r2` 时需要：`CF_R2_ACCOUNT_ID`、`CF_R2_ACCESS_KEY_ID`、`CF_R2_SECRET_ACCESS_KEY`、`CF_R2_BUCKET`、`CF_R2_PUBLIC_URL`；`provider=vercel-blob` 时需要：`BLOB_READ_WRITE_TOKEN`。
- **触碰的文件：** `content/items/**`、`content/contact/*`、`public/items/**`、`public/contact/**`、`lib/generated/image-manifest.json`、`.image-cache/checksums.json`。

### `create-item.ts` —— 物品脚手架

- **命令：** `pnpm create-item <category>/<name>`（别名：`pnpm new`）。
- **参数：** 恰好一个位置参数 `<category>/<name>`；两部分均须为非空 kebab-case，且在**任何文件系统访问之前**由 `isValidSlug` 校验（防路径穿越，与 `generateStaticParams` 共用同一校验）。分类文件夹必须已存在；物品文件夹必须不存在。
- **用途：** 依据 36 字段草稿模板写入 `content/items/<category>/<name>/item.json`（`status: "draft"`、当天日期、站点的度量单位与默认价格分级）。若设置了 `$EDITOR`，则以 `spawnSync` 参数数组方式打开新文件（无 shell 插值）。
- 写文件前通过 `scripts/lib/itemDefaults.ts` 应用两级默认值（`content/items/_defaults.json`
  加该分类自己的）；默认值文件损坏时报错中止，并指出文件和字段。
- **环境变量：** `EDITOR`（可选）。
- **触碰的文件：** 读取 `content/config.ts`（`measurementUnit`、`defaultPriceTiers`）；写入新的 `item.json`。

### `create-template.ts` —— 模板写入器

- **命令：** `pnpm create-template [category]`。
- **参数：** 可选位置参数 `[category]` —— 带参数时写入 `content/items/<category>/_template.json`（分类目录必须存在）；不带参数时写入 `content/items/_template.json`。
- **环境变量：** 无。
- **触碰的文件：** 读取 `content/config.ts`；写入带完整注释的 `_template.json` 脚手架（`reserved_for` 被排除 —— 该字段为内部专用，绝不在页面渲染）。

### `mark-sold.ts` —— 标记已售

- **命令：** `pnpm mark-sold <category>/<item>`。
- **参数：** 恰好一个位置参数 `<category>/<item>`，在文件系统访问前校验 kebab-case。
- **用途：** 通过外科手术式 JSONC 编辑设置 `status="sold"` 与 `sold_date=today`（`jsonc-parser` 的 `modify`/`applyEdits` —— 绝不走解析再序列化流程，因此 `// options:` 注释与私有的 `reserved_for` 字段均原样保留）。若状态已是 `sold`，则不做任何操作并以退出码 0 结束（提示 "already marked as sold"）。
- **环境变量：** 无。
- **触碰的文件：** 读写 `content/items/<category>/<item>/item.json`。

### `export-facebook.ts` —— Facebook Marketplace 导出

- **命令：** `pnpm fb-export`（完全交互式）。
- **流程：**
  - **第 0 步**（仅当 `exports/.export-history.json` 存在时）：`[s]` 跳过已导出物品（默认）· `[v]` 先查看历史导出记录再决定 · `[n]` 全部导出。
  - **第 1 步 —— 选择范围：** `[a]` 全部 · `[N]` 分类编号 · `[m]` 手动挑选（编号 / 区间 / `all`）。
  - **第 2 步 —— 价格策略：** `[1]` 最低分级（默认）· `[2]` 最高 · `[3]` 自提（限里程分级；仅当存在时显示）· `[4]` 邮寄（开放式分级；仅当存在时显示）· `[5]` 最低与最高的平均值。
  - 导出 `available` / `pending` / `reserved` 状态的物品，**每批 50 个**（标题 ≤150 字符，描述 ≤5000 字符，`PHOTO` 列 ≤10 个且为 CDN URL）。对无 CDN 照片的物品给出警告 —— 请先运行 `pnpm upload-images`。
- **环境变量：** 无。
- **触碰的文件：** 通过 `loadAllItemsRaw` 读取 `content/items`（含用于手动上传副本的本地照片目录）；写入 `exports/facebook-marketplace.csv` 或 `exports/facebook-marketplace-<N>.csv`、`exports/facebook-marketplace-photos/NNN_category-item/`、`exports/.export-history.json`（gitignore 的导出历史）。

### `update-site.ts` —— 模板更新器（下游站点）

- **命令：** `pnpm update-site [tag] [--list] [--skip-verify]`。
- **参数：** 无参数 = 最新的 `vX.Y.Z` 标签；`[tag]` = 指定标签；`--list` = 列出可用版本后退出（跳过工作区干净检查）；`--skip-verify` = 跳过 `pnpm install` / 类型检查 / 构建。
- **用途：** 从上游标签（`WillWYQ/usedExchange`）检出 `TEMPLATE_PATHS` —— `.claude`、`.github`、`.env.example`、`.gitignore`、`LICENSE`、`README(_zh).md`、`SETUP_GUIDE.md`、`app`、`components`、`components.json`、`hooks`、`lib`、`public`、`scripts`、`studio`、`docs` 以及根配置（`eslint.config.mjs`、`next-env.d.ts`、`next-sitemap.config.js`、`next.config.ts`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`postcss.config.mjs`、`prettier.config.js`、`tsconfig.json`、`vitest.config.ts`）—— **绝不触碰 `content/`**。要求工作区干净；缺少 `upstream` 远程时自动添加；大范围检出后**从 HEAD 恢复 `lib/generated/image-manifest.json`**（铁律 #5）；删除过期的 `.next/`；运行 `migrate-config`；验证通过后，若有变更则提交 `chore: update site code to <tag>`，并提示你执行 `git push`。
- **环境变量：** 无。
- **触碰的文件：** 对上述路径执行 git checkout；恢复图片清单；迁移 `content/config.ts`；可能删除 `.next/`。

### `migrate-config.ts` —— 配置迁移

- **命令：** `pnpm migrate-config`（`update-site` 在检出后也会以编程方式调用它 —— 由 `argv[1]` 的 `endsWith` 判断守护，因此仅导入该模块不会自动执行）。
- **用途：** 扫描 `content/config.ts`，找出模板升级后缺失的配置字段，并按 `scripts/lib/configDefaults.ts` 中 `CONFIG_DEFAULTS` 注册表的默认值拼接注入（当前为 `priceFilterStrategy` 块及 `filterPriceBucketAll` / `filterPriceIncludesOutliers` 两个 UIStrings 键）。**只做加法** —— 绝不删除或修改已有值。与铁律 #8 一致：每个被注入的字段在 TypeScript 类型上都是可选的，且在使用处有运行时默认值，因此即使下游配置跳过迁移也能通过类型检查。若某条目的锚点行（`afterKey`）未找到则跳过（并警告）；输出新增字段名或 "config is up to date"。
- **环境变量：** 无。
- **触碰的文件：** 读写 `content/config.ts`；读取 `scripts/lib/configDefaults.ts`。

### `check-config.ts` —— 构建前配置检查

- **命令：** `tsx scripts/check-config.ts`（在 `prebuild` 中运行；失败时退出码为 1）。
- **用途：** 若 `siteConfig.baseUrl` 仍为占位域名，或任一 `availableLocales` 语言在 `i18n.translations` 中缺失、或缺少 73 个必需 `UIStrings` 键中的任何一个（带回退到默认语言的机制），则使构建失败。用于防止一个隐蔽的 SEO 陷阱：`new URL("https://your-domain.com")` 能通过校验，导致 canonical/OG/JSON-LD URL 带着占位域名上线。
- **环境变量：** 无。
- **触碰的文件：** 读取 `content/config.ts`（经由 `@/content/config`）与 `lib/utils/templateStatus.ts`（`PLACEHOLDER_DOMAIN`）。

### `build-search-index.ts` —— 搜索索引构建器

- **命令：** `tsx scripts/build-search-index.ts`（在 `prebuild` 中运行；致命错误时退出码为 1）。
- **用途：** 通过 `lib/search/index.ts` 的 `buildSearchIndex()` 从全部物品构建 Fuse.js 搜索索引，写入 `public/search-index.json`（gitignore；运行时由客户端 fetch）。
- **环境变量：** 无。
- **触碰的文件：** 读取 `content/items`（经由搜索索引构建器）；写入 `public/search-index.json`。

### `postbuild.ts` —— 站点地图生成器

- **命令：** `tsx scripts/postbuild.ts`（`build` 后自动运行）。
- **用途：** 若 `siteConfig.sitemap.enabled` 为真，则运行 `npx next-sitemap --config next-sitemap.config.js`，将 `sitemap.xml` + `robots.txt` 生成到 `./out`（next-sitemap 的 `outDir`）；否则输出 "sitemap disabled — skipping"。next-sitemap 失败时退出码为 1。
- **环境变量：** `NEXT_PUBLIC_SITE_URL`（由 `next-sitemap.config.js` 读取；回退值为 `https://your-domain.com`）。
- **触碰的文件：** 读取 `content/config.ts`（`sitemap.enabled`）与 `next-sitemap.config.js`；将 sitemap/robots 写入 `./out`。

### `bump-version.ts` —— 发布工具（仅上游）

- **命令：** `pnpm bump`（完全交互式）。
- **流程：** 第 1 步 —— 版本号提升类型：`[0]` 保持不变 · `[1]` patch（默认）· `[2]` minor · `[3]` major。第 2 步 —— Release 标题后缀（必填；标题格式为 `v<ver> — <title>`）。第 3 步 —— 展示自上一标签以来的提交。第 4 步 —— 多行 Markdown 发布说明（空行结束输入；必填）。y/n 确认。随后更新 `package.json` 版本号、提交、推送，等待 CI（通过 `gh` 查询 `ci.yml`，超时 10 分钟，每 15 秒轮询），然后打 `v<ver>` 标签、推送标签并创建 `gh release`。若标签 `v<ver>` 已存在则中止。CI 失败时**不会**创建标签 —— 修复后重新运行并选择 "keep"。
- **环境变量：** 已认证的 `gh` CLI（`GH_TOKEN` 环境变量或事先 `gh auth login`）。
- **触碰的文件：** 读写 `package.json`（`version`）；git commit/tag/push；通过 `gh` 调用 GitHub API（run list、release create）。

### `setup-ui.sh` —— Aceternity 组件安装器

- **命令：** `pnpm setup-ui`（执行 `bash scripts/setup-ui.sh`）。
- **用途：** 一次性将全部 **27** 个受支持的 Aceternity UI 组件安装到 `components/ui/` —— 在 `set -e` 下顺序执行 27 次 `npx shadcn@latest add @aceternity/<component> -y`（13 个背景组件、3 个物品网格组件、4 个图库组件、7 个物品卡片组件）。每个仓库只需运行一次；之后提交生成的 `components/ui/` 文件。
- **参数 / 环境变量：** 无。
- **触碰的文件：** 写入 `components/ui/`（经由 shadcn CLI）；shadcn 可能同时改动 `components.json` / `package.json`。

### scripts 目录下的测试文件

`scripts/update-site.test.ts`、`scripts/studioFields.test.ts`，以及 `scripts/lib/*.test.ts`（`imageSync`、`itemEdit`、`itemFields`、`itemTemplate`、`markSold`、`studioApi`、`studioGit`、`studioImages`、`studioSync`）—— 全部由根级 `test` / `test:watch` / `test:coverage` 脚本执行。

---

## `scripts/lib/` 支撑模块

这些模块不是独立可执行程序 —— 由上文各 CLI 导入使用。每个模块（如下表所列）均有同目录的 `*.test.ts`，由 `pnpm test` 运行。

| 模块 | 用途 |
|---|---|
| `loadEnv.ts` | `.env.local` 解析器（`loadDotEnvLocal`）；已存在的 `process.env` 值始终优先。由 `sync-images` + `studio` 共用（tsx 不会自动加载 `.env.local`）。 |
| `imageSync.ts` ⭐ | 纯 CDN 流水线：sha256 校验和、`scanImages`（跳过 `_` 前缀目录）、`syncImagesToCdn`（`UPLOAD_CONCURRENCY=8`、单文件失败隔离、EXIF 去除、进度回调）。同时驱动 `pnpm upload-images` 与 Seller Studio 的同步。 |
| `itemTemplate.ts` | 36 字段 `item.json` 脚手架（`buildItemTemplate` / `renderItemTemplateJsonc`，注入 `// options:` 注释），由 `create-item`、`create-template` 与 Studio 新建物品共用。排除 `reserved_for`（私密字段 —— 绝不渲染，铁律 #4）。 |
| `itemEdit.ts` | 基于 `jsonc-parser` 的外科手术式 JSONC 字段编辑（`applyFieldEdits`、`readItemField`、`readItemForEdit`）—— 每次写入后注释与 `reserved_for` 均原样保留。由 `mark-sold` 与 Studio 使用。 |
| `itemFields.ts` | 浏览器可写字段路径的严格 Zod 白名单（`resolveFieldSchema(path)` 是唯一权威 —— 防原型污染的自己键查找；另有 `assertEditableValue`、`pickEditableFields`）。不含 `.catch`/`.default`/`.preprocess`，因此 `safeParse` 失败即硬性拒绝；漂移测试断言其与 `itemJsonSchema` 在每一嵌套层级的键集合一致。 |
| `markSold.ts` | `applyMarkSold(text, today)`：status → `sold` + `sold_date`；若已售出则返回 `null`。 |
| `fbCategoryMap.ts` | 供 `fb-export` 使用的有序正则 → `"Top//Sub//Leaf"` Facebook 类目映射规则（49 条有序正则规则，另有 11 条 slug 级回退）。 |
| `exportHistory.ts` | 读取/追加 `exports/.export-history.json`（gitignore），支撑 `fb-export` 第 0 步的跳过逻辑。 |
| `configDefaults.ts` | 可注入配置字段的声明式注册表（`key` / `afterKey` / `lines`），供 `migrate-config` + `update-site` 使用 —— 当前为 `priceFilterStrategy` 块及 `filterPriceBucketAll` / `filterPriceIncludesOutliers` 两个 UIStrings 键。 |
| `studioApi.ts` | Studio 的框架无关 HTTP 处理器：Zod 校验请求、slug 白名单 + 针对 `content/items/` 的解析后路径包容性校验、JSON / 文件 / SSE 三类响应、`StudioError` → 带状态码的 JSON。路由正则匹配原始百分号编码路径，匹配成功后才逐段解码（防路径穿越）。 |
| `studioGit.ts` | `readChanges` / `publishChanges` + `GitError`：git status/commit/push 仅限 `PUBLISHABLE_PATHS = [content, lib/generated/image-manifest.json]` —— 与 `pnpm push` 保持一致，**绝不使用 `git add -A`**（保护 `.env.local`）；仅用 `execFile` 加参数数组（无 shell）；提交信息经 stdin 传入（`-F -`），`MAX_MESSAGE_LENGTH=500`；`-c core.quotepath=false -z` 确保中文/含空格文件名正确解析；处理 detached HEAD（拒绝）、未出生分支、裸仓库，以及滞留提交的重推。 |
| `studioImages.ts` | 照片上传/删除/重排的文件系统操作：`IMAGE_EXTENSIONS` = jpg\|jpeg\|png\|webp\|gif、文件名规范化（`sanitizeUploadFilename`、`IMAGE_FILENAME_RE` 白名单）、魔数字节内容嗅探（`sniffImageType`）、防冲突写入。 |
| `studioSync.ts` | 同时仅一次、以 SSE 推送进度的 CDN 同步封装（`streamImageSync`）；锁状态存于 `globalThis`（tsx 与 Vite 打包后的模块副本共享），在工作真正结束时释放，而非客户端断开时。 |

---

## `workers/shipping-rate-proxy/`

### 是什么

一个 Cloudflare Worker，将静态站点 `ShippingEstimator` 的运费查询请求代理到 **Shippo** 或 **EasyPost**，并返回最低价费率：`{ amount, currency, carrier, service, estimatedDays }`（服务商失败/无报价时返回 502）。仅接受 POST（OPTIONS 用于 CORS 预检，其余方法返回 405）；校验请求体（`destinationZip`、`destinationCountry`、`weight`、`dimensions`）；单位换算 kg → lb（Shippo）或 → oz（EasyPost）、cm → 英寸（向上取整）。客户端由 `components/pricing/useShippingRate.ts` → `components/item/ShippingEstimator.tsx` 调用，且仅当 `siteConfig.shipping` 启用、物品含重量/尺寸、且解析出的分级为开放式邮寄分级时才会触发。

### 为什么存在

站点是完全静态导出的 —— 物流商 API 密钥**绝不能**进入浏览器 bundle。Worker 将密钥保存在服务端，并将 CORS 严格锁定到唯一的 `ALLOWED_ORIGIN`（必须与 `siteConfig.baseUrl` 一致）。见 [DESIGN_zh.md §21](DESIGN_zh.md)。

### 部署与本地开发

独立项目，自带 `package.json`（name 为 `shipping-rate-proxy`，`compatibility_date = 2026-01-01`）：

```bash
cd workers/shipping-rate-proxy
pnpm install

# 1. 普通变量 —— 编辑 wrangler.toml 的 [vars]：
#      SHIPPING_PROVIDER = "shippo" | "easypost"
#      ALLOWED_ORIGIN    = 与 siteConfig.baseUrl 完全一致（无结尾斜杠）
#      ORIGIN_ZIP / ORIGIN_COUNTRY（对应 siteConfig.shipping.origin）

# 2. 本地开发：
cp .dev.vars.example .dev.vars   # 在此填入测试用物流商密钥（gitignore）
pnpm dev                          # wrangler dev

# 3. 部署：
pnpm wrangler login               # 仅需一次
pnpm wrangler secret put SHIPPO_API_KEY   # 或 EASYPOST_API_KEY —— 绝不写入 wrangler.toml
pnpm deploy                       # wrangler deploy → 输出 workers.dev URL

# 4. 将输出的 URL 填入 content/config.ts → shipping.proxyUrl
#    （或运行 /setup-shipping 技能）
pnpm type-check                   # 可选：对 worker 包执行 tsc --noEmit
```

Worker 的 npm 脚本（在 `workers/shipping-rate-proxy/` 目录下运行）：`dev`（`wrangler dev`）、`deploy`（`wrangler deploy`）、`type-check`（`tsc --noEmit`）。

---

## 环境变量参考

### 本机（gitignore 的 `.env.local`）

由 `scripts/lib/loadEnv.ts` 解析进 `process.env`（已存在的环境变量始终优先）。CI **不需要**其中任何一项 —— 构建直接读取已提交的 `lib/generated/image-manifest.json`。

| 变量 | 使用方 | 何时必需 | 说明 |
|---|---|---|---|
| `CF_R2_ACCOUNT_ID` | `lib/images/cloudflare-r2.ts` | `imageStorage.provider = "cloudflare-r2"` | R2 S3 客户端所需的 Cloudflare 账户 ID；由 `pnpm upload-images` 与 Studio 同步使用 |
| `CF_R2_ACCESS_KEY_ID` | 同上 | 同上 | R2 API 令牌的 Access Key ID（Object Read & Write，限桶范围） |
| `CF_R2_SECRET_ACCESS_KEY` | 同上 | 同上 | R2 API 令牌的 Secret Access Key |
| `CF_R2_BUCKET` | 同上 | 同上 | 照片上传目标 R2 桶的名称 |
| `CF_R2_PUBLIC_URL` | 同上 | 同上 | 桶的公开基础 URL（自定义子域名或 r2.dev）；用于构造存入清单的 CDN URL |
| `BLOB_READ_WRITE_TOKEN` | `lib/images/vercel-blob.ts` | `imageStorage.provider = "vercel-blob"` | Vercel 托管构建时还需在 Vercel Dashboard 的环境变量中设置 |
| `EDITOR` | `scripts/create-item.ts` | 从不需要（可选） | 以 `spawnSync` 打开新建的 `item.json`（无 shell 插值） |
| `NEXT_PUBLIC_SITE_URL` | `next-sitemap.config.js`（经由 `postbuild.ts`） | 从不需要（可选） | 站点地图 + OG 标签使用的生产 URL；回退值 `https://your-domain.com`。唯一有文档记载的例外：作为 **GitHub Actions Variable**（而非 secret）设置以供 CI 构建使用；本机构建时也可写入 `.env.local` |

### 发布工具

| 变量 | 使用方 | 说明 |
|---|---|---|
| `GH_TOKEN` / `gh auth` | `scripts/bump-version.ts` | 通过 shell 调用 `gh`（run list、release create）；要求 `gh` CLI 已认证（`GH_TOKEN` 或事先 `gh auth login`）。`scripts/` 内不直接从 `process.env` 读取。 |

### Worker（`workers/shipping-rate-proxy`）

| 变量 | 类别 | 位置 | 说明 |
|---|---|---|---|
| `SHIPPING_PROVIDER` | 普通变量 | `wrangler.toml [vars]` | `"shippo"`（默认）或 `"easypost"` —— 选择调用的物流商 API |
| `ALLOWED_ORIGIN` | 普通变量 | `wrangler.toml [vars]` | CORS 唯一允许的 Origin；必须与 `siteConfig.baseUrl` 完全一致（无结尾斜杠） |
| `ORIGIN_ZIP` | 普通变量 | `wrangler.toml [vars]` | 包裹寄出地邮编（`siteConfig.shipping.origin.zip`），作为 `address_from` 发送 |
| `ORIGIN_COUNTRY` | 普通变量 | `wrangler.toml [vars]` | 包裹寄出地国家代码（如 `US`） |
| `SHIPPO_API_KEY` | **密钥** | `wrangler secret put`（本地：`.dev.vars`） | Shippo 令牌，provider = `shippo` 时置于 `Authorization: ShippoToken` 请求头 |
| `EASYPOST_API_KEY` | **密钥** | `wrangler secret put`（本地：`.dev.vars`） | EasyPost 密钥，provider = `easypost` 时 base64 编码进 Basic auth 请求头 |

---

## 安全说明

- **防路径穿越：** `create-item` 与 `mark-sold` 在*任何*文件系统访问之前校验 kebab-case slug（`isValidSlug`，与 `generateStaticParams` 共用）。Studio 路由正则匹配原始百分号编码路径，匹配成功后才逐段解码；所有文件服务均针对 `content/items/` 做包容性校验。
- **防 shell 注入：** `create-item` 打开 `$EDITOR` 时使用 `spawnSync` 参数数组（绝不使用 shell 插值）；`studioGit` 仅使用 `execFile` 加参数数组。
- **发布安全：** Studio 仅绑定 **127.0.0.1**，其 git 发布绝不使用 `git add -A` —— 只暂存 `content/` + `lib/generated/image-manifest.json`，因此 `.env.local`（含 CDN 凭据）绝不会被顺带提交。
- **模板更新：** `update-site` 要求工作区干净，并在检出后恢复属于卖家的图片清单。
- **凭据管理：** 物流商 API 密钥保存在 Worker 服务端（经 `wrangler secret put` 设为密钥；绝不写入 `wrangler.toml`）；R2/Blob 凭据仅存在于卖家本机 gitignore 的 `.env.local` 中。
- **隐私：** `reserved_for` 是私密的买家信息 —— 物品模板中排除该字段，Studio 字段白名单拒绝该字段，任何公开页面绝不渲染该字段。

---

## 交叉引用

| 主题 | 文档 |
|---|---|
| 架构、数据流、模块 API | [ARCHITECTURE_zh.md](ARCHITECTURE_zh.md) |
| `item.json` 完整 Schema（36 个顶层字段；连同私有的 `reserved_for` 为 37 个） | [DESIGN_zh.md §5](DESIGN_zh.md) |
| `content/config.ts` 完整模板 | [DESIGN_zh.md §13](DESIGN_zh.md) |
| 运费计算器集成 | [DESIGN_zh.md §21](DESIGN_zh.md)、[../workers/shipping-rate-proxy/README.md](../workers/shipping-rate-proxy/README.md) |
| CDN 配置说明 | [setup_instruction_zh.md](setup_instruction_zh.md) |
| 下游站点更新指南 | [UPDATE_GUIDE_zh.md](UPDATE_GUIDE_zh.md) |
| 部署清单（GitHub Pages + R2） | [TECH_REQUIREMENTS_zh.md §19](TECH_REQUIREMENTS_zh.md) |
| 测试策略 | [TECH_REQUIREMENTS_zh.md §25](TECH_REQUIREMENTS_zh.md) |
| 卖家操作指南 | [../SETUP_GUIDE.md](../SETUP_GUIDE.md) |
| 环境变量配置模板 | [../.env.example](../.env.example) |
