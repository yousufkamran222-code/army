// Frame-time benchmark of a 1,500+ stickman battle in headless Chromium.
// Usage: npm run build && node scripts/perf.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4180;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const gpu = process.argv.includes('--gpu');
const browser = await chromium.launch({ args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
for (const [name, vp, dpr] of [
  ['desktop 1280x720', { width: 1280, height: 720 }, 1],
  ['phone 844x390 @2x', { width: 844, height: 390 }, 2],
]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/?screen=battle&preset=swarm&battle=8&extra=swarmling:6,swordsman:6&numbers=1&prewarm=1&mirror=1`);
  // wait for the big clash
  await page.waitForFunction(() => window.__stick?.perf.alive >= 1500, null, { timeout: 20000 }).catch(() => console.log('  (did not reach 1500 alive)'));
  const r = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const st = window.__stick;
        const gaps = [];
        const alive = [];
        let last = performance.now();
        const t0 = last;
        const startIdx = st.perf.times.length;
        const tick = (now) => {
          gaps.push(now - last);
          last = now;
          alive.push(st.perf.alive);
          if (now - t0 < 6000) requestAnimationFrame(tick);
          else {
            const upd = st.perf.times.slice(-gaps.length);
            const s = [...gaps].sort((a, b) => a - b);
            const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
            resolve({
              frames: gaps.length,
              fps: (1000 * gaps.length) / (now - t0),
              p50: q(0.5),
              p95: q(0.95),
              updateMsAvg: upd.reduce((a, b) => a + b, 0) / upd.length,
              updateMsP95: [...upd].sort((a, b) => a - b)[Math.floor(upd.length * 0.95)],
              aliveMin: Math.min(...alive),
              aliveMax: Math.max(...alive),
              spawned: st.battle?.spawned[0] + st.battle?.spawned[1],
              startIdx,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  results.push({ name, ...r });
  console.log(name, JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  await ctx.close();
}
await browser.close();
server.kill();
