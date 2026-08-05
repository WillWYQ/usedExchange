# Seller Studio 列表搜索与筛选 设计文档

日期：2026-08-04
状态：设计已确认，待写实现计划

## 要解决的问题

Studio 的商品表格是一张平铺的全量列表：没有搜索，没有筛选，没有排序。item 一多，找一件东西就得靠肉眼扫。已售出的商品也一直混在列表里占位置——它们已经卖掉了，日常管理时基本不需要看见。

本设计给列表加四个维度：状态页签（默认视图不含 sold）、模糊搜索、分类下拉、排序。全部在浏览器端计算。

## 范围

包含：

- 服务端 `listStudioItems` 给每条 item 补 `tags` 和 `listedDate` 两个字段
- 新增纯函数模块 `studio/src/filtering.ts`（状态/分类/搜索/排序四步流水线）及其单元测试
- 新增 `studio/src/panes/FilterBar.tsx`（状态页签 + 搜索框 + 分类下拉 + 排序下拉）
- `App.tsx` 持有筛选状态，批量操作与全选作用于筛选后的可见集合
- 筛选无结果时的专门空状态
- 双语文档同步

不包含：

- 服务端筛选 API（客户端方案已足够，见"方案选择"）
- 筛选状态的持久化（每次启动都从默认视图开始）
- 分页或虚拟滚动（当前规模不需要）
- 编辑表单、配置面板、首次安装引导（后续子项目）

## 方案选择

客户端筛选，不做服务端筛选 API。

Studio 启动时 `fetchItems` 本就一次性拉取全量列表并常驻内存。加两个字段后，搜索/筛选/排序全部是内存里的数组运算：切换筛选零延迟、不新增 API 接口、逻辑集中在一个可单测的纯函数里。

服务端筛选（给 `GET /api/items` 加 `status`/`category`/`q`/`sort` 参数）每次点筛选都要一次网络往返，并需要一套参数校验与服务端测试。对一个单卖家、本地运行、item 规模在几十到几百条的工具，这是过度设计。

## 数据层

`scripts/lib/studioApi.ts` 的 `StudioItem` 类型新增两个字段：

```typescript
tags: string[];          // 搜索用；缺失或非数组时为 []
listedDate: string | null; // 排序用；YYYY-MM-DD，缺失或非法时为 null
```

两者都从 `loadAllItemsRaw()` 已经返回的 item 数据里直接读取，不新增文件 IO。`reserved_for` 不参与（Iron Rule 4）。

## 筛选逻辑

新增 `studio/src/filtering.ts`，导出：

```typescript
export type StatusFilter = "active" | "all" | "available" | "reserved" | "pending" | "sold" | "draft";
export type SortKey = "relevance" | "name-asc" | "price-asc" | "price-desc" | "date-desc" | "date-asc";
export type Filters = { query: string; status: StatusFilter; category: string; sort: SortKey };
export function applyFilters(items: StudioItem[], filters: Filters): StudioItem[];
```

四步流水线，顺序固定：

1. **状态**：`"active"` 排除 sold（默认视图）；`"all"` 全留；其余值按 `status` 精确匹配
2. **分类**：`"all"` 不过滤；否则按 `categorySlug` 精确匹配
3. **搜索**：`query` 去除首尾空白后非空时，用 fuse.js 对 `name`（权重 0.6）、`categorySlug`（0.2）、`tags`（0.2）模糊匹配，threshold 0.35；为空时跳过，保持原顺序
4. **排序**：`"relevance"` 时保持上一步的顺序（有查询词就是 fuse 的相关度序，无查询词就是加载器原序）；其余按对应键排序

排序的空值规则：`listedDate` 为 null 的项在两种日期排序里都排在末尾；`lowestTierAmount` 为 null 的项在两种价格排序里都排在末尾。"没有数据"永远沉底，避免把空值误读成"最便宜"或"最新"。

`name-asc` 用 `localeCompare` 比较，大小写不敏感。

## 界面

新增 `studio/src/panes/FilterBar.tsx`，受控组件，渲染在顶栏与表格之间。

