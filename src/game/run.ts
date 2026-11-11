// Run state + shop + economy. Pure logic (no DOM) so it can be tested and botted.

import { ECONOMY, STATUE, COMMANDS_PER_BATTLE, ENEMY } from '../config/tuning';
import { UNITS, BUYABLE_UNITS, type UnitId } from '../config/units';
import { RELICS, RELIC_MAP, type RelicId, type Rarity } from '../config/relics';
import { BASE_COMMANDS, type CommandId } from '../config/commands';
import { Rng, hashSeed } from '../sim/rng';
import { armyStats, computeMods, minionStats } from '../sim/stats';
import type { ArmySlot, BattleResult, BattleSetup, SideSetup } from '../sim/types';
import type { Mods } from '../sim/mods';
import { generateEnemy, enemySide, type EnemyArmy } from './enemies';

export const TOTAL_BATTLES = 8;

export interface ShopState {
  units: (UnitId | null)[];
  relics: (RelicId | null)[];
  rerolls: number;
}

export interface BattleLog {
  battle: number;
  won: boolean;
  time: number;
  spawned: number;
  peak: number;
  kills: number;
  gold: number;
}

export interface RunStats {
  spawned: number;
  kills: number;
  biggestHit: number;
  peakAlive: number;
  relicTotals: Record<string, number>;
  log: BattleLog[];
}

export interface RunState {
  seed: number;
  battle: number; // the upcoming battle (1..8)
  gold: number;
  army: ArmySlot[];
  relics: RelicId[];
  commands: CommandId[];
  slotsBought: number;
  shop: ShopState;
  shopRoll: number;
  enemy: EnemyArmy;
  stats: RunStats;
  over: boolean;
  won: boolean;
  lastReward: RewardBreakdown | null;
}

export interface RewardBreakdown {
  base: number;
  fast: number;
  flawless: number;
  bounty: number;
  interest: number;
  total: number;
}

export function newRun(seed = (Math.random() * 2 ** 31) | 0): RunState {
  const run: RunState = {
    seed,
    battle: 1,
    gold: ECONOMY.startGold,
    army: [{ type: 'swordsman', copies: 1 }],
    relics: [],
    commands: [...BASE_COMMANDS.slice(0, COMMANDS_PER_BATTLE)],
    slotsBought: 0,
    shop: { units: [], relics: [], rerolls: 0 },
    shopRoll: 0,
    enemy: generateEnemy(seed, 1),
    stats: { spawned: 0, kills: 0, biggestHit: 0, peakAlive: 0, relicTotals: {}, log: [] },
    over: false,
    won: false,
    lastReward: null,
  };
  rollShop(run);
  return run;
}

// ---------------------------------------------------------------- derived
export function runMods(run: RunState): Mods {
  return computeMods(run.relics, run.army);
}

export function maxSlots(run: RunState): number {
  return Math.min(ECONOMY.maxSlots, ECONOMY.startSlots + runMods(run).extraSlots + run.slotsBought);
}

export function commandSlots(run: RunState): number {
  return COMMANDS_PER_BATTLE + runMods(run).extraCommands;
}

export function availableCommands(run: RunState): CommandId[] {
  return [...BASE_COMMANDS, ...runMods(run).unlocks];
}

export function fixCommands(run: RunState) {
  const avail = availableCommands(run);
  const n = commandSlots(run);
  run.commands = run.commands.filter((c) => avail.includes(c)).slice(0, n);
  // auto-equip newly unlocked commands first, then base ones
  const unlocked = runMods(run).unlocks;
  for (const c of [...unlocked, ...avail]) {
    if (run.commands.length >= n) break;
    if (!run.commands.includes(c)) run.commands.push(c);
  }
}

export function toggleCommand(run: RunState, c: CommandId) {
  const i = run.commands.indexOf(c);
  if (i >= 0) {
    if (run.commands.length > 1) run.commands.splice(i, 1);
    return;
  }
  if (!availableCommands(run).includes(c)) return;
  if (run.commands.length >= commandSlots(run)) run.commands.shift();
  run.commands.push(c);
}

