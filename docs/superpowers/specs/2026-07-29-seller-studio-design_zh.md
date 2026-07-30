# 卖家 Studio — 纯本地卖家操作台

**日期：** 2026-07-29
**状态：** 设计已确认，可进入实施计划
**路线图条目：** `docs/FEATURES_ROADMAP.md` 中的「Seller dashboard (local-only GUI)」，标注为非 CS 用户的关键增长解锁点

---

## 1. 目的

目前卖家全靠 CLI 管理商品（`pnpm create-item`、`pnpm mark-sold`、`pnpm upload-images`、`pnpm push`）。非技术卖家尤其卡在两件事上：把照片弄到 CDN 上，以及周末卖掉几件之后一次性改多个商品的状态。

卖家 Studio 是一个**只在卖家本机运行**的浏览器界面，覆盖四类操作：

1. 拖拽上传图片、排序、删除、推送到 R2
2. 多选商品并批量改状态（售出 / pending / 草稿）
3. 通过基于 schema 的表单新建与编辑商品，不再手写 JSON
4. 提交并推送改动，让站点上线

它永不部署。站点仍是 GitHub Pages 上的 Next.js 静态导出，本设计不给已发布站点增加任何运行时服务。

## 2. 不做的事

- 不做多卖家、不做鉴权、不做远程访问（属于 v3）
- 完全不改动买家侧行为
- 不写 React 组件单测（见 §8）
- 不新增 `content/config.ts` 字段（见 §3）

## 3. 运行模型

单进程：`pnpm studio` 启动一个 Vite dev server。一个自定义 Vite 插件把 `/api/*` 交给 studio API handler，其余请求走前端。单端口、无 CORS、无需管理并发进程、只有一个终端要关。

服务绑定 **`127.0.0.1`**，明确不用 `0.0.0.0`。这套 API 会写文件系统、持有 R2 凭证、执行 `git`，绝不能被局域网访问。

端口硬编码为 **5174**，可用 `pnpm studio --port 5200` 覆盖。不引入 config 字段——为一个还没人抱怨过的问题加字段，只会给下游站点增加迁移负担。

## 4. 文件布局

```
studio/                        # 新增；仅开发期代码，`next build` 完全不碰
  index.html
  src/
    App.tsx
    panes/                     # ItemList、ImagePane、EditForm、PublishPane
    components/
  vite.config.ts               # 含 /api 中间件插件

scripts/studio.ts              # `pnpm studio` 入口：启动 Vite dev server
scripts/lib/
  imageSync.ts                 # 新增 —— 从 sync-images.ts 抽出的纯逻辑
  itemEdit.ts                  # 新增 —— 对 item.json 做外科式 JSONC 编辑
  studioApi.ts                 # 新增 —— API handler，不依赖具体 http 框架
```

`studio/` 位于 `app/` 之外，因此不可能泄漏进静态导出产物。这也是被否决的备选方案——在 `app/` 内加一个靠 `NODE_ENV` 开关的 `/studio` 路由——落选的原因：Iron Rule 3 规定 `app/` 是生产代码，被开关保护的路由进入 build 产物的风险是实打实的。

## 5. 来自现有代码库的两条硬约束

### 5.1 item.json 是 JSONC，必须外科式编辑

`item.json` 里带有 `pnpm create-item` 写入的 `// options: ...` 注释，还可能带 `reserved_for` 字段。`itemJsonSchema`（`lib/content/schema.ts:183`）通过 Zod 默认的 strip 行为**主动剥离** `reserved_for`。

因此 studio 绝不能用「Zod parse → 重新序列化」来保存：那会同时删掉卖家的注释和买家预留信息。

所有写入都走 `scripts/lib/itemEdit.ts`，它把现有的 `applyMarkSold`（`scripts/lib/markSold.ts`）模式泛化为：

```ts
applyFieldEdits(text: string, edits: Array<{ path: (string|number)[]; value: unknown }>): string
```

