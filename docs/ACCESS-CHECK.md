# 国内可访问性核查

用 [Globalping](https://globalping.io) 的中国大陆探针发起 HTTPS GET 请求，统计 2xx/3xx 响应。探针分布在中国移动、联通、电信和阿里云/腾讯云网络。脚本：`tests/china-probe.mjs`。

测量时间：2026-10-29 18:09 UTC（北京时间 2026-10-30 凌晨）

| 项目 | 地址 | 成功 | 中位耗时 | 分运营商 |
|---|---|---|---|---|
| 首页 | https://rowland786.github.io/kyukosha/ | 20/20 | 675 ms | 云/其他 8/8，联通 4/4，电信 4/4，移动 4/4 |
| 举报教程 | https://rowland786.github.io/kyukosha/guide/ | 19/20 | 522 ms | 云/其他 8/8，电信 2/2，联通 6/7，移动 3/3 |
| 图鉴数据 | https://rowland786.github.io/kyukosha/data/archive.json | 19/20 | 567 ms | 云/其他 8/8，联通 5/6，电信 2/2，移动 4/4 |
| 原图（GIF） | https://rowland786.github.io/kyukosha/mirror/images/通用/终结技/002_Stomp.gif | 20/20 | 603 ms | 云/其他 8/8，联通 5/5，电信 2/2，移动 5/5 |
| 收件接口 | https://kyukosha-desk.netlify.app/api/health | 19/20 | 1063 ms | 云/其他 8/8，电信 3/3，联通 6/6，移动 2/3 |

失败的几次分散在不同探针上（单个联通、单个移动节点超时或被重置），同一探针测其他地址时正常，判断为个别线路波动。

## 选型时的对照测试（同日）

- `*.supabase.co`：联通、电信、阿里云可达；**中国移动 5 个探针全部被重置（ECONNRESET）**，不适合作为后台。
- `*.workers.dev`、`*.vercel.app`：国内 DNS 返回被污染的地址，不可用。
- `*.netlify.app`：16/16 可达，包括 6 个中国移动探针，解析到新加坡节点。
- `*.github.io`：15/16 可达，中国移动全部可达。

这些结论只代表测量当时的情况，运营商策略会变。建议每隔一段时间重跑 `node tests/china-probe.mjs`。
