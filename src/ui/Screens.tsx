import { useEffect, useState } from 'preact/hooks';
import { UNITS } from '../config/units';
import { RELIC_MAP } from '../config/relics';
import { TOTAL_BATTLES, bestCombo, playerSide } from '../game/run';
import { Icon } from './icons';
import { Portrait } from './art';
import { Btn, Gold, RelicBadge, fmt } from './components';
import { actions, useGame } from './store';
import { ShopScreen } from './Shop';
import { BattleHud } from './Hud';
import { DebugPanel } from './Menus';

function CountUp({ to, ms = 700 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{fmt(v)}</>;
}

function Stat({ v, k }: { v: number; k: string }) {
  return (
    <div class="stat">
      <b>
        <CountUp to={v} />
      </b>
      <span>{k}</span>
    </div>
  );
}

export function TitleScreen() {
  return (
    <div class="screen title">
      <div class="title-card">
        <h1>STICKSTORM</h1>
        <p>Build a stick-figure army. Stack relics that multiply. Watch a dozen stickmen snowball into thousands.</p>
        <Btn kind="primary" class="big" onClick={actions.startRun}>
          <Icon name="charge" /> New run
        </Btn>
        <p class="muted">8 battles · 2 bosses · about 15 minutes</p>
      </div>
    </div>
  );
}

export function RewardScreen() {
  const g = useGame();
  const r = g.result;
  const rw = g.reward;
  if (!r || !rw) return null;
  const run = g.run;
  const rows: [string, number][] = [
    ['Battle reward', rw.base],
    ...(rw.fast ? [[`Fast win (${r.time.toFixed(0)}s)`, rw.fast] as [string, number]] : []),
    ...(rw.flawless ? [['Flawless: statue untouched', rw.flawless] as [string, number]] : []),
    ...(rw.bounty ? [['Bounty Board', rw.bounty] as [string, number]] : []),
    ['Interest', rw.interest],
  ];
  return (
    <div class="screen modal-screen">
      <div class="modal reward">
        <div class="m-left">
          <h2 class="win">
            <Icon name="trophy" /> Victory!
          </h2>
          <div class="stats4">
            <Stat v={r.spawned[0]} k="deployed" />
            <Stat v={r.kills[0]} k="enemies defeated" />
            <Stat v={r.peakAlive[0]} k="peak army" />
            <Stat v={r.biggestHit} k="biggest hit" />
          </div>
        </div>
        <div class="m-right">
          <div class="ledger">
            {rows.map(([k, v]) => (
              <div>
                <span>{k}</span>
                <b>+{v}</b>
              </div>
            ))}
            <div class="total">
              <span>Gold</span>
              <Gold n={run.gold} />
            </div>
          </div>
          <Btn kind="primary" onClick={actions.continueFromReward}>
            {run.over && run.won ? 'See summary' : `Shop · next battle ${run.battle}`} <Icon name="arrow" />
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function SummaryScreen() {
  const g = useGame();
  const run = g.run;
  const st = run.stats;
  const combo = bestCombo(st);
  const ps = playerSide(run);
  return (
    <div class="screen modal-screen">
      <div class="modal summary">
        <div class="m-left">
          <h2 class={run.won ? 'win' : 'lose'}>
            <Icon name={run.won ? 'crown' : 'skull'} /> {run.won ? 'Run complete!' : 'Your statue fell'}
          </h2>
          <div class="muted center">{run.won ? 'All 8 battles won, including both bosses.' : `Defeated in battle ${run.battle} of ${TOTAL_BATTLES}.`}</div>
          <div class="stats4">
            <Stat v={st.spawned} k="stickmen spawned" />
            <Stat v={st.biggestHit} k="biggest hit" />
            <Stat v={st.peakAlive} k="peak army" />
            <Stat v={st.kills} k="enemies defeated" />
          </div>
          <div class="battle-log">
            {st.log.map((l) => (
              <span class={l.won ? 'w' : 'l'}>
                {l.battle}
                <Icon name={l.won ? 'trophy' : 'skull'} />
              </span>
            ))}
          </div>
        </div>
        <div class="m-right">
          {combo && (
            <div class="best-combo">
              <RelicBadge id={combo.id} size="lg" />
              <div>
                <span class="label">Best combo</span>
                <b>{RELIC_MAP[combo.id].name}</b>
                <em>{RELIC_MAP[combo.id].label(combo.n)} over the run</em>
              </div>
            </div>
          )}
          <div class="final-army">
            {run.army.map((s, i) => (
              <div class="fa-unit">
                <Portrait type={s.type} />
                <span>{UNITS[s.type].name}</span>
                <b>×{fmt(ps.slots[i].count)}</b>
              </div>
            ))}
          </div>
          <div class="final-relics">
            {run.relics.map((id) => (
              <RelicBadge id={id} size="sm" />
            ))}
          </div>
          <Btn kind="primary" onClick={actions.startRun}>
            <Icon name="charge" /> New run
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Overlays() {
  const g = useGame();
  return (
    <>
      <div class="banners">
        {g.banners.map((b) => (
          <div class={'banner' + (b.big ? ' big' : '')} key={b.id} style={{ color: b.color }}>
            {b.text}
          </div>
        ))}
      </div>
      {g.toast && (
        <div class={'toast' + (g.toast.bad ? ' bad' : '')} key={g.toast.id}>
          {g.toast.text}
        </div>
      )}
      <DebugPanel />
      <div class="rotate">
        <Icon name="rotate" />
        <b>Turn your phone sideways</b>
        <span>Stickstorm is played in landscape.</span>
      </div>
    </>
  );
}

export function App() {
  const g = useGame();
  return (
    <div class={'app screen-' + g.screen}>
      {g.screen === 'title' && <TitleScreen />}
      {g.screen === 'shop' && <ShopScreen />}
      {(g.screen === 'battle' || g.screen === 'reward') && <BattleHud />}
      {g.screen === 'reward' && <RewardScreen />}
      {g.screen === 'summary' && <SummaryScreen />}
      <Overlays />
    </div>
  );
}
