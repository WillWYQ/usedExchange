# UsedExchange

> 🇺🇸 English version: [README.md](README.md)

一个静态生成的个人二手物品销售平台。无需数据库，无需 CMS——所有内容都存放在一个文件夹中。

**当前版本：** 1.4.2（更新于 2026-08-02）

---

## 第一次使用？从这里开始

**→ [完整使用指南](SETUP_GUIDE_zh.md)** — 无需编程基础的全程说明。

上线前需要完成两个一次性步骤：

1. **开启 GitHub Pages** — 在 GitHub 仓库页面进入 **Settings → Pages → Source → 选择 "GitHub Actions"**。不做这一步，代码推送后会构建但不会发布。
2. **配置图片存储** — 参照 [CDN 配置指南](docs/setup_instruction_zh.md) 设置照片托管服务（GitHub Pages 推荐使用 Cloudflare R2）。

> **提示：** 部署工作流（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）只会从 **`release`** 分支部署（按照 [UPDATE_GUIDE_zh.md](docs/UPDATE_GUIDE_zh.md) 操作后会得到这个分支）。请在 `release` 分支上进行卖家相关操作——推送到其他分支虽然会触发 CI 构建，但不会发布上线。

---

## 工作原理

将照片和 `item.json` 文件放入 `content/items/<分类>/<物品名称>/`，运行一条命令，推送到 git。GitHub Actions 会自动构建并发布页面。

```
content/              ← 你唯一需要操作的文件夹
├── config.ts         ← 站点名称、联系方式、定价默认值
├── items/
│   └── electronics/
│       └── iphone-14/
│           ├── item.json   ← 名称、价格档位、成色、描述
│           └── cover.jpg
└── contact/
    └── wechat-qr.png
```

## 主要功能

- **按距离分级定价** —— 根据买家所在位置自动显示对应价格（自动定位，无需手动输入）
- **Seller Studio（卖家工作台）** —— 在浏览器中管理列表：运行 `pnpm studio` 打开仅限本机的图形界面，可创建/编辑物品、拖拽管理照片、同步 CDN 并发布——无需写代码
- **Facebook Marketplace 导出** —— `pnpm fb-export` 交互式引导生成批量上架 CSV
- **运费估算（可选）** —— 通过独立的 Cloudflare Worker 代理，在物品页面实时显示承运商运费
- **多语言支持** —— 界面文字与商品内容可在运行时切换语言
- **全文搜索** —— 基于 fuse.js 的即时客户端搜索

## 快速开始

```bash
pnpm install
pnpm setup-ui          # 安装 Aceternity UI 组件（仅需一次）
pnpm dev               # 本地预览——照片从 public/items/ 提供
```

## 卖家工作流（日常操作）

```bash
# 添加新物品
pnpm new electronics/iphone-14   # 创建文件夹 + item.json 模板
# 手动将照片放入 content/items/electronics/iphone-14/
pnpm upload-images               # 上传照片到 CDN，更新清单
pnpm push                        # 提交 content/ 与图片清单并推送
# → GitHub Actions 自动构建并部署
```

```bash
# 标记物品为已售
pnpm mark-sold electronics/iphone-14
pnpm push
```

```bash
# 在浏览器中管理列表——无需代码，仅限本机
pnpm studio                      # 编辑物品、拖拽管理照片、同步 CDN、发布
```

```bash
# 导出至 Facebook Marketplace（交互式）
pnpm fb-export
# → 引导选择物品、价格档位，生成 exports/facebook-marketplace.csv
# → 再次运行时可选择跳过已导出物品（导出历史自动保存在本地）
```

所有 `pnpm` 命令的完整说明——参数、环境变量、作用——见 [docs/SCRIPTS_zh.md](docs/SCRIPTS_zh.md)。

## AI 辅助上架（可选）

在项目目录中打开 Claude Code（或任何兼容的 AI 工具）：

- `/setup` — 引导式向导，从零开始生成 `content/config.ts`
- `/update-items` — 读取照片并为每件新物品生成 `item.json`
- `/translate-items` — 将所有列表翻译为另一种语言
- `/setup-shipping` — 启用并配置可选的运费估算功能

无需 API 密钥。使用你现有的 AI 工具订阅即可。

## 文档

| 文档 | 用途 |
|---|---|
| [ARCHITECTURE_zh.md](docs/ARCHITECTURE_zh.md) | 代码结构、数据流、模块 API、CI/CD 流水线——开发者参考 |
| [DESIGN_zh.md](docs/DESIGN_zh.md) | 完整架构、数据模型、组件规范、所有设计决策 |
| [TECH_REQUIREMENTS_zh.md](docs/TECH_REQUIREMENTS_zh.md) | 依赖项、环境变量、脚本规范、部署清单 |
| [SCRIPTS_zh.md](docs/SCRIPTS_zh.md) | 所有 `pnpm` 脚本与 CLI——参数、环境变量、作用 |
| [IMPLEMENTATION_PLAN_zh.md](docs/IMPLEMENTATION_PLAN_zh.md) | 19 阶段构建计划（第 0–18 阶段，约 26 个开发日） |
| [CURRENT_FUNCTIONALITY_zh.md](docs/CURRENT_FUNCTIONALITY_zh.md) | v1 全部功能的简明汇总 |
| [FEATURES_ROADMAP_zh.md](docs/FEATURES_ROADMAP_zh.md) | v1 之后的功能待办列表 |
| [setup_instruction_zh.md](docs/setup_instruction_zh.md) | CDN 配置说明（Cloudflare R2、Vercel Blob、本地） |
| [UPDATE_GUIDE_zh.md](docs/UPDATE_GUIDE_zh.md) | 如何将站点更新到模板新版本 |
| [SETUP_GUIDE_zh.md](SETUP_GUIDE_zh.md) | 非技术用户指南（仅涉及 content/ 操作） |

## 技术栈

Next.js 15 · TypeScript 5 · Tailwind CSS v4 · Aceternity UI · Zod · fuse.js · GitHub Pages · Cloudflare R2

## 许可证

参见 [LICENSE](LICENSE)。
