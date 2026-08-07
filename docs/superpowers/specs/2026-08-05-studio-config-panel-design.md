# Seller Studio 配置面板 设计文档

日期：2026-08-05
状态：设计已确认，待实现（由接手 agent 执行，见 `docs/superpowers/HANDOFF-config-panel.md`）

## 要解决的问题

改站点设置——名称、标语、货币、卖家位置、首页数量、联系方式——目前只能手动编辑 `content/config.ts`。那是一个 368 行的 TypeScript 文件，也是卖家唯一需要碰的 TS 文件。改错一个逗号或引号，站点就构建不出来。

Studio 已经能管商品、照片、默认值和发布，唯独站点配置还要退回编辑器。本设计补上这块。

## 关键约束：注释是资产，不是噪音

`content/config.ts` 里 368 行中有 **182 行是注释**——字段说明、合法取值、注释掉的备选配置（如 `// baseUrl: "https://your-domain.com"`）。这些是卖家的文档，也是 `pnpm update-site` 从不覆盖此文件的原因。

**任何会丢失这些注释的方案都不可接受。** 这一条排除了"读成对象再整体重写文件"的做法，也决定了最终方案。

## 范围

包含：

- `scripts/lib/configEdit.ts`：TS AST 驱动的读取与外科式单值写入
- `GET/PUT /api/config`：读取字段列表、写入单个字段
- `studio/src/panes/ConfigPane.tsx`：配置面板，顶栏入口
- 写前按字段类型校验 + 写后 `tsc` 验证，不通过自动丢弃改动
- 双语文档同步、Phase 23 记录

不包含：

- **数组字段的编辑**（`contact.platforms`、`ui.priceFilterBuckets`）：只读展示，附提示引导手改文件。数组元素的增删排序是另一个量级的 UI 工程，而这两个字段的改动频率远低于站点名/货币/位置
- 新增任何配置字段（Iron Rule 8 的向后兼容检查清单因此不适用）
- 首次安装引导（独立子项目）
- `pnpm migrate-config` 的行为改动

## 方案选择：TS AST 外科式编辑

已实测验证（TypeScript 编译器已是仓库依赖，`tsc` 在跑 type-check）：用 AST 定位目标值的精确字符区间、只替换那一段字节后，**182 行注释全部保留，整个文件只有 1 行不同**。

对比排除的两个方案：

- **解析成对象后整体重写文件**：写入逻辑最简单，但会抹掉全部 182 行注释与注释掉的备选配置。对"卖家唯一编辑的 TS 文件"不可接受。
- **行级正则替换**：无需 AST，但认不出嵌套结构（`location.lat` 与顶层同名键分不清）、字符串内含冒号或大括号会误判、多行值处理不了。现有 `scripts/migrate-config.ts` 只用正则做**插入**（锚点后加整块行），从不做**值替换**——这个区别是有意的：正则做插入安全，做替换不安全。

AST 方案的复杂度集中在一个纯模块里，可单测，且与仓库既有哲学一致（`item.json` 的 JSONC 外科式编辑就是同一思路）。

## 读写引擎

新增 `scripts/lib/configEdit.ts`。纯模块：不碰 HTTP、不碰 React、不落盘（落盘由 API 层负责，便于测试）。

### 字段模型

```typescript
export type ConfigFieldKind = "string" | "number" | "boolean" | "enum" | "unsupported";

export type ConfigField = {
  /** 点分路径，如 "location.lat"、"ui.priceFilterStrategy" */
  path: string;
  /** 当前值；unsupported 字段为源码文本片段 */
  value: string | number | boolean | null;
  kind: ConfigFieldKind;
  /** kind === "enum" 时的合法值，来自 lib/config/types.ts 的联合类型 */
  options?: string[];
  /** 从文件注释提取的说明 */
  doc?: string;
  /** 该字段所属的分组标题，来自 `// ── XXX ───` 分隔注释 */
  section: string;
  /** 值在源文件中的字符区间 [start, end) */
  range: [number, number];
};
```

### 三个导出

**`readConfig(source: string, typesSource: string): ConfigField[]`**

遍历 `siteConfig` 对象字面量，递归拍平成叶子字段列表。嵌套对象展开为点分路径；数组和无法识别的初始化表达式标为 `unsupported`。

`typesSource` 是 `lib/config/types.ts` 的内容，用来解析枚举字段的合法值——界面下拉选项因此永远等于类型定义，不需要在代码里手抄一份。

**`writeConfigValue(source: string, path: string, newValue: string | number | boolean): string`**

按 path 定位字段，只替换 `range` 那一段字符，其余字节原样返回。数字直接写、字符串按 JSON 转义写、布尔写字面量。返回新的源码字符串。

路径不存在、或字段是 `unsupported` 时抛错。

**`validateConfigValue(field: ConfigField, newValue: unknown): void`**

写前校验，不通过抛出带字段名的错误。规则见下节。

### 注释提取规则

按优先级：

1. 字段上方紧邻的连续整行 `//` 注释块（向上收集，遇到空行或另一个字段则停止）
2. 字段所在行的行尾 `//` 注释
3. 都没有则 `doc` 为 undefined

