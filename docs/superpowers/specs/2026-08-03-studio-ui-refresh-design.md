# Seller Studio UI 视觉翻新 设计文档

日期：2026-08-03
状态：设计已确认，待写实现计划

## 要解决的问题

Studio 现有的"碳纸托运单"视觉（灰蓝纸色、Courier 打字机字体、无圆角无阴影、全大写字间距）是 Phase 18 有意设计的风格，但卖家实际使用后的反馈是四个字：不好看。具体诊断：配色冷淡显旧、字体气质太复古、界面一片平坦缺层次、布局间距粗糙。

翻新目标：换成现代管理工具的视觉语言（卡片、圆角、柔和阴影、清晰层次），配色直接复用站点 `app/globals.css` 的品牌色，让 Studio 和店面成为同一视觉家族。支持浅色/深色双主题。

## 范围

包含：

- `studio/src/tokens.css` 整体重写：双主题语义 token、组件样式
- 组件抽取：`Button`、`StatusBadge`、`ThemeToggle` 三个共享组件，替换各 pane 的对应标记
- 主题切换机制：`data-theme` 属性 + localStorage 记忆 + 跟随系统偏好
- 无障碍增强：对话框焦点管理（移入、模态焦点圈闭、Esc 关闭、关闭后焦点归还）
- 空/加载/错误状态升级：空列表文案、EditForm 骨架屏、错误提示条样式
- 顶栏重新设计（标题、计数、主题切换、操作按钮组）

不包含：

- 信息架构改动（仍是 顶栏 + 表格 + publish 区 + 抽屉/弹窗 的单页结构）
- Tailwind 或其他样式框架引入（保持纯 CSS 变量架构）
- Card 类组件抽取（结构不变的前提下没有卡片容器可抽）
- scripts/ 服务端、字段语法、API 的任何改动
- 主站 `app/` 的任何改动

## 设计语言

### 调色板

浅色主题直接取站点 `globals.css` 的原值，深色主题取站点 dark 值并补齐 Studio 需要的表面色。全部走语义 token，组件样式不写死色值。

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--bg` | `#f8f4ec` | `#231f20` | 页面底色（站点 background 原值） |
| `--surface` | `#ffffff` | `#2e2a2b` | 卡片、对话框、抽屉、输入框底 |
| `--surface-2` | `#f3ede1` | `#383234` | 表头、禁用态等次级面 |
| `--border` | `#e6ddcf` | `#4a4340` | 描边 |
| `--ink` | `#231f20` | `#f8f4ec` | 正文（站点 foreground 原值） |
| `--ink-soft` | `#6f675e` | `#a89e94` | 次要文字 |
| `--accent` | `#002af9` | `#a8bbd6` | 主按钮、焦点环、选中态（站点 accent 原值） |
| `--on-accent` | `#ffffff` | `#1a1d21` | accent 上的文字 |
| `--accent-soft` | `#d5a198` | `#5d4a44` | 选中行底色等柔和强调（站点 accent-soft 血缘） |
| `--danger` | `#b3241e` | `#e06c66` | 错误提示、sold 状态（沿用邮票红血缘） |
| `--backdrop` | `rgb(35 31 32 / 0.4)` | `rgb(0 0 0 / 0.55)` | 遮罩 |

状态色（徽章专用，浅/深两套，文字对比度均 ≥ 4.5:1）：

| 状态 | 浅色：底 / 字 | 深色：底 / 字 |
|---|---|---|
| available | `#e3f0e4` / `#1a7f37` | `#24402c` / `#7ed49a` |
| pending | `#f5edd6` / `#8a6a12` | `#423a1e` / `#d9b95c` |
| reserved | `#e2ecf7` / `#0969da` | `#1f3a52` / `#7ab8f0` |
| sold | `#f7e3e2` / `#b3241e` | `#4c2624` / `#e06c66` |
| draft | `#eceae6` / `#6f675e` | `#383234` / `#a89e94` |

### 字体

继续用 `@fontsource` 本地打包，离线可用：

- UI 与标题：IBM Plex Sans（保留）。标题用 600 字重，Archivo Narrow 退役
- 数据等宽：IBM Plex Mono 替换 Courier Prime（打字机气质是复古感的主要来源，Plex Mono 与 Plex Sans 同族）

字号沿用现有 `--step-*` 阶梯，不调整基准。

### 几何与质感

- 圆角分级：`--radius-sm: 6px`（输入框、按钮、徽章文字框）、`--radius-md: 10px`（对话框、抽屉、缩略图卡）、徽章用全圆（999px）。不做"全部大圆角"
- 阴影两级，暖色调：`--shadow-sm`（卡片/缩略图，1px 级）、`--shadow-lg`（对话框/抽屉，16px 级）。深色主题阴影降为近乎无，靠 `--border` 分层
- 间距：保留 `--gap: 0.75rem`，新增 `--gap-lg: 1.25rem`，所有值落在 0.25rem 刻度上
- 过渡：hover/主题切换 120–160ms ease；全部可被 `prefers-reduced-motion` 关闭
- 无渐变

## 组件规范

全部以 CSS 类实现，pane 的 DOM 结构不动（除 Button/StatusBadge/ThemeToggle 替换）。

