# UsedExchange — 安装配置说明

> ← [返回 README_zh.md](../README_zh.md) · 🇺🇸 English version: [setup_instruction.md](setup_instruction.md)

**第 4 阶段：图像管道**

本文档说明如何在完成第 4 阶段后配置图像存储提供商并使用图像同步管道。

---

## 概述

物品照片**不提交到 git**。照片在本地机器上一次性上传到 CDN，通过一个已提交的清单文件（`lib/generated/image-manifest.json`）引用。构建时读取该清单文件——CI 环境不需要任何 CDN 凭证。

在 `content/config.ts` 中选择三个存储提供商之一：

| 提供商 | 适合场景 | 配置工作量 |
|---|---|---|
| `"cloudflare-r2"` **（推荐）** | GitHub Pages 或任意静态托管——零出口流量费用 | 5 个环境变量，一次性 |
| `"vercel-blob"` | Vercel 部署 | 1 个环境变量，一次性 |
| `"local"` | 本地开发 / 自托管（无需 CDN） | 无需配置 |

---

## 方案 A — Cloudflare R2（推荐）

### 第 1 步 — 创建 R2 存储桶

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)
2. 进入 **R2 Object Storage**（左侧导航：**Build → Storage & databases → R2 Object Storage**）
3. 点击 **Create bucket**
4. 输入存储桶名称（例如 `usedexchange-images`），选择靠近买家的区域
5. 点击 **Create bucket**

### 第 2 步 — 启用公共访问

在存储桶设置中启用公共访问：

- **方案 A（自定义域名）：** 你的存储桶 → **Settings** → **Custom Domains** → 添加你的域名（如 `images.your-domain.com`），并在 DNS 中添加 CNAME 指向 R2 提供的主机名。
- **方案 B（r2.dev URL）：** 你的存储桶 → **Settings** → **Public access** → 启用 `r2.dev` 子域名，复制显示的 URL（如 `https://pub-xxxxxxxx.r2.dev`）。

### 第 3 步 — 配置 CORS

你的存储桶 → **Settings** → **CORS Policy** → 添加：

```json
[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

将 `https://your-domain.com` 替换为你的实际站点 URL。

### 第 4 步 — 找到 Account ID 并创建 API Token

三个值都在同一个页面：

**R2 Object Storage → Overview → 滚动到底部 → "Account Details" 面板**

| 字段 | 操作 |
|---|---|
| **Account ID** | 复制此值 → `CF_R2_ACCOUNT_ID` |
| **API Tokens**（Manage 链接） | 点击进入 Token 管理页面 |
| **S3 API** | S3 兼容端点——适配器内部使用，无需操作 |

在 Token 管理页面，点击 **Create API token**：
- **Token 类型：** User API Tokens（*适合个人访问和开发用途*）
- **Permissions：** Object Read & Write
- **Specify bucket：** 仅选择你的存储桶（最小权限原则）
- 点击 **Create API Token**
- 复制 **Access Key ID** 和 **Secret Access Key**——Secret 关闭页面后不再显示

> **哪些值可以共享，哪些必须保密**
>
> | 值 | 可以共享？ |
> |---|---|
> | Account ID | ✅ 可以——不是机密；Cloudflare 会公开显示 |
> | Access Key ID | ✅ 可以——用于标识 Token，单独无法操作任何内容 |
> | **Secret Access Key** | ❌ 绝不——像密码一样保管；不要粘贴到聊天或邮件中 |
>
> 使用 AI 助手配置 R2 时，可以放心分享 Account ID 和 Access Key ID。Secret Access Key 请始终由你自己直接粘贴到 `.env.local` 文件中。

### 第 5 步 — 配置 `.env.local`

将项目根目录的 `.env.example` 复制为 `.env.local`，填写以下内容：

