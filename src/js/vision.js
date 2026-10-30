// 识别画面：把一张游戏截图处理成带颗粒的黑白底片，
// 在上面画特征点三角网、串联的圆、带坐标的识别框和跟随鼠标的反相取景框，
// 隔几秒闪一次红青错位的边缘描线。全部在一个 2D canvas 里完成。
import Delaunator from 'delaunator';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// 灰度 + 对比 + 可选反相，返回离屏 canvas
function toMono(img, { contrast = 1.35, invert = false, gamma = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    l = Math.pow(Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5)), gamma);
    if (invert) l = 1 - l;
    p[i] = p[i + 1] = p[i + 2] = l * 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

// Sobel 边缘，返回带颜色的透明 canvas（用来做红/青错位）
function edges(img, color) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  const out = g.createImageData(w, h), o = out.data;
  const [r, gg, b] = color;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1] + L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1];
    const gy = -L[i - w - 1] - 2 * L[i - w] - L[i - w + 1] + L[i + w - 1] + 2 * L[i + w] + L[i + w + 1];
    const m = Math.min(1, Math.hypot(gx, gy) * 1.6);
    const a = m > 0.18 ? m : 0;
    o[i * 4] = r; o[i * 4 + 1] = gg; o[i * 4 + 2] = b; o[i * 4 + 3] = a * 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

// 在缩小的灰度图上找梯度大的点，作为“特征点”
function features(img, count, seed = 1) {
  const W = 180, H = Math.round(W * img.naturalHeight / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const p = g.getImageData(0, 0, W, H).data;
  const L = (x, y) => { const i = (y * W + x) * 4; return (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255; };
  const cand = [];
  for (let y = 2; y < H - 2; y += 1) for (let x = 2; x < W - 2; x += 1) {
    const gx = L(x + 1, y) - L(x - 1, y), gy = L(x, y + 1) - L(x, y - 1);
    const m = gx * gx + gy * gy;
    if (m > 0.012) cand.push([x, y, m]);
  }
  cand.sort((a, b) => b[2] - a[2]);
  const pts = [], minD = Math.max(4, W / 26);
  for (const [x, y] of cand) {
    if (pts.length >= count) break;
    if (pts.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > minD * minD)) pts.push([x, y]);
  }
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  while (pts.length < count) pts.push([rnd() * W, rnd() * H]);
  return pts.map(([x, y]) => [x / W, y / H]);
}

function noiseTile(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const d = g.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.random() < 0.5 ? 20 : 0;
  }
  // 少量亮斑，像底片灰尘
  for (let k = 0; k < 18; k++) { const i = (Math.floor(Math.random() * size * size)) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = 200; }
  g.putImageData(d, 0, 0);
  return c;
}

/**
 * opts:
 *  src         图片地址
 *  fit         'cover' | 'contain'
 *  focus       [x,y] 图片里对齐到画布中心的位置（0~1）
 *  boxes       [{x,y,w,h,label,sub,tone}] 图片坐标（0~1）
 *  points      特征点数量
 *  chain       串联圆：{from:[x,y], to:[x,y], n, r} 画布坐标（0~1）
 *  invert      底片反相
 *  lens        是否显示跟随鼠标的反相取景框
 *  crosshair   中心虚线十字
 *  glitch      红青错位边缘闪烁
 */
