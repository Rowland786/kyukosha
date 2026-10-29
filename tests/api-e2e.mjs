// 收件后端端到端测试：从提交到官方回复走完整一遍，最后删除测试案件。
// 用法：API=https://xxx.netlify.app DESK_PASSWORD=... node tests/api-e2e.mjs
import { randomBytes, createHash } from 'node:crypto';

const API = process.env.API || 'http://localhost:8899';
const PW = process.env.DESK_PASSWORD;
const ORIGIN = process.env.ORIGIN || 'https://rowland786.github.io';
let pass = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { failN++; console.log('  ✗ ' + msg); } };
const j = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const r = await fetch(API + path, { method, headers: { origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => null);
  return { status: r.status, d, cors: r.headers.get('access-control-allow-origin') };
};

console.log('API =', API);
const h = await j('/api/health');
ok(h.d?.ok && h.d.configured, `health 正常且已配置口令（configured=${h.d?.configured}）`);
ok(h.cors === ORIGIN, `CORS 允许 ${ORIGIN}`);
const bad = await fetch(API + '/api/health', { headers: { origin: 'https://evil.example' } });
ok(!bad.headers.get('access-control-allow-origin'), '其他来源不给 CORS');

// 上传一个跨多个分片的“视频”
const size = 7 * 1024 * 1024 + 12345;
const data = randomBytes(size);
const up = await j('/api/uploads', { method: 'POST', body: { name: 'e2e-test.mp4', size, type: 'video/mp4' } });
ok(up.d?.id && up.d.chunks === 3, `建立上传会话，分 ${up.d?.chunks} 片`);
for (let n = 0; n < up.d.chunks; n++) {
  const part = data.subarray(n * up.d.chunkSize, Math.min(size, (n + 1) * up.d.chunkSize));
  const r = await fetch(`${API}/api/uploads/${up.d.id}/${n}`, { method: 'PUT', headers: { origin: ORIGIN, 'x-upload-token': up.d.token, 'content-type': 'application/octet-stream' }, body: part });
  ok(r.ok, `分片 ${n + 1} 上传 ${r.status}`);
}
const wrongTok = await fetch(`${API}/api/uploads/${up.d.id}/0`, { method: 'PUT', headers: { 'x-upload-token': 'nope' }, body: data.subarray(0, 10) });
ok(wrongTok.status === 403, '错误的上传凭证被拒绝');
const fin = await j(`/api/uploads/${up.d.id}/complete`, { method: 'POST', headers: { 'x-upload-token': up.d.token } });
ok(fin.d?.ok, '上传完成确认');

const bad1 = await j('/api/cases', { method: 'POST', body: { type: 'report', consent: true, reporter: { nickname: '测试' }, targets: [{ username: 'builderman' }], incident: { date: '2026-10-29', narrative: '' } } });
ok(bad1.status === 400, `缺少经过时拒收：${bad1.d?.error}`);

const created = await j('/api/cases', {
  method: 'POST', body: {
    type: 'report', consent: true, hp: '',
    reporter: { nickname: 'E2E 测试', contactType: 'qq', contact: '10000', relation: 'victim', canDiscord: 'no' },
    targets: [{ username: 'builderman', characterName: 'Test Name' }],
    incident: { date: '2026-10-29', time: '20:15', tz: 'Asia/Shanghai', server: 'public', location: 'Gym 体育馆', category: 'infinite_holding', duration: '约 4 分钟', narrative: '【自动化测试】对方在体育馆把我连续击倒四分钟，不让起身。' },
    chat: [{ speaker: 'builderman', time: '20:16', text: '测试聊天原文' }],
    evidence: { links: [{ url: 'https://www.bilibili.com/video/BV1xx411c7mD', note: '测试链接' }], uploads: [{ id: up.d.id, token: up.d.token }], playerlist: 'yes', playerlistAt: '01:32' },
    extra: '这是端到端测试案件，测试结束会删除。',
  },
});
ok(created.d?.id && created.d?.key, `创建案件 ${created.d?.id}`);
ok(created.d?.targets?.[0]?.found && created.d.targets[0].id === 156, '服务端核对 Roblox 用户名');
const { id, key } = created.d;

const v1 = await j('/api/cases/view', { method: 'POST', body: { id, key } });
ok(v1.d?.case?.status === 'received', '玩家查询：已收件');
ok(!('reporter' in v1.d.case) && !('notes' in v1.d.case), '玩家视图不含联系方式和内部备注');
const vBad = await j('/api/cases/view', { method: 'POST', body: { id, key: 'AAAA-BBBB-CCCC-DDDD' } });
ok(vBad.status === 404, '错误查询码被拒绝');

const lBad = await j('/api/desk/login', { method: 'POST', body: { password: 'wrong' } });
ok(lBad.status === 401, '错误口令无法登录审核台');
const noAuth = await j('/api/desk/cases');
ok(noAuth.status === 401, '未登录不能看案件列表');
const login = await j('/api/desk/login', { method: 'POST', body: { password: PW } });
ok(login.d?.token, '审核台登录');
const T = login.d.token;
const list = await j('/api/desk/cases', { token: T });
ok(list.d?.cases?.some((c) => c.id === id), '案件出现在审核台列表');
const full = await j('/api/desk/case?id=' + id, { token: T });
ok(full.d?.case?.reporter?.contact === '10000', '审核台能看到联系方式');

const step = async (body, label) => { const r = await j('/api/desk/update', { method: 'POST', token: T, body: { id, ...body } }); ok(r.d?.ok, label + (r.d?.error ? '：' + r.d.error : '')); return r; };
await step({ action: 'claim' }, '开始核对');
await step({ action: 'note', text: '内部备注：测试' }, '内部备注');
const early = await j('/api/desk/update', { method: 'POST', token: T, body: { id, action: 'submitted', at: '2026-10-29 21:00', method: 'x' } });
ok(early.status === 400, '未标记待代投前不能记录“已代投”');
await step({ action: 'request', message: '请补一段能看到对方用户名的录像。' }, '请玩家补充');
const v2 = await j('/api/cases/view', { method: 'POST', body: { id, key } });
ok(v2.d.case.status === 'needs_info' && v2.d.case.request?.message.includes('补一段'), '玩家看到待补充和留言');
ok(!JSON.stringify(v2.d.case).includes('内部备注'), '内部备注不外泄');
const rep = await j('/api/cases/reply', { method: 'POST', body: { id, key, text: '补充：第二段录像 00:45 打开了 PLAYERLIST。', links: [{ url: 'https://streamable.com/e2etest', note: '第二段' }] } });
ok(rep.d?.case?.status === 'reviewing', '玩家补充后回到核对中');
await step({ action: 'draft', username: 'builderman', reason: 'Infinite holding for ~4 min at the Gym: knocked the reporter down repeatedly and would not let them get up. Playerlist shown at 01:32.', evidence: 'https://streamable.com/e2etest (01:32 playerlist; 00:10–04:10 holding)', narrativeEn: 'Test', chatEn: ['test chat'] }, '写好提交草稿');
await step({ action: 'ready' }, '标记待代投');
await step({ action: 'submitted', at: '2026-10-29 21:30（北京时间）', method: 'Discord · Gakuran Support #reports · Blox.report 表单', account: '站长账号', confirmation: '测试：未真正提交', publicNote: '测试记录' }, '记录已代投');
await step({ action: 'result', outcome: 'approved', at: '2026-10-30 10:00', raw: '测试：模拟回复文本', publicText: '测试结果' }, '记录官方回复');
const v3 = await j('/api/cases/view', { method: 'POST', body: { id, key } });
ok(v3.d.case.status === 'result' && v3.d.case.result?.outcome === 'approved', '玩家看到官方结果');
ok(!JSON.stringify(v3.d.case).includes('模拟回复文本'), '官方回复原文只在审核台');
ok(v3.d.case.events.length >= 6, `玩家可见时间线 ${v3.d.case.events.length} 条`);

// 下载证据并校验
let got = Buffer.alloc(0);
for (let n = 0; n < 3; n++) {
  const r = await fetch(`${API}/api/desk/file?id=${up.d.id}&n=${n}`, { headers: { authorization: 'Bearer ' + T, origin: ORIGIN } });
  got = Buffer.concat([got, Buffer.from(await r.arrayBuffer())]);
}
ok(createHash('sha256').update(got).digest('hex') === createHash('sha256').update(data).digest('hex'), '审核台取回的证据文件与上传一致');
const fNo = await fetch(`${API}/api/desk/file?id=${up.d.id}&n=0`);
ok(fNo.status === 401, '未登录不能下载证据');

const del = await j('/api/desk/delete', { method: 'POST', token: T, body: { id } });
ok(del.d?.ok, '删除测试案件');
const v4 = await j('/api/cases/view', { method: 'POST', body: { id, key } });
ok(v4.status === 404, '删除后无法再查询');

console.log(`\n通过 ${pass} 项，失败 ${failN} 项`);
process.exit(failN ? 1 : 0);
