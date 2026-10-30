import { BASE, $, $$, esc, toast, copyText } from './common.js';
import '../styles/form.css';
import '../styles/report.css';
import { call, uploadFile, fmtSize, local, ApiError } from './api.js';
import { vision } from './vision.js';

const DRAFT = 'kyukosha.draft.v2';
const form = $('#form');
const files = []; // {file,name,size,status,progress,id,token,err}
const found = new Map(); // 输入 -> 查询结果
let reached = 0;

// ---------- 左侧画面 ----------
const SUBJECT = { x: 0.24, y: 0.16, w: 0.56, h: 0.82 };
const scene = vision($('#sceneVision'), {
  src: `${BASE}mirror/images/${encodeURI('男性/制服/019_True Delinquent.png')}`,
  fit: 'cover', focus: [0.5, 0.45], points: 80, mesh: 0.3, meshFrom: [0.5, 0.3], seed: 5,
  crossAt: [0.5, 0.5], contrast: 1.55, dim: 0.9, glitch: true,
  chain: innerWidth > 960 ? { from: [0.08, 0.06], to: [0.22, 0.95], n: 6, r: 0.07 } : null,
  boxes: [{ ...SUBJECT, label: 'SUBJECT · 待确认', dashed: true }],
});

// ---------- 对话推进 ----------
function show(n, focus = true) {
  reached = Math.max(reached, n);
  $$('.dlg[data-step]').forEach((d) => { if (+d.dataset.step <= reached) d.hidden = false; });
  $$('#steps li').forEach((li) => { const s = +li.dataset.s; li.classList.toggle('is-on', s === n); li.classList.toggle('is-done', s < reached || (s === reached && s < n)); });
  const block = $(`.dlg[data-step="${n}"]`);
  if (focus && block) {
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => block.querySelector('input:not([type=checkbox]),textarea,button.opt')?.focus({ preventScroll: true }), 450);
  }
  save();
}

function line(host, html, cls = '') {
  const p = document.createElement('p');
  p.className = 'dl dl--new ' + cls;
  p.innerHTML = html;
  host.appendChild(p);
  requestAnimationFrame(() => p.classList.remove('dl--new'));
  return p;
}

// ---------- 01 对方 ID ----------
function targetInputs() { return [$('#target'), ...$$('#targetsMore .slot__in')]; }
function addTargetRow(v = '') {
  if (targetInputs().length >= 5) return toast('一次最多 5 个人');
  const row = document.createElement('div');
  row.className = 'slot__row slot__row--more';
  row.innerHTML = `<input class="input slot__in" maxlength="120" placeholder="另一个人的用户名或 ID" autocapitalize="off" spellcheck="false" value="${esc(v)}"><button type="button" class="slot__x" aria-label="删掉这一行">×</button>`;
  $('#targetsMore').appendChild(row);
  row.querySelector('input').focus();
}
$('#addTarget').addEventListener('click', () => addTargetRow());
$('#targetsMore').addEventListener('click', (e) => { if (e.target.closest('.slot__x')) { e.target.closest('.slot__row').remove(); save(); } });

