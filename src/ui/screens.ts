import { UNITS, BUYABLE_UNITS } from '../config/units';
import { RELICS, RELIC_MAP } from '../config/relics';
import type { RunState, RewardBreakdown } from '../game/run';
import { TOTAL_BATTLES, addUnit, bestCombo, grantRelic, jumpToBattle, playerSide } from '../game/run';
import type { BattleResult } from '../sim/types';
import { fmt, h, unitThumb } from './dom';

export function renderTitle(root: HTMLElement, onStart: () => void) {
  root.innerHTML = '';
  root.append(
    h(
      'div',
      { class: 'title' },
      h('h1', {}, 'STICKSTORM'),
      h('p', {}, 'Build a stick-figure army. Stack relics that multiply. Watch a dozen stickmen snowball into thousands.'),
      h('button', { class: 'primary', onclick: onStart }, '⚔️ New run'),
      h('p', { style: 'font-size:13px;opacity:.8' }, '8 battles · 2 bosses · ~15 minutes'),
    ),
  );
}

export function renderReward(root: HTMLElement, run: RunState, r: BattleResult, reward: RewardBreakdown, onContinue: () => void) {
  const row = (k: string, v: number, show = true) => (show ? [h('span', {}, k), h('b', {}, `+${v}`)] : []);
  root.append(
    h(
      'div',
      { class: 'modal' },
      h(
        'div',
        { class: 'box' },
        h('h2', { class: 'win' }, '🏆 Victory!'),
        h(
          'div',
          { class: 'bigstats' },
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(r.spawned[0])), h('div', { class: 'k' }, 'stickmen deployed')),
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(r.kills[0])), h('div', { class: 'k' }, 'enemies flattened')),
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(r.peakAlive[0])), h('div', { class: 'k' }, 'peak army')),
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(r.biggestHit)), h('div', { class: 'k' }, 'biggest hit')),
        ),
        h(
          'div',
          { class: 'kv' },
          ...row('Battle reward', reward.base),
          ...row(`Fast win (under 30s): ${r.time.toFixed(0)}s`, reward.fast, reward.fast > 0),
          ...row('Flawless (statue untouched)', reward.flawless, reward.flawless > 0),
          ...row('📜 Bounty Board', reward.bounty, reward.bounty > 0),
          ...row('Interest (1 per 5 held)', reward.interest),
          h('span', { class: 'total' }, 'Gold'),
          h('b', { class: 'total' }, `💰 ${run.gold}`),
        ),
        h('button', { class: 'primary', onclick: onContinue }, run.battle >= TOTAL_BATTLES && run.won ? 'See summary' : `To the shop → Battle ${run.battle}`),
      ),
    ),
  );
}

export function renderSummary(root: HTMLElement, run: RunState, onNew: () => void) {
  const st = run.stats;
  const combo = bestCombo(st);
  const ps = playerSide(run);
  const wins = st.log.filter((l) => l.won).length;
  root.innerHTML = '';
  root.append(
    h(
      'div',
      { class: 'modal' },
      h(
        'div',
        { class: 'box' },
        h('h2', { class: run.won ? 'win' : 'lose' }, run.won ? '👑 Run complete!' : '💀 Your statue fell'),
        h('div', { style: 'text-align:center;color:var(--dim)' }, run.won ? 'All 8 battles won, including both bosses.' : `Defeated in battle ${run.battle} of ${TOTAL_BATTLES}.`),
        h(
          'div',
          { class: 'bigstats' },
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(st.spawned)), h('div', { class: 'k' }, 'total stickmen spawned')),
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(st.biggestHit)), h('div', { class: 'k' }, 'biggest single hit')),
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(st.peakAlive)), h('div', { class: 'k' }, 'peak army on field')),
          h('div', { class: 'bigstat' }, h('div', { class: 'v' }, fmt(st.kills)), h('div', { class: 'k' }, 'enemies defeated')),
        ),
        combo
          ? h(
              'div',
              { class: 'panel', style: 'text-align:center' },
              h('div', { class: 'k', style: 'font-size:11px;color:var(--dim);letter-spacing:1px' }, 'BEST COMBO'),
              h('div', { style: 'font-size:22px;font-weight:900' }, `${RELIC_MAP[combo.id].icon} ${RELIC_MAP[combo.id].name}`),
              h('div', { style: 'color:var(--gold);font-weight:800' }, RELIC_MAP[combo.id].label(combo.n) + ' (whole run)'),
            )
          : null,
        h('div', { class: 'panel' }, h('h3', {}, 'Final army'), h('div', { class: 'chips' }, ...run.army.map((s, i) => h('span', { class: 'chip', style: 'background:rgba(226,82,43,.18);border-color:rgba(255,154,92,.4)' }, unitThumb(s.type, 0, 26), `${UNITS[s.type].name} ×${ps.slots[i].count} (Lv${ps.slots[i].level})`))), h('div', { class: 'chips', style: 'margin-top:6px' }, ...run.relics.map((id) => h('span', { class: 'chip', style: 'padding:2px 8px' }, `${RELIC_MAP[id].icon} ${RELIC_MAP[id].name}`)))),
        h('div', { class: 'loglist' }, ...st.log.map((l) => h('span', { class: l.won ? 'w' : 'l' }, `B${l.battle} ${l.won ? '✔' : '✘'} ${fmt(l.spawned)} men · ${l.time.toFixed(0)}s`))),
        h('div', { style: 'text-align:center;font-size:13px;color:var(--dim)' }, `${wins} win${wins === 1 ? '' : 's'}`),
        h('button', { class: 'primary', onclick: onNew }, '⚔️ New run'),
      ),
    ),
  );
}

