import '../styles/main.css';
import Lenis from 'lenis';

export const BASE = import.meta.env.BASE_URL; // '/kyukosha/'
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

let toastTimer;
export function toast(msg, ms = 2800) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

export function fmtTime(iso, withYear = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${withYear ? d.getFullYear() + '/' : ''}${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export let lenis = null;

function initScroll() {
  if (reduceMotion || document.body.dataset.noSmooth !== undefined) return;
  lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  // 页内锚点也走平滑滚动
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (!t) return;
    e.preventDefault();
    lenis.scrollTo(t, { offset: -90 });
    history.replaceState(null, '', a.getAttribute('href'));
  });
}

function initHeader() {
  const head = $('#siteHead');
  if (!head) return;
  let last = 0;
  const onScroll = () => {
    const y = window.scrollY;
    head.classList.toggle('is-solid', y > 24 || document.body.dataset.solidHead !== undefined);
    head.classList.toggle('is-hidden', y > 320 && y > last + 4 && !document.body.classList.contains('menu-open'));
    if (y < last - 4) head.classList.remove('is-hidden');
    // 吸顶工具栏要知道顶栏此刻占不占位置
    document.documentElement.style.setProperty('--head-offset', head.classList.contains('is-hidden') ? '0px' : 'var(--header-h)');
    last = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initMenu() {
  const btn = $('#menuBtn'), menu = $('#menu'), close = $('#menuClose');
  if (!btn || !menu) return;
  const set = (open) => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    close.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    if (lenis) open ? lenis.stop() : lenis.start();
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) setTimeout(() => close.focus(), 50);
  };
  btn.addEventListener('click', () => set(true));
  close.addEventListener('click', () => { set(false); btn.focus(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false); });
}

// 把标题按 <br> 或 data-lines 拆行，做逐行上滑
export function splitLines(el) {
  if (el.dataset.splitDone) return;
  const parts = el.innerHTML.split(/<br\s*\/?>/i);
  el.innerHTML = parts.map((p) => `<span class="split-line"><span>${p}</span></span>`).join('');
  el.dataset.splitDone = '1';
  $$('.split-line > span', el).forEach((s, i) => (s.style.transitionDelay = `${i * 0.09}s`));
}

export function initReveal(root = document) {
  $$('[data-split]', root).forEach(splitLines);
  // 需要描线的 SVG：按每条路径的实际长度设置虚线
  $$('[data-draw]', root).forEach((svg) => svg.querySelectorAll('path, circle, ellipse, line, polyline').forEach((p) => {
    try { p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1); } catch { /* 不支持就直接显示 */ }
  }));
  const items = $$('[data-reveal], [data-split], [data-strip], [data-draw]', root);
  if (reduceMotion || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const d = el.dataset.delay;
      if (d) el.style.transitionDelay = d + 's';
      el.classList.add('is-in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  items.forEach((el) => io.observe(el));
}

// 数字从 0 滚到目标值
export function countUp(el, to, ms = 1400) {
  if (reduceMotion) { el.textContent = to.toLocaleString('zh-CN'); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const v = Math.round(to * (1 - Math.pow(1 - k, 4)));
    el.textContent = v.toLocaleString('zh-CN');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function onVisible(el, fn) {
  if (!('IntersectionObserver' in window)) return fn();
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { fn(); io.disconnect(); } }, { threshold: 0.3 });
  io.observe(el);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

initScroll();
initHeader();
initMenu();
initReveal();
