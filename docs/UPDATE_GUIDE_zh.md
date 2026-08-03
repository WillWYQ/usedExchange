# UsedExchange — 更新站点代码到新版本

> ← [返回 README_zh.md](../README_zh.md) · 🇺🇸 English version: [UPDATE_GUIDE.md](UPDATE_GUIDE.md)

**版本：** 1.1  
**日期：** 2026-08-02

本指南说明如何将原始 UsedExchange 模板中的新功能、UI 改进和修复，更新到**你自己的站点副本**中——
同时不会丢失你的物品列表和照片。`content/config.ts` 中已有的配置值会原样保留；
更新脚本在 `content/` 内可能做的*唯一*改动是**追加**全新的可选字段（见下方"配置迁移"）。

---

## 为什么不能直接 `git pull`

原始仓库的 `release` 分支**每次发布新版本（`v1.0.0`、`v1.1.0` 等标签）时都会被重新生成并强制推送（force-push）**，
它不是一个只追加提交的历史记录。

这意味着：

- ❌ **不要使用 GitHub 的 "Sync fork" 按钮。** 由于上游 `release` 分支的历史记录每次都会被重写，
  GitHub 可能会提示"丢弃你的提交"来完成同步——这会删除你的物品列表和配置。
- ❌ **不要直接运行 `git merge upstream/release`**，原因相同——这可能产生大量与你实际改动无关的冲突。
- ✅ **应该**：将新版本作为标签（tag）拉取，然后**只选择性地复制应用代码文件**到你的仓库，
  保持 `content/`（以及你的图片清单文件）不受影响。

回顾铁律 #1：你只会编辑 `content/` 文件夹内的文件。其余所有文件都是模板代码，
因此用最新版本覆盖它们始终是安全的。

---

## 快速开始：`pnpm update-site`

下面的步骤已经由 `scripts/update-site.ts` 自动化。请在项目根目录运行
（脚本会检查 `content/config.ts` 是否存在，目录不对会直接中止）：

```bash
pnpm update-site --list   # 查看可用版本（首次运行会自动添加 upstream 远程仓库）
pnpm update-site          # 更新到最新的标签版本
pnpm update-site v1.2.0   # 更新到指定的标签版本
```

（`v1.2.0` 只是示例标签——请使用 `pnpm update-site --list` 输出的最新版本，
目前是 `v1.4.2`。）

随后脚本会按顺序执行：

1. 从上游模板仓库拉取标签（如果 `upstream` 远程仓库不存在会自动添加）；
   如果你指定的标签不存在，会中止并提示你先运行 `--list`。
2. 复制与下方"第 2 步"相同的文件列表（绝不包含 `content/`）。目标标签中
   不存在的条目（例如更新到早于 `studio/` 出现的旧标签时的 `studio/`）会被跳过，
   并输出一条警告。
3. 恢复你的 `lib/generated/image-manifest.json`（仅当该文件在本地存在时；
   恢复失败会降级为警告，需要你手动检查）。
4. 运行配置迁移（见下方"配置迁移"），将新的可选字段追加到你的
   `content/config.ts`。该步骤**始终执行**——`--skip-verify` 不会跳过它。
5. 除非传入 `--skip-verify`，否则先删除过期的 `.next/` 构建缓存，然后运行
   `pnpm install`、`pnpm type-check` 和 `pnpm build` 来验证结果。
6. 暂存所有改动（`git add -A`）并自行提交，提交信息为
   `chore: update site code to <tag>`——如果没有任何改动，
   则输出 "No changes to commit"。

在开始之前，如果你的工作区有未提交的改动，脚本会中止（`--list` 命令不做这项检查）。
它不会替你推送：执行完毕后会打印 `git push` 供你运行——这次推送同时也是
触发部署的动作（见下方"第 4 步"）。

本指南其余部分说明该脚本具体做了什么，方便你在需要手动执行某些步骤
或手动修复问题时参考。"第 4 步"中的提交命令仅在手动执行时才需要——
脚本会自动替你提交。

---

## 一次性设置：添加上游远程仓库

无论你的站点是通过 **fork** 还是 **"Use this template"** 创建的（后者默认不会与原始仓库建立关联），
此方法都适用。

```bash
git remote add upstream https://github.com/WillWYQ/usedExchange.git
git fetch upstream --tags
```

如果 `upstream` 已存在，只需运行 `fetch` 命令即可。

---

## 第 1 步 — 查看可用的新版本

```bash
git fetch upstream --tags
git tag -l | sort -V
```

选择最新的标签（例如 `v1.2.0`）。你可以在 GitHub 上查看该版本的更新内容：
`https://github.com/WillWYQ/usedExchange/releases`。

---

## 第 2 步 — 将更新后的应用代码复制到你的仓库

