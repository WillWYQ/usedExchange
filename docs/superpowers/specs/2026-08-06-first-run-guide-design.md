# 首次安装引导（First-Run Guide）设计文档

日期：2026-08-06
状态：设计已确认，待实现

## 要解决的问题

一个全新 clone 下来的站点，卖家不知道下一步干什么。目前的引导是**分散**的：

- 配置站点有一处（对话式 `/setup` 技能，或 Config Pane）
- 配 CDN 是另一处（`docs/setup_instruction.md` 一份手动文档）
- 没有一个把新人从"刚 clone 完"带到"第一个商品上线"的**连贯入口**

本设计补一个连贯入口：一份"还缺什么、按什么顺序做、每步去哪"的就绪清单，通过两个入口共用同一份判断逻辑。

## 范围

包含：

- `scripts/lib/siteReadiness.ts`：就绪判断模块（唯一的"还缺什么"逻辑）
- Studio 的 `GettingStarted` 面板 + `GET /api/readiness` 路由
- `scripts/doctor.ts` + `pnpm doctor` 命令
- 分级清单（核心路径 + 进阶）
- 双语文档同步

不包含：

- 自动修复任何一项（只做诊断和指路）
- Studio 面板对"config 坏了"的特殊 UI（Studio 起不来就看不到面板，无意义）
- 改动 `/setup` 技能本身、`setup_instruction.md` 的内容
- 翻译完整性的自动补全

## 方案选择：一个 readiness 模块 + 两个薄壳

环境变量和文件系统检查只能在 node 端跑，所以判断逻辑必然在服务端；Studio 侧要走 API 路由。因此唯一干净的形状是：

- **`scripts/lib/siteReadiness.ts`**：纯 node 模块，产出清单
- **Studio**：`GET /api/readiness` 路由返回清单；`GettingStarted` 面板渲染它
- **CLI**：`pnpm doctor` 跑同一个模块，终端打印同一份清单

判断逻辑只写一份，两个入口永远一致——这正是"连贯入口"的本意。排除的另两个方案：两个入口各写各的（会不一致，违背目的）；同构浏览器/node 模块（env/fs 浏览器跑不了，纯增复杂度）。

## 就绪清单（分级）

每个检查项含 `id`、`tier`、标题、一句说明（含当前状态）、`done`、以及可选的"去哪做"动作。

**Tier 1 — 核心路径**（从 clone 到第一个商品上线，必做）

| id | 检查项 | 判定依据 | 动作 |
|----|--------|---------|------|
| `identity` | 站点身份：baseUrl 非模板占位符 | `baseUrl` 不含 `your-domain.com` 且不含 `usedexchangeproject.willsleep.dev`（复用 `templateStatus.ts` 的两个常量） | 打开 Config Pane |
| `image-storage` | 图片存储：所选 CDN 的环境变量齐 | 按 `imageStorage.provider` 查 env：`cloudflare-r2` 要 `CF_R2_ACCOUNT_ID`/`CF_R2_ACCESS_KEY_ID`/`CF_R2_SECRET_ACCESS_KEY`/`CF_R2_BUCKET`/`CF_R2_PUBLIC_URL` 五个；`vercel-blob` 要 `BLOB_READ_WRITE_TOKEN`；`local` 永远 done | `setup_instruction.md` 对应小节 |
| `first-item` | 第一个商品存在 | `content/items/` 下至少一个 `item.json` | Studio 新建 / `pnpm new` |
| `first-item-live` | 至少一个商品非 draft | 任一 item 的 `status !== "draft"` | Studio 改状态 |
| `git-ready` | 是 git 仓库 | `git rev-parse --git-dir` 成功 | `git init` |
| `contact` | 至少一个联系平台 | `contact.platforms.length > 0` | 打开 Config Pane |

**Tier 2 — 进阶**（核心全 done 后才点亮，不阻塞）

| id | 检查项 | 判定依据 |
|----|--------|---------|
| `translations` | 每个启用 locale 补齐 UI 字符串 | 复用 `check-config.ts` 的 `REQUIRED_KEYS` 校验逻辑（见下） |
| `shipping` | 运费估算配好（可选） | `shipping.enabled === true` → done；未启用 → todo，detail 注明"可选项，尚未配置"。Tier 2 本就折叠、不阻塞，如实反映即可 |
| `aceternity` | Aceternity 组件已安装 | `components/ui/` 下存在组件文件 |

**特意不做**：不把更多进阶项塞进清单。这九项覆盖"从 clone 到上线 + 常见增强"，再多就是噪音。

## 数据模型

```typescript
export type ReadinessTier = 1 | 2;

/** 每项的"去哪做"，让两个入口都能把用户带到正确的地方 */
export type ReadinessAction =
  | { kind: "pane"; pane: "config" }        // Studio: 打开 Config Pane
  | { kind: "docs"; doc: string }           // 打开文档（如 setup_instruction.md 某节）
  | { kind: "command"; command: string }    // 终端：跑这条命令
  | { kind: "studio"; view: "new-item" };   // Studio: 去新建视图

export type ReadinessItem = {
  id: string;
  tier: ReadinessTier;
  title: string;
  detail: string;        // 当前状态的一句说明
  done: boolean;
  action?: ReadinessAction;
};

export type ReadinessReport = {
  items: ReadinessItem[];
  tier1Done: number;
  tier1Total: number;
  allTier1Done: boolean;   // 面板据此自动隐藏
};
```

## 模块架构（可测性优先）

**`buildReadinessReport` 不直接 import config，改成注入**：

