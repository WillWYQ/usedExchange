# UsedExchange

> 🇺🇸 English version: [README.md](README.md)

一个静态生成的个人二手物品销售平台。无需数据库，无需 CMS——所有内容都存放在一个文件夹中。

---

## 第一次使用？从这里开始

**→ [完整使用指南](SETUP_GUIDE.md)** — 无需编程基础的全程说明。

上线前需要完成两个一次性步骤：

1. **开启 GitHub Pages** — 在 GitHub 仓库页面进入 **Settings → Pages → Source → 选择 "GitHub Actions"**。不做这一步，代码推送后会构建但不会发布。
2. **配置图片存储** — 参照 [CDN 配置指南](docs/setup_instruction_zh.md) 设置照片托管服务（GitHub Pages 推荐使用 Cloudflare R2）。

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
git add content/ lib/generated/image-manifest.json && git push
# → GitHub Actions 自动构建并部署
```

```bash
# 标记物品为已售
pnpm mark-sold electronics/iphone-14
git add content/ && git push
```

## AI 辅助上架（可选）

在项目目录中打开 Claude Code（或任何兼容的 AI 工具）：

- `/setup` — 引导式向导，从零开始生成 `content/config.ts`
- `/update-items` — 读取照片并为每件新物品生成 `item.json`

无需 API 密钥。使用你现有的 AI 工具订阅即可。

## 文档

| 文档 | 用途 |
|---|---|
| [ARCHITECTURE_zh.md](docs/ARCHITECTURE_zh.md) | 代码结构、数据流、模块 API、CI/CD 流水线——开发者参考 |
| [DESIGN_zh.md](docs/DESIGN_zh.md) | 完整架构、数据模型、组件规范、所有设计决策 |
| [TECH_REQUIREMENTS_zh.md](docs/TECH_REQUIREMENTS_zh.md) | 依赖项、环境变量、脚本规范、部署清单 |
| [IMPLEMENTATION_PLAN_zh.md](docs/IMPLEMENTATION_PLAN_zh.md) | 16 阶段构建计划（第 0–15 阶段，约 24 个开发日） |
| [CURRENT_FUNCTIONALITY_zh.md](docs/CURRENT_FUNCTIONALITY_zh.md) | v1 全部功能的简明汇总 |
| [FEATURES_ROADMAP_zh.md](docs/FEATURES_ROADMAP_zh.md) | v1 之后的功能待办列表 |
| [setup_instruction_zh.md](docs/setup_instruction_zh.md) | CDN 配置说明（Cloudflare R2、Vercel Blob、本地） |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | 非技术用户指南（仅涉及 content/ 操作） |

## 技术栈

Next.js 15 · TypeScript 5 · Tailwind CSS v4 · Aceternity UI · Zod · fuse.js · GitHub Pages · Cloudflare R2

## 许可证

参见 [LICENSE](LICENSE)。
