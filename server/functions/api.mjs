// 旧校舍举报收件后端（Netlify Functions + Netlify Blobs）
// 玩家：提交案件、分片上传证据、凭编号和查询码看进度、补材料。
// 协助者：口令登录后查看全部案件、核对、请玩家补充、记录代投和官方回复。
import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const config = { path: '/api/*' };

const CHUNK = 3 * 1024 * 1024;            // 每片 3MB，base64 后仍在函数 6MB 上限内
const MAX_FILE = 200 * 1024 * 1024;       // 单个文件上限
const MAX_CASE_FILES = 12;
const FILE_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|flv|wmv|3gp|ts|png|jpe?g|gif|webp|heic|heif|bmp)$/i;

const STATUS = ['received', 'reviewing', 'needs_info', 'ready', 'submitted', 'result', 'closed'];
const CATEGORIES = {
  exploiting: 'Exploiting', bug_abuse: 'Bug Abuse', infinite_holding: 'Infinite Holding', permanent_trapping: 'Permanent Trapping Players',
  prolonged_carrying: 'Prolonged Carrying of Other Players', void_throwing: 'Throwing individuals into the void', extreme_harassment: 'Extreme Harassment',
  explicit_drawings: 'Explicit Drawings', exploiter_affiliation: 'Exploiter Affiliation', sexual_ws: 'Intentionally sexual behaviour (W+S etc.)', other: 'Other / not sure',
};
const TYPES = ['report', 'game_appeal', 'discord_appeal'];

