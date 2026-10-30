import { BASE, $, $$ } from './common.js';
import '../styles/guide.css';
import { vision } from './vision.js';

// 顶部：官方 Trello 的示例图，标出 PLAYERLIST 和头顶角色名
const gv = $('#guideVision');
if (gv) {
  const wide = innerWidth > 760;
  vision(gv, {
    src: `${BASE}guide/playerlist.webp`,
    fit: 'cover', focus: wide ? [0.5, 0.5] : [0.32, 0.5], points: 70, mesh: 0.26, meshFrom: [0.5, 0.45], seed: 9,
    crossAt: [0.5, 0.45], contrast: 1.3, dim: 0.9,
    chain: wide ? { from: [0.62, 0.12], to: [0.96, 0.9], n: 6, r: 0.08 } : null,
    boxes: [
      { x: 0.004, y: 0.515, w: 0.065, h: 0.05, label: 'PLAYERLIST → 用户名', tone: 'accent' },
      { x: 0.43, y: 0.425, w: 0.145, h: 0.065, label: '头顶：角色名，不是 ID', tone: 'red', dashed: true, labelBelow: true },
    ],
  });
}

// 阅读进度
const bar = $('#readBar'), art = $('#article');
const prog = () => {
  const r = art.getBoundingClientRect();
  bar.style.transform = `scaleX(${Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)))})`;
};
addEventListener('scroll', prog, { passive: true });
prog();

// 目录高亮当前小节
const links = new Map($$('#toc a').map((a) => [a.getAttribute('href').slice(1), a]));
const io = new IntersectionObserver((ens) => ens.forEach((en) => {
  if (!en.isIntersecting) return;
  links.forEach((a) => a.classList.remove('is-on'));
  links.get(en.target.id)?.classList.add('is-on');
}), { rootMargin: '-30% 0px -60% 0px' });
$$('#article > section[id]').forEach((s) => io.observe(s));
