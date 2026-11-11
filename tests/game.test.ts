import { describe, expect, it } from 'vitest';
import {
  newRun,
  buyUnit,
  buyRelic,
  sellUnit,
  sellRelic,
  reroll,
  rerollCost,
  buySlot,
  maxSlots,
  interestFor,
  rewardFor,
  finishBattle,
  addUnit,
  grantRelic,
  battleSetup,
  availableCommands,
  commandSlots,
  fixCommands,
  toggleCommand,
  jumpToBattle,
} from '../src/game/run';
import { ECONOMY } from '../src/config/tuning';
import { UNITS } from '../src/config/units';
import { RELICS, RELIC_MAP, relicPowers } from '../src/config/relics';
import { computeMods, levelOf, armyStats } from '../src/sim/stats';
import { defaultMods } from '../src/sim/mods';
import { generateEnemy } from '../src/game/enemies';
import type { BattleResult } from '../src/sim/types';

const fakeResult = (over: Partial<BattleResult> = {}): BattleResult => ({
  winner: 0,
  time: 40,
  timedOut: false,
  playerStatueFrac: 0.5,
  enemyStatueFrac: 0,
  spawned: [10, 10],
  kills: [10, 5],
  peakAlive: [10, 10],
  biggestHit: 12,
  relicTriggers: {},
  bountyGold: 0,
  ...over,
});

describe('shop', () => {
  it('buys a unit, spends gold, and stacks copies into levels', () => {
    const run = newRun(1);
    run.gold = 100;
    run.shop.units = ['archer', 'archer', 'archer'];
    expect(buyUnit(run, 0)).toBeNull();
    expect(run.gold).toBe(100 - UNITS.archer.cost);
    expect(run.army.find((s) => s.type === 'archer')!.copies).toBe(1);
    buyUnit(run, 1);
    buyUnit(run, 2);
    const a = run.army.find((s) => s.type === 'archer')!;
    expect(a.copies).toBe(3);
    expect(levelOf(a.copies)).toBe(2);
    expect(run.shop.units).toEqual([null, null, null]);
    expect(buyUnit(run, 0)).toBe('none');
  });

  it('refuses purchases without gold or free slots', () => {
    const run = newRun(1);
    run.gold = 0;
    run.shop.units = ['giant', 'swordsman', 'archer'];
    expect(buyUnit(run, 0)).toBe('gold');
    run.gold = 999;
    run.army = ['swordsman', 'shieldbearer', 'archer', 'monk', 'mage'].map((t) => ({ type: t as never, copies: 1 }));
    expect(buyUnit(run, 0)).toBe('slots');
    // already-owned type is still buyable with full slots
    expect(buyUnit(run, 1)).toBeNull();
  });

  it('sells units and relics for half price', () => {
    const run = newRun(1);
    addUnit(run, 'giant', 2);
    const before = run.gold;
    const idx = run.army.findIndex((s) => s.type === 'giant');
    expect(sellUnit(run, idx)).toBe(true);
    expect(run.gold).toBe(before + Math.floor(UNITS.giant.cost * 2 * ECONOMY.sellFraction));
    grantRelic(run, 'strength_in_numbers');
    const g = run.gold;
    sellRelic(run, 0);
    expect(run.gold).toBe(g + Math.floor(ECONOMY.relicCost.rare / 2));
    // can't sell your last unit
    run.army = [{ type: 'swordsman', copies: 1 }];
    expect(sellUnit(run, 0)).toBe(false);
  });

  it('reroll cost escalates within a shop and resets next battle', () => {
    const run = newRun(1);
    run.gold = 50;
    const c0 = rerollCost(run);
    reroll(run);
    expect(rerollCost(run)).toBe(c0 + ECONOMY.rerollStep);
    reroll(run);
    expect(run.gold).toBe(50 - c0 - (c0 + ECONOMY.rerollStep));
    finishBattle(run, fakeResult());
    expect(rerollCost(run)).toBe(c0);
  });

  it('buys extra unit slots up to 7, and Barracks counts', () => {
    const run = newRun(1);
    run.gold = 999;
    expect(maxSlots(run)).toBe(5);
    expect(buySlot(run)).toBeNull();
    expect(maxSlots(run)).toBe(6);
    grantRelic(run, 'barracks');
    expect(maxSlots(run)).toBe(7);
    expect(buySlot(run)).toBe('max');
  });

  it('relic shop never offers owned relics and respects the 5 relic cap', () => {
    const run = newRun(5);
    run.gold = 999;
    for (let i = 0; i < 40; i++) {
      reroll(run);
      for (const r of run.shop.relics) if (r) expect(run.relics).not.toContain(r);
      if (run.relics.length < 5 && run.shop.relics[0]) buyRelic(run, 0);
    }
    expect(run.relics.length).toBe(5);
    run.shop.relics = [RELICS.find((r) => !run.relics.includes(r.id))!.id, null];
    expect(buyRelic(run, 0)).toBe('relics');
  });

  it('shop offers are deterministic per seed', () => {
    const a = newRun(99);
    const b = newRun(99);
    expect(a.shop).toEqual(b.shop);
  });
});