export function vision(canvas, opts = {}) {
  const o = { fit: 'cover', focus: [0.5, 0.5], boxes: [], points: 70, chain: null, invert: false, lens: true, crosshair: true, glitch: true, contrast: 1.35, gamma: 1, dim: 0.88, seed: 7, mesh: 0.32, ...opts };
  const ctx = canvas.getContext('2d');
  const grain = noiseTile();
  let grainPat = null;
  let img, mono, edgeR, edgeC, pts = [], tris = [], order = [], ready = false;
  let W = 1, H = 1, dpr = 1, t0 = performance.now(), visible = true, raf = 0;
  const mouse = { x: -1, y: -1, tx: -1, ty: -1, on: 0, target: 0 };
  let glitchUntil = 0, nextGlitch = performance.now() + 2600;

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!raf) frame();
  };

  // 图片坐标 → 画布坐标
  let map = { s: 1, ox: 0, oy: 0, iw: 1, ih: 1 };
  const layout = () => {
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = o.fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih) * (o.scale || 1);
    const dw = iw * s, dh = ih * s;
    let ox = W / 2 - o.focus[0] * dw, oy = H / 2 - o.focus[1] * dh;
    if (o.fit === 'cover') { ox = Math.min(0, Math.max(W - dw, ox)); oy = Math.min(0, Math.max(H - dh, oy)); }
    else { ox = (W - dw) * (o.align?.[0] ?? 0.5); oy = (H - dh) * (o.align?.[1] ?? 0.5); }
    map = { s, ox, oy, iw: dw, ih: dh };
  };
  const P = ([x, y]) => [map.ox + x * map.iw, map.oy + y * map.ih];

  loadImage(o.src).then((im) => {
    img = im;
    mono = toMono(im, { contrast: o.contrast, invert: o.invert, gamma: o.gamma });
    if (o.glitch) { edgeR = edges(im, [255, 60, 50]); edgeC = edges(im, [60, 230, 225]); }
    pts = features(im, o.points, o.seed);
    if (o.extraPoints) pts.push(...o.extraPoints);
    const d = Delaunator.from(pts);
    tris = [];
    for (let i = 0; i < d.triangles.length; i += 3) {
      const a = d.triangles[i], b = d.triangles[i + 1], c = d.triangles[i + 2];
      const A = pts[a], B = pts[b], C = pts[c];
      // 太大的三角形不画，网才会贴着主体
      const per = Math.hypot(A[0] - B[0], A[1] - B[1]) + Math.hypot(B[0] - C[0], B[1] - C[1]) + Math.hypot(C[0] - A[0], C[1] - A[1]);
      if (per < o.mesh) tris.push([a, b, c]);
    }
    const cx = o.meshFrom?.[0] ?? 0.5, cy = o.meshFrom?.[1] ?? 0.4;
    order = tris.map((t, i) => [i, Math.hypot(pts[t[0]][0] - cx, pts[t[0]][1] - cy)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    ready = true; t0 = performance.now();
    layout();
    canvas.dispatchEvent(new CustomEvent('vision:ready'));
    if (!raf) frame();
  }).catch(() => canvas.classList.add('vision-failed'));

  const host = o.host || canvas.parentElement;
  host.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top; mouse.target = 1;
    if (mouse.x < 0) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
  }, { passive: true });
  host.addEventListener('pointerleave', () => (mouse.target = 0));
  host.addEventListener('pointerdown', () => { glitchUntil = performance.now() + 260; });
  new ResizeObserver(() => { resize(); layout(); }).observe(canvas);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) frame(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) frame(); });

  const label = (txt, x, y, align = 'left', color = 'rgba(232,230,225,.82)', size = 9.5) => {
    ctx.font = `${size}px ${MONO}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  };
  const fmt = (n) => Math.round(n);

  function draw(now) {
    const t = (now - t0) / 1000;
    const k = still ? 1 : Math.min(1, t / 2.2); // 出场进度
    ctx.clearRect(0, 0, W, H);
    if (!ready) return;
    mouse.x += (mouse.tx - mouse.x) * 0.14; mouse.y += (mouse.ty - mouse.y) * 0.14;
    mouse.on += (mouse.target - mouse.on) * 0.1;

    // 底图
    ctx.globalAlpha = o.dim * Math.min(1, t / 0.9 + 0.15);
    ctx.drawImage(mono, map.ox, map.oy, map.iw, map.ih);
    ctx.globalAlpha = 1;
    // 图片四边渐隐到底色，主体像浮在黑场里
    if (o.fade) {
      const f = o.fade, bg = o.bg || '10,10,11';
      const { ox, oy, iw, ih } = map;
      const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(${bg},1)`); g.addColorStop(1, `rgba(${bg},0)`);
        ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      };
      edge(ox, 0, ox + iw * f, 0, ox - 1, oy - 1, iw * f + 1, ih + 2);
      edge(ox + iw, 0, ox + iw * (1 - f), 0, ox + iw * (1 - f), oy - 1, iw * f + 1, ih + 2);
      edge(0, oy, 0, oy + ih * f * 0.6, ox - 1, oy - 1, iw + 2, ih * f * 0.6 + 1);
      edge(0, oy + ih, 0, oy + ih * (1 - f), ox - 1, oy + ih * (1 - f), iw + 2, ih * f + 1);
    }

    // 红青错位边缘
    if (o.glitch && !still) {
      if (now > nextGlitch) { glitchUntil = now + 180 + Math.random() * 220; nextGlitch = now + 3800 + Math.random() * 4200; }
      const g = now < glitchUntil ? 1 : 0.16;
      const off = now < glitchUntil ? 3 + Math.random() * 5 : 1.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * g;
      ctx.drawImage(edgeR, map.ox - off, map.oy, map.iw, map.ih);
      ctx.drawImage(edgeC, map.ox + off, map.oy + (now < glitchUntil ? 1 : 0), map.iw, map.ih);
      if (now < glitchUntil) {
        // 横向撕裂条
        for (let i = 0; i < 4; i++) {
          const y = Math.random() * H, h = 2 + Math.random() * 14, dx = (Math.random() - 0.5) * 40;
          ctx.globalAlpha = 0.7;
          ctx.drawImage(canvas, 0, y * dpr, W * dpr, h * dpr, dx, y, W, h);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 颗粒
    if (!still) {
      ctx.globalAlpha = 0.9;
      const gx = -Math.random() * 256, gy = -Math.random() * 256;
      ctx.fillStyle = grainPat ||= ctx.createPattern(grain, 'repeat');
      ctx.save(); ctx.translate(gx, gy); ctx.fillRect(-gx, -gy, W, H); ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 三角网
    const nShow = Math.floor(order.length * k);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(240,238,232,.34)';
    ctx.beginPath();
    for (let i = 0; i < nShow; i++) {
      const [a, b, c] = tris[order[i]];
      const A = P(pts[a]), B = P(pts[b]), C = P(pts[c]);
      ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath();
    }
    ctx.stroke();
    // 鼠标附近的网加亮
    if (mouse.on > 0.02) {
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * mouse.on})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < nShow; i++) {
        const [a, b, c] = tris[order[i]];
        const A = P(pts[a]);
        if (Math.hypot(A[0] - mouse.x, A[1] - mouse.y) > 110) continue;
        const B = P(pts[b]), C = P(pts[c]);
        ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath();
      }
      ctx.stroke();
    }
    // 特征点与坐标
    pts.forEach((p, i) => {
      if (i / pts.length > k) return;
      const [x, y] = P(p);
      if (x < -5 || y < -5 || x > W + 5 || y > H + 5) return;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(x, y, i % 9 === 0 ? 2.2 : 1.1, 0, Math.PI * 2); ctx.fill();
      if (i % 7 === 0) label(`${fmt(p[0] * img.naturalWidth)},${fmt(p[1] * img.naturalHeight)}`, x + 6, y, 'left', 'rgba(232,230,225,.7)', 8.5);
    });

    // 串联圆
    if (o.chain) {
      const { from, to, n = 9, r = 0.09 } = o.chain;
      const R = r * Math.min(W, H);
      ctx.lineWidth = 0.7;
      for (let i = 0; i < n; i++) {
        if (i / n > k * 1.2) break;
        const u = i / (n - 1);
        const cx = (from[0] + (to[0] - from[0]) * u) * W, cy = (from[1] + (to[1] - from[1]) * u) * H;
        const rr = R * (0.55 + 0.9 * Math.sin(Math.PI * u)) * (1 + 0.02 * Math.sin(t + i));
        ctx.strokeStyle = 'rgba(232,230,225,.32)';
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        const ang = -0.6 + i * 0.7;
        const nx = cx + Math.cos(ang) * rr, ny = cy + Math.sin(ang) * rr;
        ctx.fillStyle = '#f2f0ea';
        ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
        label(`${i + 1} → ${fmt(nx)} – ${fmt(ny)}`, nx + 8, ny, 'left', 'rgba(232,230,225,.86)', 9);
        ctx.fillStyle = 'rgba(232,230,225,.5)';
        ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, Math.PI * 2); ctx.fill();
        label(`${fmt(cx)},${fmt(cy)}`, cx + 6, cy + 9, 'left', 'rgba(232,230,225,.45)', 8);
      }
    }

    // 十字虚线
    if (o.crosshair) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(232,230,225,.28)'; ctx.lineWidth = 0.8;
      const cx = (o.crossAt?.[0] ?? 0.5) * W, cy = (o.crossAt?.[1] ?? 0.5) * H;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
      ctx.setLineDash([]);
      // 星形标记
      ctx.strokeStyle = 'rgba(232,230,225,.7)';
      ctx.beginPath();
      for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 4; ctx.moveTo(cx - Math.cos(ang) * 9, cy - Math.sin(ang) * 9); ctx.lineTo(cx + Math.cos(ang) * 9, cy + Math.sin(ang) * 9); }
      ctx.stroke();
      label(`${fmt(cx)},${fmt(cy)}`, cx + 12, cy + 12, 'left', 'rgba(232,230,225,.55)', 8.5);
    }

    // 识别框
    o.boxes.forEach((b, i) => {
      const appear = Math.min(1, Math.max(0, k * 1.6 - 0.25 - i * 0.18));
      if (appear <= 0) return;
      const [x, y] = P([b.x, b.y]);
      const w = b.w * map.iw, h = b.h * map.ih;
      const col = b.tone === 'accent' ? '#f2c230' : b.tone === 'red' ? '#ff4b3e' : 'rgba(240,238,232,.92)';
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.setLineDash(b.dashed ? [3, 4] : []);
      ctx.globalAlpha = appear;
      ctx.strokeRect(x, y, w * appear, h);
      ctx.setLineDash([]);
      // 角标
      const c = 7;
      ctx.lineWidth = 2;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(px, py + sy * c); ctx.lineTo(px, py); ctx.lineTo(px + sx * c, py); ctx.stroke();
      });
      if (b.label) {
        ctx.font = `600 11px ${MONO}`;
        const tw = ctx.measureText(b.label).width + 12;
        const ly = b.labelBelow ? y + h + 4 : y - 20;
        ctx.fillStyle = col; ctx.fillRect(x, ly, tw, 16);
        label(b.label, x + 6, ly + 8, 'left', '#0b0b0c', 11);
      }
      if (b.sub) label(b.sub, x + 2, (b.labelBelow ? y + h + 30 : y - 30), 'left', 'rgba(232,230,225,.75)', 9);
      label(`${fmt(b.x * img.naturalWidth)},${fmt(b.y * img.naturalHeight)}`, x + w + 6, y + 6, 'left', 'rgba(232,230,225,.6)', 8.5);
      ctx.globalAlpha = 1;
    });

    // 取景框：圆内反相
    if (o.lens && mouse.on > 0.02 && mouse.x >= 0) {
      const R = 74 * mouse.on;
      ctx.save();
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, R, 0, Math.PI * 2); ctx.clip();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff'; ctx.fillRect(mouse.x - R, mouse.y - R, R * 2, R * 2);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(mouse.x - R - 30, mouse.y); ctx.lineTo(mouse.x + R + 30, mouse.y); ctx.moveTo(mouse.x, mouse.y - R - 30); ctx.lineTo(mouse.x, mouse.y + R + 30); ctx.stroke();
      ctx.setLineDash([]);
      const ix = (mouse.x - map.ox) / map.s, iy = (mouse.y - map.oy) / map.s;
      label(`${fmt(ix)},${fmt(iy)}`, mouse.x + R + 8, mouse.y - 10, 'left', '#f2f0ea', 10);
    }
  }

  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    draw(performance.now());
    if (!still || !ready) raf = requestAnimationFrame(frame);
  }
  resize();
  return {
    redraw: () => { layout(); if (!raf) frame(); },
    // 换掉识别框（比如查到账号以后把名字写上去），并闪一下
    setBoxes: (boxes) => { o.boxes = boxes; glitchUntil = performance.now() + 240; if (!raf) frame(); },
    glitch: () => { glitchUntil = performance.now() + 260; },
  };
}