```typescript
/** 只取 readiness 需要的 config 子集。结构化类型，测试能传字面量 fixture，
    不必构造完整 SiteConfig；siteConfig 天然满足这个形状。 */
export type ReadinessConfig = {
  name: string;
  baseUrl: string;
  imageStorage: { provider: string };
  contact: { platforms: Array<{ type: string }> };
  shipping?: { enabled: boolean };
  i18n: {
    availableLocales: string[];
    defaultLocale: string;
    translations: Record<string, Record<string, string>>;
  };
};

export async function buildReadinessReport(
  projectRoot: string,
  config: ReadinessConfig | null,   // null = content/config.ts 解析失败
  env: NodeJS.ProcessEnv,
): Promise<ReadinessReport>;
```

**理由**：直接 `import { siteConfig }` 会让单元测试无法喂 fixture。改成注入后，函数内部只负责 I/O（扫 items、查 git、数 Aceternity 组件），config/env 从外面进，测试完全离线。

`config === null` 时返回一份只含单项高优先级发现的报告："`content/config.ts` 无法解析，先跑 `pnpm type-check` 看错在哪"，`done: false`，tier 1。

## config 坏掉的处理（doctor 专属）

`doctor.ts` 用 `await import("@/content/config")` 包在 try/catch：成功就传 `siteConfig`，失败传 `null`。

**理由**：Studio 服务端启动时就 import config，config 坏 Studio 根本起不来，所以"config 坏了"这个发现只有 doctor 这条路径有意义。

## Studio 面板：GettingStarted

**形态**：可折叠面板，渲染在顶栏下方、表格上方（不遮挡、非弹窗）。两层分组显示。

**触发**：核心未全 done 时自动展开；核心全 done 后自动收起成一行"全部就绪 ✓"，但顶栏常驻一个按钮可随时点开回看。

**设计系统**：复用 `tokens.css` 的 `--bg`/`--surface`/`--border`/`--ink`/`--ink-soft`，与 Config Pane / Defaults Pane 同一套视觉语言，不引入新颜色字面量。

**每项一行**：状态图标（✓/○，配文字不只靠颜色）+ 标题 + 一句说明 + 右侧动作。动作按 `action.kind` 渲染成按钮、链接、`<code>` 命令或触发新建弹窗。

**必备状态**（frontend-ui-engineering 要求）：
- Loading：skeleton 行（复用现有 `.skeleton`）
- Error：`role="alert"` 错误态
- All-done：收起成一行，常驻按钮可回看

**无障碍**：动作用真正的 `<button>`/`<a>`，`aria-label` 齐全；状态图标配文字；折叠用 `<details>`；键盘可达。

**响应式**：40rem 以下动作按钮换行堆叠，与筛选栏同一断点。

## CLI：`pnpm doctor`

`scripts/doctor.ts`，注册 `"doctor": "tsx scripts/doctor.ts"`。打印分核心/进阶两段的清单，`✓`/`○` 配文字，每个 todo 下缩进给 `→ Run:` 或 `→ See:`，结尾指向 `pnpm studio`。

**退出码**：核心全 done → `0`；还有核心 todo → `1`。理由：它是就绪检查，非零可当脚本/CI gate；但它是给人看的引导工具，不参与构建。

## 错误处理

- `buildReadinessReport` 内 git 探测失败 → 该项 `done: false`（是"未就绪"，不是报错）
- readiness 路由：`buildReadinessReport` 意外抛出 → 500 带消息（config 坏的情况已被 `config: null` 优雅处理，不会走到这里）
- doctor 在 config 坏时打印"config 坏了"单项报告并以 `1` 退出

## 测试

`scripts/lib/siteReadiness.test.ts`：
- fixture 目录 + 字面量 config：fresh 站点 → 核心全 todo；配好的站点 → 核心全 done
- `config: null` → 返回"config 坏了"单项报告
- 图片存储 env：R2 缺一个 `CF_R2_*` → todo；齐了 → done；`local` → 永远 done
- 翻译：某启用 locale 缺 key → todo
- `allTier1Done` / `tier1Done` / `tier1Total` 计数正确

## 重构：抽取共享的 `REQUIRED_KEYS`

翻译检查要用 `check-config.ts` 的 `REQUIRED_KEYS`，但那份 const 是 check-config.ts 的私有，且该文件顶层有 `main()`，import 它会直接执行。因此把 `REQUIRED_KEYS` 抽到 `scripts/lib/i18nRequiredKeys.ts`，让 `check-config.ts` 和 `siteReadiness.ts` 都 import。这是对 check-config.ts 的一处小重构，行为不变。

## 兼容性

- 不新增配置字段，不改 `content/config.ts`、`lib/config/types.ts`
- readiness 只读，不写任何文件
- `check-config.ts` 重构后行为不变（有现有测试保障）
- 不影响构建：doctor 是独立命令，不进 `prebuild`

## 文档（双语同步，Iron Rule 2）

- `CURRENT_FUNCTIONALITY.md` / `_zh`：Studio 操作表加"首次上手引导"一行；操作计数递增；正文补一段
- `ARCHITECTURE.md` / `_zh`：`scripts/lib/` 模块表加 `siteReadiness.ts` 与 `i18nRequiredKeys.ts`；studio panes 列表加 `GettingStarted`
- `SCRIPTS.md` / `_zh`：脚本表加 `pnpm doctor`
- `IMPLEMENTATION_PLAN.md` / `_zh`：新增 Phase 24，完成后全 `[x]` 加 ✅
