// AI shopper + command user, used by the headless simulator to play whole runs.

import { UNITS, type UnitId } from '../config/units';
import type { RelicId } from '../config/relics';
import { RELIC_MAP } from '../config/relics';
import { COMMANDS, type CommandId } from '../config/commands';
import { Rng } from '../sim/rng';
import { Battle } from '../sim/battle';
import type { BattleResult } from '../sim/types';
import {
  type RunState,
  availableCommands,
  battleSetup,
  buyRelic,
  buySlot,
  buyUnit,
  canBuyUnit,
  commandSlots,
  finishBattle,
  maxSlots,
  playerSide,
  relicCost,
  reroll,
  rerollCost,
  slotCost,
  unitCost,
  newRun,
} from './run';
import { sidePower, quiverExtraFor } from './power';
import { ECONOMY } from '../config/tuning';

export type Strategy = 'greedy' | 'swarm' | 'necro' | 'archer' | 'giant' | 'random';
export const STRATEGIES: Strategy[] = ['greedy', 'swarm', 'necro', 'archer', 'giant', 'random'];

interface Pref {
  units: Partial<Record<UnitId, number>>;
  relics: RelicId[];
}

const PREFS: Record<Exclude<Strategy, 'greedy' | 'random'>, Pref> = {
  swarm: { units: { swarmling: 6, shieldbearer: 2, monk: 1.5, archer: 1 }, relics: ['mitosis', 'brood_mother', 'vanguard_banner', 'strength_in_numbers', 'chain_reaction', 'echo_stone', 'bounty_board'] },
  necro: { units: { necromancer: 6, shieldbearer: 3, swordsman: 2, monk: 1 }, relics: ['soul_harvest', 'gravedigger', 'grave_pact', 'lich_crown', 'war_drums', 'strength_in_numbers', 'echo_stone'] },
  archer: { units: { archer: 6, shieldbearer: 4, spearman: 2, monk: 1 }, relics: ['shield_quiver', 'eagle_eye', 'hail_of_arrows', 'thick_skin', 'echo_stone', 'chain_reaction'] },
  giant: { units: { giant: 6, swordsman: 2, shieldbearer: 2, swarmling: 1.5 }, relics: ['catapult_arms', 'titan_blood', 'strength_in_numbers', 'chain_reaction', 'echo_stone', 'barracks'] },
};

const FRONT_ORDER: Record<string, number> = { shieldbearer: 0, spearman: 1, giant: 1, swordsman: 2, berserker: 2, swarmling: 3, minion: 3, monk: 6, archer: 7, mage: 8, necromancer: 9 };

function powerOf(run: RunState): number {
  const ps = playerSide(run);
  return sidePower(ps, quiverExtraFor(ps));
}

function clone(run: RunState): RunState {
  return { ...run, army: run.army.map((s) => ({ ...s })), relics: [...run.relics], shop: { ...run.shop, units: [...run.shop.units], relics: [...run.shop.relics] }, commands: [...run.commands] };
}

export function orderArmy(run: RunState) {
  const vanguard = run.relics.includes('vanguard_banner');
  run.army.sort((a, b) => {
    const oa = (FRONT_ORDER[a.type] ?? 4) - (vanguard && a.type === 'swarmling' ? 10 : 0);
    const ob = (FRONT_ORDER[b.type] ?? 4) - (vanguard && b.type === 'swarmling' ? 10 : 0);
    return oa - ob;
  });
}

function chooseCommands(run: RunState) {
  const avail = availableCommands(run);
  const n = commandSlots(run);
  const hasRanged = run.army.some((s) => UNITS[s.type].tags.includes('Ranged'));
  const prio: CommandId[] = ['meteor', 'raise', 'burst', 'charge', hasRanged ? 'volley' : 'rally', 'rally', 'hold', 'volley'];
  run.commands = [];
  for (const c of prio) if (avail.includes(c) && !run.commands.includes(c) && run.commands.length < n) run.commands.push(c);
}