async function lookupAll() {
  const vals = targetInputs().map((i) => i.value.trim().replace(/^@/, '')).filter(Boolean);
  const log = $('#lookupLog');
  if (!vals.length) { $('#target').setAttribute('aria-invalid', 'true'); $('#target').focus(); return false; }
  const btn = $('#lookupBtn');
  btn.classList.add('is-busy');
  log.innerHTML = '';
  try {
    const need = vals.filter((v) => !found.has(v.toLowerCase()));
    if (need.length) {
      const d = await call('/api/roblox/lookup', { method: 'POST', body: { usernames: need } });
      d.users.forEach((u) => found.set(u.requested.toLowerCase(), u));
    }
  } catch (ex) {
    line(log, `<span class="sk sk--fys">警觉</span><span class="chk">[连接失败]</span> — ${esc(ex.message)}`);
    btn.classList.remove('is-busy');
    return false;
  }
  btn.classList.remove('is-busy');
  let allOk = true;
  const hits = [];
  vals.forEach((v, i) => {
    const r = found.get(v.toLowerCase());
    const input = targetInputs().find((x) => x.value.trim().replace(/^@/, '') === v);
    if (r?.found) {
      hits.push(r);
      input?.removeAttribute('aria-invalid');
      line(log, `<span class="sk sk--int">辨认</span><span class="chk">[核对：成功]</span> — <b>@${esc(r.name)}</b>，用户 ID <span class="mono">${r.id}</span>，显示名称 ${esc(r.displayName)}。<a class="link-u" href="https://www.roblox.com/users/${r.id}/profile" target="_blank" rel="noopener">打开主页对一下</a>`);
    } else {
      allOk = false;
      input?.setAttribute('aria-invalid', 'true');
      line(log, `<span class="sk sk--int">辨认</span><span class="chk chk--fail">[核对：失败]</span> — Roblox 上没有「${esc(v)}」。看看大小写和下划线，或者直接给数字 ID。`);
    }
  });
  $('#idNext').hidden = !allOk;
  if (hits.length) {
    scene.setBoxes([{ ...SUBJECT, label: hits.map((h) => `@${h.name}`).join(' · ').slice(0, 40), tone: 'accent', sub: `ROBLOX ID ${hits.map((h) => h.id).join(' / ')}` }]);
    $('#sceneCap').textContent = `SUBJECT · @${hits[0].name} · ID ${hits[0].id}`;
  }
  save();
  return allOk;
}
$('#lookupBtn').addEventListener('click', lookupAll);
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList?.contains('slot__in')) { e.preventDefault(); lookupAll(); }
});
form.addEventListener('input', (e) => {
  if (e.target.classList?.contains('slot__in')) { $('#idNext').hidden = true; e.target.removeAttribute('aria-invalid'); }
  save();
});

// ---------- 02 视频 ----------
$$('.tabs [data-tab]').forEach((t) => t.addEventListener('click', () => {
  $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
  $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
}));
function linkRow(v = {}) {
  const el = document.createElement('div');
  el.className = 'lrow';
  el.innerHTML = `<input class="input l-url" type="url" maxlength="600" placeholder="https://..." inputmode="url" value="${esc(v.url || '')}"><input class="input l-note" maxlength="200" placeholder="说明 / 提取码" value="${esc(v.note || '')}"><button type="button" class="slot__x" aria-label="删掉这个链接">×</button>`;
  $('#links').appendChild(el);
}
$('#addLink').addEventListener('click', () => linkRow());
$('#links').addEventListener('click', (e) => { const x = e.target.closest('.slot__x'); if (x) { if ($$('#links .lrow').length > 1) x.parentElement.remove(); else $$('input', x.parentElement).forEach((i) => (i.value = '')); videoState(); save(); } });
$('#links').addEventListener('input', videoState);

