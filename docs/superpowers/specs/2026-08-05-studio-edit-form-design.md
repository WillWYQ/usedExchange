# Seller Studio 编辑表单体验 设计文档

日期：2026-08-05
状态：设计已确认，待写实现计划

## 要解决的问题

抽屉里的 Details 标签页把 36 个字段平铺成六个全部展开的 `<fieldset>`，抽屉宽 `min(30rem, 100vw)`。卖家日常改一件商品，实际动的就那么几样：改个价、改个状态、补两句描述。但现在要拿到这几样，屏幕上得滚过这些东西：

- **价格档位编辑器排在整张表单的最后**。它在 `FIELD_GROUPS` 之外（数组结构塞不进 descriptor），所以渲染在全部 43 个 input 之后。改价——最高频的操作——是滚动距离最远的操作。
- **`price.currency` / `negotiable` / `show_tiers` 和真正的金额被拆散**：前者在 Price 组，后者在表单底部，中间隔着 Specs（13 个）、Platform（8 个）、Student（4 个）、Translations（2 个）。
- **一次性字段常驻视野**：brand/model/dimensions/weight/original_* 是建 item 时填一次的东西，ISBN/course/edition/semester 只有卖教科书的人用得上，listed_date/sold_date 由 `pnpm mark-sold` 和批量状态操作维护——手改是罕见且危险的。它们和 name/status 享受同等的版面。

除了版面，读代码时还发现四处会让卖家丢数据或误判状态的摩擦：

1. **切标签页静默丢草稿**。`Drawer` 用 `tab === "details" ? <EditForm/> : <ImagePane/>` 三元渲染。卖家改了半张表单，点 Photos 看一眼图，回来——改动没了，没有任何提示。
2. **保存后 `draft` 不回读**。`save()` 更新了 `loaded`，但没有用服务端回读的文件重建 `draft`。卖家在数字框里打了 ` 5 `（带空格），保存成功后 `loaded` 是 `5`、`draft` 还是 `" 5 "`，这个字段就永久处于「已改动」状态，此后每次保存都重复下发。
3. **"Saved." 不会消失**。`saved` 只在下一次保存开始或换 item 时清除。卖家保存后继续打字，绿色的「Saved.」一直挂在那里，指的是上一次保存。
4. **"Nothing changed." 用红色 `alert-error` 报出来**。这不是错误，是「你还没改东西」。

## 范围

包含：

- 重排 `studio/src/fields.ts` 的分组：新的分组划分、组内顺序、每组一个稳定 `id` 和 `defaultOpen` 标志
- 价格档位编辑器移进 Price 组，紧跟 Currency
- 默认折叠的组用 `<details>` 渲染，摘要行带徽标（有未保存改动显示改动数，否则显示已填字段数）
- 逐字段的「未保存」标记；表单底部常驻（sticky）操作条：Save / Discard / 未保存计数
- 保存失败时，含报错字段的折叠组自动展开
- 抽屉切标签页不再卸载表单；Details 标签在有未保存改动时带标记
- 修掉上面第 2、3、4 条状态缺陷
- 把 `buildEdits` 与脏值判定从 `EditForm.tsx` 抽成纯模块 `studio/src/editForm.ts` 并补单测
- 双语文档同步

不包含：

- **`scripts/lib/itemFields.ts` 的字段语法和外科式 JSONC 写路径**——本次一行不碰。这两处是正确性关键且已评审过；本子项目只改「表单怎么摆、怎么提示」，下发给服务端的 edit 数组语义与今天完全一致。
- `item.json` schema 变更、新字段
- 表单内的字段搜索框（见「方案选择」中被否掉的方案 C）
- 自动保存
- 按站点语言配置隐藏 Translations 组（studio 客户端目前拿不到 `content/config.ts` 的 locale 列表；见「留给后续」）
- Studio 界面自身的 i18n
- 配置面板、首次安装引导（后续子项目）

## 方案选择

### 方案 A：只重排顺序，不折叠

