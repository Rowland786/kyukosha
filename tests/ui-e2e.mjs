// 浏览器端到端：在真实网站上提交 → 查询 → 审核台处理 → 玩家补充 → 记录代投与回复 → 删除。
// 用法：SITE=https://rowland786.github.io/kyukosha DESK_PASSWORD=... SHOTS=截图目录 [MOBILE=1] node tests/ui-e2e.mjs
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const SITE = (process.env.SITE || 'https://rowland786.github.io/kyukosha').replace(/\/$/, '');
const PW = process.env.DESK_PASSWORD;
const SHOTS = process.env.SHOTS || os.tmpdir();
const MOBILE = !!process.env.MOBILE;
const tag = MOBILE ? 'm' : 'd';
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const vid = path.join(os.tmpdir(), 'kyukosha-ui-test.mp4');
writeFileSync(vid, randomBytes(3.4 * 1024 * 1024)); // 跨两个分片

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext(MOBILE
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1366, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `ui-${tag}-${n}.png`), fullPage: false });
// 审核台“处理”里的折叠项全部展开，避免点击 summary 反而把已展开的收起来
const openOps = (p) => p.evaluate(() => document.querySelectorAll('.ops details').forEach((d) => (d.open = true)));
const next = async () => { await page.click('#next'); await page.waitForTimeout(400); };

// ---------- 提交：对方 ID → 视频 → 确认 ----------
await page.goto(SITE + '/report/', { waitUntil: 'networkidle' });
ok(await page.isVisible('.dlg[data-step="0"]'), '打开提交页');
await page.click('.dlg[data-step="0"] [data-go="1"]');
await page.fill('#target', 'no_such_user_zz91');
await page.click('#lookupBtn');
await page.waitForSelector('.chk--fail', { timeout: 20000 });
ok(await page.isHidden('#idNext'), '查不到的 ID 不能继续');
await page.fill('#target', 'https://www.roblox.com/users/156/profile');
await page.click('#lookupBtn');
await page.waitForSelector('#idNext:not([hidden])', { timeout: 20000 });
ok((await page.textContent('#lookupLog')).includes('@builderman'), '主页链接核对出 @builderman');
await page.click('#idNext [data-go="2"]');
await page.setInputFiles('#fileInput', vid);
await page.waitForSelector('.file.done', { timeout: 120000 });
ok(true, '视频分片上传完成');
ok(await page.isHidden('#videoNext'), '没确认非 OBS 前不能继续');
await page.check('#notObs', { force: true });
await page.waitForSelector('#videoNext:not([hidden])');
await shot('03-evidence');
await page.click('#videoNext [data-go="3"]');
await page.fill('#note', '【自动化测试，非真实举报】视频 00:10 开始。');
await page.selectOption('#contactType', 'qq');
await page.fill('#contact', '10000');
await page.check('#consent', { force: true });
await page.click('#submit');
await page.waitForSelector('#receipt:not([hidden])', { timeout: 60000 });
const id = (await page.textContent('#rcId')).trim();
const key = (await page.textContent('#rcKey')).trim();
ok(/^GK[0-9]{4}-[A-Z0-9]{5}$/.test(id) && key.length === 19, `回执 ${id}`);
await shot('06-receipt');

// ---------- 查询 ----------
await page.goto(SITE + '/track/', { waitUntil: 'networkidle' });
ok((await page.textContent('#saved')).includes(id), '查询页记得本机提交过的案件');
await page.fill('input[name=id]', id);
await page.fill('input[name=key]', key);
await page.click('#login button[type=submit]');
await page.waitForSelector('#case:not([hidden])', { timeout: 30000 });
ok((await page.textContent('#cStatus')).trim() === '已收件', '查询：已收件');
await page.fill('input[name=id]', id).catch(() => {});

