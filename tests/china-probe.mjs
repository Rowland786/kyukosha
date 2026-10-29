// 用 Globalping 的中国大陆探针测网页、图片和收件接口能否打开（https://globalping.io）
// 用法：node tests/china-probe.mjs [每项探针数]
const N = Number(process.argv[2] || 16);
const targets = [
  ['首页', 'rowland786.github.io', '/kyukosha/'],
  ['举报教程', 'rowland786.github.io', '/kyukosha/guide/'],
  ['图鉴数据', 'rowland786.github.io', '/kyukosha/data/archive.json'],
  ['原图（GIF）', 'rowland786.github.io', '/kyukosha/mirror/images/%E9%80%9A%E7%94%A8/%E7%BB%88%E7%BB%93%E6%8A%80/002_Stomp.gif'],
  ['收件接口', 'kyukosha-desk.netlify.app', '/api/health'],
];
const isp = (net) => /mobile|cmnet|移动/i.test(net) ? '移动' : /unicom|china169|联通/i.test(net) ? '联通' : /telecom|chinanet|电信/i.test(net) ? '电信' : '云/其他';
const rows = [];
for (const [name, host, path] of targets) {
  const body = { type: 'http', target: host, locations: [{ country: 'CN' }], limit: N, measurementOptions: { request: { method: 'GET', path }, protocol: 'HTTPS' } };
  const j = await (await fetch('https://api.globalping.io/v1/measurements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (!j.id) { console.log(name, JSON.stringify(j)); continue; }
  let m;
  for (let i = 0; i < 40; i++) { await new Promise((s) => setTimeout(s, 2000)); m = await (await fetch('https://api.globalping.io/v1/measurements/' + j.id)).json(); if (m.status !== 'in-progress') break; }
  const by = {};
  let ok = 0;
  const times = [];
  for (const x of m.results) {
    const k = isp(x.probe.network);
    by[k] ||= { ok: 0, n: 0 };
    by[k].n++;
    const good = x.result.status === 'finished' && x.result.statusCode >= 200 && x.result.statusCode < 400;
    if (good) { ok++; by[k].ok++; times.push(x.result.timings.total); }
  }
  times.sort((a, b) => a - b);
  const med = times.length ? times[Math.floor(times.length / 2)] : null;
  rows.push({ name, url: `https://${host}${decodeURI(path)}`, ok, n: m.results.length, med, by, id: j.id });
  console.log(`${name.padEnd(8)} ${ok}/${m.results.length} 成功，中位耗时 ${med ?? '-'} ms  ` + Object.entries(by).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join('  ') + `  （测量 ${j.id}）`);
}
console.log(JSON.stringify({ at: new Date().toISOString(), rows }));
