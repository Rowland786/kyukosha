import { $, $$ } from './common.js';
import '../styles/guide.css';

// 阅读进度条
const bar = $('#readBar'), art = $('#article');
const prog = () => {
  const r = art.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
  bar.style.transform = `scaleX(${p})`;
};
addEventListener('scroll', prog, { passive: true });
prog();

// 目录高亮当前小节
const links = new Map($$('#toc a').map((a) => [a.getAttribute('href').slice(1), a]));
const io = new IntersectionObserver((ens) => {
  ens.forEach((en) => {
    if (!en.isIntersecting) return;
    links.forEach((a) => a.classList.remove('is-on'));
    links.get(en.target.id)?.classList.add('is-on');
  });
}, { rootMargin: '-30% 0px -60% 0px' });
$$('#article > section[id]').forEach((s) => io.observe(s));
