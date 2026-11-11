// Playwright screenshots of key screens at desktop + phone sizes.
// Usage: npm run build && node scripts/shots.mjs [only-name-substring]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); // uses a global/NODE_PATH Playwright if not installed locally
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const only = process.argv[2];
mkdirSync('screenshots', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const phoneL = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const shots = [
  { name: 'title-desktop', ctx: desktop, url: '', wait: 4000 },
  { name: 'shop-desktop', ctx: desktop, url: '?screen=shop&preset=swarm&battle=4&gold=23', wait: 1200, full: true },
  { name: 'shop-phone', ctx: phone, url: '?screen=shop&preset=archer&battle=3&gold=14', wait: 1200, full: true },
  { name: 'battle-small-desktop', ctx: desktop, url: '?screen=battle&battle=1', wait: 9000 },
  { name: 'battle-huge-desktop', ctx: desktop, url: '?screen=battle&preset=swarm&battle=8&speed=1', wait: 16000 },
  { name: 'battle-relic-desktop', ctx: desktop, url: '?screen=battle&preset=archer&battle=5', wait: 10500 },
  { name: 'battle-boss-desktop', ctx: desktop, url: '?screen=battle&preset=giant&battle=4', wait: 12000 },
  { name: 'battle-phone-landscape', ctx: phoneL, url: '?screen=battle&preset=necro&battle=6', wait: 14000 },
  { name: 'battle-phone-portrait', ctx: phone, url: '?screen=battle&preset=swarm&battle=5', wait: 12000 },
  { name: 'summary-desktop', ctx: desktop, url: '?screen=summary&preset=swarm&battle=8', wait: 1500, fake: true },
  { name: 'summary-phone', ctx: phone, url: '?screen=summary&preset=necro&battle=5', wait: 1500, fake: true },
];

for (const s of shots) {
  if (only && !s.name.includes(only)) continue;
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${s.name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${s.name}] console`, m.text()));
  await page.goto(BASE + s.url);
  await page.waitForTimeout(s.wait);
  if (s.fake) {
    await page.evaluate(() => {
      const st = window.__stick;
      const r = st.run;
      Object.assign(r.stats, { spawned: 4821, kills: 2290, biggestHit: 912, peakAlive: 1377, relicTotals: { mitosis: 2311, strength_in_numbers: 500 } });
      r.stats.log = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => ({ battle: b, won: b < 8, time: 20 + b * 3, spawned: 40 * b * b, peak: 30 * b * b, kills: 25 * b * b, gold: 8 }));
      r.over = true;
      document.querySelector('.modal')?.remove();
    });
    await page.evaluate(() => window.__rerenderSummary?.());
    await page.waitForTimeout(300);
  }
  const path = `screenshots/${s.name}.png`;
  await page.screenshot({ path, fullPage: !!s.full });
  const info = await page.evaluate(() => {
    const st = window.__stick;
    const t = st.perf.times.slice(-120);
    return { alive: st.perf.alive, avgFrameMs: t.length ? (t.reduce((a, b) => a + b, 0) / t.length).toFixed(2) : null };
  });
  console.log(s.name, path, JSON.stringify(info));
  await ctx.close();
}
await browser.close();
server.kill();
