import { $, $$, esc, toast, copyText } from './common.js';
import '../styles/form.css';
import { call, uploadFile, fmtSize, local, CATEGORY_CN, ApiError } from './api.js';

const DRAFT = 'kyukosha.draft.v1';
const form = $('#form');
const steps = $$('.fstep', form);
let step = 0;
const files = []; // {key, file, name, size, status, progress, id, token, err}
const lookups = new Map(); // 用户名 -> 查询结果

const type = () => form.type.value;
const isReport = () => type() === 'report';

// ---------- 动态行 ----------
function targetRow(v = {}) {
  const el = document.createElement('div');
  el.className = 'trow';
  el.innerHTML = `
    <div class="trow__main">
      <label class="field"><span>Roblox 用户名<i class="req">*</i></span><input class="input t-user" maxlength="40" placeholder="例如 Builderman" value="${esc(v.username || '')}" autocapitalize="off" spellcheck="false"></label>
      <button type="button" class="btn-line t-check">核对</button>
    </div>
    <div class="lookup-res t-res" aria-live="polite"></div>
    <div class="grid-2">
      <label class="field"><span>头顶显示的角色名</span><input class="input t-char" maxlength="60" placeholder="选填，例如 Cazimor Räsänen" value="${esc(v.characterName || '')}"></label>
      <label class="field"><span>显示名称</span><input class="input t-disp" maxlength="60" placeholder="选填" value="${esc(v.displayName || '')}"></label>
    </div>
    <button type="button" class="row-x" aria-label="删除这个人">删除</button>`;
  $('#targets').appendChild(el);
  if (v.username && lookups.has(v.username.toLowerCase())) showLookup(el, lookups.get(v.username.toLowerCase()));
  return el;
}
function chatRow(v = {}) {
  const el = document.createElement('div');
  el.className = 'crow';
  el.innerHTML = `
    <input class="input c-who" maxlength="60" placeholder="谁说的" value="${esc(v.speaker || '')}">
    <input class="input c-time" maxlength="40" placeholder="大概时间" value="${esc(v.time || '')}">
    <textarea class="textarea c-text" maxlength="600" rows="2" placeholder="原话，一字不改">${esc(v.text || '')}</textarea>
    <button type="button" class="row-x" aria-label="删除这条">删除</button>`;
  $('#chat').appendChild(el);
}
function linkRow(v = {}) {
  const el = document.createElement('div');
  el.className = 'lrow';
  el.innerHTML = `
    <input class="input l-url" type="url" maxlength="600" placeholder="https://..." value="${esc(v.url || '')}" inputmode="url">
    <input class="input l-note" maxlength="200" placeholder="说明 / 提取码" value="${esc(v.note || '')}">
    <button type="button" class="row-x" aria-label="删除这个链接">删除</button>`;
  $('#links').appendChild(el);
}

function showLookup(row, r) {
  const box = $('.t-res', row);
  if (!r) { box.innerHTML = ''; return; }
  box.className = 'lookup-res t-res ' + (r.found ? 'is-ok' : 'is-bad');
  box.innerHTML = r.found
    ? `找到了：<b>@${esc(r.name)}</b>，显示名称 ${esc(r.displayName)}，用户 ID <span class="mono">${r.id}</span>。<a class="link-u" href="https://www.roblox.com/users/${r.id}/profile" target="_blank" rel="noopener">打开主页确认</a>`
    : '没查到这个用户名。确认一下是不是 @ 后面那串，而不是显示名称或角色名。';
}
async function lookup(names) {
  const want = names.filter((n) => n && !lookups.has(n.toLowerCase()));
  if (want.length) {
    const d = await call('/api/roblox/lookup', { method: 'POST', body: { usernames: want } });
    d.users.forEach((u) => lookups.set(u.requested.toLowerCase(), u));
  }
  return names.map((n) => lookups.get(n.toLowerCase()));
}

// ---------- 类别 ----------
$('#cats').innerHTML = Object.entries(CATEGORY_CN).map(([k, c]) =>
  `<label class="choice choice--cat"><input type="radio" name="category" value="${k}"><span><b>${c.t}</b><em class="mono">${c.en}</em><small>${c.d}</small></span></label>`).join('');