把高频字段和档位编辑器挪到前面，其余保持全展开。改动最小、零新状态。

否掉的原因：36 个字段在 30rem 宽的抽屉里，无论怎么排，Translations 和 Dates 都还在第 40 个 input 之后。顺序解决「先看到什么」，解决不了「一屏装不下」。而且一次性字段常驻会持续制造视觉噪音。

### 方案 B（选中）：两级表单——高频组展开，低频组折叠，档位并入 Price

`FieldGroup` 加 `defaultOpen: boolean`。Listing 与 Price 默认展开，其余六组以 `<details>` 折叠。抽屉打开时首屏是「名称/状态/成色/数量/描述/标签 + 币种/档位/可议价…」——正好是日常编辑要动的全部内容，其余一次点击可达。

代价是引入「内容被藏起来」的风险：折叠组里有未保存改动而卖家看不见。这个风险用两件东西对冲，两件都必须做，否则方案 B 不成立：

1. 摘要行徽标——折叠组有未保存改动时显示 `2 unsaved`；没有改动但组里有已填值时显示 `3 set`（一个徽标位，脏值优先）。前者防止改动被藏，后者让卖家不用逐个点开就知道哪组有数据。
2. 保存报错时自动展开出错字段所在的组。校验失败的字段必须可见，否则错误信息指向一个屏幕上不存在的字段。

### 方案 C：字段搜索框

在表单顶部放一个输入框，按 label 过滤可见字段。

否掉的原因：它引入了第二套导航模型，而且是会摧毁第一套的那种——搜索状态下分组结构消失，卖家学不到「尺寸在 Specs 里」这件事，每次都得重新搜。36 个字段还没到需要搜索的规模；分组一旦排对，答案是「点一下 Specs」而不是「打字找」。如果字段数涨到 50 以上再重新评估。

### 方案 D：自动保存

否掉的原因：Studio 的每一次写盘都会进入 `content/` 的 git 工作区，卖家最终要 review 这份 diff 再 publish。显式保存让每个 commit 里的改动都是有意为之；自动保存会把「打字打到一半」的中间态写进文件。

## 分组

八个组，`id` 是稳定标识（重命名 title 不影响引用），`defaultOpen` 只描述**编辑表单**的默认展开态。

| # | id | title | defaultOpen | 字段 |
|---|---|---|---|---|
| 1 | `listing` | Listing | ✅ | name, status, condition, quantity, description, tags |
| 2 | `price` | Price | ✅ | price.currency, **［档位编辑器］**, price.negotiable, price.show_tiers, min_acceptable_offer, no_lowball, price_reduced, previous_lowest_price, price.shipping_payer |
| 3 | `translations` | Translations | — | name_zh, description_zh |
| 4 | `specs` | Specs | — | brand, model, color, age_years, dimensions.{length,width,height,unit}, weight.{value,unit}, original_source, original_link, original_price |
| 5 | `payment` | Payment & pickup | — | preferred_payment, pickup_windows, contact_note, stripe_payment_link, venmo_payment_request |
| 6 | `books` | Books & courses | — | isbn, course, edition, semester_listed |
| 7 | `extras` | Extras | — | meta_description, category_override, youtube_link |
| 8 | `dates` | Dates | — | listed_date, sold_date |

字段集合与今天完全一致——36 个 descriptor 一个不增不减，`path` 一个不改。变的只有归属、顺序和默认展开态。

三处归属调整值得单独说明：

- **listed_date / sold_date 从 Basic 移到独立的 Dates 组并折叠**。这两个值由 `pnpm mark-sold` 和批量状态操作维护，手改会让「卖出日期」和实际状态对不上。放在首屏第 7、8 位是在邀请卖家去动它们。
- **Student → Books & courses**。`Student` 描述的是卖家是谁，不是字段是什么；ISBN/course/edition/semester 是教科书字段，非教科书卖家永远不填。
- **Platform → Payment & pickup**。原名指的是「各平台的收款链接」，但组里还有 pickup_windows 和 contact_note；新名字说的是这组回答的问题：钱怎么给、货怎么交。

