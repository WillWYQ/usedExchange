# Seller Studio 默认值体系 设计文档

日期：2026-08-02
状态：设计已确认，待写实现计划

## 要解决的问题

每建一个新 item，卖家都要重填一批和商品本身无关的字段：收款方式、面交时段、联系备注、货币、价格档位结构。Studio 现在用 `buildItemTemplate()` 的硬编码模板生成新 item，只从 `content/config.ts` 读 `measurementUnit` 和 `defaultPriceTiers` 两项，其余没有预设入口。

仓库里已有 `content/items/_template.json` 和分类级 `_template.json` 两级约定，但建 item 从不读它们，它们只是给人看的参考样板。本设计不复用这两个文件（里面带占位文案和注释，机器消费会污染新 item），而是新开一套稀疏的 `_defaults.json`，由 Studio 可视化管理。

## 范围

包含：

- 全站级和分类级默认值，存稀疏 JSON
- Studio 新增 Defaults 面板，可视化管理两级默认值
- 新建弹窗加 "Apply defaults" 开关（默认开）
- `pnpm create-item` 走同一套合并逻辑，CLI 与 Studio 行为一致
- 测试与双语文档同步

不包含（已排入后续子项目队列）：

- Studio 配置面板（编辑 `content/config.ts`）
- 列表搜索 / 筛选 / 排序
- 编辑表单分组优化
- UI 视觉翻新
- 首次安装引导
- "以某个已有 item 为模板"的复制建 item 模式

## 存储：两级 `_defaults.json`

文件位置：

- 全站级：`content/items/_defaults.json`
- 分类级：`content/items/<category>/_defaults.json`

文件是稀疏 JSON，只存卖家明确设置的字段：

```json
{
  "preferred_payment": ["cash", "venmo"],
  "contact_note": "WeChat: xxx",
  "pickup_windows": ["Weekday evenings", "Weekends"],
  "no_lowball": true,
  "price": { "currency": "USD", "negotiable": true }
}
```

约定：

- 文件不存在等同于没有默认值，行为与现状一致。下游站点不建这两个文件就不受任何影响。
- 保存结果为空对象时直接删除文件，不在 `content/` 里留空壳。
- `_defaults.json` 和 `_template.json`、`_category.json` 同级放在分类目录层。内容加载器只扫 `<category>/<item>/item.json`，不会把它误读成商品。
- `reserved_for` 从读写两侧排除（Iron Rule 4），保存时拒绝写入。

## 合并规则

新建 item 时的叠加顺序：

```
buildItemTemplate() 内置模板
  ← 全站 _defaults.json
    ← 分类 _defaults.json
      ← 强制覆盖 name / listed_date / status:"draft"
```

- `price`、`dimensions`、`weight` 等对象按叶子深合并。全站设 `price.currency`、分类设 `price.negotiable`，两者都保留。
- 数组和标量整体替换，不拼接。分类的 `pickup_windows` 会完整覆盖全站的。
- `name`、`status`、`listed_date`、`sold_date` 不允许存为默认值，保存时拒绝；合并末端再强制覆盖一次 `name`、`listed_date`、`status`，双重保险。
- `dimensions` / `weight` 允许只存叶子（比如只设 `dimensions.unit`）。编辑表单的 whole-object 规则约束的是对 item.json 的增量编辑；defaults 合并时底下永远是完整的内置模板对象，不会产生残缺对象。
- `price.shipping_payer` 等可选字段可以出现在 defaults 里，即使内置模板没有这个键，合并后写入 item.json 即可。

## 模块与 API

新增 `scripts/lib/itemDefaults.ts`，三个纯函数：

- `loadDefaults(projectRoot, category)`：读两级文件，返回合并后的稀疏对象。文件损坏或值非法时抛错，指明文件路径和字段名，不静默丢默认值。
- `mergeDefaultsIntoTemplate(template, defaults)`：按上面的规则合并。
- `validateDefaults(defaults)`：逐叶子按 `scripts/lib/itemFields.ts` 的字段语法校验；允许 `dimensions` / `weight` 叶子（豁免 whole-object 规则）；拒绝 `name`、`status`、`listed_date`、`sold_date`、`reserved_for`。

