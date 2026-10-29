# 旧校舍操作说明

写给站长和协助核对材料的人。玩家看的说明在网站的“举报教程”和“关于本站”里。

## 一、日常处理一个举报案件

1. 打开 https://rowland786.github.io/kyukosha/desk/ ，输入审核台口令。口令只保存在站长本机的 `.secrets/desk.env` 里，不在仓库、不在网页源码。
2. 左侧“新收件”里是还没看过的案件，红点表示有新内容（新提交或玩家补充）。
3. 点开案件，按顺序做：
   - **开始核对**：玩家会看到状态变成“核对中”。
   - **账号核对**：每个被举报人旁边写着 Roblox 是否查得到，点“主页”核对一下头像、加入时间是否像同一个人。
   - **看证据**：外链直接打开；传到本站的文件点“载入预览”，会在浏览器里拼成完整视频播放，也可以下载原文件。
   - **核对清单**：逐项勾选后点“保存清单”。
4. 缺东西时，在“处理 → 请玩家补充”里写清楚缺什么、怎么补，玩家在查询页原样看到。玩家补交后案件自动回到“核对中”，左侧出现红点。
5. 材料齐了，在“提交内容”里写好三栏：
   - **Username**：被举报人的 Roblox 用户名，默认填了 Roblox 查到的那个。
   - **Reason**（≤250 字符）：英文，写清楚行为、持续时间、地点，最好带上 PLAYERLIST 出现的时间点。
   - **Evidence**（≤1000 字符）：视频链接 + 时间点 + 关键中文聊天的英文翻译（注明原文在视频第几秒）。
   - 有中文聊天的，在“聊天原文 / 英文对照”里逐条写译文，原文始终保留。
   点“保存草稿”，再在“处理”里点“标记待代投”。

## 二、在 Discord 里代投

只在真正提交以后，才在审核台记录“已代投”。

1. 视频还没放到官方接受的平台时，先处理视频：
   - 推荐：在 #reports 点 **Report Player** → 选 **I need to upload evidence** 或点 **Report via website**，在 Blox.report 网站（用 Discord 登录）直接上传视频并提交。
   - 或者：上传到 YouTube（不公开链接）、Medal、Streamable 等官方列出的平台，把链接填进 Evidence。
   - 不要把本站的链接当作主要证据。
2. 打开 Discord → **(学乱) Gakuran Support** → 左侧 [Reports] 下的 **#reports**。
3. 点 Blox.report 面板下的红色 **Report Player**。
4. 机器人问是否已上传证据，下拉选 **I've already uploaded evidence**，弹出 **Player Report** 表单。
5. 从审核台点“复制三栏”，分别粘贴进 Username / Reason / Evidence，检查一遍，点 **提交**。
6. 截图或抄下提交后看到的确认信息（机器人的仅自己可见消息），回到审核台，“处理 → 记录已代投”：填实际提交时间（北京时间）、方式、使用的账号、确认信息，再写一句给玩家看的说明。
7. 一个案件里有几个被举报人，就重复 3–5 步，每次一个用户名；在“给玩家看的说明”里写明分别举报了几个人。

注意：
- 如果提示 **no longer taking reports**，是队列满了，第二天再试，不要在审核台记录“已代投”。
- 如果提示 **The provided username does not exist**，说明用户名有误，回到第一步核对。
- 如果提示对方已被封，就在审核台“结束案件”，原因写“对方已被官方封禁，无需再报”。
- Blox.report 对同一提交人每天的举报数量有上限，具体数字未公开。遇到上限就留到第二天。

## 三、官方回复

- Blox.report 批准举报时会私信提交人（站长账号）。收到后在审核台“记录官方回复”：选“已批准”，贴原文，写一句给玩家看的说明。
- 举报 7 天内没有员工处理会被自动驳回。可以重新提交一次（重复第二部分），在内部备注里记下是第几次提交。
- 被驳回且附有理由的，选“驳回”，把理由用中文写进给玩家的说明。没有理由但证据确实有效的，可以在 Support 服务器 #support 开一般工单询问。
- 没收到任何回复，就让案件停在“已代投”，不要猜测结果。

## 四、申诉案件

游戏封禁和 Discord 封禁申诉只能本人提交。协助者只做两件事：核对材料，在“申诉英文”里写好各栏（游戏申诉每栏 ≤250 字符），然后“标记整理完成”。玩家的查询页会出现提交步骤和可复制的英文。不要用站长账号替别人申诉。

## 五、删除与保密

- 玩家要求删除时，在案件底部点“删除案件和全部文件”，输入案件编号确认。
- 结案（官方已回复或已结束）满 180 天的案件，由每日清理任务自动删除。
- 不要把任何材料截图发到公开群、GitHub 或 Issues。

## 六、维护

- **改审核台口令**：本机运行下面的脚本生成新的摘要，再在 Netlify 后台把 `DESK_PASSWORD_HASH` 换掉，重新部署一次后台。
  ```bash
  node -e "const c=require('crypto');const pw=process.argv[1];const s=c.randomBytes(16);console.log('scrypt$'+s.toString('base64')+'$'+c.scryptSync(pw,s,32,{N:16384,r:8,p:1}).toString('base64'))" "新口令"
  ```
- **新案件提醒**：在自己管理的 Discord 服务器里建一个 Webhook，把地址设为 Netlify 环境变量 `DISCORD_WEBHOOK_URL`，重新部署后台。提醒只包含案件编号和类别。
- **部署后台**：在 `server/` 目录运行 `netlify deploy --prod --dir public --functions functions`（Netlify CLI 需先 `netlify login`，站点已通过 `netlify link` 关联）。`netlify.toml` 里的 `command = "echo no build step"` 不要删，否则 CLI 会把仓库根目录当成前端项目来询问构建命令。
- **后台测试**：`API=https://kyukosha-desk.netlify.app DESK_PASSWORD=口令 node tests/api-e2e.mjs`，会创建一个测试案件走完全流程并在最后删除。
- **规则变化**：官方的举报面板、Trello 或员工口径变了，更新 `guide/index.html` 正文和末尾的核查记录，以及首页的核查日期。
- **国内可访问性**：Netlify 的 `*.netlify.app` 在 2026-10-30 的多地测试中三大运营商均可访问；`*.supabase.co` 在中国移动被重置，`*.workers.dev`、`*.vercel.app` 在国内 DNS 被污染，换后台时不要选这几个域名。