export function relicCost(id: RelicId): number {
  return ECONOMY.relicCost[RELIC_MAP[id].rarity];
}
export function unitCost(t: UnitId): number {
  return UNITS[t].cost;
}
export function rerollCost(run: RunState): number {
  return ECONOMY.rerollBase + ECONOMY.rerollStep * run.shop.rerolls;
}
export function slotCost(run: RunState): number {
  return ECONOMY.slotBaseCost + ECONOMY.slotCostStep * run.slotsBought;
}
export function sellValueUnit(s: ArmySlot): number {
  return Math.max(1, Math.floor(unitCost(s.type) * s.copies * ECONOMY.sellFraction));
}
export function sellValueRelic(id: RelicId): number {
  return Math.max(1, Math.floor(relicCost(id) * ECONOMY.sellFraction));
}

// ---------------------------------------------------------------- shop
export function rollShop(run: RunState) {
  const rng = new Rng(hashSeed(run.seed, 'shop', run.battle, run.shopRoll++));
  const units: UnitId[] = [];
  for (let i = 0; i < ECONOMY.shopUnitOffers; i++) {
    units.push(
      rng.weighted(BUYABLE_UNITS, (u) => {
        let w = 1;
        if (run.army.some((s) => s.type === u)) w *= 1.6; // help leveling
        if (units.includes(u)) w *= 0.4;
        if (UNITS[u].cost >= 6 && run.battle <= 1) w *= 0.5;
        return w;
      }),
    );
  }
  const weights = ECONOMY.rarityWeights(run.battle);
  const relics: RelicId[] = [];
  for (let i = 0; i < ECONOMY.shopRelicOffers; i++) {
    const pool = RELICS.filter((r) => !run.relics.includes(r.id) && !relics.includes(r.id));
    if (!pool.length) break;
    const rarity = rng.weighted(['common', 'uncommon', 'rare'] as Rarity[], (r) => (pool.some((p) => p.rarity === r) ? weights[r] : 0));
    const sub = pool.filter((p) => p.rarity === rarity);
    relics.push(rng.pick(sub).id);
  }
  run.shop.units = units;
  run.shop.relics = relics;
}

export type ShopError = 'gold' | 'slots' | 'relics' | 'none' | 'max';

export function canBuyUnit(run: RunState, t: UnitId): ShopError | null {
  if (run.gold < unitCost(t)) return 'gold';
  if (!run.army.some((s) => s.type === t) && run.army.length >= maxSlots(run)) return 'slots';
  return null;
}

export function buyUnit(run: RunState, offer: number): ShopError | null {
  const t = run.shop.units[offer];
  if (!t) return 'none';
  const err = canBuyUnit(run, t);
  if (err) return err;
  run.gold -= unitCost(t);
  addUnit(run, t);
  run.shop.units[offer] = null;
  return null;
}

export function addUnit(run: RunState, t: UnitId, copies = 1) {
  const owned = run.army.find((s) => s.type === t);
  if (owned) owned.copies += copies;
  else run.army.push({ type: t, copies });
  fixCommands(run);
}

export function buyRelic(run: RunState, offer: number): ShopError | null {
  const id = run.shop.relics[offer];
  if (!id) return 'none';
  if (run.gold < relicCost(id)) return 'gold';
  if (run.relics.length >= ECONOMY.maxRelics) return 'relics';
  run.gold -= relicCost(id);
  run.relics.push(id);
  run.shop.relics[offer] = null;
  fixCommands(run);
  return null;
}

export function grantRelic(run: RunState, id: RelicId): boolean {
  if (run.relics.includes(id)) return false;
  if (run.relics.length >= ECONOMY.maxRelics) run.relics.shift();
  run.relics.push(id);
  fixCommands(run);
  return true;
}

export function sellUnit(run: RunState, slot: number): boolean {
  const s = run.army[slot];
  if (!s || run.army.length <= 1) return false;
  run.gold += sellValueUnit(s);
  run.army.splice(slot, 1);
  fixCommands(run);
  return true;
}

export function sellRelic(run: RunState, idx: number): boolean {
  const id = run.relics[idx];
  if (!id) return false;
  run.gold += sellValueRelic(id);
  run.relics.splice(idx, 1);
  // army might now exceed slot cap (barracks sold): keep units but block new ones
  fixCommands(run);
  return true;
}