底层用 `jsonc-parser` 的 `modify` / `applyEdits`。`applyMarkSold` 变成它的薄封装，其现有测试继续保护该行为。

### 5.2 sync-images.ts 必须先抽库才能复用

`scripts/sync-images.ts` 约 500 行，所有逻辑都在私有函数里，且与 `console` 输出和 `process.exit` 强耦合，仅上传路径就有 13 个顺序步骤。

把纯逻辑抽到 `scripts/lib/imageSync.ts`，返回结构化结果；退出码与打印留在 CLI 层，这样 `pnpm upload-images` 行为不变，而 studio 能调用同一份代码并流式回报进度。

这是本功能必需的定向重构，不是顺手的清理。

## 6. API 表面

| 端点 | 作用 |
|---|---|
| `GET /api/items` | 通过 `lib/content/loader.ts` 列出所有商品，附带每项的图片文件 |
| `POST /api/items` | 新建商品，复用 `scripts/lib/itemTemplate.ts` |
| `PATCH /api/items/:cat/:name` | 通过 `itemEdit.ts` 做局部字段更新（保留注释） |
| `POST /api/items/:cat/:name/images` | 把上传的图片写入磁盘 |
| `DELETE /api/items/:cat/:name/images/:file` | 删除单张图片 |
| `POST /api/sync-images` | 推送到 R2；用 SSE 流式回报每张进度 |
| `POST /api/publish` | `git add` / `commit` / `push`，返回变更摘要 |

### 单一数据源

前端不保存商品状态的本地副本。任何写操作之后重新全量 `GET /api/items`。商品数量是几十的量级，全量刷新比增量同步简单，且不会与磁盘不一致。

由于列表通过 `lib/content/loader.ts` 读取，studio 中显示的分类、可见性、价格层级与状态和线上站点完全一致——不会出现 studio 说没问题、build 出来不对的情况。

## 7. 四个面板

1. **商品列表**（主视图）—— 表格，每行一个复选框，列出状态、价格、图片数。有选中项时出现批量操作工具栏。
2. **图片面板**（选中单个商品时的抽屉）—— 拖拽区、缩略图网格拖拽排序、单张删除。
3. **编辑表单**（同一抽屉的第二个 tab）—— 字段分组为 基本 / 价格 / 规格 / 平台 / 学生专用 / i18n。保存时只发送**被改动的字段**，`PATCH` 仅对这些 path 做 JSONC 编辑。
4. **发布面板** —— 由 `git status --porcelain` 解析出的变更文件列表，加一个「提交并推送」按钮。

### 图片顺序以文件名前缀落地

manifest 的 key 就是文件路径，所以顺序必须体现在文件名上（`01-…jpg`、`02-…jpg`），不能只存在前端状态里。排序即重命名文件。

## 8. 失败语义

**批量编辑不回滚。** 每项独立写入，响应回报逐项结果：

```jsonc
{ "ok": 19, "failed": [{ "id": "electronics/lamp", "error": "EACCES" }] }
```

这与 `sync-images.ts` 已有的失败哲学一致（`FIX M2`）：单个文件失败不能拖垮整批，已成功的工作必须落盘。回滚反而更危险——撤销写了一半的文件本身也可能失败，那才是真正的不一致。前端把失败行标红并保持选中，方便重试。

**`POST /api/publish` 是例外：** git 操作天然原子，失败即整体失败，不需要逐项语义。publish 必须在提交前立刻重新读取变更列表，确保卖家确认的 diff 就是最终提交的 diff。

**`POST /api/sync-images` 持有服务端互斥锁** —— 同一时刻只允许一个 sync。两次并发会同时写 `image-manifest.json` 和 checksum 缓存，那会损坏数据。进度用 SSE 流式回报，因为几十张照片推 R2 可能耗时一两分钟，而没有反馈的按钮会被再点一次。

## 9. 输入校验

