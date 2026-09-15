import { chromium } from 'playwright';
const base = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`PAGEERROR ${e.message.slice(0,160)}`));
page.on('response', r => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });

await page.goto(base + '/login');
await page.getByRole('button', { name: /Demo User/i }).click();
await page.waitForURL(/\/home/);
const cookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
const api = (p, o={}) => fetch(base+p, { ...o, headers: { cookie, 'Content-Type':'application/json', ...(o.headers||{}) } });

const list = await (await api('/api/search?q=')).json();
const m = list.meetings.find(x => x.title.includes('Roadmap'));
console.log('meeting:', m.title);

// share link
let r = await api(`/api/meetings/${m.id}/share`, { method:'POST', body: JSON.stringify({ expiresInDays: 7 }) });
const share = await r.json();
console.log('share ->', r.status, share.token?.slice(0,8));
const sp = await ctx.newPage();
const sres = await sp.goto(`${base}/share/${share.token}`, { waitUntil:'networkidle' });
console.log('share page ->', sres.status(), await sp.title());
await sp.screenshot({ path:'/tmp/s-share.png' });
await sp.close();

// soundbite
r = await api(`/api/meetings/${m.id}/bites`, { method:'POST', body: JSON.stringify({ name:'Latency win', startMs: 16000, endMs: 42000 }) });
console.log('bite ->', r.status);

// comment + bookmark
r = await api(`/api/meetings/${m.id}/comments`, { method:'POST', body: JSON.stringify({ body:'Great catch on the leak', timeMs: 55000 }) });
console.log('comment ->', r.status);
r = await api(`/api/meetings/${m.id}/bookmarks`, { method:'POST', body: JSON.stringify({ label:'Pricing decision', timeMs: 85000 }) });
console.log('bookmark ->', r.status);

// speaker rename
r = await api(`/api/meetings/${m.id}/transcript`, { method:'PATCH', body: JSON.stringify({ speakerIndex: 0, displayName: 'Priya R.' }) });
console.log('rename ->', r.status);

// AskFred streaming (fallback mode)
const af = await fetch(`${base}/api/meetings/${m.id}/askfred`, { method:'POST', headers:{cookie,'Content-Type':'application/json'}, body: JSON.stringify({ question:'What did we decide about pricing?' }) });
let acc=''; const rd = af.body.getReader(); const dec=new TextDecoder();
for(;;){ const {done,value}=await rd.read(); if(done)break; acc+=dec.decode(value,{stream:true}); }
console.log('askfred ->', af.status, JSON.stringify(acc.slice(0,150)));

// global askfred
const gf = await fetch(`${base}/api/askfred`, { method:'POST', headers:{cookie,'Content-Type':'application/json'}, body: JSON.stringify({ question:'security review timeline' }) });
let gacc=''; const grd=gf.body.getReader();
for(;;){ const {done,value}=await grd.read(); if(done)break; gacc+=dec.decode(value,{stream:true}); }
console.log('global askfred ->', gf.status, JSON.stringify(gacc.slice(0,120)));

// exports
for (const fmt of ['md','txt']) {
  const e = await api(`/api/meetings/${m.id}/export?format=${fmt}`);
  const body = await e.text();
  console.log(`export ${fmt} ->`, e.status, body.length, 'chars');
}

// notepad with the new panels
await page.goto(`${base}/meetings/${m.id}`, { waitUntil:'networkidle' });
await page.waitForTimeout(900);
await page.locator('button:has(svg.lucide-scissors)').first().click().catch(()=>{});
await page.waitForTimeout(500);
await page.screenshot({ path:'/tmp/s-notepad2.png' });

console.log('ERRORS:', errs.length ? errs : 'none');
await browser.close();