// ---------- 审核台 ----------
const desk = await ctx.newPage();
desk.on('dialog', (d) => d.accept());
await desk.goto(SITE + '/desk/', { waitUntil: 'networkidle' });
await desk.fill('input[name=password]', 'wrong-password');
await desk.click('#loginForm button[type=submit]');
await desk.waitForSelector('#loginErr:not([hidden])');
ok(true, '错误口令被拒绝');
await desk.fill('input[name=password]', PW);
await desk.click('#loginForm button[type=submit]');
await desk.waitForSelector('#deskApp:not([hidden])', { timeout: 30000 });
await desk.click(`.desk-item[data-id="${id}"]`);
await desk.waitForSelector('.dd-head');
ok((await desk.textContent('#detail')).includes('10000'), '审核台能看到联系方式');
await desk.click('[data-act=claim]');
await desk.waitForTimeout(1500);
await openOps(desk);
await desk.fill('#reqMsg', '测试：请补一段能看清对方用户名的录像。');
await desk.click('[data-act=request]');
await desk.waitForSelector('.desk-badge.big.st-needs_info', { timeout: 20000 });
ok(true, '审核台发出补充请求');
// 证据预览
await desk.click('[data-load]');
await desk.waitForSelector('.ev-view a[download]', { timeout: 60000 });
ok(true, '审核台取回并拼好证据文件');
await desk.screenshot({ path: path.join(SHOTS, `ui-${tag}-07-desk.png`) });

// ---------- 玩家补充 ----------
await page.reload({ waitUntil: 'networkidle' });
await page.fill('input[name=id]', id);
await page.fill('input[name=key]', key);
await page.click('#login button[type=submit]');
await page.waitForSelector('#case:not([hidden])');
ok((await page.textContent('#cStatus')).trim() === '待补充' && (await page.textContent('#cRequest')).includes('补一段'), '玩家看到待补充和留言');
await page.fill('#reply textarea[name=text]', '测试补充：第二段录像 00:45 打开了 PLAYERLIST。');
await page.fill('#links .l-url', 'https://streamable.com/uitest');
await page.click('#replyBtn');
await page.waitForFunction(() => document.querySelector('#cStatus')?.textContent.trim() === '核对中', null, { timeout: 30000 });
ok(await page.isVisible('#rail li.is-on'), '进度条高亮当前一步');
ok(true, '补充后回到核对中');
await shot('08-track');

// ---------- 草稿、代投、回复 ----------
await desk.click('#refresh');
await desk.waitForTimeout(2500);
await desk.fill('#dReason', 'Infinite holding at the Gym for ~4 min; knocked me down repeatedly and blocked respawn. Playerlist at 01:32. (UI TEST)');
await desk.fill('#dEvidence', 'https://streamable.com/uitest — 00:10–04:10 holding; 01:32 playerlist. (UI TEST)');
await desk.click('#saveDraft');
await desk.waitForTimeout(1500);
await openOps(desk);
await desk.click('[data-act=ready]');
await desk.waitForSelector('.desk-badge.big.st-ready', { timeout: 20000 });
ok(true, '标记待代投');
await openOps(desk);
await desk.fill('#subAt', '2026-10-30 02:10（北京时间，测试）');
await desk.fill('#subConf', '测试记录，未真正提交');
await desk.fill('#subPub', '测试');
await desk.click('[data-act=submitted]');
await desk.waitForSelector('.desk-badge.big.st-submitted', { timeout: 20000 });
ok(true, '记录已代投');
await openOps(desk);
await desk.fill('#resAt', '2026-10-30 03:00（测试）');
await desk.fill('#resRaw', '测试：模拟回复');
await desk.fill('#resPub', '测试结果');
await desk.click('[data-act=result]');
await desk.waitForSelector('.desk-badge.big.st-result', { timeout: 20000 });
ok(true, '记录官方回复');

await page.click('#login button[type=submit]').catch(() => {});
await page.goto(SITE + '/track/', { waitUntil: 'networkidle' });
await page.fill('input[name=id]', id);
await page.fill('input[name=key]', key);
await page.click('#login button[type=submit]');
await page.waitForSelector('#case:not([hidden])');
ok((await page.textContent('#cStatus')).trim() === '官方已回复', '玩家看到官方已回复');
ok(!(await page.textContent('#case')).includes('模拟回复'), '回复原文不出现在玩家页');
await shot('09-result');

// ---------- 清理 ----------
const token = await desk.evaluate(() => sessionStorage.getItem('kyukosha.desk'));
const api = process.env.API || 'https://kyukosha-desk.netlify.app';
const del = await desk.evaluate(async ([api, token, id]) => (await fetch(api + '/api/desk/delete', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ id }) })).json(), [api, token, id]);
ok(del.ok, '测试案件已删除');
ok(errors.length === 0, `页面脚本错误 ${errors.length} 个${errors.length ? '：' + errors.join(' | ') : ''}`);
await browser.close();
console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