function renderFiles() {
  $('#files').innerHTML = files.map((f, i) => `
    <li class="file ${f.status}">
      <span class="file__name">${esc(f.name)}</span>
      <span class="file__size mono">${fmtSize(f.size)}</span>
      <span class="file__st mono">${f.status === 'done' ? 'OK' : f.status === 'error' ? '失败' : f.status === 'queued' ? '排队' : Math.round(f.progress * 100) + '%'}</span>
      <button type="button" class="slot__x" data-i="${i}" aria-label="移除">×</button>
      <span class="file__bar"><i style="width:${Math.round(f.progress * 100)}%"></i></span>
      ${f.status === 'error' ? `<span class="file__err">${esc(f.err || '')} <button type="button" class="link-u f-retry" data-i="${i}">重试</button></span>` : ''}
    </li>`).join('');
}
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  for (;;) {
    const f = files.find((x) => x.status === 'queued');
    if (!f) break;
    f.status = 'uploading'; f.progress = 0; renderFiles();
    try {
      const r = await uploadFile(f.file, { onProgress: (p) => { f.progress = p; renderFiles(); } });
      Object.assign(f, { id: r.id, token: r.token, status: 'done', progress: 1 });
      line($('#videoLog'), `<span class="sk sk--mot">眼力</span><span class="chk">[核对：成功]</span> — 收到「${esc(f.name)}」，${fmtSize(f.size)}。`);
      scene.glitch();
    } catch (ex) { f.status = 'error'; f.err = ex.message; }
    renderFiles(); videoState(); save();
  }
  pumping = false;
}
function addFiles(list) {
  for (const file of list) {
    if (files.length >= 12) { toast('最多 12 个文件'); break; }
    if (file.size > 200 * 1048576) { toast(`${file.name} 超过 200MB，剪掉无关的开头结尾，或者改用链接`); continue; }
    if (!/^(video|image)\//.test(file.type) && !/\.(mkv|flv|wmv|mov|mp4|avi|webm|m4v)$/i.test(file.name)) { toast(`${file.name} 不是视频`); continue; }
    files.push({ file, name: file.name, size: file.size, status: 'queued', progress: 0 });
  }
  renderFiles(); pump();
}
const drop = $('#drop'), fileInput = $('#fileInput');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
$('#files').addEventListener('click', (e) => {
  const x = e.target.closest('.slot__x'), r = e.target.closest('.f-retry');
  if (x) { files.splice(+x.dataset.i, 1); renderFiles(); videoState(); save(); }
  if (r) { const f = files[+r.dataset.i]; if (f.file) { f.status = 'queued'; renderFiles(); pump(); } else toast('这个文件需要重新选择'); }
});

const links = () => $$('#links .lrow').map((r) => ({ url: $('.l-url', r).value.trim(), note: $('.l-note', r).value.trim() })).filter((l) => l.url);
const goodLinks = () => links().filter((l) => /^https?:\/\/\S+\.\S+/i.test(l.url));
function videoState() {
  const has = files.some((f) => f.status === 'done') || goodLinks().length > 0;
  const busy = files.some((f) => f.status === 'uploading' || f.status === 'queued');
  $('#videoNext').hidden = !(has && !busy && $('#notObs').checked);
}
$('#notObs').addEventListener('change', () => {
  videoState();
  if ($('#notObs').checked && (files.some((f) => f.status === 'done') || goodLinks().length)) line($('#videoLog'), '<span class="sk sk--mot">眼力</span><span class="chk">[确认]</span> — 不是 OBS，没剪辑。好。');
  save();
});

// ---------- 推进按钮 ----------
form.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    const n = +go.dataset.go;
    if (n === 2 && !(await lookupAll())) return;
    if (n === 3) {
      if (!$('#notObs').checked) { toast('先确认这段视频不是 OBS 录屏'); return; }
      if (!files.some((f) => f.status === 'done') && !goodLinks().length) { toast('传一个视频，或者贴一个链接'); return; }
    }
    show(n);
  }
  if (e.target.closest('[data-help]')) { $('#helpId').hidden = false; $('#helpId').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  if (e.target.closest('[data-refocus]')) { $('#target').select(); $('#target').focus(); }
});