- **按钮**：primary（accent 底 + on-accent 字）、secondary（surface 底 + border）、ghost（无边框，hover 出浅底）。hover 加深、active 再加深、disabled 灰化。圆角 6px。替换现有全部"描边按钮 hover 反色"
- **输入框 / 下拉 / 文本域**：带边框圆角盒子，surface 底；focus 时 border 变 accent 并加 2px 细 ring。替换现有下划线式
- **表格**：保留 `<table>`。表头小字号、600 字重、ink-soft 色，去全大写字间距。行 hover 浅底；选中行 accent-soft 底；失败行保留左侧 3px danger 条
- **状态徽章**：全圆角，状态色"底 + 字"对，文字即状态名（不靠颜色单独传达）。SOLD 徽章用 sold 状态色
- **盖戳动画**：保留。刚标 sold 的行先盖一次倾斜红戳（现有 `stamp-press` 动画与 `-4deg` 造型、mask 缺墨效果、reduced-motion 降级都不变），动画结束后该行展示普通 sold 徽章。印章红沿用 `#b3241e` 血缘
- **对话框**：surface 底、radius-md、shadow-lg、backdrop 遮罩。打开时焦点移入，模态焦点圈闭，Esc 关闭，关闭后焦点归还触发按钮
- **抽屉**：surface 底、左侧 shadow-lg（去掉 border-left）。非模态：不做焦点圈闭，支持 Esc 关闭。标签页（Photos/Details）改下划线式 active 指示，沿用现有 `.tab` 语义
- **顶栏**：surface 底 + 下边框。左侧标题与计数，右侧 ThemeToggle + New item 按钮。标题去全大写，600 字重
- **空状态**：无 item 时显示居中的引导块（一句话 + 指向 New item 按钮），替换现在裸在页面上的一句 CLI 提示
- **加载态**：EditForm 首次加载由 `Loading…` 文本升级为三行骨架条（`--surface-2` 底、脉冲动画、reduced-motion 下静止）
- **错误态**：`role="alert"` 的提示统一为 danger 色系浅底条（不抢 sold 徽章的视觉权重）

## 主题切换机制

- 根节点 `<html data-theme="light">` 或 `data-theme="dark"`；两套 token 各定义一次
- `main.tsx` 启动时同步读取 localStorage 键 `studio-theme`；无值则跟随 `prefers-color-scheme`；落到 DOM 后再挂载 React，避免闪烁
- `ThemeToggle`：顶栏图标按钮（内联 SVG 日/月，带 aria-label），点击写回 localStorage 并切换 `data-theme`
- 组件样式只认 token，切换零重载

## 组件抽取与 TSX 改动清单

新增 `studio/src/components/`：

- `Button.tsx`：`variant: "primary" | "secondary" | "ghost"`，透传原生 button 属性。约 10 处替换点：App 顶栏、NewItemDialog、PublishPane、BulkToolbar、EditForm、ImagePane、TierEditor、DefaultsPane、Drawer
- `StatusBadge.tsx`：`status: string → 徽章`（未知状态按 draft 样式显示原文），ItemList 使用
- `ThemeToggle.tsx`：App 顶栏使用

改动文件：

- `tokens.css`：整体重写
- `main.tsx`：主题初始化
- `App.tsx`：ThemeToggle、按钮换 Button、空状态文案
- `ItemList.tsx`：StatusBadge
- `EditForm.tsx`：按钮换 Button、加载骨架屏
- `BulkToolbar.tsx`、`NewItemDialog.tsx`、`PublishPane.tsx`、`DefaultsPane.tsx`、`ImagePane.tsx`、`Drawer.tsx`：按钮换 Button
- `NewItemDialog.tsx`、`DefaultsPane.tsx`：模态焦点圈闭 + Esc + 焦点归还（可抽一个共享 `useDialogBehavior` hook，放在 components/）
- `package.json`：`@fontsource/courier-prime`、`@fontsource/archivo-narrow` 移除，`@fontsource/ibm-plex-mono` 加入（IBM Plex Sans 已有）

不动：`fields.ts`、`FieldInput.tsx` 的 JSX（样式走 CSS 类生效）、`api.ts`、scripts/ 全部。

## 无障碍与降级

- 两套主题全部文字组合对比度 ≥ WCAG AA（正文 4.5:1、大字/徽章 3:1）；徽章带文字，不用颜色单独传达状态
- 焦点管理：focus-visible 全局 accent 2px ring；对话框焦点圈闭与归还；所有可交互元素保持原生 button/input（键盘可达）
- `prefers-reduced-motion`：盖戳、骨架脉冲、过渡动画全部关闭
- 窄屏：现有 40rem 断点的卡片式折叠布局保留并适配新 token

## 验证与文档

- 自动门槛：`pnpm type-check && pnpm lint && pnpm test`（619 个测试不受影响，scripts/ 零改动）
- 人工走查：两个主题 × 全部面板 × 320/768/1024/1440 四档宽度；盖戳动画；焦点圈闭与 Esc；骨架屏；空状态
- 文档（双语同步，Iron Rule 2）：
  - `TECH_REQUIREMENTS.md` / `_zh`：依赖表（英 87-89 行 / 中 87-89 行）移除 `@fontsource/archivo-narrow` 与 `@fontsource/courier-prime`，加入 `@fontsource/ibm-plex-mono`
  - `CURRENT_FUNCTIONALITY.md` / `_zh`：Studio 节补一句双主题与主题切换
  - `ARCHITECTURE.md` / `_zh`：Studio SPA 结构处补 `components/` 目录（Button/StatusBadge/ThemeToggle）

## 依赖与分支

- 本分支（`feat/studio-ui-refresh`）叠在 `feat/studio-item-defaults`（PR #4）之上，因为要覆盖 Defaults 面板。PR #4 合入 develop 后，本分支 rebase 到 develop
- 验收时的对照物是翻新后的实际界面；无自动化视觉回归（与 TECH_REQUIREMENTS §25 现有口径一致）