// ---------- 文件 ----------
function renderFiles() {
  $('#files').innerHTML = files.map((f, i) => `
    <li class="file ${f.status}">
      <span class="file__name">${esc(f.name)}</span>
      <span class="file__size mono">${fmtSize(f.size)}</span>
      <span class="file__bar"><i style="width:${Math.round((f.progress || 0) * 100)}%"></i></span>
      <span class="file__st">${f.status === 'done' ? '已上传' : f.status === 'error' ? esc(f.err || '失败') : f.status === 'queued' ? '排队中' : Math.round((f.progress || 0) * 100) + '%'}</span>
      ${f.status === 'error' ? `<button type="button" class="link-u f-retry" data-i="${i}">重试</button>` : ''}
      <button type="button" class="row-x f-del" data-i="${i}" aria-label="移除这个文件">移除</button>
    </li>`).join('');
}
let uploading = false;
async function pump() {
  if (uploading) return;
  uploading = true;
  while (true) {
    const f = files.find((x) => x.status === 'queued');
    if (!f) break;
    f.status = 'uploading'; f.progress = 0; renderFiles();
    try {
      const r = await uploadFile(f.file, { onProgress: (p) => { f.progress = p; renderFiles(); } });
      Object.assign(f, { id: r.id, token: r.token, status: 'done', progress: 1 });
    } catch (e) {
      f.status = 'error'; f.err = e.message;
    }
    renderFiles(); save();
  }
  uploading = false;
}
function addFiles(list) {
  for (const file of list) {
    if (files.length >= 12) { toast('最多 12 个文件'); break; }
    if (file.size > 200 * 1048576) { toast(`${file.name} 超过 200MB，请压缩或剪掉无关部分，或者改用链接`); continue; }
    if (!/^(video|image)\//.test(file.type) && !/\.(mkv|flv|wmv|mov|mp4|avi|webm|heic)$/i.test(file.name)) { toast(`${file.name} 不是视频或图片`); continue; }
    files.push({ file, name: file.name, size: file.size, status: 'queued', progress: 0 });
  }
  renderFiles(); pump();
}
const drop = $('#drop'), input = $('#fileInput');
drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
$('#files').addEventListener('click', (e) => {
  const d = e.target.closest('.f-del'), r = e.target.closest('.f-retry');
  if (d) { files.splice(+d.dataset.i, 1); renderFiles(); save(); }
  if (r) { const f = files[+r.dataset.i]; if (f.file) { f.status = 'queued'; renderFiles(); pump(); } else toast('这个文件需要重新选择'); }
});

// ---------- 读写表单 ----------
function collect() {
  const t = type();
  const targets = $$('.trow').map((r) => ({ username: $('.t-user', r).value.trim().replace(/^@/, ''), characterName: $('.t-char', r).value.trim(), displayName: $('.t-disp', r).value.trim() })).filter((x) => x.username);
  if (t === 'game_appeal' && form.appealRoblox.value.trim()) targets.splice(0, targets.length, { username: form.appealRoblox.value.trim().replace(/^@/, '') });
  if (t === 'discord_appeal') targets.splice(0, targets.length, ...(form.appealRoblox2.value.trim() ? [{ username: form.appealRoblox2.value.trim().replace(/^@/, '') }] : []));
  return {
    type: t,
    targets,
    reporter: {
      nickname: form.nickname.value.trim(), contactType: form.contactType.value, contact: form.contact.value.trim(), roblox: form.myRoblox.value.trim(),
      relation: t === 'report' ? form.relation.value : 'self', canDiscord: form.canDiscord.value,
      appealAccount: t === 'discord_appeal' ? form.appealDiscord.value.trim() : t === 'game_appeal' ? form.appealRoblox.value.trim() : '',
    },
    incident: {
      date: form.date.value, time: form.time.value, tz: form.tz.value, server: form.server.value, location: form.location.value,
      category: t === 'report' ? (form.category.value || '') : 'other', duration: form.duration.value.trim(), narrative: form.narrative.value.trim(),
    },
    chat: $$('.crow').map((r) => ({ speaker: $('.c-who', r).value.trim(), time: $('.c-time', r).value.trim(), text: $('.c-text', r).value.trim() })).filter((m) => m.text),
    evidence: {
      links: $$('.lrow').map((r) => ({ url: $('.l-url', r).value.trim(), note: $('.l-note', r).value.trim() })).filter((l) => l.url),
      uploads: files.filter((f) => f.status === 'done').map((f) => ({ id: f.id, token: f.token })),
      playerlist: form.playerlist.value, playerlistAt: form.playerlistAt.value.trim(), clipStart: form.clipStart.value.trim(), clipEnd: form.clipEnd.value.trim(), note: form.evNote.value.trim(),
    },
    extra: form.extra.value.trim(),
    appealDiscord: form.appealDiscord.value.trim(),
  };
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const d = collect();
    d.step = step;
    d.files = files.filter((f) => f.status === 'done').map(({ id, token, name, size }) => ({ id, token, name, size }));
    const ok = local.set(DRAFT, d);
    $('#saveState').textContent = ok ? '草稿已存在本机' : '';
  }, 400);
}
function restore() {
  const d = local.get(DRAFT);
  if (!d) { targetRow(); chatRow(); linkRow(); return; }
  const set = (name, v) => { if (form[name] && v !== undefined && v !== null) form[name].value = v; };
  $$('input[name=type]').forEach((r) => (r.checked = r.value === (d.type || 'report')));
  (d.type === 'report' && d.targets?.length ? d.targets : [{}]).forEach(targetRow);
  if (d.type === 'game_appeal') set('appealRoblox', d.targets?.[0]?.username);
  if (d.type === 'discord_appeal') { set('appealDiscord', d.reporter?.appealAccount); set('appealRoblox2', d.targets?.[0]?.username); }
  const r = d.reporter || {}, i = d.incident || {}, e = d.evidence || {};
  set('nickname', r.nickname); set('contactType', r.contactType); set('contact', r.contact); set('myRoblox', r.roblox); set('relation', r.relation || 'victim'); set('canDiscord', r.canDiscord || 'no');
  ['date', 'time', 'tz', 'server', 'location', 'duration', 'narrative'].forEach((k) => set(k, i[k]));
  if (i.category) $$('input[name=category]').forEach((x) => (x.checked = x.value === i.category));
  (d.chat?.length ? d.chat : [{}]).forEach(chatRow);
  (e.links?.length ? e.links : [{}]).forEach(linkRow);
  set('playerlist', e.playerlist); set('playerlistAt', e.playerlistAt); set('clipStart', e.clipStart); set('clipEnd', e.clipEnd); set('evNote', e.note); set('extra', d.extra);
  (d.files || []).forEach((f) => files.push({ ...f, status: 'done', progress: 1 }));
  renderFiles();
  toast('已恢复上次没填完的草稿');
}