const env = (k, d = '') => (typeof Netlify !== 'undefined' ? Netlify.env.get(k) : process.env[k]) ?? d;
const store = (name) => getStore({ name, consistency: 'strong' });
const now = () => new Date().toISOString();
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ---------- 通用 ----------
function cors(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = env('ALLOWED_ORIGINS', 'https://rowland786.github.io').split(',').map((s) => s.trim());
  const h = {
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-upload-token',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  if (allowed.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const json = (req, body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(req), ...extra } });
const fail = (req, status, msg, code) => json(req, { ok: false, error: msg, code }, status);

class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const need = (cond, msg) => { if (!cond) throw new Bad(msg); };
const str = (v, max, { req = false, name = '字段' } = {}) => {
  const s = typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : '';
  if (req) need(s.length > 0, `${name}不能为空`);
  need(s.length <= max, `${name}太长了（最多 ${max} 字）`);
  return s;
};
const clientIp = (req, ctx) => ctx?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || '0';
const ipKey = (req, ctx) => sha(clientIp(req, ctx) + env('SESSION_SECRET', 'dev')).slice(0, 24);

async function rateLimit(req, ctx, bucket, limit, windowSec) {
  const win = Math.floor(Date.now() / 1000 / windowSec);
  const key = `${bucket}/${ipKey(req, ctx)}/${win}`;
  const s = store('rl');
  const n = Number((await s.get(key)) || 0) + 1;
  await s.set(key, String(n));
  if (n > limit) throw new Bad('操作太频繁，请稍后再试', 429);
}

// ---------- 编号与口令 ----------
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const randCode = (n) => [...randomBytes(n)].map((b) => ALPHA[b % 32]).join('');
const newCaseId = () => {
  const d = new Date(Date.now() + 8 * 3600e3); // 北京时间日期
  return `GK${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${randCode(5)}`;
};
const newKey = () => randCode(16).match(/.{4}/g).join('-');
const keyHash = (key) => sha(String(key).toUpperCase().replace(/[^0-9A-Z]/g, '') + env('SESSION_SECRET', 'dev'));
const normId = (id) => String(id || '').toUpperCase().replace(/\s+/g, '').slice(0, 20);

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', env('SESSION_SECRET')).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token) {
  if (!token || !env('SESSION_SECRET')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', env('SESSION_SECRET')).update(body).digest('base64url');
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
function checkPassword(pw) {
  const rec = env('DESK_PASSWORD_HASH'); // scrypt$saltB64$hashB64
  if (!rec || !pw) return false;
  const [kind, salt, hash] = rec.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(String(pw), Buffer.from(salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const exp = Buffer.from(hash, 'base64');
  return got.length === exp.length && timingSafeEqual(got, exp);
}
function requireDesk(req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const s = verifySession(t);
  if (!s) throw new Bad('需要重新登录审核台', 401);
  return s;
}

// ---------- Roblox 用户名核对 ----------
async function robloxLookup(usernames) {
  const list = [...new Set(usernames.map((u) => String(u || '').trim().replace(/^@/, '')).filter(Boolean))].slice(0, 10);
  if (!list.length) return [];
  const r = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: list, excludeBannedUsers: false }),
  });
  if (!r.ok) throw new Bad('Roblox 用户名查询暂时不可用，请稍后再试', 502);
  const data = (await r.json()).data || [];
  return list.map((u) => {
    const hit = data.find((d) => d.requestedUsername?.toLowerCase() === u.toLowerCase());
    return hit ? { requested: u, found: true, id: hit.id, name: hit.name, displayName: hit.displayName, verified: !!hit.hasVerifiedBadge } : { requested: u, found: false };
  });
}

// ---------- 案件读写 ----------
const getCase = async (id) => store('cases').get(`case/${normId(id)}`, { type: 'json' });
async function putCase(c) {
  c.updatedAt = now();
  await store('cases').setJSON(`case/${c.id}`, c);
  const idx = (await store('meta').get('index', { type: 'json' })) || [];
  const row = {
    id: c.id, type: c.type, status: c.status, outcome: c.result?.outcome || '', createdAt: c.createdAt, updatedAt: c.updatedAt,
    target: c.targets?.map((t) => t.name || t.requested).join(', ') || '', category: c.incident?.category || '', nickname: c.reporter?.nickname || '',
    unread: !!c.unread,
  };
  const i = idx.findIndex((x) => x.id === c.id);
  if (i >= 0) idx[i] = row; else idx.unshift(row);
  await store('meta').setJSON('index', idx);
}
async function dropFromIndex(id) {
  const idx = (await store('meta').get('index', { type: 'json' })) || [];
  await store('meta').setJSON('index', idx.filter((x) => x.id !== id));
}
const event = (c, actor, type, text = '', visible = true, data) => {
  c.events.push({ at: now(), actor, type, text, visible, ...(data ? { data } : {}) });
};

// 玩家能看到的部分：不含联系方式之外的内部备注、草稿和协助者核对清单
function playerView(c) {
  return {
    id: c.id, type: c.type, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt,
    targets: c.targets, incident: c.incident, chat: c.chat, extra: c.extra,
    evidence: { links: c.evidence.links, files: c.evidence.files.map(({ id, name, size, type }) => ({ id, name, size, type })), playerlist: c.evidence.playerlist },
    request: c.status === 'needs_info' ? c.request : null,
    submission: c.submission ? { at: c.submission.at, method: c.submission.method, note: c.submission.publicNote || '' } : null,
    result: c.result ? { at: c.result.at, outcome: c.result.outcome, text: c.result.publicText || '' } : null,
    closed: c.status === 'closed' ? { reason: c.closeReason || '' } : null,
    // 申诉要本人提交，协助者写好的英文各栏在“待提交”后交给玩家
    appealPack: c.type !== 'report' && ['ready', 'closed'].includes(c.status) ? c.draft?.appealFields || null : null,
    events: c.events.filter((e) => e.visible).map(({ at, actor, type, text }) => ({ at, actor, type, text })),
  };
}

// ---------- 上传 ----------
async function uploadCreate(req, body, desk) {
  const name = str(body.name, 200, { req: true, name: '文件名' }).replace(/[\\/]/g, '_');
  const size = Number(body.size);
  need(Number.isFinite(size) && size > 0 && size <= MAX_FILE, `单个文件最大 ${MAX_FILE / 1048576}MB`);
  need(FILE_EXT.test(name), '只收视频和图片文件');
  const id = randCode(14), token = randCode(24);
  const meta = { id, name, size, type: str(body.type, 100) || 'application/octet-stream', chunks: Math.ceil(size / CHUNK), received: [], tokenHash: sha(token), createdAt: now(), complete: false, bound: null, desk: !!desk };
  await store('meta').setJSON(`up/${id}`, meta);
  return { id, token, chunkSize: CHUNK, chunks: meta.chunks };
}
async function uploadAuth(id, token) {
  const meta = await store('meta').get(`up/${id}`, { type: 'json' });
  if (!meta || meta.tokenHash !== sha(String(token || ''))) throw new Bad('上传凭证无效', 403);
  return meta;
}
async function uploadChunk(req, id, n, token) {
  const meta = await uploadAuth(id, token);
  need(!meta.complete, '这个文件已经传完了');
  need(Number.isInteger(n) && n >= 0 && n < meta.chunks, '分片编号不对');
  const buf = new Uint8Array(await req.arrayBuffer());
  const expect = n === meta.chunks - 1 ? meta.size - CHUNK * (meta.chunks - 1) : CHUNK;
  need(buf.byteLength === expect, `分片大小不对（应为 ${expect}，收到 ${buf.byteLength}）`);
  await store('files').set(`${id}/${n}`, buf);
  return { ok: true, n };
}
async function uploadComplete(id, token) {
  const meta = await uploadAuth(id, token);
  const listed = await store('files').list({ prefix: `${id}/` });
  const have = new Set(listed.blobs.map((b) => Number(b.key.split('/')[1])));
  const missing = [];
  for (let i = 0; i < meta.chunks; i++) if (!have.has(i)) missing.push(i);
  if (missing.length) return { ok: false, missing };
  meta.complete = true;
  await store('meta').setJSON(`up/${id}`, meta);
  return { ok: true, id, size: meta.size, name: meta.name };
}
async function bindUploads(list, caseId) {
  const out = [];
  for (const u of (list || []).slice(0, MAX_CASE_FILES)) {
    const meta = await uploadAuth(String(u.id || ''), u.token);
    need(meta.complete, `文件 ${meta.name} 还没传完`);
    need(!meta.bound || meta.bound === caseId, `文件 ${meta.name} 已经用在别的案件里了`);
    meta.bound = caseId;
    await store('meta').setJSON(`up/${meta.id}`, meta);
    out.push({ id: meta.id, name: meta.name, size: meta.size, type: meta.type, chunks: meta.chunks, at: now() });
  }
  return out;
}

// ---------- 玩家提交 ----------
function readLinks(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 12).map((l) => ({ url: str(l.url, 600), note: str(l.note, 200), host: '' }))
    .filter((l) => l.url).map((l) => {
      need(/^https?:\/\//i.test(l.url), '证据链接要以 http:// 或 https:// 开头');
      try { l.host = new URL(l.url).hostname.replace(/^www\./, ''); } catch { throw new Bad('有一条证据链接格式不对'); }
      return l;
    });
}
function readChat(arr) {
  return (Array.isArray(arr) ? arr : []).slice(0, 80).map((m) => ({ speaker: str(m.speaker, 60), time: str(m.time, 40), text: str(m.text, 600, { name: '聊天内容' }) })).filter((m) => m.text);
}

async function createCase(req, ctx, b) {
  need(!b.hp, '提交失败');
  need(b.consent === true, '需要先勾选确认');
  const type = TYPES.includes(b.type) ? b.type : 'report';
  const reporter = {
    nickname: str(b.reporter?.nickname, 40, { req: true, name: '称呼' }),
    contactType: str(b.reporter?.contactType, 20),
    contact: str(b.reporter?.contact, 120),
    roblox: str(b.reporter?.roblox, 40),
    relation: str(b.reporter?.relation, 20),
    canDiscord: str(b.reporter?.canDiscord, 20),
    appealAccount: str(b.reporter?.appealAccount, 60),
  };
  const rawTargets = (Array.isArray(b.targets) ? b.targets : []).slice(0, 5).map((t) => ({ requested: str(t.username, 40).replace(/^@/, ''), characterName: str(t.characterName, 60), displayName: str(t.displayName, 60) })).filter((t) => t.requested);
  if (type === 'report') need(rawTargets.length > 0, '至少填一个被举报人的 Roblox 用户名');
  const looked = rawTargets.length ? await robloxLookup(rawTargets.map((t) => t.requested)) : [];
  const targets = rawTargets.map((t) => {
    const hit = looked.find((x) => x.requested.toLowerCase() === t.requested.toLowerCase()) || {};
    return { ...t, found: !!hit.found, id: hit.id || null, name: hit.name || '', displayNameApi: hit.displayName || '' };
  });
  const cat = Object.hasOwn(CATEGORIES, b.incident?.category) ? b.incident.category : 'other';
  const incident = {
    date: str(b.incident?.date, 20, { req: true, name: '日期' }),
    time: str(b.incident?.time, 20),
    tz: str(b.incident?.tz, 40) || 'Asia/Shanghai',
    server: str(b.incident?.server, 40),
    location: str(b.incident?.location, 80),
    category: cat,
    categoryEn: CATEGORIES[cat],
    duration: str(b.incident?.duration, 40),
    narrative: str(b.incident?.narrative, 5000, { req: true, name: '事情经过' }),
  };
  const evidence = {
    links: readLinks(b.evidence?.links),
    files: [],
    playerlist: str(b.evidence?.playerlist, 20),
    playerlistAt: str(b.evidence?.playerlistAt, 40),
    clipStart: str(b.evidence?.clipStart, 40),
    clipEnd: str(b.evidence?.clipEnd, 40),
    note: str(b.evidence?.note, 1000),
  };
  if (type === 'report') need(evidence.links.length > 0 || (b.evidence?.uploads || []).length > 0, '举报需要视频：上传文件或者贴一个链接');
  const id = newCaseId();
  evidence.files = await bindUploads(b.evidence?.uploads, id);
  const key = newKey();
  const c = {
    v: 1, id, type, status: 'received', createdAt: now(), updatedAt: now(), keyHash: keyHash(key),
    reporter, targets, incident, chat: readChat(b.chat), extra: str(b.extra, 2000), evidence,
    checklist: {}, notes: [], draft: null, request: null, submission: null, result: null, events: [], unread: true,
    meta: { ua: str(req.headers.get('user-agent'), 300), ipKey: ipKey(req, ctx) },
  };
  event(c, 'player', 'created', '材料已收到');
  await putCase(c);
  notify(`新案件 ${id}（${type === 'report' ? '举报' : '申诉协助'}${type === 'report' ? ' · ' + CATEGORIES[cat] : ''}）`);
  return { ok: true, id, key, targets };
}

async function loadForPlayer(b) {
  const c = await getCase(b.id);
  if (!c || c.keyHash !== keyHash(b.key)) throw new Bad('案件编号或查询码不对', 404);
  return c;
}
async function playerReply(b) {
  const c = await loadForPlayer(b);
  need(!['closed'].includes(c.status), '这个案件已经结束，如需继续请重新提交');
  const text = str(b.text, 3000);
  const links = readLinks(b.links);
  const files = await bindUploads(b.uploads, c.id);
  const chat = readChat(b.chat);
  need(text || links.length || files.length || chat.length, '补充内容是空的');
  c.supplements = c.supplements || [];
  c.supplements.push({ at: now(), text, links, files: files.map((f) => f.id), chat });
  c.evidence.links.push(...links);
  c.evidence.files.push(...files);
  c.chat.push(...chat);
  if (c.status === 'needs_info') c.status = 'reviewing';
  c.unread = true;
  event(c, 'player', 'supplement', `玩家补充了材料${files.length ? `（${files.length} 个文件）` : ''}${links.length ? `（${links.length} 个链接）` : ''}`);
  await putCase(c);
  notify(`案件 ${c.id} 收到补充材料`);
  return { ok: true, case: playerView(c) };
}

// ---------- 审核台 ----------
async function deskUpdate(b) {
  const c = await getCase(b.id);
  if (!c) throw new Bad('没有这个案件', 404);
  const a = b.action;
  const t = (v, max = 3000) => str(v, max);
  switch (a) {
    case 'read': c.unread = false; break;
    case 'claim':
      need(['received', 'needs_info'].includes(c.status) || c.status === 'reviewing', '当前状态不能开始核对');
      if (c.status !== 'reviewing') { c.status = 'reviewing'; event(c, 'desk', 'reviewing', '协助者开始核对材料'); }
      break;
    case 'note': c.notes.push({ at: now(), text: t(b.text, 4000) }); break;
    case 'checklist': c.checklist = Object.fromEntries(Object.entries(b.items || {}).slice(0, 30).map(([k, v]) => [str(k, 40), !!v])); break;
    case 'request': {
      const msg = t(b.message, 2000);
      need(msg, '请写清楚要玩家补什么');
      c.request = { at: now(), message: msg };
      c.status = 'needs_info';
      event(c, 'desk', 'needs_info', msg);
      break;
    }
    case 'message': { const msg = t(b.message, 2000); need(msg, '留言是空的'); event(c, 'desk', 'message', msg); break; }
    case 'draft':
      c.draft = {
        at: now(), username: t(b.username, 40), reason: t(b.reason, 250), evidence: t(b.evidence, 1000),
        narrativeEn: t(b.narrativeEn, 5000), chatEn: (Array.isArray(b.chatEn) ? b.chatEn : []).slice(0, 80).map((x) => t(x, 800)),
        appealFields: b.appealFields ? Object.fromEntries(Object.entries(b.appealFields).slice(0, 6).map(([k, v]) => [str(k, 40), t(v, 1000)])) : null,
      };
      break;
    case 'ready':
      need(c.draft && (c.type !== 'report' || (c.draft.username && c.draft.reason && c.draft.evidence)), '先把要提交的三栏内容写好再标记');
      c.status = 'ready';
      event(c, 'desk', 'ready', c.type === 'report' ? '材料核对完毕，等待在 Discord 提交' : '材料已整理好，请按查询页里的说明本人提交');
      break;
    case 'submitted': {
      need(c.type === 'report', '申诉只能由本人提交');
      need(c.status === 'ready' || c.status === 'submitted', '先标记“待代投”再记录提交');
      const at = t(b.at, 40); need(at, '填写实际提交时间');
      const method = t(b.method, 80); need(method, '填写提交方式');
      c.submission = { at, method, account: t(b.account, 80), confirmation: t(b.confirmation, 2000), publicNote: t(b.publicNote, 500), proof: (b.proof || []).slice(0, 4), recordedAt: now() };
      c.status = 'submitted';
      event(c, 'desk', 'submitted', `已通过 ${method} 提交${c.submission.publicNote ? '：' + c.submission.publicNote : ''}`);
      break;
    }
    case 'result': {
      need(c.status === 'submitted' || c.status === 'result', '还没记录提交，不能记录官方回复');
      const outcome = ['approved', 'dismissed', 'other'].includes(b.outcome) ? b.outcome : 'other';
      const at = t(b.at, 40); need(at, '填写收到回复的时间');
      const raw = t(b.raw, 3000); need(raw, '贴上官方回复原文');
      c.result = { at, outcome, raw, publicText: t(b.publicText, 1000), proof: (b.proof || []).slice(0, 4), recordedAt: now() };
      c.status = 'result';
      const label = { approved: '官方已批准（Blox.report 私信通知已处理）', dismissed: '官方驳回或超时未处理', other: '收到官方回复' }[outcome];
      event(c, 'desk', 'result', label + (c.result.publicText ? '：' + c.result.publicText : ''));
      break;
    }
    case 'close': {
      const reason = t(b.reason, 1000); need(reason, '写一句结束原因，玩家会看到');
      c.closeReason = reason; c.status = 'closed';
      event(c, 'desk', 'closed', reason);
      break;
    }
    case 'reopen': c.status = 'reviewing'; event(c, 'desk', 'reopened', '案件重新打开'); break;
    default: throw new Bad('未知操作');
  }
  await putCase(c);
  return { ok: true, case: c };
}

async function deskDelete(id) {
  const c = await getCase(id);
  if (!c) throw new Bad('没有这个案件', 404);
  for (const f of c.evidence.files) {
    const ls = await store('files').list({ prefix: `${f.id}/` });
    for (const b of ls.blobs) await store('files').delete(b.key);
    await store('meta').delete(`up/${f.id}`);
  }
  await store('cases').delete(`case/${c.id}`);
  await dropFromIndex(c.id);
  return { ok: true };
}

async function deskFile(req, id, n) {
  const meta = await store('meta').get(`up/${id}`, { type: 'json' });
  if (!meta) throw new Bad('文件不存在', 404);
  const buf = await store('files').get(`${id}/${n}`, { type: 'arrayBuffer' });
  if (!buf) throw new Bad('分片不存在', 404);
  return new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store', 'x-chunks': String(meta.chunks), ...cors(req) } });
}

function notify(text) {
  const hook = env('DISCORD_WEBHOOK_URL');
  if (!hook) return;
  fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }) }).catch(() => {});
}

