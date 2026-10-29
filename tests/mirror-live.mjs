// 线上镜像核对：从发布后的网站逐个下载 manifest 里的文件，按 git blob SHA-1 校验；
// 再检查 archive.json 的每条记录都有可访问的缩略图。
// 用法：SITE=https://rowland786.github.io/kyukosha node tests/mirror-live.mjs
import { createHash } from 'node:crypto';

const SITE = (process.env.SITE || 'https://rowland786.github.io/kyukosha').replace(/\/$/, '');
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const get = async (url, tries = 4) => {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url); if (r.ok) return Buffer.from(await r.arrayBuffer()); if (i >= tries) return { status: r.status }; }
    catch (e) { if (i >= tries) return { status: e.message }; }
    await new Promise((s) => setTimeout(s, 800 * (i + 1)));
  }
};
const pool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); };

const m = JSON.parse((await get(`${SITE}/mirror/manifest.json`)).toString());
const data = JSON.parse((await get(`${SITE}/data/archive.json`)).toString());
const bad = [];
let bytes = 0, gif = 0;
const t0 = Date.now();
await pool(m.files, 12, async (f) => {
  const b = await get(`${SITE}/mirror/${enc(f.path)}`);
  if (!Buffer.isBuffer(b)) return bad.push(`${f.path} 下载失败 ${b.status}`);
  if (b.length !== f.size || blobSha(b) !== f.sha) return bad.push(`${f.path} 校验不符`);
  bytes += b.length;
  if (/\.gif$/i.test(f.path)) gif++;
});
let thumbs = 0;
await pool(data.records, 16, async (r) => {
  const b = await get(`${SITE}/${r.thumb}`);
  if (!Buffer.isBuffer(b) || b.length < 100) bad.push(`缩略图 ${r.thumb} 不可用`); else thumbs++;
});
const imgs = m.files.filter((f) => f.path.startsWith('images/')).length;
console.log(`线上镜像：${m.files.length} 个文件（图像 ${imgs}，GIF ${gif}），共 ${(bytes / 1048576).toFixed(1)} MB，逐个校验 ${m.files.length - bad.filter((x) => !x.startsWith('缩略图')).length} 个一致`);
console.log(`记录 ${data.records.length} 条，缩略图可用 ${thumbs} 张；用时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
console.log(bad.length ? '问题：\n' + bad.join('\n') : '没有发现问题');
process.exit(bad.length ? 1 : 0);
