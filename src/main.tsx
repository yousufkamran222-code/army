import './ui/style.css';
import { Application } from 'pixi.js';
import { render } from 'preact';
import { BattleView } from './render/battleView';
import { Battle } from './sim/battle';
import { sfx } from './audio/sfx';
import { setAtlas } from './ui/art';
import { App } from './ui/Screens';
import { actions, banner, emitPulse, getState, initState, update } from './ui/store';
import { preset } from './game/presets';
import { newRun, battleSetup, finishBattle, jumpToBattle, isBossBattle, addUnit, grantRelic } from './game/run';
import { UNITS } from './config/units';
import { COMMANDS } from './config/commands';
import type { BattleResult } from './sim/types';

const params = new URLSearchParams(location.search);
const store = (k: string, d: string) => {
  try {
    return localStorage.getItem('stickstorm.' + k) ?? d;
  } catch {
    return d;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem('stickstorm.' + k, v);
  } catch {
    /* ignore */
  }
};

/** Phones: go fullscreen and lock to landscape where the browser allows it. */
function goLandscape() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), Promise.resolve());
  Promise.resolve(p)
    .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
    .catch(() => {});
}

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

  initState({
    screen: 'title',
    run: newRun(),
    battle: null,
    result: null,
    reward: null,
    sel: null,
    debugOpen: false,
    menuOpen: false,
    toast: null,
    banners: [],
    speed: Number(store('speed', '1')) || 1,
    paused: false,
    numbers: store('numbers', '1') !== '0',
    muted: sfx.muted,
  });
  const S = getState;
  view.showNumbers = S().numbers;

  const perf = { frames: 0, times: [] as number[], alive: 0 };
  (window as unknown as { __stick: unknown }).__stick = {
    perf,
    view,
    get battle() {
      return S().battle;
    },
    get run() {
      return S().run;
    },
    get screen() {
      return S().screen;
    },
    update,
  };
  window.addEventListener('pointerdown', () => sfx.unlock());
  window.addEventListener('keydown', () => sfx.unlock());

  // ---------------------------------------------------------------- actions
  let demo: Battle | null = null;
  const toShop = () => {
    demo = null;
    view.showBackdrop();
    update((s) => {
      s.screen = 'shop';
      s.battle = null;
      s.sel = null;
      s.menuOpen = false;
    });
  };

  Object.assign(actions, {
    startRun: () => {
      goLandscape();
      const run = newRun();
      if (params.get('preset')) preset(run, params.get('preset') as never);
      update((s) => {
        s.run = run;
        s.debugOpen = false;
      });
      toShop();
    },
    startBattle: () => {
      const run = S().run;
      sfx.play('horn');
      demo = null;
      const setup = battleSetup(run);
      if (params.get('mirror')) {
        setup.enemy.slots = setup.player.slots.map((x) => ({ ...x }));
        setup.enemy.mods = setup.player.mods;
        setup.enemy.minion = setup.player.minion;
        setup.enemy.statueHp = 5000;
      }
      const battle = new Battle(setup);
      if (params.get('prewarm')) {
        battle.emitEvents = false;
        while (battle.tick < 1500 && (battle.deploying || battle.front[1] - battle.front[0] > 30)) battle.step();
        battle.emitEvents = true;
      }
      view.start(battle);
      view.paused = false;
      view.speed = S().speed;
      view.hooks = {
        onRelic: emitPulse,
        onFinish: endBattle,
        onBanner: (t, c) => banner(t, c),
      };
      update((s) => {
        s.screen = 'battle';
        s.battle = battle;
        s.paused = false;
        s.sel = null;
        s.menuOpen = false;
      });
      const boss = isBossBattle(run.battle);
      banner(boss ? `Boss: ${UNITS[run.enemy.boss!].name}` : `Battle ${run.battle}`, boss ? '#ff9a7a' : '#fff', true);
    },
    continueFromReward: () => {
      const run = S().run;
      if (run.over && run.won) {
        view.showBackdrop();
        update((s) => ((s.screen = 'summary'), (s.battle = null)));
      } else toShop();
    },
    command: (k: number) => {
      const b = S().battle;
      if (!b?.useCommand(k)) return;
      banner(COMMANDS[b.setup.commands[k]].name.toUpperCase() + '!', '#ffcf3a');
      update();
    },
    setSpeed: (sp: number) => {
      view.speed = sp;
      view.paused = false;
      save('speed', String(sp));
      update((s) => ((s.speed = sp), (s.paused = false)));
    },
    togglePause: () => {
      view.paused = !view.paused;
      update((s) => (s.paused = view.paused));
    },
    toggleNumbers: () => {
      view.showNumbers = !view.showNumbers;
      save('numbers', view.showNumbers ? '1' : '0');
      update((s) => (s.numbers = view.showNumbers));
    },
    toggleMute: () => {
      sfx.setMuted(!sfx.muted);
      update((s) => (s.muted = sfx.muted));
    },
    forceWin: () => S().battle?.forceWin(),
    refreshShop: () => update(),
    quitBattle: () => {
      const b = S().battle;
      if (b && !b.finished && confirm('Give up this battle? Your run will end.')) {
        b.forceLose();
        update((s) => (s.menuOpen = false));
      }
    },
  });

  const endBattle = (r: BattleResult) => {
    if (demo) return startDemo();
    const run = S().run;
    const won = r.winner === 0;
    sfx.play(won ? 'win' : 'lose');
    const reward = finishBattle(run, r);
    if (!won || !reward) {
      view.showBackdrop();
      update((s) => ((s.screen = 'summary'), (s.battle = null), (s.result = r)));
      return;
    }
    update((s) => ((s.screen = 'reward'), (s.result = r), (s.reward = reward), (s.menuOpen = false)));
  };

  const startDemo = () => {
    const d = newRun(1234);
    preset(d, 'swarm');
    addUnit(d, 'giant', 3);
    jumpToBattle(d, 6);
    demo = new Battle(battleSetup(d));
    view.start(demo);
    view.speed = 1;
    view.showNumbers = false;
    view.hooks = { onFinish: endBattle };
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') update((s) => (s.debugOpen = !s.debugOpen));
    const s = S();
    if (s.screen === 'battle' && s.battle) {
      if (e.key === ' ') {
        e.preventDefault();
        actions.togglePause();
      }
      if (e.key >= '1' && e.key <= '4') actions.command(Number(e.key) - 1);
    }
    if (e.key === 'Escape') update((st) => ((st.sel = null), (st.menuOpen = false), (st.debugOpen = false)));
  });

  // ---------------------------------------------------------------- loop
  app.ticker.add((tk) => {
    const t0 = performance.now();
    view.update(tk.deltaMS / 1000);
    perf.frames++;
    const b = S().battle;
    if (b) perf.alive = b.aliveCount[0] + b.aliveCount[1];
    perf.times.push(performance.now() - t0);
    if (perf.times.length > 600) perf.times.shift();
  });

  render(<App />, document.getElementById('ui')!);

  // URL params for testing: ?screen=shop|battle|summary&battle=N&preset=swarm&relics=a,b&gold=N&speed=N&extra=unit:copies
  if (params.has('screen')) {
    const run = newRun(Number(params.get('seed') ?? 7));
    if (params.get('preset')) preset(run, params.get('preset') as never);
    if (params.get('relics')) for (const r of params.get('relics')!.split(',')) grantRelic(run, r as never);
    if (params.get('battle')) jumpToBattle(run, Number(params.get('battle')));
    if (params.get('extra')) for (const kv of params.get('extra')!.split(',')) addUnit(run, kv.split(':')[0] as never, Number(kv.split(':')[1] ?? 1));
    if (params.get('gold')) run.gold = Number(params.get('gold'));
    if (params.get('numbers') === '0') view.showNumbers = false;
    update((s) => {
      s.run = run;
      if (params.get('speed')) s.speed = Number(params.get('speed'));
    });
    const sc = params.get('screen');
    if (sc === 'battle') actions.startBattle();
    else if (sc === 'summary') {
      view.showBackdrop();
      update((s) => (s.screen = 'summary'));
    } else toShop();
  } else {
    startDemo();
  }
}

void boot();
