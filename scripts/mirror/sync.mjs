// 从 Kaglorn/gakuran-clothes 同步公开资料到 public/mirror。
// 用法：node scripts/mirror/sync.mjs [--from 本地克隆目录]
// 不传 --from 时，逐个文件从 raw.githubusercontent.com 下载。
// 每个文件都按 git blob SHA-1 与上游仓库树核对，任何一项对不上就退出并报错。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/mirror');
const OWNER = 'Kaglorn';
const REPO = 'gakuran-clothes';
const SITE = 'https://kaglorn.github.io/gakuran-clothes/';

const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const LOCAL = fromIdx >= 0 ? path.resolve(args[fromIdx + 1]) : null;

const gh = async (p) => {
  const headers = { 'user-agent': 'kyukosha-mirror', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${p}`, { headers });
  if (!r.ok) throw new Error(`GitHub API ${p}: ${r.status}`);
  return r.json();
};

const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

// 本地克隆里的文本文件可能被 autocrlf 改过换行，所以直接从 git 对象库取原始字节
async function getFile(p, sha, blob) {
  let buf;
  if (LOCAL && existsSync(path.join(LOCAL, '.git'))) {
    try {
      buf = execFileSync('git', ['-C', LOCAL, 'cat-file', 'blob', blob], { maxBuffer: 1 << 30 });
    } catch { buf = null; }
  }
  if (!buf) {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${p.split('/').map(encodeURIComponent).join('/')}`;
    for (let i = 0; i < 4; i++) {
      const r = await fetch(url).catch(() => null);
      if (r && r.ok) { buf = Buffer.from(await r.arrayBuffer()); break; }
      await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
    }
    if (!buf) throw new Error(`下载失败：${p}`);
  }
  return buf;
}

// 原站首页把数据直接写在 <script> 里，这里取出来和 clothes.json 对照。
function extractInlineData(html) {
  const m = html.match(/const DATA = (\[.*?\]);\n/s);
  if (!m) throw new Error('原站页面里没有找到 DATA');
  return JSON.parse(m[1]);
}

async function main() {
  const repo = await gh('');
  const branch = repo.default_branch;
  const commit = (await gh(`/commits/${branch}`));
  const tree = await gh(`/git/trees/${commit.sha}?recursive=1`);
  if (tree.truncated) throw new Error('仓库树被截断，需要分目录读取');
  const blobs = tree.tree.filter((t) => t.type === 'blob');

  const files = [];
  let bytes = 0;
  for (const [i, b] of blobs.entries()) {
    const buf = await getFile(b.path, commit.sha, b.sha);
    const sha = blobSha(buf);
    if (sha !== b.sha) throw new Error(`校验不符：${b.path} 本地 ${sha} 上游 ${b.sha}`);
    const dest = path.join(OUT, b.path);
    await mkdir(path.dirname(dest), { recursive: true });
    const same = existsSync(dest) && (await stat(dest)).size === buf.length && blobSha(await readFile(dest)) === sha;
    if (!same) await writeFile(dest, buf);
    files.push({ path: b.path, size: buf.length, sha });
    bytes += buf.length;
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${blobs.length}`);
  }

  const records = JSON.parse(await readFile(path.join(OUT, 'clothes.json'), 'utf8'));
  const liveHtml = await (await fetch(SITE)).text();
  const live = extractInlineData(liveHtml);
  const repoHtml = await readFile(path.join(OUT, 'index.html'), 'utf8');

  // 线上页面与仓库 index.html、clothes.json 三者逐条比对
  const shared = ['gender', 'category', 'rarity', 'rarity_base', 'ethnicity', 'name', 'asset_id', 'source', 'sheet', 'card', 'card_url', 'file'];
  const problems = [];
  if (liveHtml !== repoHtml) problems.push('线上 index.html 与仓库 index.html 不一致');
  if (live.length !== records.length) problems.push(`线上 ${live.length} 条，clothes.json ${records.length} 条`);
  live.forEach((d, i) => {
    const r = records[i];
    for (const k of shared) if (!r || d[k] !== r[k]) { problems.push(`第 ${i + 1} 条字段 ${k} 不一致`); break; }
  });

  const imageFiles = new Set(files.filter((f) => f.path.startsWith('images/')).map((f) => f.path));
  const recFiles = new Set(records.map((r) => r.file));
  const missing = [...recFiles].filter((f) => !imageFiles.has(f));
  const orphan = [...imageFiles].filter((f) => !recFiles.has(f));
  if (missing.length) problems.push(`记录引用但仓库没有的图片 ${missing.length} 个`);

  const count = (fn) => records.reduce((o, r) => ((o[fn(r)] = (o[fn(r)] || 0) + 1), o), {});
  const manifest = {
    source: {
      author: 'Kaglorn',
      site: SITE,
      repo: `https://github.com/${OWNER}/${REPO}`,
      branch,
      commit: commit.sha,
      commitDate: commit.commit.committer.date,
      upstreamBoard: 'https://trello.com/b/v3WatB1P/',
    },
    fetchedAt: new Date().toISOString(),
    totals: {
      files: files.length,
      bytes,
      records: records.length,
      images: imageFiles.size,
      gif: [...imageFiles].filter((f) => f.toLowerCase().endsWith('.gif')).length,
      png: [...imageFiles].filter((f) => f.toLowerCase().endsWith('.png')).length,
      categories: Object.keys(count((r) => r.category)).length,
    },
    byGender: count((r) => r.gender),
    byCategory: count((r) => r.category),
    byGenderCategory: count((r) => `${r.gender}/${r.category}`),
    emptyFields: Object.fromEntries(shared.map((k) => [k, records.filter((r) => !r[k]).length])),
    checks: {
      liveMatchesRepo: liveHtml === repoHtml,
      liveRecords: live.length,
      missingImages: missing,
      imagesWithoutRecord: orphan,
      problems,
    },
    // 上游 README 写明存在、但没有公开发布的内容
    notPublished: [
      { path: '合集原图/', note: '原始目录大图（README 记为 138 张、约 158MB），被上游 .gitignore 排除，未公开' },
      { path: 'gakuran_clothes/', note: 'README 中列出的处理脚本目录，未上传到仓库' },
      { path: '_旧命名/', note: 'README 提到的早期命名副本，未上传' },
    ],
    files,
  };
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`完成：${files.length} 个文件，${(bytes / 1e6).toFixed(1)} MB，${records.length} 条记录`);
  if (problems.length) {
    console.error('发现问题：\n' + problems.join('\n'));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
