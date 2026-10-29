// 由 public/mirror 生成站内查阅用的数据和缩略图。
// 原始字段一律原样保留；这里只追加尺寸、帧数、缩略图路径等派生信息。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIRROR = path.join(ROOT, 'public/mirror');
const THUMBS = path.join(ROOT, 'public/thumbs');
const force = process.argv.includes('--force');

const manifest = JSON.parse(await readFile(path.join(MIRROR, 'manifest.json'), 'utf8'));
const records = JSON.parse(await readFile(path.join(MIRROR, 'clothes.json'), 'utf8'));
const sizeOf = new Map(manifest.files.map((f) => [f.path, f]));
await mkdir(THUMBS, { recursive: true });

const out = [];
for (const [i, r] of records.entries()) {
  const src = path.join(MIRROR, r.file);
  const meta = await sharp(src, { animated: true }).metadata();
  const w = meta.width;
  const h = meta.pageHeight || meta.height;
  const frames = meta.pages || 1;
  const id = String(i + 1).padStart(4, '0');
  const thumb = `thumbs/${id}.webp`;
  const dest = path.join(ROOT, 'public', thumb);
  if (force || !existsSync(dest)) {
    // 竖图按高度 420 收，横图（滑板）按宽度 720 收，都不放大
    const wide = w / h > 1.4;
    await sharp(src, { animated: frames > 1 })
      .resize({ ...(wide ? { width: Math.min(w, 720) } : { height: Math.min(h, 420) }), withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toFile(dest);
  }
  const f = sizeOf.get(r.file);
  out.push({ ...r, i: i + 1, w, h, frames, bytes: f.size, sha: f.sha, thumb });
  if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${records.length}`);
}

const data = {
  source: manifest.source,
  fetchedAt: manifest.fetchedAt,
  totals: manifest.totals,
  notPublished: manifest.notPublished,
  records: out,
};
await mkdir(path.join(ROOT, 'public/data'), { recursive: true });
await writeFile(path.join(ROOT, 'public/data/archive.json'), JSON.stringify(data));
console.log(`archive.json：${out.length} 条`);