// ---------- 步骤 ----------
function applyType() {
  const t = type();
  $$('[data-show]', form).forEach((el) => (el.hidden = !el.dataset.show.split(' ').includes(t)));
  $$('[data-t-report]', form).forEach((el) => (el.textContent = t === 'report' ? el.dataset.tReport : el.dataset.tAppeal));
}
function err(el, msg) {
  if (!el) return;
  el.setAttribute('aria-invalid', 'true');
  let m = el.closest('.field')?.querySelector('.err');
  if (!m && el.closest('.field')) { m = document.createElement('span'); m.className = 'err'; el.closest('.field').appendChild(m); }
  if (m) m.textContent = msg;
}
function clearErr() { $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid')); $$('.field .err', form).forEach((m) => m.remove()); }

async function validate(n) {
  clearErr();
  const t = type();
  const d = collect();
  let first = null;
  const bad = (el, msg) => { err(el, msg); first ||= el; };
  if (n === 1) {
    if (t === 'report') {
      const rows = $$('.trow').filter((r) => $('.t-user', r).value.trim());
      if (!rows.length) bad($('.t-user'), '至少填一个用户名');
      else {
        try {
          const res = await lookup(rows.map((r) => $('.t-user', r).value.trim().replace(/^@/, '')));
          rows.forEach((r, i) => { showLookup(r, res[i]); if (!res[i]?.found) bad($('.t-user', r), '这个用户名查不到'); });
        } catch (e) { toast(e.message); }
      }
    }
    if (t === 'game_appeal' && !form.appealRoblox.value.trim()) bad(form.appealRoblox, '填写你被封的 Roblox 用户名');
    if (t === 'discord_appeal' && !form.appealDiscord.value.trim()) bad(form.appealDiscord, '填写你被封的 Discord 用户名');
  }
  if (n === 2) {
    if (!d.incident.date) bad(form.date, '选一个日期，记不清就选大概那天');
    if (t === 'report' && !d.incident.category) { bad($('input[name=category]'), '选一类'); $('#cats').classList.add('is-bad'); } else $('#cats').classList.remove('is-bad');
    if (d.incident.narrative.length < 10) bad(form.narrative, '多写几句，至少说清楚对方做了什么');
  }
  if (n === 3) {
    if (files.some((f) => f.status === 'uploading' || f.status === 'queued')) { toast('还有文件在上传，等它传完'); return false; }
    const badLink = $$('.l-url').find((x) => x.value.trim() && !/^https?:\/\/\S+\.\S+/i.test(x.value.trim()));
    if (badLink) bad(badLink, '链接要以 http:// 或 https:// 开头');
    if (t === 'report' && !d.evidence.uploads.length && !d.evidence.links.length) { toast('举报需要视频：上传文件或贴一个链接'); first ||= drop; }
    if (t === 'report' && !d.evidence.playerlist) bad(form.playerlist, '请选一项');
  }
  if (n === 4) {
    if (!d.reporter.nickname) bad(form.nickname, '留一个称呼');
    if (d.reporter.contactType && !d.reporter.contact) bad(form.contact, '填上号码，或者选“不留”');
  }
  if (first) { first.focus?.({ preventScroll: true }); first.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); return false; }
  return true;
}

