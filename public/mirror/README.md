# 学乱 Gakuran · 服饰数据

从 Trello 看板 **「(学乱) Gakuran Trello」** 的 `Cosmetics`（装扮）列表抓取整理，
**一件衣服 / 一个装扮 = 一张图**，可按 **性别 / 部位 / 稀有度 / 种族** 四个维度查看。

- 看板地址：https://trello.com/b/v3WatB1P/
- 抓取时间：2026-10-21
- 总条目：**1097** 件（原始 1411 条，去重后）

## 目录结构

```
学乱服饰数据/
├─ index.html     本地图鉴：双击用浏览器打开，可切换「部位 / 稀有度 / 种族」三种视角
├─ clothes.csv    索引表（UTF-8 BOM，Excel / WPS 可直接打开）
├─ clothes.json   结构化数据（字段同 CSV）
├─ images/        单件图
│   ├─ 男性/  制服 面部 头部饰品 颈部 手臂 腰部
│   │         发型/{Japanese, European, African, Indian, MiddleEastern, Latino}
│   ├─ 女性/  制服 面部 头部饰品 颈部 手臂 腰部
│   │         发型/{Japanese, European, African, Indian, MiddleEastern, Latina}
│   └─ 通用/  滑板 背部 终结技
└─ 合集原图/      看板里的原始目录大图（138 张，备查）
```

## 两个分类视角

### 按稀有度

看板正文只给 **制服 / 滑板 / 终结技** 标注了稀有度，共 97 件有值：

| 稀有度 | 数量 |
|---|---|
| Unique | 33 |
| ???（0.1%） | 22 |
| Epic | 14 |
| Common | 14 |
| Legendary（1%） | 11 |
| Rare | 2 |
| Uncommon | 1 |
| 未标注 | 1000 |

### 按种族（仅发型）

种族来自每张发型目录页的标题（`Male Hairstyles - Japanese - 25 hairstyles`），共 629 件有值：

| 种族 | 男性 | 女性 | 合计 |
|---|---|---|---|
| 日系 Japanese | 232 | 75 | 307 |
| 非洲 African | 63 | 23 | 86 |
| 欧美 European | 36 | 47 | 83 |
| 印度 Indian | 28 | 33 | 61 |
| 中东 MiddleEastern | 14 | 25 | 39 |
| 拉美 Latino（男） | 31 | — | 31 |
| 拉美 Latina（女） | — | 22 | 22 |
| 未标注 | — | — | 2 |

## 数量分布（按部位）

| 性别 | 部位 | 数量 |
|---|---|---|
| 男性 | 发型 | 406 |
| 男性 | 面部 | 51 |
| 男性 | 头部饰品 | 40 |
| 男性 | 颈部 | 36 |
| 男性 | 制服 | 27 |
| 男性 | 手臂 | 26 |
| 男性 | 腰部 | 9 |
| 女性 | 发型 | 225 |
| 女性 | 头部饰品 | 64 |
| 女性 | 制服 | 34 |
| 女性 | 颈部 | 25 |
| 女性 | 手臂 | 25 |
| 女性 | 面部 | 21 |
| 女性 | 腰部 | 3 |
| 通用 | 滑板 | 92 |
| 通用 | 背部 | 8 |
| 通用 | 终结技 | 5 |

## 字段说明

| 字段 | 说明 |
|---|---|
| 序号 | 全局序号 |
| 性别 | 男性 / 女性 / 通用 |
| 部位 | 制服、发型、面部、头部饰品、颈部、手臂、腰部、背部、滑板、终结技 |
| 种族 | Japanese / European / African / Indian / MiddleEastern / Latino / Latina；仅发型有 |
| 稀有度 | 归一后的值：Common / Rare / Uncommon / Epic / Legendary / Unique / ??? |
| 稀有度(原始) | 看板原文，如 `Legendary (1%)`、`??? (0.1%)` |
| 名称 | 看板正文有文字标注的才填，见下方说明 |
| 资产ID | Roblox 资产 ID（合集图切分的条目才有，见下方说明） |
| 图片来源 | `合集图`（从目录大图切分） / `实机截图`（游戏内截图） |
| 合集图 | 该图来自哪张目录大图 |
| 所属卡片 | 看板里对应的卡片名 |
| 图片文件 | 相对路径 |
| Trello卡片 | 原卡片链接 |

## 重要说明

1. **名称与资产 ID 印在图片上。** 看板里大部分装扮（发型、配饰等）是以"目录页"形式发布的：
   一张大图里排着几十个小卡，每张小卡上写着名称和 Roblox 资产 ID，但看板正文并没有对应文本。
   本数据集已把这类目录页按网格自动切成一格一件（切出来的图里名称、ID、稀有度都在），
   但 **CSV 的名称/ID 字段留空**——那是图片内的文字，不是看板文本，无法在不做 OCR 的前提下批量提取。
   已有文字标注的 92 件（主要是制服、滑板、终结技）名称已填好。

2. **种族是怎么来的。** 每张发型目录页顶部都有标题（如 `Male Hairstyles - Japanese - 25 hairstyles`），
   把 86 张目录页的标题条拼成图逐张识别后，把种族写到了该页切出的每一件上。
   非发型类目没有种族信息。

3. **去重。** 看板里有大量重复/改版的目录页，按内容 MD5 + 感知哈希（dHash）去重，1411 → 1097。

4. **合集原图。** `合集原图/` 保留原始目录页，方便核对名称；`_旧命名/` 是早期命名版本的重复文件，可忽略或删除。

5. 图片为 PNG（少数终结技动作为 GIF），未做二次压缩。

## 部署到 GitHub Pages

本目录已经初始化成 git 仓库（`main` 分支），并已暂存全部文件，`合集原图/` 通过 `.gitignore` 排除（网页用不到，省一半体积）。

```bash
# 1. 设置提交身份（只需一次）
git config user.name  "你的名字"
git config user.email "你的GitHub邮箱"

# 2. 提交
git commit -m "学乱 Gakuran 服饰图鉴：1097 件"

# 3. 关联远程仓库（先在 GitHub 建一个空仓库，不要勾选 README）
git remote add origin https://github.com/你的用户名/仓库名.git

# 4. 推送
git push -u origin main
```

推送完成后，在仓库页面进入 **Settings → Pages**：

- Source 选 `Deploy from a branch`
- Branch 选 `main`，目录选 `/ (root)`
- 保存，等 1～2 分钟

访问地址：`https://你的用户名.github.io/仓库名/`

> 仓库里已放 `.nojekyll`，防止 GitHub Pages 的 Jekyll 处理跳过 `_` 开头的目录。

## 重新生成

`gakuran_clothes/` 目录下是处理脚本（纯标准库，无需第三方依赖）：

| 脚本 | 作用 |
|---|---|
| `parse.py` | 解析看板 JSON，提取正文中的名称↔图片对应 |
| `download.py` | 下载全部附件（415 个，去重 383） |
| `classify.py` | 判定每张图是单件截图还是目录页，并切格 |
| `make_titles.py` / `make_ethnicity.py` | 拼接目录页标题条、标注种族 |
| `export.py` | 去重、归档、输出 images/ + CSV + JSON |
| `make_html.py` | 生成 index.html 图鉴 |
| `pngio.py` / `detect.py` / `phash.py` | PNG 读写、卡片网格检测、感知哈希 |