在项目根目录运行以下命令，将 `v1.2.0` 替换为你选择的标签：

```bash
git checkout v1.2.0 -- \
  .claude .github \
  .env.example .gitignore LICENSE \
  README.md README_zh.md SETUP_GUIDE.md SETUP_GUIDE_zh.md \
  app components components.json hooks lib public scripts studio docs \
  eslint.config.mjs next-env.d.ts next-sitemap.config.js next.config.ts \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  postcss.config.mjs prettier.config.js tsconfig.json vitest.config.ts
```

注意这里**特意排除了** `content/`（你的物品列表、配置、照片元数据）。
此命令不会触碰这个文件夹——运行脚本时，它在 `content/` 内可能做的*唯一*改动
是向 `content/config.ts` 追加新的可选字段（见下方"配置迁移"）。

这份文件列表由一个测试（`scripts/update-site.test.ts`）与脚本中的
`TEMPLATE_PATHS` 数组自动保持同步，因此手动命令与脚本不会悄悄产生差异。

### 恢复你的图片清单文件

上面的命令包含 `lib/`，其中也包含你专属的 `lib/generated/image-manifest.json`
（铁律 #5——该文件需要提交到 git，但它属于*你*，而不是模板）。
执行完上面的命令后，立即恢复你自己的版本：

```bash
git checkout HEAD -- lib/generated/image-manifest.json
```

---

## 配置迁移（自动运行）

在完成 checkout 并恢复图片清单之后，`pnpm update-site` 会运行与独立命令
`pnpm migrate-config`（`scripts/migrate-config.ts`）完全相同的逻辑。
新模板版本偶尔会引入*可选的*配置字段；迁移会把你的 `content/config.ts`
中缺失的字段追加进去，使用的默认值在 `scripts/lib/configDefaults.ts` 中声明
（目前是价格筛选策略 `priceFilterStrategy`，插入在 `itemCard:` 那一行之后；
以及 UI 字符串 `filterPriceBucketAll` / `filterPriceIncludesOutliers`，
插入在 `filterPrice:` 之后）。

- **只增不改。** 它绝不会覆盖、重排或删除你配置中已有的任何内容——
  已经存在的字段完全不会被触碰。
- 每个字段都插入在相关锚点行的正后方。如果你的配置中找不到该锚点，
  该字段会被跳过并输出一条警告，而不会让整个更新失败。
- 注入的字段在 TypeScript 中都是可选的（optional），并在读取处有 `??`
  运行时默认值（铁律 #8），因此即使迁移还没运行，站点也依然能正常构建。
- 你的物品列表、照片以及所有已有配置值都不会被改动。如果更新后你在
  `content/config.ts` 中看到意外的 diff，那就是这次迁移产生的——不要回退它。

`update-site` 没有 `--migrate-config` 开关：配置迁移始终运行。
你也可以随时单独运行它：

```bash
pnpm migrate-config
```

如果你是按手动步骤操作，请在恢复图片清单之后、验证构建之前运行这条命令。

---

## 第 3 步 — 重新安装依赖并验证

新版本有时会增加依赖或修改脚本：

```bash
pnpm install
pnpm type-check
pnpm build
```

如果 `pnpm build` 成功，说明你的站点可以用新代码正常构建。

脚本在运行以上命令之前会删除过期的 `.next/` 构建缓存；如果你手动执行
并遇到奇怪的缓存问题，可以先 `rm -rf .next`。（`--skip-verify` 会跳过
缓存清理和这三条命令——install、type-check 和 build——但绝不会跳过配置迁移。）

---

## 第 4 步 — 提交并推送

如果你运行的是 `pnpm update-site`，提交已经完成：脚本会自行暂存（`git add -A`）
并提交改动，提交信息为 `chore: update site code to <tag>`。你只需要：

```bash
git push
```

下面的命令仅在你手动执行第 1–3 步时才需要：

```bash
git add -A
git commit -m "chore: update site code to v1.2.0"
git push
```

无论哪种方式，都要推送到你的 **`release`** 分支——从本模板创建的站点使用的
工作分支就是它，部署工作流（`.github/workflows/deploy.yml`）会在推送到该分支时
发布上线（它也支持手动触发，或在模板发布工作流完成后自动运行）。之后 GitHub
Actions 会像更新物品列表一样自动构建并部署。

---

## 出现问题怎么办

在提交之前，你可以将任何文件恢复到更新前的版本：

```bash
git checkout HEAD -- <文件路径>
```

提交之后，你也可以随时撤销整个更新提交：

```bash
git revert HEAD
```

整个更新过程都不会涉及你的物品列表和照片。更新可能改动的 `content/` 文件只有
`content/config.ts`，而且只是追加新的可选字段——因此回退更新永远是安全的。