function go(n) {
  step = Math.max(0, Math.min(5, n));
  steps.forEach((s) => (s.hidden = +s.dataset.step !== step));
  $$('#stepper li').forEach((li) => { const k = +li.dataset.step; li.classList.toggle('is-on', k === step); li.classList.toggle('is-done', k < step); });
  $('#prev').hidden = step === 0;
  $('#next').hidden = step === 5;
  $('#submit').hidden = step !== 5;
  if (step === 5) renderReview();
  const top = $('#form').getBoundingClientRect().top + scrollY - 90;
  if (scrollY > top) scrollTo({ top, behavior: 'smooth' });
  steps[step].querySelector('h2')?.setAttribute('tabindex', '-1');
  steps[step].querySelector('h2')?.focus({ preventScroll: true });
  save();
}

function renderReview() {
  const d = collect();
  const t = d.type;
  const TL = { report: '举报其他玩家', game_appeal: '游戏封禁申诉（协助整理）', discord_appeal: 'Discord 封禁申诉（协助整理）' };
  const row = (k, v) => `<div><dt>${k}</dt><dd>${v || '<span class="mute">未填</span>'}</dd></div>`;
  const who = t === 'report'
    ? d.targets.map((x) => { const r = lookups.get(x.username.toLowerCase()); return `@${esc(r?.name || x.username)}${r?.found ? ` <span class="mute">（ID ${r.id}）</span>` : ''}${x.characterName ? ` · 角色名 ${esc(x.characterName)}` : ''}`; }).join('<br>')
    : esc(t === 'discord_appeal' ? d.appealDiscord : d.targets[0]?.username);
  $('#review').innerHTML = `<dl class="rv">
    ${row('类型', TL[t])}
    ${row(t === 'report' ? '被举报人' : '被封账号', who)}
    ${row('时间', esc([d.incident.date, d.incident.time, { 'Asia/Shanghai': '北京时间', 'Asia/Tokyo': '日本时间', UTC: 'UTC', other: '其他时区' }[d.incident.tz]].filter(Boolean).join(' ')))}
    ${row('地点', esc([d.incident.server === 'private' ? '私人服务器' : d.incident.server === 'public' ? '公开服务器' : '', d.incident.location].filter(Boolean).join(' · ')))}
    ${t === 'report' ? row('类别', esc(CATEGORY_CN[d.incident.category]?.t || '')) : ''}
    ${row('经过', `<span class="pre">${esc(d.incident.narrative)}</span>`)}
    ${row('聊天原文', d.chat.length ? `${d.chat.length} 条` : '')}
    ${row('证据', [d.evidence.uploads.length ? `${d.evidence.uploads.length} 个文件` : '', d.evidence.links.length ? `${d.evidence.links.length} 个链接` : ''].filter(Boolean).join('，'))}
    ${t === 'report' ? row('PLAYERLIST', { yes: '录像里打开了', no: '没有打开', unsure: '不确定' }[d.evidence.playerlist] + (d.evidence.playerlistAt ? `（${esc(d.evidence.playerlistAt)}）` : '')) : ''}
    ${row('称呼', esc(d.reporter.nickname))}
    ${row('联系方式', d.reporter.contactType ? esc(d.reporter.contactType.toUpperCase() + ' ' + d.reporter.contact) : '不留')}
  </dl>`;
}

// ---------- 提交 ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#submitErr');
  errBox.hidden = true;
  if (!$('#consent').checked) { errBox.textContent = '请先勾选确认。'; errBox.hidden = false; return; }
  for (const n of [1, 2, 3, 4]) if (!(await validate(n))) { go(n); return; }
  const d = collect();
  const btn = $('#submit');
  btn.classList.add('is-busy');
  $('.pill__t', btn).textContent = '提交中…';
  try {
    const payload = { ...d, consent: true, hp: $('#hp').value };
    if (d.type === 'discord_appeal') payload.reporter.appealAccount = d.appealDiscord;
    delete payload.appealDiscord;
    const r = await call('/api/cases', { method: 'POST', body: payload });
    local.del(DRAFT);
    showReceipt(r, d);
  } catch (ex) {
    errBox.textContent = ex instanceof ApiError ? ex.message : '提交失败，请稍后重试。';
    errBox.hidden = false;
  } finally {
    btn.classList.remove('is-busy');
    $('.pill__t', btn).textContent = '提交材料';
  }
});