export interface DebugHooks {
  refresh: () => void;
  winBattle: () => void;
  inBattle: () => boolean;
  close: () => void;
}

export function renderDebug(root: HTMLElement, run: RunState, hooks: DebugHooks): HTMLElement {
  const box = h('div', { class: 'debug' });
  const redraw = () => {
    box.innerHTML = '';
    box.append(
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, h('b', { style: 'color:#c07aff' }, '🐞 Debug / cheats'), h('button', { onclick: hooks.close }, '✕')),
      h('h4', {}, `Jump to battle (now ${run.battle})`),
      h('div', {}, ...Array.from({ length: TOTAL_BATTLES }, (_, i) => h('button', { onclick: () => (jumpToBattle(run, i + 1), hooks.refresh(), redraw()) }, `${i + 1}${i === 3 || i === 7 ? '👑' : ''}`))),
      h('h4', {}, `Gold (now ${run.gold})`),
      h('div', {}, ...[10, 50, 200].map((g) => h('button', { onclick: () => ((run.gold += g), hooks.refresh(), redraw()) }, `+${g}`))),
      hooks.inBattle() ? h('div', {}, h('h4', {}, 'Battle'), h('button', { onclick: hooks.winBattle }, '🏆 Win this battle now')) : '',
      h('h4', {}, 'Add unit copies (+3)'),
      h('div', {}, ...BUYABLE_UNITS.map((u) => h('button', { onclick: () => (addUnit(run, u, 3), hooks.refresh(), redraw()) }, UNITS[u].name))),
      h('h4', {}, `Grant relic (${run.relics.length}/5; replaces the leftmost when full)`),
      h('div', {}, ...RELICS.map((r) => h('button', { style: run.relics.includes(r.id) ? 'outline:2px solid var(--gold)' : '', onclick: () => (grantRelic(run, r.id), hooks.refresh(), redraw()) }, `${r.icon} ${r.name}`))),
      h('h4', {}, 'Quick builds (replaces army & relics)'),
      h(
        'div',
        {},
        h('button', { onclick: () => (preset(run, 'swarm'), hooks.refresh(), redraw()) }, '🧫 Swarm'),
        h('button', { onclick: () => (preset(run, 'necro'), hooks.refresh(), redraw()) }, '💀 Necro'),
        h('button', { onclick: () => (preset(run, 'archer'), hooks.refresh(), redraw()) }, '🏹 Volley'),
        h('button', { onclick: () => (preset(run, 'giant'), hooks.refresh(), redraw()) }, '🏋️ Giants'),
      ),
    );
  };
  redraw();
  root.append(box);
  return box;
}

export function preset(run: RunState, kind: 'swarm' | 'necro' | 'archer' | 'giant') {
  const P = {
    swarm: { army: [['swarmling', 9], ['shieldbearer', 3], ['monk', 3], ['archer', 3]], relics: ['vanguard_banner', 'brood_mother', 'mitosis', 'strength_in_numbers', 'chain_reaction'] },
    necro: { army: [['shieldbearer', 3], ['swordsman', 3], ['necromancer', 9], ['monk', 3]], relics: ['soul_harvest', 'gravedigger', 'grave_pact', 'war_drums', 'lich_crown'] },
    archer: { army: [['shieldbearer', 9], ['spearman', 3], ['archer', 9], ['monk', 3]], relics: ['echo_stone', 'shield_quiver', 'eagle_eye', 'hail_of_arrows', 'thick_skin'] },
    giant: { army: [['swordsman', 3], ['giant', 9], ['swarmling', 3], ['archer', 3]], relics: ['echo_stone', 'catapult_arms', 'titan_blood', 'war_drums', 'strength_in_numbers'] },
  }[kind];
  run.army = P.army.map(([t, c]) => ({ type: t as never, copies: c as number }));
  run.relics = [];
  for (const r of P.relics) grantRelic(run, r as never);
}