`stringList` 的三个字段（tags / preferred_payment / pickup_windows）今天只有 tags 带 `One per line.` 提示。三个都补上——同一种输入方式却只有三分之一说明白，是纯粹的疏忽。

## 组 id 与两个面板各自的优先级

`DefaultsPane` 也消费 `FIELD_GROUPS`，并且有自己的一套 `PINNED_GROUPS = new Set(["Price", "Platform"])`，按 **title 字符串**匹配。把 title 改掉，这个 Set 会静默失效（没有类型错误），默认值面板的所有组都会变成折叠——这是本次重排最容易踩的坑。

处理方式：`FieldGroup` 加 `id: GroupId`，`GroupId` 是字符串字面量联合类型。`DefaultsPane` 保留它自己的置顶集合，但改成 `ReadonlySet<GroupId>`，值为 `"price"` 和 `"payment"`。

这里刻意**不**让两个面板共用 `defaultOpen`：它们的高频组不是同一批。编辑表单里 Payment & pickup 是折叠的（日常改商品不会动收款方式）；而默认值面板里它恰恰是最该置顶的（`2026-08-02-studio-item-defaults-design.md` 明确写了「收款方式、面交时段、联系备注」是卖家点名要预设的）。同一个布尔值服务两个相反的需求只会两头不讨好。用 `GroupId` 联合类型的意义是：分组重命名时 `DefaultsPane` 会**编译失败**，而不是静默降级。

## 脏值判定：一个谓词，两处使用

底部计数说「3 unsaved changes」，保存却下发 5 条 edit，或者反过来——这类不一致比没有计数更糟。所以脏值只有一个定义，`buildEdits` 和计数共用同一个谓词：

```typescript
// studio/src/editForm.ts
export function fieldIsDirty(field, loaded, draft): boolean {
  const next = draft[pathKey(field.path)] ?? "";
  if (next === toInput(readAtPath(loaded, field.path), field.kind)) return false;
  // 空白 select 表示「不改动」——严格 enum 不收 ""，永远不下发（现有规则，原样保留）
  if (next === "" && field.kind === "select") return false;
  return true;
}
```

推论：`buildEdits` 会下发的字段，正好就是计数里的字段，正好就是带「未保存」标记的字段。三者不可能对不上。

代价：在数字框里打 ` 5 `（前后空格）算作脏——字符串不等，会下发一条 `5`。和今天的行为一致，写在测试里当作已知且无害的行为固定下来。

## 界面

**折叠组**用原生 `<details>` / `<summary>`。摘要行复用 `.edit-form legend` 的排版（小写字母间距、`--ink-soft`），加一个箭头和右侧徽标。原生 details 自带键盘可达性与 `aria-expanded`，不需要手写展开状态——除了「保存报错时强制展开」这一种情况，用受控的 `open` 属性覆盖。

**逐字段标记**：`FieldInput` 收一个可选 `dirty` prop，label 后面加一个 `●` 与一段仅供读屏的「unsaved」文本。不靠颜色单独表意。

**底部操作条**：`position: sticky; bottom: 0`，抽屉本身是滚动容器，所以它会贴在抽屉底部。内容为 `Save changes`（无改动时禁用）、`Discard`（无改动时禁用）、以及一段 `role="status"` 的「N unsaved changes」。今天要保存必须滚到表单最底部；现在不用滚。

**抽屉标签页**：Details 有未保存改动时标签显示为 `Details ●`。配合「切标签页不卸载表单」，卖家去看图再回来，改动还在，且在别的标签页时也能看见有东西没存。

## 抽屉标签页不再卸载

`Drawer` 维护一个 `visited` 集合：访问过的标签页保持挂载，非当前页用 `hidden` 属性隐藏。首次打开抽屉仍只挂载 Photos（不为没点开的 Details 白发一次 `GET /api/items/:id/fields`），点过 Details 之后两者都常驻。

`EditForm` 通过 `onDirtyChange(count)` 把未保存数上报给 `Drawer`，用于标签页标记。

