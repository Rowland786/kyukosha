// 每天清理一次：48 小时还没绑定到案件的上传、两天前的限流计数
import { getStore } from '@netlify/blobs';

export const config = { schedule: '@daily' };

export default async () => {
  const meta = getStore({ name: 'meta', consistency: 'strong' });
  const files = getStore({ name: 'files', consistency: 'strong' });
  const rl = getStore({ name: 'rl', consistency: 'strong' });
  const cutoff = Date.now() - 48 * 3600e3;
  let removed = 0;
  const ups = await meta.list({ prefix: 'up/' });
  for (const b of ups.blobs) {
    const m = await meta.get(b.key, { type: 'json' });
    if (!m || m.bound || Date.parse(m.createdAt) > cutoff) continue;
    const parts = await files.list({ prefix: `${m.id}/` });
    for (const p of parts.blobs) await files.delete(p.key);
    await meta.delete(b.key);
    removed++;
  }
  // 限流键是 桶/IP摘要/窗口编号，窗口编号 = 秒数 / 窗口长度（与 api.mjs 的 rateLimit 一致）
  const WINDOW = { lookup: 600, view: 600, upload: 3600, case: 3600, reply: 3600, login: 3600 };
  const keys = await rl.list();
  const nowSec = Date.now() / 1000;
  for (const b of keys.blobs) {
    const [bucket, , w] = b.key.split('/');
    const start = Number(w) * (WINDOW[bucket] || 3600);
    if (Number.isFinite(start) && start < nowSec - 2 * 86400) await rl.delete(b.key);
  }
  // 结案（官方已回复 / 已结束）满 180 天的案件，连同证据文件一起删除
  const cases = getStore({ name: 'cases', consistency: 'strong' });
  const idx = (await meta.get('index', { type: 'json' })) || [];
  const expire = Date.now() - 180 * 86400e3;
  const keep = [];
  let expired = 0;
  for (const row of idx) {
    if (!['result', 'closed'].includes(row.status) || Date.parse(row.updatedAt) > expire) { keep.push(row); continue; }
    const c = await cases.get(`case/${row.id}`, { type: 'json' });
    for (const f of c?.evidence?.files || []) {
      const parts = await files.list({ prefix: `${f.id}/` });
      for (const p of parts.blobs) await files.delete(p.key);
      await meta.delete(`up/${f.id}`);
    }
    await cases.delete(`case/${row.id}`);
    expired++;
  }
  if (expired) await meta.setJSON('index', keep);
  console.log(`cleanup: removed ${removed} stale uploads, ${expired} expired cases`);
};
