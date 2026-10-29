// 实时网点渲染：把图拆成一格一格的圆点，圆点大小跟随明暗，随时间轻微起伏，
// 鼠标靠近时局部放大。传入多张图时，每隔几秒从下往上溶解到下一张。
// WebGL 不可用时退回静态图。
const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
const FRAG = `
precision highp float;
uniform sampler2D u_a, u_b;
uniform vec4 u_cropA, u_cropB;
uniform vec2 u_res, u_sizeA, u_sizeB, u_mouse, u_anchor;
uniform float u_cell, u_time, u_intro, u_mouseOn, u_fit, u_mix, u_lo;
uniform vec3 u_ink;

vec2 toUV(vec2 px, vec2 size, vec4 crop){
  vec2 cs = size * (crop.zw - crop.xy);
  float s = min(u_res.x / cs.x, u_res.y / cs.y) * u_fit;
  vec2 dim = cs * s;
  vec2 off = (u_res - dim) * u_anchor;
  vec2 k = (px - off) / dim;
  if(k.x<0.||k.y<0.||k.x>1.||k.y>1.) return vec2(-1.);
  return crop.xy + k * (crop.zw - crop.xy);
}
float dark(sampler2D t, vec2 uv){
  if(uv.x < 0.) return 0.;
  vec4 c = texture2D(t, uv);
  float l = dot(c.rgb, vec3(.299,.587,.114));
  return pow(smoothstep(u_lo, .97, (1. - l) * c.a), 1.25);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
void main(){
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 cell = floor(px / u_cell);
  vec2 ctr = (cell + .5) * u_cell;
  float dA = dark(u_a, toUV(ctr, u_sizeA, u_cropA));
  float dB = dark(u_b, toUV(ctr, u_sizeB, u_cropB));
  // 溶解：自下而上，带一点颗粒
  float edge = (1. - ctr.y / u_res.y) * .7 + hash(cell) * .3;
  float k = smoothstep(edge - .12, edge + .12, u_mix * 1.24 - .12);
  float d = mix(dA, dB, k);
  float t = u_time;
  float w = .16 * sin(t * .8 + ctr.x * .011 + ctr.y * .017) + .1 * sin(t * 1.3 - ctr.y * .009);
  vec2 m = ctr - u_mouse;
  float md = exp(-dot(m, m) / (2. * 130. * 130.)) * u_mouseOn;
  float intro = clamp(u_intro * 1.6 - (1. - ctr.y / u_res.y) * .6, 0., 1.);
  float r = u_cell * .5 * sqrt(max(d * (1. + w) + md * .3 * step(.02, d + .02), 0.)) * intro * (1. + md * .45);
  r = min(r * .92, u_cell * .5);
  vec2 dp = px - ctr - normalize(m + .0001) * md * u_cell * .35;
  float a = 1. - smoothstep(r - 1., r + 1., length(dp));
  gl_FragColor = vec4(u_ink * a, a);
}`;

export function halftone(canvas, sources, opts = {}) {
  const o = { cell: 8, ink: [0.075, 0.075, 0.075], fit: 0.98, anchor: [0.5, 1], lo: 0.12, hold: 5200, fade: 1700, onChange: null, ...opts };
  const list = (Array.isArray(sources) ? sources : [sources]).map((s) => (typeof s === 'string' ? { src: s } : s));
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return fallback(canvas, list[0].src);

  const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fallback(canvas, list[0].src);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const names = ['u_a', 'u_b', 'u_cropA', 'u_cropB', 'u_res', 'u_sizeA', 'u_sizeB', 'u_mouse', 'u_anchor', 'u_cell', 'u_time', 'u_intro', 'u_mouseOn', 'u_fit', 'u_mix', 'u_lo', 'u_ink'];
  const u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // 每张图一个纹理，按需加载
  const items = list.map((it) => ({ ...it, crop: it.crop || [0, 0, 1, 1], tex: gl.createTexture(), w: 1, h: 1, ok: false }));
  const load = (it) => new Promise((res) => {
    if (it.ok || it.loading) return res(it);
    it.loading = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, it.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      it.w = img.naturalWidth; it.h = img.naturalHeight; it.ok = true; res(it);
    };
    img.onerror = () => res(it);
    img.src = it.src;
  });

  let cur = 0, next = 0, mixStart = 0, ready = false, t0 = performance.now(), lastSwap = 0;
  load(items[0]).then(() => { ready = true; t0 = performance.now(); lastSwap = t0; o.onChange?.(items[0], 0); if (items[1]) load(items[1]); });

  let dpr = 1, W = 1, H = 1;
  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
  };
  resize();
  addEventListener('resize', resize);

  const mouse = { x: -9999, y: -9999, on: 0, target: 0 };
  const host = canvas.parentElement;
  host.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * dpr; mouse.y = (e.clientY - r.top) * dpr; mouse.target = e.pointerType === 'touch' ? 0.6 : 1;
  }, { passive: true });
  host.addEventListener('pointerleave', () => (mouse.target = 0));

  let visible = true, raf = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) loop(); }).observe(canvas);

  function bind(slot, it) {
    gl.activeTexture(slot === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, it.tex);
  }
  function draw(now) {
    if (!ready) return;
    const t = (now - t0) / 1000;
    // 轮换：到点且下一张已加载才开始溶解
    let mix = 0;
    if (items.length > 1 && !still) {
      if (next === cur && now - lastSwap > o.hold) {
        const n = (cur + 1) % items.length;
        if (items[n].ok) { next = n; mixStart = now; o.onChange?.(items[n], n); }
        else load(items[n]);
      }
      if (next !== cur) {
        mix = Math.min(1, (now - mixStart) / o.fade);
        if (mix >= 1) { cur = next; mix = 0; lastSwap = now; load(items[(cur + 1) % items.length]); }
      }
    }
    const A = items[cur], B = items[next];
    mouse.on += (mouse.target - mouse.on) * 0.08;
    const cell = Math.max(5, o.cell * (W < 700 * dpr ? 0.85 : 1)) * dpr;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bind(0, A); bind(1, B);
    gl.uniform1i(u.u_a, 0); gl.uniform1i(u.u_b, 1);
    gl.uniform4f(u.u_cropA, ...A.crop); gl.uniform4f(u.u_cropB, ...B.crop);
    gl.uniform2f(u.u_sizeA, A.w, A.h); gl.uniform2f(u.u_sizeB, B.w, B.h);
    gl.uniform2f(u.u_res, W, H);
    gl.uniform2f(u.u_mouse, mouse.x, mouse.y);
    gl.uniform1f(u.u_mouseOn, mouse.on);
    gl.uniform1f(u.u_cell, cell);
    gl.uniform1f(u.u_time, still ? 0 : t);
    gl.uniform1f(u.u_intro, still ? 1 : Math.min(1, t / 1.8));
    gl.uniform1f(u.u_mix, mix);
    gl.uniform1f(u.u_lo, o.lo);
    gl.uniform1f(u.u_fit, o.fit);
    gl.uniform2f(u.u_anchor, ...o.anchor);
    gl.uniform3f(u.u_ink, ...o.ink);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function loop() {
    raf = 0;
    if (!visible || document.hidden) return;
    draw(performance.now());
    if (!still || !ready) raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) loop(); });
  loop();
  return { resize };
}

function fallback(canvas, src) {
  const img = document.createElement('img');
  img.src = src; img.alt = '';
  img.className = canvas.className + ' halftone-fallback';
  canvas.replaceWith(img);
  return { resize() {} };
}
