import './ui/style.css';
import { Application } from 'pixi.js';
import { BattleView } from './render/battleView';
import { Battle } from './sim/battle';
import { sfx } from './audio/sfx';
import { setAtlas, h, hideTip } from './ui/dom';
import { renderShop } from './ui/shop';
import { Hud } from './ui/hud';
import { renderDebug, renderReward, renderSummary, renderTitle } from './ui/screens';
import { preset } from './game/presets';
import { newRun, battleSetup, finishBattle, jumpToBattle, isBossBattle, addUnit, grantRelic, type RunState } from './game/run';
import { UNITS } from './config/units';
import type { BattleResult } from './sim/types';

type Screen = 'title' | 'shop' | 'battle' | 'reward' | 'summary';

const params = new URLSearchParams(location.search);

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: false,
    backgroundColor: 0x161c2b,
    // phones: cap at 1.5x to save fill-rate (stickmen are drawn from a 2x atlas anyway)
    resolution: Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2),
    autoDensity: true,
    powerPreference: 'high-performance',
    preference: 'webgl',
  });
  document.getElementById('stage')!.append(app.canvas);
  const view = new BattleView(app);
  setAtlas(view.atlas);
  const ui = document.getElementById('ui')!;
  const hud = new Hud(ui);

  let run: RunState = newRun();
  let screen: Screen = 'title';
  let battle: Battle | null = null;
  let debugEl: HTMLElement | null = null;
  let speed = Number(localStorage.getItem('stickstorm.speed') ?? '1') || 1;
  view.speed = speed;
  view.showNumbers = localStorage.getItem('stickstorm.numbers') !== '0';

  // perf/debug stats exposed for automated checks
  const perf = { frames: 0, times: [] as number[], alive: 0 };
  (window as unknown as { __stick: unknown }).__stick = { perf, get battle() { return battle; }, get run() { return run; }, get screen() { return screen; }, view };

  (window as unknown as { __rerenderSummary: () => void }).__rerenderSummary = () => {
    ui.innerHTML = '';
    renderSummary(ui, run, startRun);
  };

  const unlockAudio = () => sfx.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // ---------------------------------------------------------------- flow
  const go = (s: Screen) => {
    screen = s;
    hideTip(true);
    if (s !== 'battle') hud.unmount();
    debugEl?.remove();
    debugEl = null;
  };

  const toShop = () => {
    go('shop');
    demo = null;
    view.stop();
    renderShop(ui, run, { onFight: startBattle, onDebug: toggleDebug, onMute: () => sfx.setMuted(!sfx.muted) });
  };

  const startBattle = () => {
    sfx.play('horn');
    go('battle');
    ui.innerHTML = '';
    demo = null;
    const setup = battleSetup(run);
    if (params.get('mirror')) {
      // benchmark helper: the enemy gets a copy of your army (huge symmetric clash)
      setup.enemy.slots = setup.player.slots.map((x) => ({ ...x }));
      setup.enemy.mods = setup.player.mods;
      setup.enemy.minion = setup.player.minion;
      setup.enemy.statueHp = 5000;
    }
    battle = new Battle(setup);
    if (params.get('prewarm')) {
      // benchmark helper: fast-forward headlessly to the moment the armies clash
      battle.emitEvents = false;
      while (battle.tick < 1500 && (battle.deploying || battle.front[1] - battle.front[0] > 30)) battle.step();
      battle.emitEvents = true;
    }
    view.start(battle);
    view.paused = false;
    view.speed = speed;
    view.hooks = {
      onRelic: (id, n, set) => hud.pulse(id, n, set),
      onFinish: (r) => endBattle(r),
      onBanner: (t, c) => hud.banner(t, c),
    };
    hud.mount(battle, run.relics, hudHooks, `Battle ${run.battle}: ${run.enemy.name}`);
    hud.banner(isBossBattle(run.battle) ? `👑 BOSS: ${UNITS[run.enemy.boss!].name}` : `Battle ${run.battle}`, isBossBattle(run.battle) ? '#ff8a6a' : '#fff');
    ui.append(h('button', { class: 'debugbtn', onclick: toggleDebug }, '🐞'));
  };

  const hudHooks = {
    onCommand: (k: number) => {
      if (battle?.useCommand(k)) {
        const id = battle.setup.commands[k];
        hud.banner(`${id === 'charge' ? '⚔️ CHARGE!' : id === 'hold' ? '🛡️ HOLD THE LINE!' : id === 'volley' ? '🏹 VOLLEY!' : id === 'rally' ? '📯 RALLY!' : id === 'meteor' ? '☄️ METEOR!' : id === 'raise' ? '💀 RISE!' : '🐜 BURST!'}`, '#ffcf3a', '42%');
      }
    },
    onSpeed: (s: number) => {
      speed = s;
      view.speed = s;
      view.paused = false;
      localStorage.setItem('stickstorm.speed', String(s));
    },
    onPause: () => (view.paused = !view.paused),
    onNumbers: () => {
      view.showNumbers = !view.showNumbers;
      localStorage.setItem('stickstorm.numbers', view.showNumbers ? '1' : '0');
    },
    onMute: () => sfx.setMuted(!sfx.muted),
    getSpeed: () => speed,
    isPaused: () => view.paused,
    numbersOn: () => view.showNumbers,
  };

  const endBattle = (r: BattleResult) => {
    const won = r.winner === 0;
    sfx.play(won ? 'win' : 'lose');
    const reward = finishBattle(run, r);
    hud.unmount();
    screen = 'reward';
    if (!won || !reward) {
      setTimeout(() => {
        view.stop();
        go('summary');
        renderSummary(ui, run, startRun);
      }, 300);
      return;
    }
    ui.innerHTML = '';
    renderReward(ui, run, r, reward, () => {
      if (run.over && run.won) {
        view.stop();
        go('summary');
        renderSummary(ui, run, startRun);
      } else toShop();
    });
  };

  const startRun = () => {
    sfx.play('click');
    run = newRun();
    if (params.get('preset')) preset(run, params.get('preset') as never);
    toShop();
  };

  const toggleDebug = () => {
    if (debugEl) {
      debugEl.remove();
      debugEl = null;
      return;
    }
    debugEl = renderDebug(ui, run, {
      refresh: () => {
        if (screen === 'shop') {
          renderShop(ui, run, { onFight: startBattle, onDebug: toggleDebug, onMute: () => sfx.setMuted(!sfx.muted) });
          if (debugEl) ui.append(debugEl);
        }
      },
      winBattle: () => {
        battle?.forceWin();
      },
      inBattle: () => screen === 'battle',
      close: () => toggleDebug(),
    });
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') toggleDebug();
    if (screen === 'battle' && battle) {
      if (e.key === ' ') hudHooks.onPause();
      if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
        const k = Number(e.key) - 1;
        hudHooks.onCommand(k);
      }
    }
  });

  // ---------------------------------------------------------------- title / attract mode
  let demo: Battle | null = null;
  const startDemo = () => {
    const d = newRun(1234);
    preset(d, 'swarm');
    addUnit(d, 'giant', 3);
    jumpToBattle(d, 6);
    demo = new Battle(battleSetup(d));
    view.start(demo);
    view.speed = 1;
    view.showNumbers = false;
    view.hooks = { onFinish: () => startDemo() };
  };

  // ---------------------------------------------------------------- loop
  app.ticker.add((tk) => {
    const t0 = performance.now();
    view.update(tk.deltaMS / 1000);
    if (screen === 'battle') hud.update();
    perf.frames++;
    if (battle) perf.alive = battle.aliveCount[0] + battle.aliveCount[1];
    perf.times.push(performance.now() - t0);
    if (perf.times.length > 600) perf.times.shift();
  });

  // URL params for testing: ?screen=shop|battle&battle=N&preset=swarm&relics=a,b&gold=N&speed=N
  if (params.has('screen')) {
    run = newRun(Number(params.get('seed') ?? 7));
    if (params.get('preset')) preset(run, params.get('preset') as never);
    if (params.get('relics')) for (const r of params.get('relics')!.split(',')) grantRelic(run, r as never);
    if (params.get('battle')) jumpToBattle(run, Number(params.get('battle')));
    // e.g. extra=swarmling:9,swordsman:9 (adds unit copies; used by the perf benchmark)
    if (params.get('extra')) for (const kv of params.get('extra')!.split(',')) addUnit(run, kv.split(':')[0] as never, Number(kv.split(':')[1] ?? 1));
    if (params.get('gold')) run.gold = Number(params.get('gold'));
    if (params.get('speed')) speed = Number(params.get('speed'));
    if (params.get('numbers') === '0') view.showNumbers = false;
    const s = params.get('screen');
    if (s === 'battle') startBattle();
    else if (s === 'summary') {
      go('summary');
      renderSummary(ui, run, startRun);
    } else toShop();
  } else {
    startDemo();
    renderTitle(ui, () => {
      view.showNumbers = localStorage.getItem('stickstorm.numbers') !== '0';
      startRun();
    });
  }
}

void boot();