export function reroll(run: RunState): ShopError | null {
  const c = rerollCost(run);
  if (run.gold < c) return 'gold';
  run.gold -= c;
  run.shop.rerolls++;
  rollShop(run);
  return null;
}

export function buySlot(run: RunState): ShopError | null {
  if (maxSlots(run) >= ECONOMY.maxSlots) return 'max';
  const c = slotCost(run);
  if (run.gold < c) return 'gold';
  run.gold -= c;
  run.slotsBought++;
  return null;
}

export function move<T>(arr: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
}

// ---------------------------------------------------------------- battle
export function playerSide(run: RunState): SideSetup {
  const mods = runMods(run);
  return {
    slots: armyStats(run.army, mods),
    statueHp: STATUE.playerHp,
    mods,
    minion: minionStats(mods, 1, run.battle),
  };
}

export function battleSetup(run: RunState, seedSalt = 0): BattleSetup {
  return {
    seed: hashSeed(run.seed, 'battle', run.battle, seedSalt),
    battleIndex: run.battle,
    player: playerSide(run),
    enemy: enemySide(run.enemy),
    commands: [...run.commands],
  };
}

export function interestFor(gold: number, mods: Mods): number {
  return Math.min(ECONOMY.interestCap + mods.interestCap, Math.floor(Math.max(0, gold) / ECONOMY.interestPer));
}

export function rewardFor(run: RunState, r: BattleResult): RewardBreakdown {
  const mods = runMods(run);
  const base = ECONOMY.baseReward + Math.floor(run.battle * ECONOMY.rewardPerBattle);
  const fast = r.time <= ECONOMY.fastWinTime ? ECONOMY.fastWinBonus : 0;
  const flawless = r.playerStatueFrac >= 1 ? ECONOMY.flawlessBonus : 0;
  const bounty = r.bountyGold;
  const interest = interestFor(run.gold, mods);
  return { base, fast, flawless, bounty, interest, total: base + fast + flawless + bounty + interest };
}

/** Apply a finished battle to the run. Returns reward (null if lost). */
export function finishBattle(run: RunState, r: BattleResult): RewardBreakdown | null {
  const st = run.stats;
  st.spawned += r.spawned[0];
  st.kills += r.kills[0];
  st.biggestHit = Math.max(st.biggestHit, r.biggestHit);
  st.peakAlive = Math.max(st.peakAlive, r.peakAlive[0]);
  for (const [k, v] of Object.entries(r.relicTriggers)) {
    if (k === 'strength_in_numbers' || k === 'chain_reaction') st.relicTotals[k] = Math.max(st.relicTotals[k] ?? 0, v);
    else st.relicTotals[k] = (st.relicTotals[k] ?? 0) + v;
  }
  const won = r.winner === 0;
  let reward: RewardBreakdown | null = null;
  if (won) {
    reward = rewardFor(run, r);
    run.gold += reward.total;
  }
  st.log.push({ battle: run.battle, won, time: r.time, spawned: r.spawned[0], peak: r.peakAlive[0], kills: r.kills[0], gold: reward?.total ?? 0 });
  run.lastReward = reward;
  if (!won) {
    run.over = true;
    return null;
  }
  if (run.battle >= TOTAL_BATTLES) {
    run.over = true;
    run.won = true;
    return reward;
  }
  run.battle++;
  run.enemy = generateEnemy(run.seed, run.battle);
  run.shop.rerolls = 0;
  rollShop(run);
  return reward;
}

/** Debug: jump to any battle. */
export function jumpToBattle(run: RunState, battle: number) {
  run.battle = Math.max(1, Math.min(TOTAL_BATTLES, battle));
  run.enemy = generateEnemy(run.seed, run.battle);
  run.shop.rerolls = 0;
  rollShop(run);
}

export function isBossBattle(b: number): boolean {
  return ENEMY.bossBattles.includes(b);
}

export function bestCombo(stats: RunStats): { id: RelicId; n: number } | null {
  let best: { id: RelicId; n: number } | null = null;
  for (const [k, v] of Object.entries(stats.relicTotals)) {
    if (!(k in RELIC_MAP)) continue;
    if (!best || v > best.n) best = { id: k as RelicId, n: v };
  }
  return best;
}