`studioApi.ts` 与 `create-item.ts` 都调用这个模块，保证两条入口行为一致。

`scripts/lib/studioApi.ts` 的 API 变更（沿用现有 CSRF guard、127.0.0.1 绑定、slug 校验）：

- `GET /api/defaults?scope=site | <category>`：返回该作用域的 defaults 对象，文件不存在返回 `{}`。
- `PUT /api/defaults?scope=...`：整体保存。先跑 `validateDefaults`，非法值返回 400 并报字段路径和原因；空对象删除文件；scope 为不存在的分类时自动建目录（与现有建 item 行为一致）。
- `POST /api/items`：请求体新增可选 `applyDefaults?: boolean`，默认 `true`。

`scripts/create-item.ts`：写文件前读共享合并模块，应用两级默认值。

## Studio 界面

Defaults 面板，新文件 `studio/src/panes/DefaultsPane.tsx`：

- 入口在 header，紧挨 "New item" 按钮，点开对话框式面板。
- 顶部作用域选择器：Site-wide 和各现有分类。
- 字段渲染复用 `studio/src/fields.ts` 的 `FIELD_GROUPS`，去掉 `name`、`status`、`listed_date`、`sold_date` 四个不可预设字段。Price 和 Platform 两组置顶（这是卖家点名的高频组），其余组折叠。
- 每个字段一个启用开关加值输入框。启用即写入 `_defaults.json`，关闭即移除。
- 分类作用域下，已被全站级设置的字段旁显示浅色提示（形如 "site: cash, venmo"），让继承关系可见。

`EditForm.tsx` 已 422 行，其中的输入框渲染逻辑抽成共享组件供 Defaults 面板复用。这是本次唯一的针对性拆分，不做无关重构。

`NewItemDialog.tsx` 加一个 "Apply defaults" 复选框，默认勾选。取消勾选则建完全空白的模板 item，请求体带 `applyDefaults: false`。

## 错误处理

- 保存默认值时字段值非法：400，报具体字段路径和原因，沿用 `assertEditableValue` 的报错风格。
- 建 item 时发现磁盘上的 `_defaults.json` 非法（比如手改坏的）：报错指出文件和字段，拒绝创建，不带着坏默认值建 item。
- 分类目录不存在时保存分类默认值：自动创建目录。

## 测试

- 新增 `scripts/lib/itemDefaults.test.ts`：合并优先级（全站 < 分类）、对象深合并、数组整体替换、`name` / `status` 免疫、`reserved_for` 永不应用、非法值报错指明字段名、空保存删除文件。
- `scripts/lib/studioApi.test.ts` 补充：GET/PUT 往返、PUT 拒绝排除字段、建 item 在 `applyDefaults` 开与关两条路径下的产物差异。

## 文档同步（Iron Rule 2，双语同时改）

- `docs/DESIGN.md` 与 `_zh`：新增 defaults 小节，写文件格式与合并规则。
- `docs/CURRENT_FUNCTIONALITY.md` 与 `_zh`：Studio 操作表从五项扩为六项，加 Defaults。
- `docs/ARCHITECTURE.md` 与 `_zh`：`scripts/lib` 模块清单加 `itemDefaults.ts`。
- `docs/IMPLEMENTATION_PLAN.md` 与 `_zh`：本工作记为 Phase 19，完成后全部任务标 `[x]`，标题加 ✅。
- `docs/SCRIPTS.md` 与 `_zh`：`create-item` 条目注明会应用默认值。

## 兼容性

- 不建 `_defaults.json` 文件，行为与现在完全一致。下游站点升级模板代码后无需任何动作。
- 不改 `content/config.ts`，不新增 config 字段，Iron Rule 8 的向后兼容检查清单不适用。
- 写入范围仍在 `content/` 内（Iron Rule 1）。`_defaults.json` 会出现在 publish 的变更列表里，随 `content/` 一起提交，符合现有 publish 语义。
