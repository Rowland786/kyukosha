// 发布前核对：public/mirror 里的每个文件都和 manifest 记录的大小、git 校验值一致，
// clothes.json 的每条记录都有对应图片。任何一项不符就让构建失败。
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIRROR = path.join(ROOT, 'public/mirror');
const m = JSON.parse(await readFile(path.join(MIRROR, 'manifest.json'), 'utf8'));
const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
let bad = 0;
for (const f of m.files) {
  let buf;
  try { buf = await readFile(path.join(MIRROR, f.path)); } catch { console.error('缺失', f.path); bad++; continue; }
  if (buf.length !== f.size || blobSha(buf) !== f.sha) { console.error('不一致', f.path); bad++; }
}
const recs = JSON.parse(await readFile(path.join(MIRROR, 'clothes.json'), 'utf8'));
const files = new Set(m.files.map((f) => f.path));
for (const r of recs) if (!files.has(r.file)) { console.error('记录没有图片', r.file); bad++; }
if (recs.length !== m.totals.records) { console.error('记录数和清单不符'); bad++; }
console.log(`核对 ${m.files.length} 个文件、${recs.length} 条记录：${bad ? bad + ' 处问题' : '全部一致'}`);
process.exit(bad ? 1 : 0);