## 保存流程的四处修正

1. **保存成功后用回读结果重建 `draft`**。`patchItem` 返回的就是重新读盘的文件，`load()` 里那段「从 fields 生成 draft」抽成 `draftFromFields(fields)`，保存成功后再调一次。脏值计数因此归零，服务端做过的归一化也如实反映到输入框里。
2. **`saved` 在卖家再次输入时清除**。`setDraft` 的每个入口都跟一次 `setSaved(false)`（`DefaultsPane` 已经是这个写法，对齐它）。
3. **「Nothing changed」不再是错误**。无改动时 Save 按钮本就禁用，这条路径基本走不到；保留为防御性分支，但渲染成 `role="status"` 的中性提示。
4. **`Discard`**：把 `draft` 重置回 `draftFromFields(loaded)`，并给 `TierEditor` 一个 `resetToken`，让它把 `rows` 拉回 `baseline`。

## 测试

新增 `studio/src/editForm.test.ts`（与 `filtering.test.ts` 同样的定位：纯函数，相对 import，vitest 自动纳入）：

- `draftFromFields`：每个 descriptor 都有一个字符串键；缺失值为 `""`
- `fieldIsDirty`：未改动 / 改了文本 / 空白 select 视为未改动 / 数字带空格算改动
- `computeDirtyKeys`：只返回脏字段的 key
- `buildEdits`：叶子 edit；未改动字段不下发；空白 select 不下发；非法数字产出 problem 且带 groupId；`dimensions` 缺失时用 seed 合成整对象；只填长度不填单位时报「pick a unit」
- `problemGroupIds`：报错字段能映射回它所在组的 id（含 dimensions/weight 这种整对象路径）

`scripts/studioFields.test.ts` 同步更新：
- 组标题断言换成新的八组（同时断言 `id` 序列）
- 两条对 `EditForm.tsx` 的源码字符串断言（`WHOLE_OBJECT_SEEDS[head]` / `pick a unit` / 空白 select 守卫）指向搬家后的 `studio/src/editForm.ts`；其中「空白 select 不下发」这一条从源码字符串匹配升级为 `editForm.test.ts` 里的行为断言——同一个保证，更强的验证方式
- `{ path: ["price", "tiers"], value: rows }` 仍在 `EditForm.tsx`（`TierEditor` 不搬家），该断言原样保留

现有 646 个测试必须全绿。

## 文档（双语同步，Iron Rule 2）

- `CURRENT_FUNCTIONALITY.md` / `_zh`：编辑表单一节改写——两级分组、sticky 操作条、未保存提示、切标签页不丢草稿
- `ARCHITECTURE.md` / `_zh`：studio 结构补 `editForm.ts` 与 `fieldValues.ts`
- `TECH_REQUIREMENTS.md` / `_zh`：`fields.ts` 那一行补上 `id` / `defaultOpen` 的约定，以及「`DefaultsPane` 的置顶集合按 `GroupId` 类型校验」
- `IMPLEMENTATION_PLAN.md` / `_zh`：记为 Phase 22，完成后全部任务标 `[x]` 并加 ✅

## 留给后续

- **按站点语言隐藏 Translations 组**：需要 studio 服务端把 `content/config.ts` 的 locale 列表发到客户端。这是配置面板子项目（backlog #2）本来就要建的通道，等它建好再接。
- **关闭抽屉时对未保存改动的确认**：sticky 条 + 标签页标记已经让「有东西没存」持续可见，先看这一层够不够；确认弹窗有它自己的烦人成本，不在证据不足时先加。

## 兼容性与分支

- 不改 `content/`，不新增配置字段（Iron Rule 8 不涉及）
- 不改 `scripts/lib/itemFields.ts`、不改服务端任何写路径；`PATCH /api/items/:id` 收到的 edit 数组语义与今天完全一致
- 不新增依赖
- `reserved_for` 不出现在任何 descriptor 里（Iron Rule 4，与今天一致）
- 分支 `feat/studio-edit-form`，从 develop 切出
