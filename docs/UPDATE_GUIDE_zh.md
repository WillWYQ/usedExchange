# UsedExchange — 更新站点代码到新版本

> ← [返回 README_zh.md](../README_zh.md) · 🇺🇸 English version: [UPDATE_GUIDE.md](UPDATE_GUIDE.md)

本指南说明如何将原始 UsedExchange 模板中的新功能、UI 改进和修复，更新到**你自己的站点副本**中——
同时不会丢失你的物品列表、照片和 `content/config.ts`。

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
  README.md README_zh.md SETUP_GUIDE.md \
  app components components.json hooks lib public scripts docs \
  eslint.config.mjs next-env.d.ts next-sitemap.config.js next.config.ts \
  package.json pnpm-lock.yaml pnpm-workspace.yaml \
  postcss.config.mjs prettier.config.js tsconfig.json vitest.config.ts
```

注意这里**特意排除了** `content/`（你的物品列表、配置、照片元数据）。
此命令不会触碰这个文件夹。

### 恢复你的图片清单文件

上面的命令包含 `lib/`，其中也包含你专属的 `lib/generated/image-manifest.json`
（铁律 #5——该文件需要提交到 git，但它属于*你*，而不是模板）。
执行完上面的命令后，立即恢复你自己的版本：

```bash
git checkout HEAD -- lib/generated/image-manifest.json
```

---

## 第 3 步 — 重新安装依赖并验证

新版本有时会增加依赖或修改脚本：

```bash
pnpm install
pnpm type-check
pnpm build
```

如果 `pnpm build` 成功，说明你的站点可以用新代码正常构建。

---

## 第 4 步 — 提交并推送

```bash
git add -A
git commit -m "chore: update site code to v1.2.0"
git push
```

GitHub Actions 会像更新物品列表一样自动构建并部署。

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

整个更新过程都不会涉及 `content/` 文件夹，因此无论如何，你的物品列表和配置都是安全的。