API 接受来自浏览器的 `:cat`、`:name` 和文件名。三项检查是强制的：

- **路径遍历** —— `cat` / `name` / 文件名一律用 `lib/utils/slug.ts` 的白名单（仅 `[a-z0-9-]`）校验，**并且**断言解析后的绝对路径仍位于 `content/items/` 之内。两层都要，因为白名单以后可能被放宽。
- **图片类型** —— 扩展名白名单加 magic bytes 文件头校验，只接受 jpg / png / webp / gif。
- **字段写入** —— 每个 `PATCH` 的 path 必须是 `itemJsonSchema` 的已知字段，值必须先通过该字段的 Zod 校验才能落盘。`reserved_for` 在显式拒绝名单上：它不在 schema 里，studio 也不该成为写它的途径。

## 10. 测试

| 测试文件 | 覆盖内容 |
|---|---|
| `scripts/lib/itemEdit.test.ts` | 注释保留、`reserved_for` 保留、字段白名单拒绝、多字段编辑 |
| `scripts/lib/imageSync.test.ts` | 抽库后行为不变 —— 重构的回归网 |
| `scripts/lib/studioApi.test.ts` | 直接调 handler：路径遍历被拒、magic bytes 校验、部分失败的返回结构、sync 互斥锁 |
| `scripts/lib/markSold.test.ts` | 已存在；`applyFieldEdits` 重构后必须继续通过 |

React 组件**不写单测**。它们很薄、只在本机跑、点一遍就能验证。测试预算全部投向会破坏卖家数据的服务端逻辑。

## 11. 下发到下游站点

- 在 `scripts/update-site.ts:23` 的 `TEMPLATE_PATHS` 中加入 `"studio"`。（`scripts` 已在列表中，所以新增的 `scripts/lib/*.ts` 自动跟随下发。）
- 按该文件注释的要求，同步更新 `docs/UPDATE_GUIDE.md` **与** `docs/UPDATE_GUIDE_zh.md` 的 Step 2 路径清单。
- 把 `vite` 与 `@vitejs/plugin-react` 加入 `devDependencies`。下游卖家如果在 `pnpm install` 之前就跑 `pnpm studio`，会撞上模块解析的错误栈，所以 `scripts/studio.ts` 先 resolve `vite`，缺失时打印「请先运行 `pnpm install`」而不是抛栈。

## 12. 文档更新（双语 —— Iron Rule 2）

- `docs/CURRENT_FUNCTIONALITY.md` / `_zh` —— 新增 Studio 章节
- `docs/FEATURES_ROADMAP.md` / `_zh` —— 把 Seller dashboard 标为 ✅
- `docs/IMPLEMENTATION_PLAN.md` / `_zh` —— 新增 Phase 18，完成时勾选（Iron Rule 7）
- `docs/UPDATE_GUIDE.md` / `_zh` —— Step 2 路径清单
- `.claude/CLAUDE.md` —— 在 Common Seller Tasks 表中加入 `pnpm studio`

## 13. Iron Rule 合规性

| 规则 | 本设计如何合规 |
|---|---|
| 1 —— 卖家只碰 `content/` | Studio 只写 `content/` 之下，以及 `upload-images` 本就拥有的生成物 `lib/generated/image-manifest.json` |
| 2 —— 文档双语 | §12 列出了每份文档的两个版本 |
| 3 —— `app/` 是生产代码 | Studio 位于 `studio/`；不向 `app/` 添加任何东西 |
| 4 —— 永不渲染 `reserved_for` | 该字段在写入拒绝名单上，且每次编辑都保留（而非剥离） |
| 5 —— manifest 保留在 git | 不变；studio 调用同一份 sync 逻辑 |
| 6 —— `pricing.ts` 无 `"use client"` | 未触碰 |
| 7 —— 标记 phase 完成 | 新增 Phase 18，完成时勾选 |
| 8 —— config 字段可选 | 不引入任何新 config 字段（§3） |
