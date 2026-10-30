# 旧校舍 KYŪKŌSHA

学乱 Gakuran 中文玩家的举报协助窗口和服饰图鉴镜像。非官方玩家站，与 Gakuran 开发组、Roblox 无关。

- 网站：https://rowland786.github.io/kyukosha/
- 收件后台：https://kyukosha-desk.netlify.app （只有接口，没有页面）

## 网站做什么

| 页面 | 路径 | 用途 |
|---|---|---|
| 首页 | `/` | 入口 |
| 举报教程 | `/guide/` | 中文举报流程，附核查记录 |
| 提交举报 | `/report/` | 只要两样：对方的 Roblox ID、一段有效视频（不收 OBS 录屏）；对话式三步，拿到案件编号和查询码 |
| 查询进度 | `/track/` | 凭编号和查询码看进度、补材料 |
| 服饰图鉴 | `/archive/` | Kaglorn 图鉴的完整镜像和中文查阅界面 |
| 关于本站 | `/about/` | 分工、隐私、镜像完整性核对、署名 |
| 审核台 | `/desk/` | 协助者口令登录，核对、翻译、记录代投和官方回复 |
| 原版页面 | `/mirror/` | Kaglorn 原站页面，原样镜像 |

## 目录

```
index.html, guide/ report/ track/ archive/ about/ desk/   各页面
src/partials/      顶栏和页脚片段（构建时嵌入）
src/js/            页面脚本；api.js 是收件后台的客户端
src/styles/        样式
public/mirror/     Kaglorn/gakuran-clothes 的全部公开文件，原样保存，含 manifest.json
public/guide/      教程配图（来自官方 Trello，已注明出处）
scripts/mirror/    sync.mjs 同步上游；verify.mjs 核对；build.mjs 生成缩略图与 archive.json
server/            收件后台（Netlify Functions + Netlify Blobs）
tests/             api-e2e.mjs 后台端到端测试；shot.mjs 截图
docs/OPERATIONS.md 站长和协助者的操作说明
```

## 本地开发

```bash
npm ci
node scripts/mirror/build.mjs      # 生成 public/thumbs 和 public/data/archive.json
npx vite                            # http://localhost:5178/kyukosha/
```

前端默认连接 `https://kyukosha-desk.netlify.app`。本地联调后台时用 `VITE_API_BASE=http://localhost:8899 npx vite`，后台用 `netlify dev`（见 `server/`）。

## 发布

- 前端：推送到 `main` 后，`.github/workflows/pages.yml` 会核对镜像、生成缩略图、构建，并打包三份整包图片，发布到 GitHub Pages。
- 后台：在 `server/` 目录运行 `netlify deploy --prod --dir public --functions functions`。需要的环境变量在 Netlify 后台设置，**不进仓库**：
  - `DESK_PASSWORD_HASH`：审核台口令的 scrypt 摘要，格式 `scrypt$盐$摘要`
  - `SESSION_SECRET`：会话签名密钥
  - `ALLOWED_ORIGINS`：允许调用接口的网页来源，逗号分隔
  - `DISCORD_WEBHOOK_URL`（可选）：新案件提醒，只发编号和类别，不含个人信息

## 图鉴镜像

`scripts/mirror/sync.mjs` 按上游仓库的文件树下载每个文件，用 git blob SHA-1 逐个比对，并把线上页面内嵌的数据和 `clothes.json` 逐条比对，任何不符都会中止。`.github/workflows/mirror-sync.yml` 每周一检查一次上游更新。

原始数据、图片和中文整理归 **Kaglorn** 所有（[Kaglorn/gakuran-clothes](https://github.com/Kaglorn/gakuran-clothes)），素材出自官方 [(学乱) Gakuran Trello](https://trello.com/b/v3WatB1P/)。上游未声明许可证，本站镜像仅为方便国内查阅；作者如有异议请联系，会立即处理。

## 隐私

举报材料、证据文件和联系方式只存在收件后台的私有存储里，只能凭查询码（玩家）或审核台口令（协助者）读取。**请不要在本仓库或 Issues 里贴任何举报材料、用户名或联系方式。**

## 许可

本站自己的代码以 MIT 许可发布。`public/mirror/` 下的内容不适用此许可，权利归原作者。字体 Noto Serif SC、Archivo、IBM Plex Mono 以 SIL OFL 授权。
