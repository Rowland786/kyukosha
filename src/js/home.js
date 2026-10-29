import { BASE, $, esc, countUp, onVisible, reduceMotion } from './common.js';
import '../styles/home.css';
import { halftone } from './halftone.js';

// 首屏轮换的六款发型（图鉴序号），用缩略图渲染，裁掉卡片下方的名称栏
const HERO = [118, 357, 75, 351, 408, 79];
const ETH_CN = { Japanese: '日系', European: '欧美', African: '非洲', Indian: '印度', MiddleEastern: '中东', Latino: '拉美', Latina: '拉美' };
const cap = $('#heroCap');
let recIndex = null;
const archiveReady = fetch(BASE + 'data/archive.json').then((r) => r.json());
archiveReady.then((d) => { recIndex = d.records; }).catch(() => {});
const capFor = (no) => {
  const r = recIndex?.[no - 1];
  if (!r) return `网点画面取自图鉴 No.${no}`;
  return `网点画面取自图鉴 No.${no} · ${r.gender}${r.category}${r.ethnicity ? ' · ' + (ETH_CN[r.ethnicity] || r.ethnicity) : ''}`;
};
const canvas = $('#heroCanvas');
if (canvas) {
  halftone(canvas, HERO.map((no) => ({ src: `${BASE}thumbs/${String(no).padStart(4, '0')}.webp`, crop: [0.02, 0.006, 0.905, 0.68], no })), {
    cell: 9, fit: 0.86, anchor: [0.46, 0.42], lo: 0.18,
    onChange: (it) => { if (cap) { cap.classList.remove('is-in'); setTimeout(() => { cap.textContent = capFor(it.no); cap.classList.add('is-in'); }, 260); } },
  });
}

// 让底部大字正好撑满一行
const word = $('.hero__wordmark');
function fitWord() {
  if (!word) return;
  word.style.fontSize = '100px';
  const w = word.parentElement.clientWidth;
  const cs = getComputedStyle(word.parentElement);
  const inner = w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  word.style.fontSize = (100 * inner / word.scrollWidth) + 'px';
}
document.fonts?.ready.then(fitWord);
addEventListener('resize', fitWord);
fitWord();

// 走马灯首尾相接
const mq = $('#marquee');
if (mq) mq.innerHTML += mq.innerHTML;

// 图鉴统计和缩略图条，全部从 archive.json 现算
archiveReady.then((data) => {
  const recs = data.records;
  const files = new Set(recs.map((r) => r.file));
  const stats = {
    records: recs.length,
    images: files.size,
    categories: new Set(recs.map((r) => r.category)).size,
    gif: [...files].filter((f) => /\.gif$/i.test(f)).length,
  };
  document.querySelectorAll('.js-total').forEach((el) => (el.textContent = stats.records.toLocaleString('zh-CN')));
  const sec = $('.stats');
  onVisible(sec, () => document.querySelectorAll('[data-stat]').forEach((el) => countUp(el, stats[el.dataset.stat])));

  // 每个部位挑几件有代表性的，滑板和终结技单独放宽一点
  const pick = [];
  const byCat = {};
  recs.forEach((r) => (byCat[r.category] ||= []).push(r));
  const want = { 制服: 6, 发型: 7, 面部: 3, 头部饰品: 4, 颈部: 2, 手臂: 2, 滑板: 3, 终结技: 2, 背部: 2, 腰部: 1 };
  for (const [cat, n] of Object.entries(want)) {
    const list = byCat[cat] || [];
    const step = Math.max(1, Math.floor(list.length / n));
    for (let k = 0; k < n && k * step < list.length; k++) pick.push(list[k * step]);
  }
  pick.sort(() => 0.5 - Math.random());
  const row = $('#stripRow');
  row.innerHTML = pick.map((r) => {
    const wide = r.w / r.h > 1.4;
    return `<figure class="strip__item${wide ? ' strip__item--wide' : ''}" style="margin:0"><img loading="lazy" decoding="async" src="${BASE}${r.thumb}" alt=""><span>${esc(r.category)}${r.name ? ' · ' + esc(r.name) : ''}</span></figure>`;
  }).join('');

  if (!reduceMotion) {
    const strip = $('#strip');
    const move = () => {
      const r = strip.getBoundingClientRect();
      const p = (innerHeight - r.top) / (innerHeight + r.height);
      if (p < -0.2 || p > 1.2) return;
      const max = row.scrollWidth - innerWidth;
      row.style.transform = `translate3d(${-Math.max(0, max) * Math.min(1, Math.max(0, p)) * 0.85}px,0,0)`;
    };
    addEventListener('scroll', move, { passive: true });
    move();
  }
}).catch(() => {});
