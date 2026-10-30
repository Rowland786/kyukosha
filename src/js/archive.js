import { BASE, $, $$, esc, toast, copyText } from './common.js';
import '../styles/archive.css';
import { vision } from './vision.js';

// 头部画面：图鉴 No.0016 Rebel 实机截图
const av = $('#arcVision');
if (av) vision(av, {
  src: `${BASE}mirror/images/${encodeURI('男性/制服/016_Rebel.png')}`,
  fit: 'contain', scale: innerWidth > 960 ? 1.05 : 1.2, align: innerWidth > 960 ? [0.58, 0.55] : [0.5, 0.2],
  fade: 0.2, points: 70, mesh: 0.3, meshFrom: [0.5, 0.3], seed: 13, contrast: 1.45, dim: 0.62,
  crossAt: [0.58, 0.5], chain: innerWidth > 960 ? { from: [0.68, 0.12], to: [0.98, 0.86], n: 5, r: 0.07 } : null,
  boxes: [{ x: 0.2, y: 0.18, w: 0.6, h: 0.8, label: 'No.0016 · Rebel · ???', dashed: true }],
});

// 分类顺序、种族中文名和两段数据说明沿用 Kaglorn 原站的写法
const GENDERS = ['全部', '男性', '女性', '通用'];
const VIEWS = [{ k: 'category', t: '部位' }, { k: 'rarity', t: '稀有度' }, { k: 'ethnicity', t: '种族' }];
const CAT_ORDER = ['制服', '发型', '面部', '头部饰品', '颈部', '手臂', '腰部', '背部', '滑板', '终结技'];
const RAR_ORDER = ['Legendary', 'Mythic', 'Epic', 'Rare', 'Uncommon', 'Common', 'Unique', '???', ''];
const ETH_ORDER = ['Japanese', 'European', 'African', 'Indian', 'MiddleEastern', 'Latino', 'Latina', ''];
const ETH_CN = { Japanese: '日系', European: '欧美', African: '非洲', Indian: '印度', MiddleEastern: '中东', Latino: '拉美（男）', Latina: '拉美（女）' };
const ORIGIN = 'https://kaglorn.github.io/gakuran-clothes/';

const state = { g: '全部', view: 'category', f: '全部', q: '' };
let DATA = [], META = null, current = [], lbIndex = -1;

const field = (d) => (state.view === 'category' ? d.category : state.view === 'rarity' ? d.rarity_base || '' : d.ethnicity || '');
const label = (v) => (v === '' ? '未标注' : state.view === 'ethnicity' ? (ETH_CN[v] ? `${ETH_CN[v]} · ${v}` : v) : v);
const orderOf = (v) => { const a = state.view === 'category' ? CAT_ORDER : state.view === 'rarity' ? RAR_ORDER : ETH_ORDER; const i = a.indexOf(v); return i < 0 ? 999 : i; };
const pool = () => DATA.filter((d) => state.g === '全部' || d.gender === state.g);
// 合集图切出的条目，名称和 ID 印在图上，原表没录文字（见原 README）
const noName = (d) => (d.source === '合集图' ? '名称见图（原表未录）' : '原资料无名称');
const no = (d) => 'No.' + String(d.i).padStart(4, '0');
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB');
const fileUrl = (f) => BASE + 'mirror/' + f.split('/').map(encodeURIComponent).join('/');
const originUrl = (f) => ORIGIN + f.split('/').map(encodeURIComponent).join('/');

function readURL() {
  const p = new URLSearchParams(location.search);
  if (GENDERS.includes(p.get('g'))) state.g = p.get('g');
  if (VIEWS.some((v) => v.k === p.get('v'))) state.view = p.get('v');
  if (p.get('f') !== null) state.f = p.get('f');
  state.q = p.get('q') || '';
  $('#q').value = state.q;
}
function writeURL() {
  const p = new URLSearchParams();
  if (state.g !== '全部') p.set('g', state.g);
  if (state.view !== 'category') p.set('v', state.view);
  if (state.f !== '全部') p.set('f', state.f);
  if (state.q) p.set('q', state.q);
  const s = p.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
}