function showReceipt(r, d) {
  form.hidden = true;
  $('.form-aside').classList.add('is-done');
  const rc = $('#receipt');
  rc.hidden = false;
  $('#rcId').textContent = r.id;
  $('#rcKey').textContent = r.key;
  const remember = () => {
    const list = local.get('kyukosha.cases', []).filter((x) => x.id !== r.id);
    if ($('#rcRemember').checked) list.unshift({ id: r.id, key: r.key, at: new Date().toISOString() });
    local.set('kyukosha.cases', list.slice(0, 10));
  };
  remember();
  $('#rcRemember').addEventListener('change', remember);
  const text = `旧校舍 · 举报材料回执\n案件编号：${r.id}\n查询码：${r.key}\n查询地址：${location.origin}/kyukosha/track/\n提交时间：${new Date().toLocaleString('zh-CN')}\n\n查询码只显示这一次，请妥善保存，不要发给别人。`;
  $('#rcCopy').onclick = () => copyText(`案件编号 ${r.id}\n查询码 ${r.key}`).then((ok) => toast(ok ? '已复制' : '复制失败，请手动抄下'));
  $('#rcSave').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `旧校舍回执-${r.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  if (d.type === 'report' && d.targets.length > 1) $('#rcTargets').textContent = `这次填了 ${d.targets.length} 个人。官方表单一次只能报一个人，协助者会分开提交，进度在同一个案件里记录。`;
  if (d.type !== 'report') $('#rcTargets').textContent = '申诉需要你本人提交。材料整理好以后，查询页会给出逐步说明和可以直接粘贴的英文内容。';
  scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- 事件 ----------
form.addEventListener('change', (e) => {
  if (e.target.name === 'type') applyType();
  if (e.target.name === 'playerlist') $('#plWarn').hidden = e.target.value !== 'no';
  save();
});
form.addEventListener('input', (e) => {
  if (e.target.name === 'narrative') $('#narrCount').textContent = e.target.value.length;
  if (e.target.classList.contains('t-user')) showLookup(e.target.closest('.trow'), null);
  save();
});
form.addEventListener('click', async (e) => {
  const x = e.target.closest('.row-x:not(.f-del)');
  if (x) { const host = x.parentElement; const box = host.parentElement; if (box.children.length > 1) host.remove(); else host.querySelectorAll('input,textarea').forEach((i) => (i.value = '')); save(); }
  const chk = e.target.closest('.t-check');
  if (chk) {
    const row = chk.closest('.trow');
    const name = $('.t-user', row).value.trim().replace(/^@/, '');
    if (!name) return;
    chk.disabled = true;
    try { const [r] = await lookup([name]); showLookup(row, r); } catch (ex) { toast(ex.message); }
    chk.disabled = false;
  }
});
$('#checkAppeal').addEventListener('click', async () => {
  const name = form.appealRoblox.value.trim().replace(/^@/, '');
  if (!name) return;
  try { const [r] = await lookup([name]); $('#appealRes').textContent = r?.found ? `找到了：@${r.name}（显示名称 ${r.displayName}，ID ${r.id}）` : '没查到这个用户名'; } catch (ex) { toast(ex.message); }
});
$('#addTarget').addEventListener('click', () => { if ($$('.trow').length < 5) targetRow(); else toast('一次最多 5 个人'); });
$('#addChat').addEventListener('click', () => chatRow());
$('#addLink').addEventListener('click', () => linkRow());
$('#next').addEventListener('click', async () => { if (step === 0 || (await validate(step))) go(step + 1); });
$('#prev').addEventListener('click', () => go(step - 1));
$('#stepper').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const n = +li.dataset.step;
  if (n <= step) return go(n);
  for (let k = Math.max(1, step); k < n; k++) if (!(await validate(k))) return go(k);
  go(n);
});
addEventListener('beforeunload', (e) => { if (files.some((f) => f.status === 'uploading')) { e.preventDefault(); e.returnValue = ''; } });

restore();
applyType();
$('#narrCount').textContent = form.narrative.value.length;
const d0 = local.get(DRAFT);
go(d0?.step && d0.step < 5 ? d0.step : 0);
