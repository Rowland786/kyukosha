// 收件后端地址：构建时可用 VITE_API_BASE 覆盖
export const API = (import.meta.env.VITE_API_BASE || 'https://kyukosha-desk.netlify.app').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export async function call(path, { method = 'GET', body, token, raw = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let r;
  try {
    r = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('连不上收件服务器，请检查网络后再试。已填的内容保存在这台设备上，不会丢。', 0);
  }
  if (raw) { if (!r.ok) throw new ApiError(`下载失败（${r.status}）`, r.status); return r; }
  let data = null;
  try { data = await r.json(); } catch { /* 非 JSON */ }
  if (!r.ok || data?.ok === false) throw new ApiError(data?.error || `服务器返回 ${r.status}`, r.status);
  return data;
}

// 分片上传：先建会话，再按顺序并发两路传分片，失败的分片重试三次，最后确认完整
export async function uploadFile(file, { onProgress, token, signal } = {}) {
  const s = await call('/api/uploads', { method: 'POST', body: { name: file.name, size: file.size, type: file.type }, token, signal });
  const done = new Set();
  let sent = 0;
  const putChunk = async (n) => {
    const blob = file.slice(n * s.chunkSize, Math.min(file.size, (n + 1) * s.chunkSize));
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(`${API}/api/uploads/${s.id}/${n}`, { method: 'PUT', headers: { 'x-upload-token': s.token, 'content-type': 'application/octet-stream' }, body: blob, signal });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ApiError(d.error || `分片 ${n + 1} 上传失败`, r.status); }
        done.add(n); sent += blob.size; onProgress?.(sent / file.size);
        return;
      } catch (e) {
        if (e.name === 'AbortError' || attempt >= 3 || (e.status && e.status < 500 && e.status !== 429)) throw e;
        await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)));
      }
    }
  };
  let next = 0;
  const worker = async () => { while (next < s.chunks) await putChunk(next++); };
  await Promise.all([worker(), worker()]);
  let fin = await fetch(`${API}/api/uploads/${s.id}/complete`, { method: 'POST', headers: { 'x-upload-token': s.token }, signal }).then((r) => r.json());
  if (!fin.ok && fin.missing?.length) {
    for (const n of fin.missing) await putChunk(n);
    fin = await fetch(`${API}/api/uploads/${s.id}/complete`, { method: 'POST', headers: { 'x-upload-token': s.token }, signal }).then((r) => r.json());
  }
  if (!fin.ok) throw new ApiError(fin.error || '文件没有传完整，请重试');
  return { id: s.id, token: s.token, name: file.name, size: file.size, type: file.type };
}

export const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

// 本地暂存（只存在这台设备的浏览器里）
export const local = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 忽略 */ } },
};

export const STATUS_CN = {
  received: { t: '已收件', en: 'RECEIVED', d: '材料到了，等协助者查看。' },
  reviewing: { t: '核对中', en: 'REVIEWING', d: '协助者正在逐项核对材料。' },
  needs_info: { t: '待补充', en: 'NEED INFO', d: '需要你补一些材料，见下方留言。' },
  ready: { t: '待提交', en: 'READY', d: '材料已经核对整理好。' },
  submitted: { t: '已代投', en: 'FILED', d: '已经通过官方表单提交。' },
  result: { t: '官方已回复', en: 'REPLIED', d: '收到了官方的处理结果。' },
  closed: { t: '已结束', en: 'CLOSED', d: '这个案件已经结束。' },
};

export const CATEGORY_CN = {
  exploiting: { t: '外挂 / 作弊', en: 'Exploiting', d: '飞天、瞬移、秒杀、穿墙等明显用第三方工具的行为。' },
  bug_abuse: { t: '利用漏洞', en: 'Bug Abuse', d: '故意卡 Bug 获利或害人，比如卡进墙里打人。' },
  infinite_holding: { t: '无限压制', en: 'Infinite Holding', d: '把人一直按在地上、反复击倒、不让起身。需要录满两分钟以上。' },
  permanent_trapping: { t: '永久困住', en: 'Permanent Trapping Players', d: '把人困在角落或封闭位置出不来。' },
  prolonged_carrying: { t: '长时间扛人', en: 'Prolonged Carrying of Other Players', d: '扛着别人不放、到处带走。' },
  void_throwing: { t: '扔出地图', en: 'Throwing individuals into the void', d: '把人扔进虚空或地图外。' },
  extreme_harassment: { t: '严重骚扰', en: 'Extreme Harassment', d: '持续辱骂、跟踪、针对性骚扰，包括种族歧视言论。' },
  explicit_drawings: { t: '露骨涂画', en: 'Explicit Drawings', d: '在黑板等地方画色情或露骨内容。' },
  exploiter_affiliation: { t: '与外挂者勾结', en: 'Exploiter Affiliation', d: '和开挂的人组队、配合或替其掩护。' },
  sexual_ws: { t: '带性意味的动作', en: 'Intentionally sexual behaviour', d: '对倒地玩家做明显带性暗示的动作。单纯 W+S 来回晃已经不封，除非明显是性暗示。' },
  other: { t: '其他 / 不确定', en: 'Other / not sure', d: '拿不准属于哪一类就选这个，协助者会帮你判断能不能报。' },
};