**状态页签**：`Active` / `Available` / `Reserved` / `Pending` / `Draft` / `Sold` / `All`，每个页签跟一个该状态的条数（`Sold 12`）。复用抽屉标签页已有的 `.tab` / `.tab-active` 样式与 `role="tablist"` / `role="tab"` / `aria-selected` 语义，视觉上与 Studio 现有的下划线式标签保持同一套语言，不引入第二种标签样式。

**搜索框**：`type="search"`，占据筛选栏主要宽度，placeholder 为 `Search name, category, tags`，带 `aria-label`。

**分类下拉**：选项从当前 items 的 `categorySlug` 去重排序派生，首项为 `All categories`。

**排序下拉**：`Name A–Z` / `Price low–high` / `Price high–low` / `Newest` / `Oldest`。搜索框非空时首项额外出现 `Best match`（对应 `relevance`）并成为默认值。

**结果计数**：筛选栏右侧显示当前可见条数，带 `role="status"`，筛选变化时读屏用户能听到结果数。

**窄屏（40rem 断点）**：筛选栏纵向堆叠，页签横向可滚动，与现有表格折叠为卡片的断点一致。

## 交互规则

1. **可见集合就是操作对象**：全选复选框只勾选当前筛选结果；批量改状态只作用于可见且选中的项。避免"筛掉了 sold，批量操作却动了它们"。
2. **切换任一筛选条件时清空选择**：跨视图残留的选中项会让批量操作的作用范围变得不可预测。
3. **刚改过状态的行暂不消失**：在 Active 视图把商品标成 sold 后，该行保留在视图中直到下次刷新或切换筛选。否则盖戳动画来不及看见，操作反馈也随之消失。复用现有 `justStampedIds` 机制，扩展为"本轮豁免筛选"的集合。
4. **筛选状态不持久化**：每次启动 Studio 都从 Active 视图、空搜索、全部分类、默认排序开始。避免上次的筛选残留让卖家误以为商品丢失。

## 空状态

两种空状态语义不同，文案与操作也不同：

- **完全没有 item**（现有状态）：引导去用顶栏的 New item 建第一件商品
- **筛选后无结果**（新增）：显示 `No items match your filters`，附一个"清除筛选"按钮，一键回到默认视图

## 状态管理

四个筛选值作为 state 放在 `App.tsx`——它已持有 `items` 与 `selectedIds`，而"切换筛选清空选择"这条规则要求两者同层。

`App` 用 `useMemo` 计算 `visibleItems = applyFilters(items, filters)`，传给 `ItemList`；全选与批量操作都基于 `visibleItems`。fuse 实例按 `items` 用 `useMemo` 缓存，避免每次击键重建索引。

`FilterBar` 只收 value 与 onChange，`ItemList` 只收已过滤的数组——两者都不知道筛选逻辑的存在。

## 测试

新增 `studio/src/filtering.test.ts`（本项目第一次给 studio 前端逻辑写单测；`applyFilters` 是纯函数，适合）：

- 状态：`active` 排除 sold、具体状态精确匹配、`all` 全留
- 分类与状态叠加
- 搜索：命中 name、命中 categorySlug、命中 tag、拼写小错仍命中、空查询保持原顺序
- 排序：五种排序各自正确；null 价格与 null 日期在升序和降序里都沉底
- 组合：搜索 + 状态 + 分类 + 排序四者叠加
- 空结果返回空数组

`vitest.config.ts` 当前未限制 include（默认包含仓库内所有 `*.test.ts`），`studio/src/filtering.test.ts` 会被自动纳入；实现时确认一次。

`scripts/lib/studioApi.test.ts` 补一条断言：`listStudioItems` 返回的 item 带 `tags` 与 `listedDate`。

## 文档（双语同步，Iron Rule 2）

- `CURRENT_FUNCTIONALITY.md` / `_zh`：Studio 操作表加"搜索与筛选"一行；正文补一段说明默认视图不含 sold
- `ARCHITECTURE.md` / `_zh`：studio 结构补 `filtering.ts` 与 `FilterBar`
- `IMPLEMENTATION_PLAN.md` / `_zh`：记为 Phase 21，完成后全部任务标 `[x]` 并加 ✅

## 兼容性与分支

- 不改 `content/`，不改 `content/config.ts`，不新增配置字段
- 服务端只加两个只读字段，不改任何写路径
- 分支 `feat/studio-list-filtering`，从 develop 切出（PR #4 与 PR #5 均已合入 develop）
