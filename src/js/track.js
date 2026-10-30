import { $, $$, esc, toast, fmtTime, copyText } from './common.js';
import '../styles/form.css';
import '../styles/track.css';
import { call, uploadFile, fmtSize, local, STATUS_CN, CATEGORY_CN } from './api.js';

const login = $('#login');
let cred = null;
const files = [];

function savedList() {
  const list = local.get('kyukosha.cases', []);
  $('#saved').innerHTML = list.length ? '本机记住的案件：' + list.map((c, i) => `<button type="button" class="link-u" data-i="${i}">${esc(c.id)}</button>`).join(' ') : '';
  return list;
}
$('#saved').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const c = savedList()[+b.dataset.i];
  login.id.value = c.id; login.key.value = c.key;
  login.requestSubmit();
});

login.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = login.id.value.trim().toUpperCase(), key = login.key.value.trim().toUpperCase();
  const err = $('#loginErr');
  err.hidden = true;
  if (!id || !key) { err.textContent = '两项都要填。'; err.hidden = false; return; }
  try {
    const d = await call('/api/cases/view', { method: 'POST', body: { id, key } });
    cred = { id, key };
    render(d.case);
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

const STAGES = ['received', 'reviewing', 'needs_info', 'ready', 'submitted', 'result'];
function render(c) {
  const box = $('#case');
  box.hidden = false;
  const st = STATUS_CN[c.status] || { t: c.status, en: '', d: '' };
  $('#cId').textContent = `${c.id} · ${{ report: '举报', game_appeal: '游戏封禁申诉', discord_appeal: 'Discord 封禁申诉' }[c.type]} · ${fmtTime(c.createdAt)} 提交`;
  $('#cStatus').textContent = st.t;
  let desc = st.d;
  if (c.type !== 'report' && c.status === 'ready') desc = '材料已经整理好，请照下面的步骤本人提交。';
  if (c.status === 'submitted' && c.submission) desc = `${c.submission.at} 通过 ${c.submission.method} 提交。官方处理通常要几天；7 天内没人处理，Blox.report 会自动驳回，到时我们会重新提交。`;
  if (c.status === 'result' && c.result) desc = { approved: '官方已经批准这份举报。封禁有时会晚一点生效。', dismissed: '这份举报被驳回或超时自动关闭了，见下方说明。', other: '官方有回复，见下方说明。' }[c.result.outcome] + (c.result.text ? ' ' + c.result.text : '');
  if (c.status === 'closed' && c.closed?.reason) desc = c.closed.reason;
  $('#cDesc').textContent = desc;
  const stamp = $('#cStamp');
  stamp.innerHTML = `${st.t}<small>${st.en}</small>`;
  stamp.classList.toggle('is-ok', c.status === 'result' && c.result?.outcome === 'approved');

  const req = $('#cRequest');
  req.hidden = !c.request;
  if (c.request) req.innerHTML = `<b>协助者请你补充（${fmtTime(c.request.at)}）</b><br><span class="pre">${esc(c.request.message)}</span>`;

  const ap = $('#cAppeal');
  ap.hidden = !(c.type !== 'report' && c.appealPack);
  if (!ap.hidden) {
    const steps = c.type === 'game_appeal'
      ? `<ol><li>打开 Discord，进入 <a class="link-u" href="https://discord.gg/nEd7NXkh2p" target="_blank" rel="noopener">(学乱) Gakuran Support</a>，找到左侧 [Appeals] 分类下的 <b>#game-appeals</b>。</li><li>点 Blox.report 消息下面的 <b>Appeal Ban</b> 按钮，会弹出三栏表单。</li><li>把下面三段分别复制进去，点“提交”。每栏最多 250 个字符，已经按长度写好。</li><li>不要重复提交，也不要私信催员工；结果会通过 Blox.report 通知你。</li></ol>`
      : `<ol><li>用<b>被封的那个 Discord 账号</b>打开 <a class="link-u" href="https://appeal.gg/tzqBhsK7RM" target="_blank" rel="noopener">appeal.gg/tzqBhsK7RM</a>，点 Log in with Discord 登录。</li><li>按页面上的问题填写，把下面对应的英文复制进去。</li><li>结果会由 @appeal.gg 私信告诉你。</li></ol>`;
    ap.innerHTML = `<b>请你本人提交申诉</b>${steps}<div class="pack">${Object.entries(c.appealPack).map(([k, v]) => `<div class="pack__row"><span class="mono">${esc(k)}</span><p>${esc(v)}</p><button type="button" class="link-u" data-copy="${esc(v)}">复制</button></div>`).join('')}</div>`;
  }

  // 顶部进度条
  const RAIL = ['received', 'reviewing', 'ready', 'submitted', 'result'];
  const at = c.status === 'needs_info' ? 1 : c.status === 'closed' ? -1 : RAIL.indexOf(c.status);
  $$('#rail li').forEach((li, i) => {
    li.classList.toggle('is-done', at >= 0 && i < at);
    li.classList.toggle('is-on', i === at && c.status !== 'needs_info');
    li.classList.toggle('is-warn', i === at && c.status === 'needs_info');
  });
  const reached = STAGES.indexOf(c.status);
  const evs = c.events.slice().reverse();
  $('#cEvents').innerHTML = evs.map((e) => `<li class="tl__it tl__it--${e.actor}"><span class="mono tl__t">${fmtTime(e.at)}</span><b>${esc((STATUS_CN[e.type] || {}).t || { created: '已收件', supplement: '你补充了材料', message: '协助者留言', reopened: '重新打开' }[e.type] || e.type)}</b>${e.text ? `<p class="pre">${esc(e.text)}</p>` : ''}</li>`).join('');
  box.style.setProperty('--progress', Math.max(0, reached) / (STAGES.length - 1));

  const t = c.targets || [];
  const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  $('#cSummary').innerHTML = [
    row(c.type === 'report' ? '被举报人' : '账号', t.map((x) => `@${esc(x.name || x.requested)}${x.id ? ` <span class="mono mute">ID ${x.id}</span>` : ''}${x.found ? '' : ' <span class="mute">（未查到）</span>'}`).join('<br>')),
    row('时间', esc([c.incident.date, c.incident.time].filter(Boolean).join(' '))),
    row('地点', esc(c.incident.location)),
    c.type === 'report' && c.incident.category !== 'other' ? row('类别', esc(CATEGORY_CN[c.incident.category]?.t || '')) : '',
    row('经过', `<span class="pre">${esc(c.incident.narrative)}</span>`),
    row('聊天原文', c.chat?.length ? `${c.chat.length} 条` : ''),
    row('补充', c.extra ? `<span class="pre">${esc(c.extra)}</span>` : ''),
    row('文件', c.evidence.files.map((f) => `${esc(f.name)} <span class="mute">${fmtSize(f.size)}</span>`).join('<br>')),
    row('链接', c.evidence.links.map((l) => `<a class="link-u" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.host || l.url)}</a>${l.note ? ' · ' + esc(l.note) : ''}`).join('<br>')),
  ].join('');

  $('#reply').hidden = c.status === 'closed';
  login.hidden = true;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#case').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) copyText(b.dataset.copy).then((ok) => toast(ok ? '已复制' : '复制失败，请手动选中复制'));
});