/** Spend gold in the shop according to a strategy. */
export function botShop(run: RunState, strat: Strategy, rng: Rng) {
  let rerolls = 0;
  for (let guard = 0; guard < 40; guard++) {
    type Opt = { score: number; act: () => void };
    const opts: Opt[] = [];
    const base = strat === 'greedy' ? powerOf(run) : 0;
    run.shop.units.forEach((t, i) => {
      if (!t || canBuyUnit(run, t)) return;
      let score: number;
      if (strat === 'random') score = rng.next();
      else {
        const c = clone(run);
        buyUnit(c, i);
        score = (powerOf(c) - base) / unitCost(t);
        if (strat !== 'greedy' && PREFS[strat].relics.slice(0, 3).some((r) => run.relics.includes(r))) {
          // synergy player: once a key relic is found, stay greedy but bias toward the plan's units
          const w = PREFS[strat].units[t] ?? 0;
          score *= 0.5 + w * 0.5;
          if (!run.army.some((s) => s.type === t) && w < 1 && run.army.length >= maxSlots(run) - 1) score *= 0.2;
        }
      }
      opts.push({ score, act: () => buyUnit(run, i) });
    });
    run.shop.relics.forEach((id, i) => {
      if (!id || run.gold < relicCost(id) || run.relics.length >= ECONOMY.maxRelics) return;
      let score: number;
      if (strat === 'random') score = rng.next();
      else {
        const c = clone(run);
        buyRelic(c, i);
        score = (powerOf(c) - base) / relicCost(id);
        // value economy & command relics a bit even though they add no power
        if (['bounty_board', 'piggy_bank', 'commanders_horn', 'barracks', 'sky_hammer', 'echo_stone'].includes(id)) score = Math.max(score, (base * 0.04) / relicCost(id));
        if (strat !== 'greedy') {
          const k = PREFS[strat].relics.indexOf(id);
          score = k >= 0 ? Math.max(score, 0) + (base * 0.05 * (10 - k)) / 10 / relicCost(id) : score * 0.6;
        }
      }
      opts.push({ score: score * 1.05, act: () => buyRelic(run, i) });
    });
    if (maxSlots(run) < ECONOMY.maxSlots && run.army.length >= maxSlots(run) && run.gold >= slotCost(run) + 3 && run.battle >= 3) {
      opts.push({ score: strat === 'random' ? rng.next() * 0.5 : 0.05, act: () => buySlot(run) });
    }
    opts.sort((a, b) => b.score - a.score);
    const best = opts[0];
    if (best && best.score > 0) {
      best.act();
      continue;
    }
    // no good buy: reroll if rich enough (keep some interest)
    const keep = strat === 'random' ? 0 : Math.min(10, run.battle * 2);
    if (rerolls < 3 && run.gold - rerollCost(run) >= keep + 3) {
      reroll(run);
      rerolls++;
      continue;
    }
    break;
  }
  orderArmy(run);
  chooseCommands(run);
}

/** Use commands at sensible moments, like a player would. */
export function botCommands(b: Battle) {
  const contact = b.aliveCount[0] > 0 && b.aliveCount[1] > 0 && b.front[1] - b.front[0] < 60;
  b.setup.commands.forEach((c, k) => {
    if (!b.canUse(k)) return;
    let use = false;
    switch (c) {
      case 'charge':
      case 'volley':
      case 'meteor':
      case 'hold':
        use = contact && b.time > 3;
        break;
      case 'rally':
        use = b.time > 12 && b.aliveCount[0] < b.peakAlive[0] * 0.5;
        break;
      case 'raise':
        use = b.time > 14;
        break;
      case 'burst':
        use = contact && b.time > 6;
        break;
    }
    if (b.time > 40) use = true;
    if (use) b.useCommand(k);
  });
}

export function playBattle(b: Battle, useCommands = true): BattleResult {
  b.emitEvents = false;
  const max = Math.ceil(95 * 30);
  while (!b.finished && b.tick < max) {
    if (useCommands && b.tick % 5 === 0) botCommands(b);
    b.step();
  }
  return b.result!;
}

export interface RunReport {
  strategy: Strategy;
  won: boolean;
  reached: number;
  battles: { battle: number; won: boolean; time: number; spawned: number; peak: number; enemyCount: number; timedOut: boolean; predicted: number }[];
  relics: RelicId[];
  army: { type: UnitId; copies: number }[];
  maxSpawned: number;
  maxPeak: number;
}

export function playRun(seed: number, strat: Strategy, useCommands = true): RunReport {
  const run = newRun(seed);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const report: RunReport = { strategy: strat, won: false, reached: 0, battles: [], relics: [], army: [], maxSpawned: 0, maxPeak: 0 };
  while (!run.over) {
    botShop(run, strat, rng);
    const setup = battleSetup(run);
    const pp = sidePower(setup.player, quiverExtraFor(setup.player));
    const ep = sidePower(setup.enemy);
    const b = new Battle(setup);
    const r = playBattle(b, useCommands);
    report.battles.push({
      battle: run.battle,
      won: r.winner === 0,
      time: r.time,
      spawned: r.spawned[0],
      peak: r.peakAlive[0],
      enemyCount: r.spawned[1],
      timedOut: r.timedOut,
      predicted: pp / (pp + ep),
    });
    report.maxSpawned = Math.max(report.maxSpawned, r.spawned[0]);
    report.maxPeak = Math.max(report.maxPeak, r.peakAlive[0]);
    report.reached = run.battle;
    report.relics = [...run.relics];
    report.army = run.army.map((s) => ({ ...s }));
    finishBattle(run, r);
  }
  report.won = run.won;
  return report;
}

export { COMMANDS, RELIC_MAP };
