import { BASE, $, esc, countUp, onVisible } from './common.js';
import '../styles/home.css';
import { vision } from './vision.js';

const img = (no) => `${BASE}mirror/images/${encodeURI(no)}`;
const mobile = () => innerWidth < 860;

// 首屏：No.0628，头顶写着角色名的那张实机截图
const NAME_BOX = { x: 0.3, y: 0.004, w: 0.37, h: 0.062 };
const hero = $('#heroVision');
if (hero) {
  vision(hero, {
    src: img('女性/制服/033_未命名.png'),
    fit: 'contain', scale: mobile() ? 0.92 : 0.86, align: mobile() ? [0.5, 1] : [0.84, 1],
    fade: 0.16, points: 90, mesh: 0.34, meshFrom: [0.5, 0.2], seed: 11,
    crossAt: mobile() ? [0.5, 0.78] : [0.68, 0.5],
    chain: mobile() ? null : { from: [0.05, 0.22], to: [0.52, 0.94], n: 8, r: 0.1 },
    boxes: [
      { ...NAME_BOX, label: '头顶名称 = 角色名 ≠ ID', tone: 'red', dashed: true },
      { x: 0.2, y: 0.2, w: 0.7, h: 0.79, label: '被举报人 · 待核对', labelBelow: false, sub: '在 PLAYERLIST 里查用户名' },
    ],
    contrast: 1.5, dim: 0.95,
  });
}

// 第一张卡片：同一张图放大到头顶名称
const idv = $('#idVision');
if (idv) {
  vision(idv, {
    src: img('女性/制服/033_未命名.png'),
    fit: 'cover', focus: [0.5, 0.22], points: 60, mesh: 0.3, meshFrom: [0.5, 0.05], seed: 3,
    crosshair: true, crossAt: [0.5, 0.18], lens: true, glitch: true,
    boxes: [{ ...NAME_BOX, label: '角色名', tone: 'red', dashed: true, labelBelow: true, sub: '可以随时改，不能当 ID' }],
    contrast: 1.4, dim: 0.95,
  });
}

// 走马灯首尾相接
const tk = $('#ticker');
if (tk) tk.innerHTML += tk.innerHTML;

// 图鉴统计和图片墙，全部从 archive.json 现算
fetch(BASE + 'data/archive.json').then((r) => r.json()).then((data) => {
  const recs = data.records;
  const files = new Set(recs.map((r) => r.file));
  const stats = {
    records: recs.length,
    images: files.size,
    categories: new Set(recs.map((r) => r.category)).size,
    gif: [...files].filter((f) => /\.gif$/i.test(f)).length,
  };
  document.querySelectorAll('.js-total').forEach((el) => (el.textContent = stats.records.toLocaleString('zh-CN')));
  onVisible($('.arch__stats'), () => document.querySelectorAll('[data-stat]').forEach((el) => countUp(el, stats[el.dataset.stat])));
  // 每个部位挑几件竖图，排成墙
  const pick = [];
  const by = {};
  recs.filter((r) => r.w / r.h < 1.3).forEach((r) => (by[r.category] ||= []).push(r));
  const want = { 制服: 8, 发型: 8, 头部饰品: 3, 面部: 2, 颈部: 2, 手臂: 1, 背部: 1, 终结技: 2, 腰部: 1 };
  for (const [cat, n] of Object.entries(want)) {
    const list = by[cat] || [];
    const step = Math.max(1, Math.floor(list.length / n));
    for (let k = 0; k < n && k * step < list.length; k++) pick.push(list[k * step]);
  }
  $('#wall').innerHTML = pick.slice(0, mobile() ? 16 : 24).map((r) => `<figure><img loading="lazy" decoding="async" src="${BASE}${r.thumb}" alt=""><figcaption>No.${String(r.i).padStart(4, '0')}</figcaption></figure>`).join('');
}).catch(() => {});