// ---------- 补充 ----------
function linkRow() {
  const el = document.createElement('div');
  el.className = 'lrow';
  el.innerHTML = '<input class="input l-url" type="url" maxlength="600" placeholder="https://..." inputmode="url"><input class="input l-note" maxlength="200" placeholder="说明 / 提取码"><button type="button" class="row-x" aria-label="删除">删除</button>';
  $('#links').appendChild(el);
}
linkRow();
$('#addLink').addEventListener('click', linkRow);
$('#links').addEventListener('click', (e) => { const x = e.target.closest('.row-x'); if (x) { if ($$('.lrow').length > 1) x.parentElement.remove(); else $$('input', x.parentElement).forEach((i) => (i.value = '')); } });

function renderFiles() {
  $('#files').innerHTML = files.map((f, i) => `<li class="file ${f.status}"><span class="file__name">${esc(f.name)}</span><span class="file__size mono">${fmtSize(f.size)}</span><span class="file__bar"><i style="width:${Math.round(f.progress * 100)}%"></i></span><span class="file__st">${f.status === 'done' ? '已上传' : f.status === 'error' ? esc(f.err) : Math.round(f.progress * 100) + '%'}</span><button type="button" class="row-x" data-i="${i}">移除</button></li>`).join('');
}
async function addFiles(list) {
  for (const file of list) {
    if (file.size > 200 * 1048576) { toast(`${file.name} 超过 200MB`); continue; }
    const f = { file, name: file.name, size: file.size, status: 'uploading', progress: 0 };
    files.push(f); renderFiles();
    try { const r = await uploadFile(file, { onProgress: (p) => { f.progress = p; renderFiles(); } }); Object.assign(f, r, { status: 'done', progress: 1 }); }
    catch (ex) { f.status = 'error'; f.err = ex.message; }
    renderFiles();
  }
}
const drop = $('#drop'), input = $('#fileInput');
drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
$('#files').addEventListener('click', (e) => { const b = e.target.closest('.row-x'); if (b) { files.splice(+b.dataset.i, 1); renderFiles(); } });

$('#reply').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#replyErr');
  err.hidden = true;
  if (files.some((f) => f.status === 'uploading')) { err.textContent = '文件还在上传。'; err.hidden = false; return; }
  const links = $$('#links .lrow').map((r) => ({ url: $('.l-url', r).value.trim(), note: $('.l-note', r).value.trim() })).filter((l) => l.url);
  const body = { ...cred, text: $('#reply').text.value.trim(), links, uploads: files.filter((f) => f.status === 'done').map((f) => ({ id: f.id, token: f.token })) };
  if (!body.text && !links.length && !body.uploads.length) { err.textContent = '补充内容是空的。'; err.hidden = false; return; }
  const btn = $('#replyBtn');
  btn.classList.add('is-busy');
  try {
    const d = await call('/api/cases/reply', { method: 'POST', body });
    files.length = 0; renderFiles();
    $('#reply').reset(); $('#links').innerHTML = ''; linkRow();
    render(d.case);
    toast('补充已提交');
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  btn.classList.remove('is-busy');
});

savedList();
