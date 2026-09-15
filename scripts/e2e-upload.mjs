import { chromium } from 'playwright';
import fs from 'node:fs';

const base = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(base + '/login');
await page.getByRole('button', { name: /Demo User/i }).click();
await page.waitForURL(/\/home/, { timeout: 20000 }).catch(()=>{});
const cookie = (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ');

// 1. upload the real audio file
const fd = new FormData();
fd.append('file', new File([fs.readFileSync('/tmp/conv.wav')], 'conv.wav', { type: 'audio/wav' }));
let r = await fetch(base + '/api/uploads/direct', { method: 'POST', headers: { cookie }, body: fd });
const up = await r.json();
console.log('1. upload ->', r.status, up.url?.slice(0, 60), up.size, 'bytes');

// 2. create meeting (enqueues transcribe)
r = await fetch(base + '/api/meetings', {
  method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Real Deepgram Test', source: 'upload', audioUrl: up.url, mimeType: 'audio/wav' })
});
const created = await r.json();
console.log('2. create   ->', r.status, created.id, created.status);

// 3. poll until the job pipeline completes
for (let i = 0; i < 40; i++) {
  await new Promise(s => setTimeout(s, 1500));
  const sr = await fetch(`${base}/api/meetings/${created.id}/debug`, { headers: { cookie } });
  if (!sr.ok) { continue; }
  const d = await sr.json();
  console.log(`   t+${((i+1)*1.5).toFixed(0)}s status=${d.status} sentences=${d.sentences} jobs=${JSON.stringify(d.jobs)}`);
  if (d.status === 'completed' || d.status === 'failed') {
    console.log('\n--- TRANSCRIPT ---');
    d.lines.forEach(l => console.log(`  [${l.speakerName}] ${l.text}`));
    console.log('\n--- SUMMARY ---');
    console.log('  gist:', d.summary?.gist);
    console.log('  actions:', JSON.stringify(d.summary?.actionItems?.map(a=>a.text), null, 0));
    break;
  }
}
await browser.close();