function buildGender() {
  $('#genderSeg').innerHTML = GENDERS.map((g) => {
    const n = g === '全部' ? DATA.length : DATA.filter((d) => d.gender === g).length;
    return `<button role="tab" aria-selected="${g === state.g}" data-g="${g}">${g}<b>${n}</b></button>`;
  }).join('');
}
function buildView() {
  $('#viewSeg').innerHTML = VIEWS.map((v) => `<button role="tab" aria-selected="${v.k === state.view}" data-v="${v.k}">${v.t}</button>`).join('');
}
function buildChips() {
  const p = pool();
  const m = new Map();
  p.forEach((d) => { const k = field(d); m.set(k, (m.get(k) || 0) + 1); });
  const keys = [...m.keys()].sort((a, b) => orderOf(a) - orderOf(b));
  if (state.f !== '全部' && !m.has(state.f)) state.f = '全部';
  const allN = state.view === 'ethnicity' ? p.filter((d) => d.ethnicity).length : p.length;
  $('#chips').innerHTML = `<button class="chip" aria-pressed="${state.f === '全部'}" data-f="全部">全部<b>${allN}</b></button>` +
    keys.filter((k) => !(state.view === 'ethnicity' && k === '')).map((k) => `<button class="chip" aria-pressed="${state.f === k}" data-f="${esc(k)}">${esc(label(k))}<b>${m.get(k)}</b></button>`).join('');
  const note = $('#note');
  if (state.view === 'rarity') {
    const withR = p.filter((d) => d.rarity_base).length;
    note.textContent = `看板正文只给制服、滑板、终结技标了稀有度，共 ${withR} 件；其余 ${p.length - withR} 件归入“未标注”。（说明沿用原站）`;
    note.hidden = false;
  } else if (state.view === 'ethnicity') {
    const withE = p.filter((d) => d.ethnicity).length;
    note.textContent = `种族信息来自发型目录页的标题，共 ${withE} 件；其他部位没有种族数据，这个视角下不显示。（说明沿用原站）`;
    note.hidden = false;
  } else note.hidden = true;
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  return pool().filter((d) => {
    if (state.view === 'ethnicity' && !d.ethnicity) return false;
    if (state.f !== '全部' && field(d) !== state.f) return false;
    if (q) {
      const hay = [d.name, d.category, d.rarity, d.rarity_base, d.ethnicity, ETH_CN[d.ethnicity], d.card, d.gender, d.sheet, no(d), String(d.i)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function card(d, idx) {
  const wide = d.w / d.h > 1.4;
  const tag = [d.gender, state.view === 'category' ? (d.ethnicity ? ETH_CN[d.ethnicity] || d.ethnicity : '') : d.category, state.view !== 'rarity' && d.rarity_base ? d.rarity_base : '']
    .filter(Boolean).join(' · ');
  return `<button class="it${wide ? ' it--wide' : ''}" data-idx="${idx}" aria-label="${esc(no(d) + ' ' + (d.name || noName(d)))}">
    <span class="it__ph"><img loading="lazy" decoding="async" src="${BASE}${d.thumb}" alt="" width="${d.w}" height="${d.h}">
      ${d.rarity_base ? `<span class="it__rb">${esc(d.rarity_base)}</span>` : ''}${d.frames > 1 ? '<span class="it__gif">GIF</span>' : ''}</span>
    <span class="it__meta"><span class="it__no mono">${no(d)}</span><span class="it__nm${d.name ? '' : ' is-none'}">${d.name ? esc(d.name) : noName(d)}</span><span class="it__tag">${esc(tag)}</span></span>
  </button>`;
}

function render() {
  current = filtered();
  $('#count').textContent = `显示 ${current.length} / ${DATA.length} 件`;
  $('#empty').hidden = current.length > 0;
  $('#searchNote').hidden = !state.q.trim();
  const groups = new Map();
  current.forEach((d) => { const k = field(d); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
  const keys = [...groups.keys()].sort((a, b) => orderOf(a) - orderOf(b));
  let html = '', idx = 0;
  const ordered = [];
  for (const k of keys) {
    const items = groups.get(k);
    html += `<div class="sect"><h2 class="sect__t">${esc(label(k))}</h2><span class="sect__n">${items.length}</span><span class="sect__l"></span></div>`;
    html += items.map((d) => { ordered.push(d); return card(d, idx++); }).join('');
  }
  current = ordered;
  $('#grid').innerHTML = html;
  writeURL();
}

function refresh(all = true) { if (all) { buildGender(); buildView(); } buildChips(); render(); }

// ---------- 大图 ----------
const lb = $('#lb');
function openLb(i, push = true) {
  const d = current[i];
  if (!d) return;
  lbIndex = i;
  const img = $('#lbImg');
  $('#lbSpin').hidden = false;
  img.classList.remove('is-ready');
  img.onload = () => { $('#lbSpin').hidden = true; img.classList.add('is-ready'); };
  img.src = fileUrl(d.file);
  img.alt = d.name || no(d);
  img.classList.toggle('is-wide', d.w / d.h > 1.4);
  $('#lbNo').textContent = `${no(d)} · ${i + 1}/${current.length}`;
  $('#lbTitle').textContent = d.name || noName(d);
  $('#lbTitle').classList.toggle('is-none', !d.name);
  const empty = '<span class="mute">原资料为空</span>';
  const rows = [
    ['性别', esc(d.gender)],
    ['部位', esc(d.category)],
    ['种族', d.ethnicity ? `${esc(ETH_CN[d.ethnicity] || '')} <span class="mono">${esc(d.ethnicity)}</span>` : empty],
    ['稀有度（原文）', d.rarity ? esc(d.rarity) : empty],
    ['稀有度（归一）', d.rarity_base ? esc(d.rarity_base) : empty],
    ['资产 ID', d.asset_id ? `<span class="mono">${esc(d.asset_id)}</span>` : empty],
    ['图片来源', esc(d.source) + (d.sheet ? `<br><span class="mute">合集图：${esc(d.sheet)}</span>` : '')],
    ['所属卡片', d.card_url ? `<a class="link-u" href="${esc(d.card_url)}" target="_blank" rel="noopener">${esc(d.card)}</a>` : esc(d.card)],
    ['原始序号', `<span class="mono">${esc(d.no)}</span>`],
    ['文件', `<span class="mono lb__path">${esc(d.file)}</span>`],
    ['尺寸', `${d.w} × ${d.h}${d.frames > 1 ? ` · ${d.frames} 帧动图` : ''} · ${kb(d.bytes)}`],
    ['校验', `<span class="mono lb__path" title="git blob SHA-1，与原仓库一致">${esc(d.sha)}</span>`],
  ];
  $('#lbFields').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#lbActs').innerHTML = `
    <a class="btn btn--solid btn--sm" href="${fileUrl(d.file)}" target="_blank" rel="noopener"><span class="btn__t">打开原图</span><span class="btn__ar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h15M13 6l6 6-6 6"/></svg></span></a>
    <a class="btn btn--sm" href="${fileUrl(d.file)}" download="${esc(d.file.split('/').pop())}"><span class="btn__t">下载</span><span class="btn__ar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg></span></a>
    <div class="lb__src">
      <a class="link-u" href="${originUrl(d.file)}" target="_blank" rel="noopener">在 Kaglorn 原站打开这张图</a>
      ${d.url ? `<a class="link-u" href="${esc(d.url)}" target="_blank" rel="noopener">Trello 原附件</a>` : ''}
      <button class="link-u lb__copy" type="button" data-copy="${esc(location.origin + location.pathname + '#' + no(d))}">复制本条链接</button>
    </div>`;
  if (lb.hidden) {
    lb.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => lb.classList.add('is-open'));
    setTimeout(() => $('.lb__close').focus(), 60);
  }
  if (push) history.replaceState(null, '', location.pathname + location.search + '#' + no(d));
  // 预取前后两张
  [i - 1, i + 1].forEach((j) => { if (current[j]) new Image().src = fileUrl(current[j].file); });
}
function closeLb() {
  lb.classList.remove('is-open');
  document.documentElement.style.overflow = '';
  setTimeout(() => (lb.hidden = true), 280);
  history.replaceState(null, '', location.pathname + location.search);
  const btn = $(`.it[data-idx="${lbIndex}"]`);
  btn?.focus({ preventScroll: true });
}
const step = (k) => { if (current.length) openLb((lbIndex + k + current.length) % current.length); };

function bind() {
  $('#genderSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.g = b.dataset.g; state.f = '全部'; refresh(); });
  $('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.view = b.dataset.v; state.f = '全部'; refresh(); });
  $('#chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.f = b.dataset.f; refresh(false); });
  let t;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); }, 120); });
  $('#grid').addEventListener('click', (e) => { const b = e.target.closest('.it'); if (b) openLb(+b.dataset.idx); });
  lb.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeLb();
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy).then((ok) => toast(ok ? '链接已复制' : '复制失败，请手动复制地址栏'));
  });
  $('#lbPrev').addEventListener('click', () => step(-1));
  $('#lbNext').addEventListener('click', () => step(1));
  addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Tab') {
      const f = $$('button, a[href]', lb).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  // 手机左右滑动切换
  let sx = null;
  $('.lb__media').addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  $('.lb__media').addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    sx = null;
  });
  // 工具栏吸顶后加阴影
  const bar = $('#arcBar');
  addEventListener('scroll', () => bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= 1), { passive: true });
}

function openFromHash() {
  const m = location.hash.match(/^#No\.(\d+)/i);
  if (!m) return;
  const target = +m[1];
  let i = current.findIndex((d) => d.i === target);
  if (i < 0) { state.g = '全部'; state.f = '全部'; state.q = ''; $('#q').value = ''; refresh(); i = current.findIndex((d) => d.i === target); }
  if (i >= 0) openLb(i, false);
}

fetch(BASE + 'data/archive.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((data) => {
  DATA = data.records; META = data;
  const s = data.source;
  const gif = DATA.filter((d) => d.frames > 1).length;
  $('#headTotal').textContent = DATA.length.toLocaleString('zh-CN');
  $('#headGif').textContent = gif;
  $('#headCat').textContent = new Set(DATA.map((d) => d.category)).size;
  $('#syncInfo').innerHTML = `同步自 ${esc(s.repo.replace('https://github.com/', ''))} @ <a class="link-u" href="${esc(s.repo)}/commit/${esc(s.commit)}" target="_blank" rel="noopener">${esc(s.commit.slice(0, 7))}</a><br>上游提交 ${esc(s.commitDate.slice(0, 10))} · 本站同步 ${esc(data.fetchedAt.slice(0, 10))}`;
  // 整包下载：构建时按性别打包，大小按记录现算
  const zips = [['男性', 'male'], ['女性', 'female'], ['通用', 'unisex']].map(([g, slug]) => {
    const rs = DATA.filter((d) => d.gender === g);
    const mb = rs.reduce((s, d) => s + d.bytes, 0) / 1048576;
    return `<li><a href="${BASE}downloads/gakuran-images-${slug}.zip" download><b>gakuran-images-${slug}.zip</b><span>${g}全部图片，${rs.length} 个文件，约 ${Math.ceil(mb)} MB</span></a></li>`;
  });
  $('#dlList').insertAdjacentHTML('beforeend', zips.join(''));
  readURL();
  bind();
  refresh();
  openFromHash();
  addEventListener('hashchange', openFromHash);
}).catch(() => {
  $('#grid').innerHTML = '<p class="arc-empty">图鉴数据没有加载出来，刷新一下试试。如果一直这样，可以先看 <a class="link-u" href="/kyukosha/mirror/">原版页面镜像</a>。</p>';
});
