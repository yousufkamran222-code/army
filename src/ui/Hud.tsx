import { useEffect, useRef, useState } from 'preact/hooks';
import { COMMANDS } from '../config/commands';
import { RELIC_MAP, type RelicId } from '../config/relics';
import { JUICE } from '../config/tuning';
import { UNITS } from '../config/units';
import { Icon } from './icons';
import { IconBtn, RelicBadge, fmt } from './components';
import { actions, onPulse, update, useGame, useTick } from './store';
import { SettingsMenu } from './Menus';

function RelicTray({ relics }: { relics: RelicId[] }) {
  const pending = useRef(new Map<string, { n: number; set: boolean; t: number }>());
  const [labels, setLabels] = useState<{ key: number; id: string; text: string }[]>([]);
  const [pulsing, setPulsing] = useState<Record<string, number>>({});
  const keyRef = useRef(1);
  useEffect(
    () =>
      onPulse((id, n, set) => {
        const p = pending.current.get(id);
        if (p) p.n = set ? n : p.n + n;
        else pending.current.set(id, { n, set, t: performance.now() });
      }),
    [],
  );
  useEffect(() => {
    const iv = setInterval(() => {
      const now = performance.now();
      for (const [id, p] of pending.current) {
        if (now - p.t < JUICE.relicLabelWindow * 1000) continue;
        pending.current.delete(id);
        const def = RELIC_MAP[id as RelicId];
        if (!def || !relics.includes(id as RelicId)) continue;
        const key = keyRef.current++;
        setLabels((l) => [...l.filter((x) => x.id !== id), { key, id, text: def.label(Math.round(p.n)) }]);
        setPulsing((s) => ({ ...s, [id]: key }));
        setTimeout(() => setLabels((l) => l.filter((x) => x.key !== key)), 1200);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [relics]);
  return (
    <div class="relic-tray">
      {relics.map((id) => (
        <div class="tray-slot" key={id} title={RELIC_MAP[id].name + ': ' + RELIC_MAP[id].desc}>
          <span class="pulse-wrap" key={pulsing[id] ?? 0} data-pulse={pulsing[id] ? '1' : '0'}>
            <RelicBadge id={id} />
          </span>
          {labels
            .filter((l) => l.id === id)
            .map((l) => (
              <span class="tray-label" key={l.key}>
                {l.text}
              </span>
            ))}
        </div>
      ))}
    </div>
  );
}

export function BattleHud() {
  const g = useGame();
  useTick(100);
  const b = g.battle;
  if (!b) return null;
  const run = g.run;
  const bossAlive = b.bossIdx >= 0 && b.alive[b.bossIdx] && b.flags[b.bossIdx] & 4;
  const bossType = run.enemy.boss;
  const hpFrac = (s: number) => Math.max(0, b.statueHp[s] / b.statueMax[s]);
  return (
    <div class="hud">
      <div class="hud-top">
        <div class="side-box p">
          <div class="statue-hp">
            <Icon name="heart" />
            <div class="bar">
              <div style={{ width: `${hpFrac(0) * 100}%` }} />
            </div>
          </div>
          <div class="alive">
            {fmt(b.aliveCount[0])}
            <small>alive</small>
          </div>
        </div>
        <div class="hud-center">
          <div class="hud-title">
            Battle {run.battle} · {run.enemy.name}
          </div>
          <div class="hud-time">{b.deploying ? 'Deploying…' : `${Math.floor(b.time)}s`}</div>
          {bossType && (
            <div class={'bossbar' + (bossAlive ? '' : ' dead')}>
              <span>
                <Icon name="crown" /> {UNITS[bossType].name}
              </span>
              <div class="bar">
                <div style={{ width: `${bossAlive ? (100 * b.hp[b.bossIdx]) / b.bossMaxHp : 0}%` }} />
              </div>
            </div>
          )}
        </div>
        <div class="side-box e">
          <div class="statue-hp">
            <div class="bar">
              <div style={{ width: `${hpFrac(1) * 100}%` }} />
            </div>
            <Icon name="heart" />
          </div>
          <div class="alive">
            <small>alive</small>
            {fmt(b.aliveCount[1])}
          </div>
        </div>
        <div class="hud-ctrls">
          <button class="speedbtn" onClick={() => actions.setSpeed(g.speed === 1 ? 2 : g.speed === 2 ? 4 : 1)} title="Game speed">
            <Icon name="play" />
            {g.speed}×
          </button>
          <IconBtn icon={g.paused ? 'play' : 'pause'} title={g.paused ? 'Resume' : 'Pause'} on={g.paused} onClick={actions.togglePause} />
          <IconBtn icon="menu" title="Menu" on={g.menuOpen} onClick={() => update((s) => (s.menuOpen = !s.menuOpen))} />
          {g.menuOpen && <SettingsMenu />}
        </div>
      </div>
      <div class="hud-bottom">
        <div class="cmd-bar">
          {b.setup.commands.map((c, k) => {
            const used = b.commandsUsed[k];
            const active = (c === 'charge' && b.chargeT > 0) || (c === 'hold' && b.holdT > 0);
            return (
              <button class={`cmd-btn ${used ? 'used' : 'ready'} ${active ? 'active' : ''}`} disabled={used || b.finished} onClick={() => actions.command(k)} title={COMMANDS[c].desc}>
                <span class="cmd-key">{k + 1}</span>
                <Icon name={c} />
                <span class="cmd-name">{COMMANDS[c].name}</span>
                <span class="cmd-state">{active ? 'ACTIVE' : used ? 'USED' : 'READY'}</span>
              </button>
            );
          })}
        </div>
        <RelicTray relics={run.relics} />
      </div>
      {g.paused && <div class="paused-tag">PAUSED</div>}
    </div>
  );
}
