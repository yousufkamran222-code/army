import { BUYABLE_UNITS, UNITS } from '../config/units';
import { RELICS } from '../config/relics';
import { TOTAL_BATTLES, addUnit, grantRelic, isBossBattle, jumpToBattle } from '../game/run';
import { preset, type PresetName } from '../game/presets';
import { Icon } from './icons';
import { Btn } from './components';
import { actions, update, useGame } from './store';

export function SettingsMenu() {
  const g = useGame();
  const row = (icon: string, label: string, on: boolean | null, fn: () => void) => (
    <button
      class={'menu-row' + (on ? ' on' : '')}
      onClick={(e) => {
        e.stopPropagation();
        fn();
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {on !== null && <em>{on ? 'On' : 'Off'}</em>}
    </button>
  );
  return (
    <div class="menu" onClick={(e) => e.stopPropagation()}>
      {row(g.muted ? 'mute' : 'sound', 'Sound', !g.muted, actions.toggleMute)}
      {row('numbers', 'Damage numbers', g.numbers, actions.toggleNumbers)}
      {row('bug', 'Debug / cheats', g.debugOpen, () => update((s) => ((s.debugOpen = !s.debugOpen), (s.menuOpen = false))))}
      {g.screen === 'battle' && row('flag', 'Give up battle', null, actions.quitBattle)}
      {row('skull', 'Abandon run', null, () => confirm('Abandon this run and start a new one?') && actions.startRun())}
    </div>
  );
}

export function DebugPanel() {
  const g = useGame();
  if (!g.debugOpen) return null;
  const run = g.run;
  const act = (fn: () => void) => () => {
    update(fn);
    actions.refreshShop();
  };
  return (
    <div class="debug" onClick={(e) => e.stopPropagation()}>
      <div class="debug-head">
        <b>
          <Icon name="bug" /> Debug / cheats
        </b>
        <button class="d-close" onClick={() => update((s) => (s.debugOpen = false))} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      {g.screen === 'battle' && (
        <div class="debug-sec">
          <Btn kind="gold" onClick={actions.forceWin}>
            Win this battle now
          </Btn>
        </div>
      )}
      <div class="debug-sec">
        <h4>Jump to battle (now {run.battle})</h4>
        <div class="debug-row">
          {Array.from({ length: TOTAL_BATTLES }, (_, i) => (
            <Btn class={run.battle === i + 1 ? 'on' : ''} onClick={act(() => jumpToBattle(run, i + 1))}>
              {i + 1}
              {isBossBattle(i + 1) && <Icon name="crown" />}
            </Btn>
          ))}
        </div>
      </div>
      <div class="debug-sec">
        <h4>Gold (now {run.gold})</h4>
        <div class="debug-row">
          {[10, 50, 200].map((n) => (
            <Btn onClick={act(() => (run.gold += n))}>+{n}</Btn>
          ))}
        </div>
      </div>
      <div class="debug-sec">
        <h4>Quick builds (replace army + relics)</h4>
        <div class="debug-row">
          {(['swarm', 'necro', 'archer', 'giant'] as PresetName[]).map((p) => (
            <Btn onClick={act(() => preset(run, p))}>{p}</Btn>
          ))}
        </div>
      </div>
      <div class="debug-sec">
        <h4>Add 3 copies</h4>
        <div class="debug-row">
          {BUYABLE_UNITS.map((u) => (
            <Btn onClick={act(() => addUnit(run, u, 3))}>{UNITS[u].name}</Btn>
          ))}
        </div>
      </div>
      <div class="debug-sec">
        <h4>Grant relic ({run.relics.length}/5, replaces the leftmost when full)</h4>
        <div class="debug-row">
          {RELICS.map((r) => (
            <Btn class={run.relics.includes(r.id) ? 'on' : ''} onClick={act(() => grantRelic(run, r.id))}>
              <Icon name={r.id} /> {r.name}
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}
