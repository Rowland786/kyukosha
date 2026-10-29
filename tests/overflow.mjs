// 各页面在不同宽度下是否出现横向滚动，顺便截一屏
import { chromium } from 'playwright-core';
import path from 'node:path';
const SITE = (process.env.SITE || 'http://localhost:5178/kyukosha').replace(/\/$/, '');
const OUT = process.env.SHOTS || '.';
const pages = ['/', '/guide/', '/report/', '/track/', '/archive/', '/about/', '/desk/'];
const widths = (process.env.WIDTHS || '360,390,768,1280,1440').split(',').map(Number);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let bad = 0;
for (const w of widths) {
  const mobile = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 780 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  for (const p of pages) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(SITE + p, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > cw + 1 && getComputedStyle(e).position !== 'fixed' && b.width > 0 && !e.closest('.marquee,.strip,.chips,.seg,.stepper,.audit__tbl,.lb,.menu,.hero__word'); }).slice(0, 4).map((e) => e.tagName.toLowerCase() + '.' + [...e.classList].join('.') + ' ' + Math.round(e.getBoundingClientRect().right));
      return { sw, cw, wide };
    });
    const over = r.sw > r.cw;
    if (over || r.wide.length || errs.length) bad++;
    console.log(`${w}px ${p.padEnd(10)} ${over ? '横向溢出 ' + r.sw + '>' + r.cw : 'ok'} ${r.wide.join(' | ')} ${errs.join(' | ')}`);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(OUT, `ov-${w}${p.replace(/\//g, '_')}.png`) });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} 处需要检查` : '全部通过');