// ---------- 提交 ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#submitErr');
  err.hidden = true;
  const fail = (m) => { err.textContent = m; err.hidden = false; };
  if (!(await lookupAll())) return fail('对方的 Roblox 账号还没核对通过。');
  if (files.some((f) => f.status === 'uploading' || f.status === 'queued')) return fail('视频还在上传，等它传完。');
  if (!files.some((f) => f.status === 'done') && !goodLinks().length) return fail('还没有视频。');
  if (!$('#notObs').checked) return fail('请确认视频不是 OBS 录屏。');
  if (!$('#consent').checked) return fail('请勾选“可以，照这样提交”。');
  const btn = $('#submit');
  btn.classList.add('is-busy');
  try {
    const targets = targetInputs().map((i) => i.value.trim().replace(/^@/, '')).filter(Boolean).map((username) => ({ username }));
    const r = await call('/api/cases', {
      method: 'POST',
      body: {
        type: 'report', consent: true, hp: $('#hp').value, targets,
        evidence: { links: goodLinks(), uploads: files.filter((f) => f.status === 'done').map((f) => ({ id: f.id, token: f.token })), notObs: true },
        extra: $('#note').value.trim(),
        reporter: { contactType: $('#contactType').value, contact: $('#contact').value.trim() },
      },
    });
    local.del(DRAFT);
    receipt(r);
  } catch (ex) {
    fail(ex instanceof ApiError ? ex.message : '提交失败，请稍后再试。');
  }
  btn.classList.remove('is-busy');
});

function receipt(r) {
  form.hidden = true;
  $$('#steps li').forEach((li) => { li.classList.remove('is-on'); li.classList.add('is-done'); });
  const rc = $('#receipt');
  rc.hidden = false;
  $('#rcId').textContent = r.id;
  $('#rcKey').textContent = r.key;
  scene.setBoxes([{ ...SUBJECT, label: `已收件 · ${r.id}`, tone: 'accent', sub: r.targets?.map((t) => '@' + t.name).join(' · ') }]);
  const remember = () => {
    const list = local.get('kyukosha.cases', []).filter((x) => x.id !== r.id);
    if ($('#rcRemember').checked) list.unshift({ id: r.id, key: r.key, at: new Date().toISOString() });
    local.set('kyukosha.cases', list.slice(0, 10));
  };
  remember();
  $('#rcRemember').addEventListener('change', remember);
  $('#rcCopy').onclick = () => copyText(`案件编号 ${r.id}\n查询码 ${r.key}`).then((ok) => toast(ok ? '已复制' : '复制失败，请手动抄下'));
  $('#rcSave').onclick = () => {
    const text = `旧校舍 · 举报回执\n案件编号：${r.id}\n查询码：${r.key}\n查询地址：${location.origin}${BASE}track/\n提交时间：${new Date().toLocaleString('zh-CN')}\n\n查询码只显示这一次，请保存好，不要发给别人。`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `旧校舍回执-${r.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  rc.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 草稿（只存在这台设备） ----------
let st;
function save() {
  clearTimeout(st);
  st = setTimeout(() => local.set(DRAFT, {
    reached,
    targets: targetInputs().map((i) => i.value),
    links: links(),
    files: files.filter((f) => f.status === 'done').map(({ id, token, name, size }) => ({ id, token, name, size })),
    notObs: $('#notObs').checked, note: $('#note').value, contactType: $('#contactType').value, contact: $('#contact').value,
  }), 300);
}
function restore() {
  const d = local.get(DRAFT);
  if (!d) { linkRow(); return; }
  $('#target').value = d.targets?.[0] || '';
  (d.targets || []).slice(1).filter(Boolean).forEach((v) => addTargetRow(v));
  (d.links?.length ? d.links : [{}]).forEach(linkRow);
  (d.files || []).forEach((f) => files.push({ ...f, status: 'done', progress: 1 }));
  renderFiles();
  $('#notObs').checked = !!d.notObs;
  $('#note').value = d.note || ''; $('#contactType').value = d.contactType || ''; $('#contact').value = d.contact || '';
  if (d.reached) { show(Math.min(d.reached, 3), false); if (d.reached >= 1 && $('#target').value) lookupAll(); videoState(); toast('接着上次没交完的继续'); }
}
addEventListener('beforeunload', (e) => { if (files.some((f) => f.status === 'uploading')) { e.preventDefault(); e.returnValue = ''; } });
form.addEventListener('change', save);
restore();
