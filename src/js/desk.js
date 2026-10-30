import { $, $$, esc, toast, fmtTime, copyText } from './common.js';
import '../styles/form.css';
import '../styles/desk.css';
import { API, call, fmtSize, STATUS_CN, CATEGORY_CN } from './api.js';

const SKEY = 'kyukosha.desk';
let token = null;
try { token = sessionStorage.getItem(SKEY); } catch { /* 隐私模式 */ }
let cases = [], filter = 'open', cur = null;
const blobUrls = [];

const TYPE_CN = { report: '举报', game_appeal: '游戏申诉', discord_appeal: 'Discord 申诉' };
const OUTCOME_CN = { approved: '已批准', dismissed: '驳回 / 超时', other: '其他回复' };
const CHECKS = [
  ['user', 'Roblox 查得到这个账号'],
  ['match', '视频里能认出就是这个人（PLAYERLIST 或其他方式）'],
  ['video', '视频完整、没剪辑、不是 OBS 录屏'],
  ['rule', '属于官方列出的可举报行为（持续类录够两分钟）'],
  ['link', '证据能直接播放，或已转存到官方接受的平台'],
  ['dup', '同一对象没有重复举报'],
];

const api = (path, opt = {}) => call(path, { ...opt, token }).catch((e) => {
  if (e.status === 401) { logout(); toast('登录过期，请重新输入口令'); }
  throw e;
});

