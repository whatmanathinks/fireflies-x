import { chromium } from 'playwright';
const base = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`${page.url()} :: ${e.message.slice(0,200)}`));
page.on('response', r => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(base + '/login');
await page.getByRole('button', { name: /Demo User/i }).click();
await page.waitForURL(/\/home/, { timeout: 20000 });

const routes = [['home','/home'],['meetings','/meetings'],['tasks','/tasks'],['search','/search?filter=pricing'],['analytics','/analytics'],['askfred','/askfred'],['settings','/settings']];
for (const [name, path] of routes) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `/tmp/s-${name}.png`, fullPage: false });
  console.log('✓', name);
}
console.log('ERRORS:', errs.length ? errs : 'none');
await browser.close();