```bash
CF_R2_ACCOUNT_ID=你的_cloudflare_账户_id
CF_R2_ACCESS_KEY_ID=你的_r2_access_key_id
CF_R2_SECRET_ACCESS_KEY=你的_r2_secret_key
CF_R2_BUCKET=usedexchange-images
CF_R2_PUBLIC_URL=https://images.your-domain.com
# 或者: CF_R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

> ⚠️ 永远不要把 `.env.local` 提交到 git。该文件已被 gitignore。

### 第 6 步 — 在 `content/config.ts` 中设置提供商

```ts
imageStorage: {
  provider: "cloudflare-r2",
},
```

---

## 方案 B — Vercel Blob

### 第 1 步 — 安装 SDK

```bash
pnpm add -D @vercel/blob
```

### 第 2 步 — 创建 Blob 存储

Vercel 控制台 → **Storage** → **Create** → **Blob** → 按提示操作

### 第 3 步 — 获取 Token

Storage → 你的 Blob 存储 → **Settings** → 复制 **BLOB_READ_WRITE_TOKEN**

### 第 4 步 — 配置 `.env.local`

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### 第 5 步 — 设置提供商

```ts
imageStorage: {
  provider: "vercel-blob",
},
```

---

## 方案 C — Local（无 CDN）

无需任何配置。构建时将图片复制到 `public/items/`。适合自托管服务器或纯本地开发场景（部署整个 `out/` 文件夹）。

```ts
imageStorage: {
  provider: "local",
},
```

> ⚠️ 不要在 GitHub Pages 或 Vercel 上使用 `local` 提供商——物品照片已被 gitignore，CI 运行器上不存在这些文件。

---

## 日常使用流程

### 新增或更新照片

```bash
# 1. 将照片放入 content/items/<分类>/<商品名>/
# 2. 上传到 CDN（仅在本机运行）：
pnpm upload-images

# 3. 暂存、提交并推送，一步完成：
pnpm push
```

### 本地开发

```bash
pnpm dev
```

`pnpm dev` 会自动先运行 `scripts/sync-images.ts --mode dev-sync`，将 `content/items/` 中的照片复制到 `public/items/`——本地开发时不需要 CDN 凭证。

### 生产构建

```bash
pnpm build
```

`prebuild` 步骤调用 `scripts/sync-images.ts --mode build-check`。在 CI（GitHub Actions）上，照片文件不存在（已被 gitignore），但会使用已提交的清单文件解析所有图片 URL。CI 不需要 CDN 凭证。

---

## Git 提交清单

| 文件 | 提交？ | 说明 |
|---|---|---|
| `content/**/*.json` | **是** | 物品元数据——纯文本，体积小 |
| `content/config.ts` | **是** | 站点配置 |
| `content/contact/*.png` | **是** | 二维码图片——体积小，很少变动 |
| `content/items/**/*.jpg/png/…` | **否** | Gitignore——在卖家本机和 CDN 上 |
| `lib/generated/image-manifest.json` | **是** | CDN URL 映射表——CI 构建需要此文件 |
| `.image-cache/checksums.json` | **否** | Gitignore——本地增量上传缓存 |
| `public/items/` | **否** | Gitignore——开发/构建时自动生成 |
| `public/contact/` | **否** | Gitignore——从 `content/contact/` 复制而来 |

---

## 备份提醒

> ⚠️ **照片不在 git 中，云存储不是备份。**
>
> 每次成功运行 `pnpm upload-images` 后，脚本都会打印备份提醒。请确保将 `content/` 文件夹（尤其是照片）备份到外置硬盘或云存储服务（iCloud、Google Drive、Dropbox）。

---

## 照片质量建议

上传脚本打印以下建议警告（不会阻断上传）：

| 警告 | 原因 | 建议处理 |
|---|---|---|
| 图片超过 8 MB | 文件过大 | 上传前将图片缩小至最大宽度 2000px |
| 未找到 `cover.*` | 物品文件夹没有封面图片 | 将主缩略图命名为 `cover.jpg` |
| 未找到任何图片 | 物品文件夹没有照片 | 上架前至少添加一张照片 |
| 图片宽度不足 800px（需要 `sharp`） | 照片分辨率过低 | 使用更高质量的照片 |

如需启用宽度检查，安装 `sharp`：
```bash
pnpm add -D sharp
```

---

## 常见问题排查

| 错误 | 原因 | 解决方法 |
|---|---|---|
| `Missing CF_R2_*` | 环境变量未设置 | 对照 Cloudflare 控制台检查 `.env.local` 的值 |
| `Missing BLOB_READ_WRITE_TOKEN` | Token 未设置 | 在 Vercel 控制台 → Storage → Blob 重新生成 |
| 部署后图片显示破损 | 清单文件未提交 | 运行 `pnpm upload-images` 并提交 `lib/generated/image-manifest.json` |
| `@vercel/blob is not installed` | SDK 缺失 | 运行 `pnpm add -D @vercel/blob` |
