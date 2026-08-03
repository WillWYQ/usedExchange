# UsedExchange — 卖家设置指南

**版本：** 1.4.2 · **更新于：** 2026-08-02

本指南说明如何在不编写任何代码的情况下管理你的列表站点。
这里的每一项任务都使用 Claude Code 内置的 AI 助手——只需用日常语言描述你想做什么即可。
大多数任务也可以在**卖家工作台（Seller Studio）**中完全不用命令完成——这是一个基于浏览器的操作界面，参见[第 8 节](#8-在浏览器中管理列表卖家工作台seller-studio)。

---

## 开始之前

你的电脑上需要安装两样东西：
- **Claude Code** —— AI 助手（前往 [claude.ai/code](https://claude.ai/code) 获取）
- **Node.js** 和 **pnpm** —— 用于运行站点命令（你的开发者可能已经帮你装好了）

在你的项目文件夹中打开 Claude Code。AI 会自动读取你的站点设置并知道该怎么做。

---

## 1. 添加新物品

**快速回答：是的，每个物品创建一个文件夹。AI 会生成其中的所有内容。**

### 步骤 1 —— 为物品创建文件夹

在 `content/items/` 内，为每件要出售的物品创建一个新文件夹。文件夹名称会成为 URL 的一部分，因此请保持简短、全小写并使用连字符。

示例：
```
content/items/electronics/iphone-14-pro/
content/items/houseware/ikea-lamp/
content/items/books/calculus-8th-edition/
```

### 步骤 2 —— 添加照片

将物品照片复制到该文件夹中。任何常见图片格式都可以（JPG/JPEG、PNG、WEBP 或 GIF）。命名要清晰——它们会按字母顺序显示在站点上：
- `01-front.jpg`
- `02-back.jpg`
- `03-detail.jpg`

### 步骤 3 ——（可选）写一份备注文件

在同一文件夹中创建一个 `notes.txt` 文件，随手记下你所知道的关于该物品的信息：

```
iPhone 14 Pro Max, 256GB, Deep Purple
Bought from Apple Store in May 2024, 14 months old
Condition: great, no cracks, minor scratches on the screen protector (replaced)
Comes with original cable (no charger brick), original box
Asking $750 local, $800 shipped
Willing to negotiate slightly
```

AI 会用这些备注来补全照片中看不到的细节（确切型号、你的要价等）。

### 步骤 4 —— 运行 AI 技能

在 Claude Code 中输入：

```
/update-items
```

AI 会查看你的照片和备注，然后向你展示它将要创建的列表预览。审阅它、做出任何修改并确认。AI 会为你写好 `item.json` 文件。

### 步骤 5 —— 审阅并发布

打开生成的 `item.json`。找到写着 `"status": "draft"` 的那一行，将其改为 `"status": "available"`。

### 步骤 6 —— 上传照片并部署

```
pnpm upload-images
```

然后运行 `pnpm push` —— 它会一步提交你的 `content/` 文件夹和图片清单并推送到 GitHub。站点会自动重新构建，物品随之上线。

---

## 2. 标记物品为已售

运行以下命令（替换为你的分类和物品文件夹名）：

```
pnpm mark-sold electronics/iphone-14-pro
```

这会将状态设为 `"sold"` 并记录当天日期。然后运行 `pnpm push` 发布该变更。该物品会在站点上显示 "SOLD" 标签若干天（由你的设置决定），之后自动消失。

---

## 3. 创建没有照片的列表

如果你想在照片还没准备好时先开始一个列表：

```
pnpm create-item electronics/iphone-14-pro
```

这会创建一个完整脚手架的 `item.json` —— 全部 36 个字段，状态已设为 `"draft"`，并填好当天日期、你站点的计量单位和默认价格档位。补全详细信息，之后再添加照片，准备好时将状态改为 `"available"`。

> **注意：** 分类文件夹（本例中为 `content/items/electronics/`）必须已存在。如果是全新分类，请先创建文件夹（见[步骤 1](#1-添加新物品)），再运行上面的命令。

你也可以为整个分类创建一个可复用的模板（前提相同——分类文件夹必须已存在）：

```
pnpm create-template electronics
```

之后每次添加新的 electronics 物品时复制该模板即可。

---

## 4. 修改价格

打开该物品的 `item.json` 文件，找到 `"price"` 部分：

```json
"price": {
  "tiers": [
    { "label": "Local pickup", "miles_max": 5, "amount": 750 },
    { "label": "Shipping", "miles_min": 5, "amount": 800 }
  ],
  "negotiable": false
}
```

将 `"amount"` 数字改为你的新价格并保存。然后运行 `pnpm push` —— 站点会自动更新。

如需将价格标记为从先前金额下调：
```json
"price_reduced": true,
"previous_lowest_price": 850
```

---

## 5. 上传新照片

在物品文件夹中添加或替换照片后：

```
pnpm upload-images
```

这会将你的照片与 CDN 上已有的内容进行比对，只上传新增或变更的部分。然后运行 `pnpm push`。

---

## 6. 将列表翻译为其他语言

如果你的站点配置了多种语言（在 `/setup` 期间设置），可以一次性为所有列表添加翻译：

在 Claude Code 中输入：

```
/translate-items
```

AI 会找出每一个缺少翻译的物品，向你展示拟议的翻译，并在写入任何内容之前请你确认。未经你的许可，已有翻译绝不会被打覆盖。

---

## 7. 更新站点设置

如需更改联系信息、位置、站点名称、外观或任何其他站点级设置：

在 Claude Code 中输入：

```
/setup
```

AI 会读取你当前的设置并询问你想更改什么。你不需要懂任何代码——只需用日常语言回答。

更新中新增的设置始终是可选项——在你选择配置之前，站点会使用内置默认值继续正常运行。

---

## 8. 在浏览器中管理列表——卖家工作台（Seller Studio）

如果你完全不想碰文件，卖家工作台是一个无需代码的网页界面，覆盖第 1–5 节的大部分内容：

```
pnpm studio
```

这会在你的浏览器中打开一个页面（位于 `http://127.0.0.1:5174`），**仅在你自己的电脑上运行**——绝不会发布到任何地方。通过它可以：

- 在表格中查看所有物品并更改其状态（available / pending / sold / draft），可单个或批量操作
- 通过表单创建新物品——无需编辑 JSON
- 通过表单编辑列表的任何字段；文件的注释和格式会被保留
- 拖拽上传照片、重新排序和删除照片
- 将照片同步到 CDN，带实时进度条
- 发布——一键提交并推送所有内容

卖家工作台只写入你的 `content/` 文件夹（外加自动生成的图片清单），其发布步骤也只提交 `content/` 和该清单——凭据和其他文件不可能被意外推送。你可以放心地将它与上述手动步骤混合使用；它们操作的是同一批文件。

---

## 9. 运费估算（可选）

你的站点可以在设置了重量和尺寸的物品页面上，向买家显示实时运费估算。此功能为**可选启用**，需要两样东西：

1. 一个免费的 Cloudflare 账户——费率由一个运行在那里的小型 "Worker" 程序查询
2. 一个来自运费费率服务商（Shippo 或 EasyPost）的 API 密钥

设置过程有向导引导——在 Claude Code 中输入：

```
/setup-shipping
```

你的服务商 API 密钥只存放在 Cloudflare Worker 中，绝不会出现在站点的公开文件里。如果跳过这一步，物品只是不会显示运费估算——其他一切不变。详见 [docs/CURRENT_FUNCTIONALITY_zh.md](docs/CURRENT_FUNCTIONALITY_zh.md) 的"运费估算"章节。

---

## 10. 导出到 Facebook Marketplace

如需将物品批量上架到 Facebook Marketplace，运行：

```
pnpm fb-export
```

该命令会引导你选择物品和价格（再次运行时，开头还会询问关于已导出物品的问题）：

1. **选择物品** —— 导出全部、单个分类，或按编号挑选特定物品（可以输入 `1,3,5` 或类似 `2-6` 的范围）
2. **选择价格** —— 所有档位中的最低价（推荐）或最高价；外加本地自提价（仅限有里程上限的档位）和邮寄价（仅限开放式档位），仅当你的物品确实包含这些档位类型时才会出现
3. **完成** —— 文件 `exports/facebook-marketplace.csv` 已就绪，可上传到 Facebook Marketplace 的批量上架工具

如果物品超过 50 个，文件会自动拆分为带编号的多个批次（Facebook 的单次上传上限）。导出还会将你的照片复制到 `exports/facebook-marketplace-photos/`，并在 CSV 的照片列中填入你的 CDN 照片链接（每件物品最多 10 个）。

**之后再次运行：** 第二次运行 `pnpm fb-export` 时，它会询问是否跳过已导出的物品。这样你只会添加新上架的物品，而不会重复创建。

CSV 不会提交到 git——它只保留在你的电脑上。

---

## 11. 需要备份什么

你唯一需要备份的文件夹是 **`content/`**。其他一切（站点代码、设计、构建脚本）都可以从 GitHub 仓库恢复。

在 `content/` 内，最重要的文件是：
- `content/config.ts` —— 你的站点设置
- `content/items/` —— 你的所有列表和照片

**建议：** 在上传到 CDN 之前，先将物品照片备份到别处（Google Photos、iCloud、移动硬盘）。CDN 很可靠，但保留原件是好习惯。

---

## 12. 出问题时向谁求助

如果 AI 生成了不正确的输出、站点构建失败或有任何不对劲：

1. 运行 `pnpm type-check`（可选运行 `pnpm lint`）——它会告诉你是否有文件出错并指出所在行。
2. 检查你最近的编辑是否仅限于 `content/` 文件夹内。
3. 如果你手动修改了 `.json` 文件，验证 JSON 是否有效（没有缺失的逗号、没有未闭合的括号）。拿不准时，使用卖家工作台（[第 8 节](#8-在浏览器中管理列表卖家工作台seller-studio)）而不是手工编辑——它会在保存前校验每个字段。
4. 如果构建失败并提示与站点 URL 或缺少翻译相关的信息，打开 `content/config.ts`：当你的站点地址仍是占位符，或某种语言只有部分翻译时，构建会刻意停止。`/setup` 技能可以修复这两种情况。
5. 如果构建在 GitHub 上失败，查看你 GitHub 仓库的 Actions 标签页中的错误信息。

如需 Claude Code 本身的帮助，请访问 [claude.ai](https://claude.ai) 或在 [Claude Code GitHub 页面](https://github.com/anthropics/claude-code/issues)提交 issue。
