// End-to-end UI test in a real browser (landscape phone + desktop).
// Checks: no page scrolling/jumps, buy/sell/reorder/detail flows, a full winning run, a losing run,
// and the rotate prompt in portrait.
// Usage: npm run build && npm run e2e
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
};

const devices = [
  ['phone 844x390', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['small phone 667x375', { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['desktop 1280x720', { viewport: { width: 1280, height: 720 } }],
];

for (const [name, opts] of devices) {
  console.log(`\n== ${name}`);
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(1200);
  await page.click('text=New run');
  await page.waitForSelector('.shop');
  const st = (fn) => page.evaluate(fn);
  const layout = () =>
    st(() => {
      const d = document.scrollingElement;
      const offscreen = [...document.querySelectorAll('.shop .panel, .fight, .offer, .squad-card')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1 || r.left < -1;
      }).length;
      return { scrollTop: d.scrollTop, scrollH: d.scrollHeight, h: innerHeight, offscreen, fightTop: Math.round(document.querySelector('.fight').getBoundingClientRect().top) };
    });
  const l0 = await layout();
  check(l0.scrollH <= l0.h + 1 && l0.offscreen === 0, `shop fits one screen (page height ${l0.scrollH} vs ${l0.h}, elements off-screen: ${l0.offscreen})`);

  // give gold and buy every unit offer: nothing on screen should move
  await st(() => {
    window.__stick.run.gold = 60;
    window.__stick.update();
  });
  await page.waitForTimeout(200);
  const before = await layout();
  for (const b of await page.$$('.offer.unit .buy')) await b.click();
  await page.waitForTimeout(300);
  const after = await layout();
  check(after.scrollTop === 0 && after.fightTop === before.fightTop, `buying keeps the screen still (fight button y ${before.fightTop} -> ${after.fightTop})`);
  const armyLen = await st(() => window.__stick.run.army.length);
  check(armyLen >= 2, `bought units joined the army (${armyLen} slots)`);

  // detail panel: open by tapping a card, close with X
  // (UI updates land on the next animation frame; software-rendered headless frames are slow, so wait for them)
  const appears = (sel) => page.waitForSelector(sel, { timeout: 3000 }).then(() => true, () => false);
  const goes = (sel) => page.waitForSelector(sel, { state: 'detached', timeout: 3000 }).then(() => true, () => false);
  await page.click('.offer.relic .o-name');
  check(await appears('.detail'), 'tapping a relic opens the detail panel');
  await page.click('.detail .d-close');
  check(await goes('.detail'), 'detail panel closes');

  // reorder by drag: drag slot 1 onto slot 2
  const order0 = await st(() => window.__stick.run.army.map((s) => s.type).join(','));
  const cards = await page.$$('.formation .squad-card[data-sort]');
  if (cards.length >= 2) {
    const a = await cards[0].boundingBox();
    const b = await cards[1].boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 - 20, a.y + a.height / 2, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const order1 = await st(() => window.__stick.run.army.map((s) => s.type).join(','));
    check(order1 !== order0, `dragging reorders the army (${order0} -> ${order1})`);
  }
  // sell via detail
  await page.click('.formation .squad-card[data-sort="0"]');
  await page.waitForSelector('.detail');
  const goldBefore = await st(() => window.__stick.run.gold);
  await page.click('.detail .btn.danger');
  await page.waitForTimeout(150);
  check((await st(() => window.__stick.run.gold)) > goldBefore, 'selling a unit refunds gold');

  // full winning run: fight each battle, force the win, continue
  let hudOk = true;
  for (let b = 1; b <= 8; b++) {
    await page.click('.fight');
    await page.waitForSelector('.hud');
    await page.waitForTimeout(500);
    const ok = await st(() => {
      const cmds = [...document.querySelectorAll('.cmd-btn')];
      const inView = cmds.every((c) => c.getBoundingClientRect().bottom <= innerHeight + 1);
      return cmds.length >= 2 && inView && document.scrollingElement.scrollHeight <= innerHeight + 1;
    });
    if (!ok) hudOk = false;
    await st(() => window.__stick.battle.forceWin());
    await page.waitForSelector('.modal.reward', { timeout: 30000 });
    await page.click('.modal.reward .btn.primary');
    await page.waitForTimeout(300);
  }
  check(hudOk, 'battle HUD shows commands on screen in all 8 battles');
  check((await st(() => window.__stick.screen)) === 'summary' && (await page.textContent('.modal h2')).includes('Run complete'), 'winning battle 8 shows the run summary');

  // losing run
  await page.click('.modal.summary .btn.primary');
  await page.waitForSelector('.shop');
  await page.click('.fight');
  await page.waitForSelector('.hud');
  await st(() => window.__stick.battle.forceLose());
  await page.waitForSelector('.modal.summary', { timeout: 30000 });
  check((await page.textContent('.modal h2')).includes('statue fell'), 'losing a battle ends the run');
  check(errs.length === 0, `no page errors ${errs.length ? JSON.stringify(errs) : ''}`);
  await ctx.close();
}

// portrait phone shows the rotate prompt
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const pp = await pctx.newPage();
await pp.goto(`http://localhost:${PORT}/`);
await pp.waitForTimeout(800);
check(await pp.isVisible('.rotate'), 'portrait phone shows "turn your phone sideways"');
await browser.close();
server.kill();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
