# Handoff — Seller Studio 配置面板（Phase 23）

这份文件交给实现配置面板的 agent。设计已经完成并获卖家批准，你的工作是**实现**，不是重新设计。

## 先读这三样

1. `.claude/CLAUDE.md` — 项目铁律（尤其 Iron Rule 2 双语同步、Iron Rule 4 `reserved_for`、Iron Rule 1 只写 `content/`）
2. `docs/superpowers/specs/2026-08-05-studio-config-panel-design.md` — 已批准的设计
3. `docs/superpowers/plans/2026-08-05-studio-config-panel.md` — 逐任务实现计划（含全部测试代码和实现要点）

按计划的 Task 1 → 6 顺序执行。推荐走 superpowers 的 subagent-driven-development 流程；单会话顺序 TDD 也可以，但每个任务的测试先行不可省略。

## 仓库现状

- 分支 `feat/studio-config-panel` 已从 `develop` 切好，直接在上面干活
- `develop` 已含 Phase 19-22：默认值体系、UI 视觉翻新、列表搜索筛选、编辑表单体验
- 门槛基线：**666 测试 / 39 文件**，type-check 与 lint（零警告）干净。每个 commit 前必须保持全绿
- 最近的功能实现风格参照：`studio/src/filtering.ts` + 其测试（纯模块 + 单测的样板）、`studio/src/panes/DefaultsPane.tsx`（对话框式面板的样板）

## 已经验证过的技术事实

不要重新怀疑这些——设计阶段的实测结论：

- TypeScript 编译器已是仓库依赖。用它的 AST 定位 `siteConfig` 字面量、按字符区间替换单个值，**实测 182 行注释全部保留，全文件只有 1 行不同**
- `content/config.ts`：368 行，182 行注释，20 个顶层字段全部是字面量或对象字面量（无表达式）
- 可编辑叶子字段共 118 个，其中 87 个在 `i18n.translations` 下——面板把这部分单独折叠成一组，其余 31 个是主体
- 分组标题从 `// ── XXX ───` 分隔注释提取，共 15 个顶层分组
- `lib/config/types.ts`（260 行）里有枚举字段的联合类型，AST 可读

## 三条红线

1. **注释逐字节保留**。这是整个设计的存在理由。Task 1 的测试会钉死这一点（改动行数 = 1，注释行数不变）；实现时任何"顺手重新格式化"的念头都不要有
2. **写不进就一点都不要动文件**。`PUT /api/config` 的 tsc 关卡不过，`content/config.ts` 必须与写入前逐字节相同。用临时文件 + 原子 rename，不要"先覆盖再补救"
3. **数组字段只读**。`contact.platforms`、`ui.priceFilterBuckets` 在界面灰显、`writeConfigValue` 拒绝。不要扩展成数组编辑器——那是另一个子项目

## 已知的坑（计划里写了，这里再点一次）

- Task 2 的测试要在沙箱里跑 tsc，沙箱没有 `tsconfig.json`。计划要求的处理：找不到 `tsconfig.json` 时跳过关卡，并且**用一条显式测试把这个行为钉死**。静默跳过是不合格的
- AST 取字符位置用 `getStart(sourceFile)`，**不是** `.pos`——后者包含前导 trivia，会把注释吞进替换区间
- 对象属性上方的注释块归属其**第一个叶子字段**（`location:` 上方的注释挂在 `location.lat` 上）
- 字符串值校验拒绝反引号和 `${`——防模板字符串注入，别当普通引号处理
- `soldItemRetentionDays` 允许 -1（-1 = 立即隐藏），别把"负数"一刀切拦掉；但 `recentlyListedCount`、`soldArchiveDisplayLimit` 必须 ≥ 0

## 完成标准

- 计划 Task 1-6 全部完成，每个 commit 门槛全绿
- Task 6 的两项硬验证通过：真实文件单值编辑后注释数不变且只改 1 行；非法写入被拒且文件未被动过
- 双语文档同步完成（CURRENT_FUNCTIONALITY、ARCHITECTURE、IMPLEMENTATION_PLAN 各一对）
- 开 PR 到 `develop`（若 GitHub 写权限不可用，把分支和验证结果打包留下，并在 PR 描述里写明门槛的实际数字——**不许声称没亲眼验证过的结果**）

## 明确不做

- 首次安装引导（独立子项目，另行安排）
- 新增任何配置字段
- 改 `lib/config/types.ts`、`pnpm migrate-config` 的行为
- 配置面板之外的任何 Studio 改动（发现别的 bug 记下来，不要顺手修）