分组标题从 `// ── XXX ───` 形式的分隔注释提取，字段归属其上方最近的一个分隔注释。

### i18n 的特殊处理

配置里共 **118 个可编辑叶子字段，其中 87 个在 `i18n.translations` 下**——是界面 UI 字符串的翻译表。如果平铺，面板会有 74% 的篇幅是翻译字符串，真正的站点设置被淹没。

因此：`i18n.translations.*` 的字段归入一个独立分组，界面上**默认折叠**，标题写明"UI 翻译（87 项）"。它们仍然可编辑，只是不占据默认视野。其余 31 个字段是面板的主体。

## API

`scripts/lib/studioApi.ts` 新增两个路由，沿用现有的 CSRF guard 与 127.0.0.1 绑定：

- **`GET /api/config`** → `{ fields: ConfigField[] }`
- **`PUT /api/config`**，请求体 `{ path: string, value: string | number | boolean }` → `{ fields: ConfigField[] }`（写入后重新解析返回）

### 写入流程（顺序不可变）

1. 读当前 `content/config.ts` 源码，解析并按 path 找到字段
2. **写前校验** `validateConfigValue`
3. 用 `writeConfigValue` 得到新源码，写入**临时文件**
4. 跑 `tsc --noEmit` 验证整个项目仍类型正确
5. 通过 → 用新源码覆盖 `content/config.ts`；**不通过 → 丢弃临时文件**，返回 400 并附 tsc 的错误输出
6. 重新解析并返回字段列表

第 4 步是兜底：即使第 2 步的校验规则漏了什么，类型系统会拦住。代价是每次保存慢几秒，对这个低频操作可以接受。

### 校验规则

| kind | 规则 |
|---|---|
| `enum` | 必须是 `options` 中的一个 |
| `number` | 必须是有限数；`recentlyListedCount` / `soldArchiveDisplayLimit` ≥ 0；`location.lat` ∈ [-90, 90]；`location.lng` ∈ [-180, 180] |
| `boolean` | 必须是布尔 |
| `string` | 不得包含反引号或 `${`（防模板字符串注入）；`baseUrl` 与其他 URL 类字段必须能被 `new URL()` 解析且协议为 http/https（空字符串允许，代表未设置） |
| `unsupported` | 一律拒绝写入 |

## 界面

新增 `studio/src/panes/ConfigPane.tsx`，复用 Defaults 面板的对话框骨架与共享的 `FieldInput` 组件。

- 字段按 `config.ts` 中的原有分组顺序呈现（Identity / Deployment / Image Storage / Seller location / Content defaults / …），分组标题来自文件的分隔注释
- 每个字段：标签（path 末段美化）+ 输入控件 + `doc` 作为 hint
- `unsupported` 字段：灰显只读，附"这个字段请直接编辑 `content/config.ts`"
- **危险字段警告**：`deploymentMode`、`baseUrl`、`imageStorage.provider` 三项加醒目提示，说明改错的后果（构建失败 / 图片全部失效）
- `i18n.translations` 分组默认折叠
- **逐字段保存**：改一个存一个，不是整表提交。因为写入要跑 tsc，逐字段才能精确定位是哪个改动导致失败
- 保存中禁用该字段的输入；失败时在该字段下方显示错误（含 tsc 输出）

入口：顶栏 Defaults 按钮旁新增 Config 按钮。

## 测试

新增 `scripts/lib/configEdit.test.ts`：

- **读取**：路径拍平正确；注释提取的三种情形（上方块 / 行尾 / 无）；分组归属正确；枚举选项来自类型定义；数组标为 unsupported；i18n 字段数量符合预期
- **写入**：改数字、字符串、布尔各一例，每例断言**除目标行外全文件逐字节相同**，且注释行数不变
- **边界**：路径不存在抛错；写 unsupported 字段抛错；字符串含 `${` 被拒；enum 非法值被拒；纬度越界被拒
- **往返**：写入后重新 `readConfig`，该字段新值正确且其余字段不变

`scripts/lib/studioApi.test.ts` 补充：GET 返回字段列表；PUT 合法值成功并返回新列表；PUT 非法值返回 400 且**文件未被修改**。

## 文档（双语同步，Iron Rule 2）

- `CURRENT_FUNCTIONALITY.md` / `_zh`：Studio 操作表加"站点配置"一行，操作计数递增
- `ARCHITECTURE.md` / `_zh`：`scripts/lib/` 模块表加 `configEdit.ts`；studio 结构补 `ConfigPane`
- `IMPLEMENTATION_PLAN.md` / `_zh`：Phase 23，完成后全部 `[x]` 并加 ✅

## 兼容性

- 不新增配置字段，不改 `lib/config/types.ts`，Iron Rule 8 的检查清单不适用
- 不改 `pnpm migrate-config` 的行为
- 写入范围仅 `content/config.ts`，仍在 `content/` 内（Iron Rule 1）
- 没有 `content/config.ts` 或其中无 `siteConfig` 时，API 返回 400 并说明原因，面板显示该错误而非崩溃