describe('economy', () => {
  it('interest is 1 per 5 gold, capped (Piggy Bank raises the cap)', () => {
    const m = defaultMods();
    expect(interestFor(4, m)).toBe(0);
    expect(interestFor(14, m)).toBe(2);
    expect(interestFor(200, m)).toBe(ECONOMY.interestCap);
    m.interestCap = 5;
    expect(interestFor(200, m)).toBe(ECONOMY.interestCap + 5);
  });

  it('rewards fast and flawless wins and bounty gold', () => {
    const run = newRun(1);
    run.gold = 10;
    const r = rewardFor(run, fakeResult({ time: 20, playerStatueFrac: 1, bountyGold: 3 }));
    expect(r.fast).toBe(ECONOMY.fastWinBonus);
    expect(r.flawless).toBe(ECONOMY.flawlessBonus);
    expect(r.bounty).toBe(3);
    expect(r.interest).toBe(2);
    expect(r.total).toBe(r.base + r.fast + r.flawless + r.bounty + r.interest);
  });

  it('losing ends the run; winning battle 8 wins it', () => {
    const run = newRun(1);
    expect(finishBattle(run, fakeResult({ winner: 1 }))).toBeNull();
    expect(run.over).toBe(true);
    expect(run.won).toBe(false);
    const r2 = newRun(2);
    jumpToBattle(r2, 8);
    finishBattle(r2, fakeResult());
    expect(r2.over && r2.won).toBe(true);
  });
});

describe('relics', () => {
  it('there are 25 relics with unique ids and all three rarities', () => {
    expect(RELICS.length).toBe(25);
    expect(new Set(RELICS.map((r) => r.id)).size).toBe(25);
    for (const rar of ['common', 'uncommon', 'rare']) expect(RELICS.some((r) => r.rarity === rar)).toBe(true);
    for (const r of RELICS) expect(r.label(3)).toBeTypeOf('string');
  });

  it('every relic changes Mods (except Echo Stone, which changes powers)', () => {
    const base = JSON.stringify(defaultMods());
    for (const r of RELICS) {
      if (r.id === 'echo_stone') continue;
      const m = computeMods([r.id], [{ type: 'mage', copies: 1 }, { type: 'monk', copies: 1 }]);
      expect(JSON.stringify(m), r.id).not.toBe(base);
    }
  });

  it('Echo Stone doubles the relic to its right, and chains', () => {
    expect(relicPowers(['echo_stone', 'war_drums']).map((p) => p.power)).toEqual([1, 2]);
    expect(relicPowers(['war_drums', 'echo_stone']).map((p) => p.power)).toEqual([1, 1]);
    expect(relicPowers(['echo_stone', 'echo_stone', 'war_drums']).map((p) => p.power)).toEqual([1, 2, 3]);
    const one = computeMods(['war_drums'], []);
    const two = computeMods(['echo_stone', 'war_drums'], []);
    expect(two.dmg.Blade).toBeCloseTo(one.dmg.Blade * one.dmg.Blade);
  });

  it('Vanguard Banner doubles the first slot count', () => {
    const army = [{ type: 'swarmling' as const, copies: 2 }, { type: 'archer' as const, copies: 1 }];
    const plain = armyStats(army, computeMods([], army));
    const vb = armyStats(army, computeMods(['vanguard_banner'], army));
    expect(vb[0].count).toBe(plain[0].count * 2);
    expect(vb[1].count).toBe(plain[1].count);
  });

  it('Brood Mother multiplies swarmling counts; War Drums multiplies Blade damage', () => {
    const army = [{ type: 'swarmling' as const, copies: 2 }, { type: 'swordsman' as const, copies: 1 }];
    const plain = armyStats(army, computeMods([], army));
    const m = armyStats(army, computeMods(['brood_mother', 'war_drums'], army));
    expect(m[0].count).toBe(Math.round(plain[0].count * 1.5));
    expect(m[1].dmg).toBeCloseTo(plain[1].dmg * 1.3);
  });

  it('Arcane Resonance compounds per Arcane slot', () => {
    const army = [{ type: 'mage' as const, copies: 1 }, { type: 'monk' as const, copies: 1 }, { type: 'necromancer' as const, copies: 1 }];
    const m = computeMods(['arcane_resonance'], army);
    expect(m.dmg.Arcane).toBeCloseTo(Math.pow(1.25, 3));
  });

  it('unlock relics add commands; Commander\'s Horn adds a command slot', () => {
    const run = newRun(1);
    expect(availableCommands(run)).not.toContain('meteor');
    grantRelic(run, 'sky_hammer');
    expect(availableCommands(run)).toContain('meteor');
    expect(run.commands).toContain('meteor');
    expect(commandSlots(run)).toBe(2);
    grantRelic(run, 'commanders_horn');
    fixCommands(run);
    expect(commandSlots(run)).toBe(3);
    expect(run.commands.length).toBe(3);
    toggleCommand(run, 'rally');
    expect(run.commands).toContain('rally');
    expect(run.commands.length).toBe(3);
  });

  it('relic map matches list', () => {
    for (const r of RELICS) expect(RELIC_MAP[r.id]).toBe(r);
  });
});

describe('enemies', () => {
  it('bosses appear at battles 4 and 8 and armies grow', () => {
    for (const seed of [1, 2, 3]) {
      expect(generateEnemy(seed, 4).boss).toBe('warlord');
      expect(generateEnemy(seed, 8).boss).toBe('golem');
      expect(generateEnemy(seed, 3).boss).toBeNull();
      const run = newRun(seed);
      jumpToBattle(run, 1);
      const s1 = battleSetup(run).enemy.slots.reduce((a, s) => a + s.count * s.hp, 0);
      jumpToBattle(run, 7);
      const s7 = battleSetup(run).enemy.slots.reduce((a, s) => a + s.count * s.hp, 0);
      expect(s7).toBeGreaterThan(s1 * 3);
    }
  });
});