// ---------- 路由 ----------
export default async (req, ctx) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  const url = new URL(req.url);
  // 本地 netlify dev 遇到 4xx 会补一个 /index.htm 再请求一次，这里去掉
  const p = url.pathname.replace(/\/index\.html?$/, '').replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const body = async () => { try { return await req.json(); } catch { throw new Bad('请求格式不对'); } };
  try {
    const route = `${req.method} ${p[0] || ''}${p[1] ? '/' + p[1] : ''}`;
    if (route === 'GET health') return json(req, { ok: true, time: now(), configured: !!env('SESSION_SECRET') && !!env('DESK_PASSWORD_HASH') });

    if (route === 'POST roblox/lookup') {
      await rateLimit(req, ctx, 'lookup', 60, 600);
      const b = await body();
      return json(req, { ok: true, users: await robloxLookup(Array.isArray(b.usernames) ? b.usernames : []) });
    }
    if (route === 'POST uploads' && p.length === 1) {
      const desk = verifySession((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
      if (!desk) await rateLimit(req, ctx, 'upload', 40, 3600);
      return json(req, await uploadCreate(req, await body(), desk));
    }
    if (req.method === 'PUT' && p[0] === 'uploads' && p.length === 3) return json(req, await uploadChunk(req, p[1], Number(p[2]), req.headers.get('x-upload-token')));
    if (req.method === 'POST' && p[0] === 'uploads' && p[2] === 'complete') return json(req, await uploadComplete(p[1], req.headers.get('x-upload-token')));

    if (route === 'POST cases' && p.length === 1) { await rateLimit(req, ctx, 'case', 8, 3600); return json(req, await createCase(req, ctx, await body())); }
    if (route === 'POST cases/view') { await rateLimit(req, ctx, 'view', 40, 600); return json(req, { ok: true, case: playerView(await loadForPlayer(await body())) }); }
    if (route === 'POST cases/reply') { await rateLimit(req, ctx, 'reply', 20, 3600); return json(req, await playerReply(await body())); }

    if (route === 'POST desk/login') {
      await rateLimit(req, ctx, 'login', 10, 3600);
      const b = await body();
      if (!checkPassword(b.password)) throw new Bad('口令不对', 401);
      const exp = Date.now() + 12 * 3600e3;
      return json(req, { ok: true, token: signSession({ sub: 'desk', exp }), exp });
    }
    if (p[0] === 'desk') {
      requireDesk(req);
      if (route === 'GET desk/cases') return json(req, { ok: true, cases: (await store('meta').get('index', { type: 'json' })) || [] });
      if (route === 'GET desk/case') { const c = await getCase(url.searchParams.get('id')); if (!c) throw new Bad('没有这个案件', 404); return json(req, { ok: true, case: c }); }
      if (route === 'POST desk/update') return json(req, await deskUpdate(await body()));
      if (route === 'POST desk/delete') return json(req, await deskDelete((await body()).id));
      if (route === 'GET desk/file') return deskFile(req, url.searchParams.get('id'), Number(url.searchParams.get('n') || 0));
      if (route === 'GET desk/upload') return json(req, { ok: true, meta: await store('meta').get(`up/${url.searchParams.get('id')}`, { type: 'json' }) });
    }
    return fail(req, 404, '没有这个接口');
  } catch (e) {
    if (e instanceof Bad) return fail(req, e.status, e.message);
    console.error(e);
    return fail(req, 500, '服务器出错了，请稍后再试');
  }
};
