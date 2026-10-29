// 本地截图：node tests/shot.mjs <url> <out前缀> <宽> <高> [滚动位置,逗号分隔] [--full]
import { chromium } from 'playwright-core';
const [url, out, w = 1440, h = 900, ys = '0'] = process.argv.slice(2);
const full = process.argv.includes('--full');
const mobile = +w < 600;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url() + ' ' + r.failure()?.errorText));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
const list = ys.split(',').map(Number);
for (const [i, y] of list.entries()) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}_${i}.png`, fullPage: full && i === 0 });
}
const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight }));
console.log(JSON.stringify(ov));
if (errs.length) console.log(errs.slice(0, 20).join('\n'));
await browser.close();