function logout() {
  token = null;
  try { sessionStorage.removeItem(SKEY); } catch { /* 忽略 */ }
  $('#deskApp').hidden = true; $('#deskLogin').hidden = false;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginErr'); err.hidden = true;
  try {
    const d = await call('/api/desk/login', { method: 'POST', body: { password: e.target.password.value } });
    token = d.token;
    try { sessionStorage.setItem(SKEY, token); } catch { /* 忽略 */ }
    e.target.reset();
    start();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
$('#logout').addEventListener('click', logout);
$('#refresh').addEventListener('click', () => loadList().then(() => cur && openCase(cur.id)));

async function start() {
  $('#deskLogin').hidden = true; $('#deskApp').hidden = false;
  await loadList();
  const m = location.hash.match(/^#(GK[\w-]+)/);
  if (m) openCase(m[1]);
}

async function loadList() {
  const d = await api('/api/desk/cases');
  cases = d.cases;
  renderList();
}
const OPEN = ['received', 'reviewing', 'needs_info', 'ready', 'submitted'];
function renderList() {
  const groups = [
    ['open', '进行中', (c) => OPEN.includes(c.status)],
    ['received', '新收件', (c) => c.status === 'received'],
    ['ready', '待代投', (c) => c.status === 'ready'],
    ['submitted', '等回复', (c) => c.status === 'submitted'],
    ['done', '已完结', (c) => ['result', 'closed'].includes(c.status)],
    ['all', '全部', () => true],
  ];
  $('#tabs').innerHTML = groups.map(([k, t, f]) => `<button class="${filter === k ? 'is-on' : ''}" data-f="${k}">${t}<b>${cases.filter(f).length}</b></button>`).join('');
  const fn = groups.find((g) => g[0] === filter)[2];
  const list = cases.filter(fn);
  $('#items').innerHTML = list.length ? list.map((c) => `
    <li><button class="desk-item ${cur?.id === c.id ? 'is-on' : ''} ${c.unread ? 'is-unread' : ''}" data-id="${esc(c.id)}">
      <span class="mono">${esc(c.id)}</span>
      <b>${esc(c.target || '（未填对象）')}</b>
      <small>${TYPE_CN[c.type]} · ${esc(CATEGORY_CN[c.category]?.t || '')} · ${esc(c.nickname)}</small>
      <span class="desk-badge st-${c.status}">${STATUS_CN[c.status]?.t || c.status}${c.outcome ? ' · ' + OUTCOME_CN[c.outcome] : ''}</span>
      <small class="mono">${fmtTime(c.updatedAt)}</small>
    </button></li>`).join('') : '<li class="desk-empty">这一栏没有案件</li>';
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.f; renderList(); } });
$('#items').addEventListener('click', (e) => { const b = e.target.closest('.desk-item'); if (b) openCase(b.dataset.id); });

async function openCase(id) {
  blobUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const d = await api('/api/desk/case?id=' + encodeURIComponent(id));
  cur = d.case;
  history.replaceState(null, '', '#' + cur.id);
  renderDetail();
  renderList();
  if (cur.unread) { await api('/api/desk/update', { method: 'POST', body: { id: cur.id, action: 'read' } }).catch(() => {}); const row = cases.find((x) => x.id === cur.id); if (row) row.unread = false; renderList(); }
  if (innerWidth < 960) $('#detail').scrollIntoView({ behavior: 'smooth' });
}

const counter = (max) => `<span class="cnt mono" data-max="${max}"></span>`;
function renderDetail() {
  const c = cur;
  const r = c.reporter, i = c.incident, ev = c.evidence;
  const dr = c.draft || {};
  const t0 = c.targets?.find((x) => x.found);
  const isReport = c.type === 'report';
  const appealKeys = c.type === 'game_appeal' ? ['Your Roblox Username', 'Where and why did you get banned?', 'Do you believe this is a false ban?'] : ['Discord username', 'Why were you banned?', 'Why should the ban be lifted?'];
  const af = dr.appealFields || {};
  const kv = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  $('#detail').innerHTML = `
  <header class="dd-head">
    <div>
      <span class="mono">${esc(c.id)} · ${TYPE_CN[c.type]} · 提交于 ${fmtTime(c.createdAt)}</span>
      <h2 class="h-2">${esc(c.targets?.map((x) => '@' + (x.name || x.requested)).join('、') || r.appealAccount || '（未填对象）')}</h2>
    </div>
    <span class="desk-badge st-${c.status} big">${STATUS_CN[c.status]?.t}</span>
  </header>

  <div class="dd-grid">
    <section class="dd-card"><h3>玩家</h3><dl class="rv">
      ${kv('称呼', esc(r.nickname))}${kv('联系方式', r.contactType ? esc(r.contactType + '：' + r.contact) : '<span class="mute">未留</span>')}
      ${kv('自己的 Roblox', esc(r.roblox))}${kv('关系', esc({ victim: '受害者本人', witness: '目击者', friend: '替朋友交', self: '本人' }[r.relation] || r.relation))}
      ${kv('能否用 Discord', esc({ yes: '能，但不熟悉流程', no: '不能 / 不方便', unsure: '不确定' }[r.canDiscord] || ''))}${kv('申诉账号', esc(r.appealAccount))}
    </dl></section>

    <section class="dd-card"><h3>账号核对</h3>
      ${(c.targets || []).map((x) => `<div class="acct ${x.found ? 'ok' : 'bad'}">
        <b>@${esc(x.name || x.requested)}</b> ${x.found ? `<span class="mono">ID ${x.id}</span> · 显示名称 ${esc(x.displayNameApi)} · <a class="link-u" href="https://www.roblox.com/users/${x.id}/profile" target="_blank" rel="noopener">主页</a>` : '<span class="err">Roblox 查不到这个用户名</span>'}
        ${x.characterName ? `<br><small>玩家填的角色名：${esc(x.characterName)}</small>` : ''}${x.displayName ? `<br><small>玩家填的显示名称：${esc(x.displayName)}</small>` : ''}
      </div>`).join('') || '<p class="mute">没有填写对象账号</p>'}
    </section>
  </div>

  ${i.narrative || i.date || i.location || c.extra ? `<section class="dd-card"><h3>经过（原文）<button class="link-u dd-copy" data-copy="${esc(i.narrative || c.extra)}">复制</button></h3>
    <dl class="rv">${kv('时间', esc([i.date, i.time, i.tz].filter(Boolean).join(' ')))}${kv('服务器 / 地点', esc([i.server, i.location].filter(Boolean).join(' · ')))}
      ${isReport && i.category !== 'other' ? kv('类别', `${esc(CATEGORY_CN[i.category]?.t)} <span class="mono">${esc(i.categoryEn)}</span>`) : ''}${kv('持续', esc(i.duration))}</dl>
    ${i.narrative ? `<p class="pre dd-narr">${esc(i.narrative)}</p>` : ''}
    ${c.extra ? `<p class="pre dd-narr">${esc(c.extra)}</p>` : ''}
  </section>` : ''}

  <section class="dd-card"><h3>证据</h3>
    ${ev.notObs ? '<p class="mono ok-line">玩家确认：不是 OBS 录屏，未剪辑</p>' : ''}
    <dl class="rv">${isReport ? kv('PLAYERLIST', esc({ yes: '录像里打开了', no: '没有打开', unsure: '不确定' }[ev.playerlist] || '') + (ev.playerlistAt ? ' · ' + esc(ev.playerlistAt) : '')) : ''}
      ${kv('违规时段', esc([ev.clipStart, ev.clipEnd].filter(Boolean).join(' – ')))}${kv('说明', esc(ev.note))}</dl>
    <ul class="ev-links">${ev.links.map((l) => `<li><a class="link-u" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.url)}</a>${l.note ? ` <span class="mute">· ${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>
    <ul class="ev-files">${ev.files.map((f) => `<li data-file="${esc(f.id)}"><span>${esc(f.name)} <span class="mono mute">${fmtSize(f.size)}</span></span><button class="btn-line btn-sm" data-load="${esc(f.id)}" data-chunks="${f.chunks}" data-type="${esc(f.type)}" data-name="${esc(f.name)}">载入预览</button><div class="ev-view"></div></li>`).join('')}</ul>
    ${!ev.links.length && !ev.files.length ? '<p class="mute">没有证据</p>' : ''}
  </section>

  ${c.chat?.length ? `<section class="dd-card"><h3>聊天原文 / 英文对照</h3>
    <div class="chat-tr">${c.chat.map((m, k) => `<div class="chat-tr__row"><div><span class="mono mute">${esc(m.speaker)} ${esc(m.time)}</span><p>${esc(m.text)}</p></div><textarea class="textarea chat-en" data-k="${k}" rows="2" placeholder="英文对照">${esc(dr.chatEn?.[k] || '')}</textarea></div>`).join('')}</div>
  </section>` : ''}

  ${c.supplements?.length ? `<section class="dd-card"><h3>玩家补充</h3>${c.supplements.map((s) => `<div class="supp"><span class="mono mute">${fmtTime(s.at)}</span>${s.text ? `<p class="pre">${esc(s.text)}</p>` : ''}${s.links.map((l) => `<a class="link-u" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.url)}</a>`).join('<br>')}${s.files.length ? `<p class="mute">附 ${s.files.length} 个文件（见上方证据）</p>` : ''}</div>`).join('')}</section>` : ''}

  <section class="dd-card"><h3>核对清单</h3>
    <div class="checks">${CHECKS.map(([k, t]) => `<label><input type="checkbox" data-check="${k}" ${c.checklist?.[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
    <button class="btn-line btn-sm" id="saveChecks">保存清单</button>
  </section>

  <section class="dd-card dd-draft"><h3>${isReport ? '提交内容（对应 Blox.report 表单三栏）' : '申诉英文（交给玩家本人提交）'}</h3>
    ${isReport ? `
    <label class="field"><span>Username</span><input class="input mono" id="dUser" maxlength="40" value="${esc(dr.username || t0?.name || '')}"></label>
    <label class="field"><span>Reason ${counter(250)}</span><textarea class="textarea" id="dReason" maxlength="250" rows="4" placeholder="Infinite holding for ~4 min at the Gym ...">${esc(dr.reason || '')}</textarea></label>
    <label class="field"><span>Evidence ${counter(1000)}</span><textarea class="textarea" id="dEvidence" maxlength="1000" rows="5" placeholder="Video link + timestamps (playerlist at 01:32) + short translation of key chat lines">${esc(dr.evidence || '')}</textarea></label>` :
    appealKeys.map((k, n) => `<label class="field"><span>${k} ${counter(250)}</span><textarea class="textarea af" data-k="${esc(k)}" maxlength="${c.type === 'game_appeal' ? 250 : 1000}" rows="3">${esc(af[k] || '')}</textarea></label>`).join('')}
    <label class="field"><span>经过英文全文（内部存档，必要时随证据附上）</span><textarea class="textarea" id="dNarr" rows="5">${esc(dr.narrativeEn || '')}</textarea></label>
    <div class="dd-actions"><button class="btn-line" id="saveDraft">保存草稿</button>${isReport ? '<button class="btn-line" id="copyPack">复制三栏</button>' : ''}${dr.at ? `<span class="mono mute">上次保存 ${fmtTime(dr.at)}</span>` : ''}</div>
  </section>

  <section class="dd-card dd-ops"><h3>处理</h3>
    <div class="ops">
      <details ${['received'].includes(c.status) ? 'open' : ''}><summary>开始核对</summary><p class="mute">把状态改为“核对中”，玩家会看到。</p><button class="btn-line" data-act="claim">开始核对</button></details>
      <details><summary>请玩家补充</summary><textarea class="textarea" id="reqMsg" rows="3" placeholder="写清楚缺什么、怎么补，玩家会原样看到">${esc(c.request?.message || '')}</textarea><button class="btn-line" data-act="request">发出补充请求</button></details>
      <details><summary>给玩家留言</summary><textarea class="textarea" id="msg" rows="2"></textarea><button class="btn-line" data-act="message">发送留言</button></details>
      <details ${c.status === 'reviewing' ? 'open' : ''}><summary>${isReport ? '标记待代投' : '标记整理完成'}</summary><p class="mute">${isReport ? '三栏写好、清单核对完再标记。之后去 Discord 提交。' : '标记后，查询页会把上面的英文和提交步骤给玩家。'}</p><button class="btn-line" data-act="ready">标记</button></details>
      ${isReport ? `<details ${c.status === 'ready' ? 'open' : ''}><summary>记录已代投</summary>
        <p class="mute">只在 Discord 里真正点了“提交”之后再记录。</p>
        <div class="grid-2"><label class="field"><span>提交时间</span><input class="input" id="subAt" value="${esc(c.submission?.at || '')}" placeholder="2026-10-30 21:05（北京时间）"></label>
        <label class="field"><span>方式</span><select class="select" id="subMethod"><option>Discord · Gakuran Support #reports · Blox.report 表单</option><option>Blox.report 网站 Report Hub</option></select></label></div>
        <label class="field"><span>使用的账号</span><input class="input" id="subAcct" value="${esc(c.submission?.account || '站长的 Discord 账号')}"></label>
        <label class="field"><span>提交后看到的确认信息（内部存档）</span><textarea class="textarea" id="subConf" rows="2">${esc(c.submission?.confirmation || '')}</textarea></label>
        <label class="field"><span>给玩家看的说明</span><input class="input" id="subPub" value="${esc(c.submission?.publicNote || '')}" placeholder="例如：分别举报了 2 个人"></label>
        <button class="btn-line" data-act="submitted">记录已代投</button></details>
      <details ${c.status === 'submitted' ? 'open' : ''}><summary>记录官方回复</summary>
        <p class="mute">只记录真实收到的 Blox.report 私信或员工回复。</p>
        <div class="grid-2"><label class="field"><span>结果</span><select class="select" id="resOut"><option value="approved">已批准（Blox.report 通知已处理）</option><option value="dismissed">驳回 / 7 天超时</option><option value="other">其他</option></select></label>
        <label class="field"><span>收到时间</span><input class="input" id="resAt" placeholder="2026-11-01 10:20"></label></div>
        <label class="field"><span>回复原文（内部存档）</span><textarea class="textarea" id="resRaw" rows="3"></textarea></label>
        <label class="field"><span>给玩家看的说明</span><input class="input" id="resPub"></label>
        <button class="btn-line" data-act="result">记录官方回复</button></details>` : ''}
      <details><summary>结束案件</summary><input class="input" id="closeReason" placeholder="玩家会看到这句原因"><button class="btn-line" data-act="close">结束</button></details>
      ${['closed', 'result'].includes(c.status) ? '<details><summary>重新打开</summary><button class="btn-line" data-act="reopen">重新打开</button></details>' : ''}
    </div>
  </section>

  <section class="dd-card"><h3>内部备注</h3>
    ${c.notes.map((n) => `<p class="note"><span class="mono mute">${fmtTime(n.at)}</span> ${esc(n.text)}</p>`).join('') || '<p class="mute">还没有备注</p>'}
    <textarea class="textarea" id="noteText" rows="2" placeholder="只有协助者看得到"></textarea><button class="btn-line btn-sm" data-act="note">添加备注</button>
  </section>

  <section class="dd-card"><h3>全部记录</h3>
    <ol class="tl">${c.events.slice().reverse().map((e) => `<li class="tl__it tl__it--${e.actor}"><span class="mono tl__t">${fmtTime(e.at)} · ${e.actor}${e.visible ? '' : ' · 内部'}</span><b>${esc(STATUS_CN[e.type]?.t || e.type)}</b>${e.text ? `<p class="pre">${esc(e.text)}</p>` : ''}</li>`).join('')}</ol>
    ${c.submission ? `<p class="mono mute">已代投记录：${esc(c.submission.at)} · ${esc(c.submission.method)} · ${esc(c.submission.account)}<br>${esc(c.submission.confirmation)}</p>` : ''}
    ${c.result ? `<p class="mono mute">官方回复：${esc(OUTCOME_CN[c.result.outcome])} · ${esc(c.result.at)}<br>${esc(c.result.raw)}</p>` : ''}
    <button class="btn-line btn-sm danger" id="delCase">删除案件和全部文件</button>
  </section>`;
  updateCounters();
}

function updateCounters() {
  $$('.cnt').forEach((s) => {
    const ta = s.closest('.field').querySelector('textarea,input');
    const n = ta.value.length, max = +s.dataset.max;
    s.textContent = `${n}/${max}`;
    s.classList.toggle('over', n > max);
  });
}

async function update(body, okMsg) {
  try {
    const d = await api('/api/desk/update', { method: 'POST', body: { id: cur.id, ...body } });
    cur = d.case;
    const row = cases.find((x) => x.id === cur.id);
    if (row) { row.status = cur.status; row.updatedAt = cur.updatedAt; row.outcome = cur.result?.outcome || ''; }
    renderDetail(); renderList();
    toast(okMsg);
  } catch (ex) { toast(ex.message, 4000); }
}

function draftBody() {
  const chatEn = $$('.chat-en').map((t) => t.value);
  if (cur.type === 'report') return { action: 'draft', username: $('#dUser').value.trim(), reason: $('#dReason').value.trim(), evidence: $('#dEvidence').value.trim(), narrativeEn: $('#dNarr').value, chatEn };
  return { action: 'draft', narrativeEn: $('#dNarr').value, chatEn, appealFields: Object.fromEntries($$('.af').map((t) => [t.dataset.k, t.value.trim()])) };
}

$('#detail').addEventListener('input', (e) => { if (e.target.closest('.field')?.querySelector('.cnt')) updateCounters(); });
$('#detail').addEventListener('click', async (e) => {
  const cp = e.target.closest('[data-copy]');
  if (cp) return copyText(cp.dataset.copy).then((ok) => toast(ok ? '已复制' : '复制失败'));
  if (e.target.id === 'saveChecks') return update({ action: 'checklist', items: Object.fromEntries($$('[data-check]').map((x) => [x.dataset.check, x.checked])) }, '清单已保存');
  if (e.target.id === 'saveDraft') return update(draftBody(), '草稿已保存');
  if (e.target.id === 'copyPack') return copyText(`Username: ${$('#dUser').value}\nReason: ${$('#dReason').value}\nEvidence: ${$('#dEvidence').value}`).then((ok) => toast(ok ? '三栏已复制' : '复制失败'));
  if (e.target.id === 'delCase') {
    const typed = prompt(`删除后无法恢复。输入案件编号 ${cur.id} 确认：`);
    if (typed !== cur.id) return;
    try { await api('/api/desk/delete', { method: 'POST', body: { id: cur.id } }); toast('已删除'); cur = null; $('#detail').innerHTML = '<div class="desk-empty">已删除。</div>'; loadList(); } catch (ex) { toast(ex.message); }
    return;
  }
  const load = e.target.closest('[data-load]');
  if (load) return loadFile(load);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  const v = (id) => $('#' + id)?.value.trim();
  if (act === 'claim') update({ action: 'claim' }, '已开始核对');
  if (act === 'request') update({ action: 'request', message: v('reqMsg') }, '已请玩家补充');
  if (act === 'message') update({ action: 'message', message: v('msg') }, '留言已发出');
  if (act === 'ready') { await update(draftBody(), '草稿已保存'); update({ action: 'ready' }, '已标记'); }
  if (act === 'submitted') update({ action: 'submitted', at: v('subAt'), method: v('subMethod'), account: v('subAcct'), confirmation: v('subConf'), publicNote: v('subPub') }, '已记录代投');
  if (act === 'result') update({ action: 'result', outcome: v('resOut'), at: v('resAt'), raw: v('resRaw'), publicText: v('resPub') }, '已记录官方回复');
  if (act === 'close') update({ action: 'close', reason: v('closeReason') }, '案件已结束');
  if (act === 'reopen') update({ action: 'reopen' }, '已重新打开');
  if (act === 'note') update({ action: 'note', text: v('noteText') }, '备注已添加');
});

// 证据文件按分片取回，在浏览器里拼成完整文件预览和下载
async function loadFile(btn) {
  const { load: id, chunks, type, name } = btn.dataset;
  const view = btn.parentElement.querySelector('.ev-view');
  btn.disabled = true;
  const parts = [];
  try {
    for (let n = 0; n < +chunks; n++) {
      btn.textContent = `载入中 ${n + 1}/${chunks}`;
      const r = await call(`/api/desk/file?id=${encodeURIComponent(id)}&n=${n}`, { token, raw: true });
      parts.push(await r.arrayBuffer());
    }
    const blob = new Blob(parts, { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    const isVideo = /^video\//.test(type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(name);
    view.innerHTML = isVideo ? `<video controls preload="metadata" src="${url}"></video>` : /^image\//.test(type) ? `<img src="${url}" alt="">` : '';
    view.insertAdjacentHTML('beforeend', `<a class="link-u" href="${url}" download="${esc(name)}">下载原文件</a>`);
    btn.remove();
  } catch (ex) { btn.disabled = false; btn.textContent = '重试'; toast(ex.message); }
}

if (token) start().catch(() => logout());
console.info('收件后端：', API);
