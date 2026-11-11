import { describe, expect, it } from 'vitest';
import { Battle, EV } from '../src/sim/battle';
import { newRun, addUnit, grantRelic, jumpToBattle, battleSetup } from '../src/game/run';
import { playBattle, playRun } from '../src/game/bot';
import { BUYABLE_UNITS, UNIT_INDEX } from '../src/config/units';
import { RELICS } from '../src/config/relics';
import { Rng } from '../src/sim/rng';
import { SIM } from '../src/config/tuning';

function setupWith(units: [string, number][], relics: string[] = [], battle = 3, seed = 1) {
  const run = newRun(seed);
  run.army = [];
  for (const [u, c] of units) addUnit(run, u as never, c);
  for (const r of relics) grantRelic(run, r as never);
  jumpToBattle(run, battle);
  return battleSetup(run);
}

describe('battle simulation', () => {
  it('is deterministic for the same seed', () => {
    const s = setupWith([['swordsman', 3], ['archer', 2], ['mage', 1]], ['war_drums']);
    const a = new Battle(s).run();
    const b = new Battle(structuredClone(s)).run();
    expect(a).toEqual(b);
  });

  it('always ends (statue falls or time limit) for random armies', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 60; i++) {
      const units: [string, number][] = [];
      for (let k = 0; k < 1 + rng.int(4); k++) units.push([rng.pick(BUYABLE_UNITS), 1 + rng.int(6)]);
      const relics = Array.from({ length: rng.int(5) }, () => rng.pick(RELICS).id);
      const b = new Battle(setupWith(units, relics, 1 + rng.int(8), i));
      const r = b.run();
      expect(r).toBeTruthy();
      expect(r.time).toBeLessThanOrEqual(SIM.timeLimit + 0.1);
      expect([0, 1]).toContain(r.winner);
    }
  });

  it('a much bigger army beats a tiny enemy quickly', () => {
    const r = new Battle(setupWith([['swordsman', 9], ['archer', 6]], [], 1)).run();
    expect(r.winner).toBe(0);
    expect(r.time).toBeLessThan(45);
  });

  it('Mitosis makes Swarmlings split (more spawned than deployed)', () => {
    const plain = new Battle(setupWith([['swarmling', 4]], [], 3, 5)).run();
    const mito = new Battle(setupWith([['swarmling', 4]], ['mitosis'], 3, 5)).run();
    expect(mito.spawned[0]).toBeGreaterThan(plain.spawned[0] * 1.5);
    expect(mito.relicTriggers.mitosis).toBeGreaterThan(10);
  });

  it('Necromancers raise minions from corpses; Soul Harvest raises more', () => {
    const base = new Battle(setupWith([['shieldbearer', 2], ['necromancer', 3]], [], 4, 2)).run();
    const sh = new Battle(setupWith([['shieldbearer', 2], ['necromancer', 3]], ['soul_harvest'], 4, 2)).run();
    expect(base.spawned[0]).toBeGreaterThan(14); // 12 shields + necros + minions
    expect(sh.spawned[0]).toBeGreaterThan(base.spawned[0]);
    expect(sh.relicTriggers.soul_harvest).toBeGreaterThan(0);
  });

  it('Shield Quiver adds arrows per volley', () => {
    const b = new Battle(setupWith([['shieldbearer', 6], ['archer', 2]], ['shield_quiver'], 3));
    b.emitEvents = true;
    let maxArrows = 0;
    for (let t = 0; t < 900 && !b.finished; t++) {
      b.step();
      for (let k = 0; k < b.events.length; k += 7) if (b.events[k] === EV.Shoot && b.events[k + 3] === 0 && b.events[k + 4] === 0) maxArrows = Math.max(maxArrows, b.events[k + 5]);
      b.events.length = 0;
    }
    expect(maxArrows).toBe(1 + Math.min(10, Math.floor(36 / 4)));
  });

  it('Bounty Board pays gold for kills', () => {
    const r = new Battle(setupWith([['swordsman', 9], ['archer', 6]], ['bounty_board'], 4)).run();
    expect(r.bountyGold).toBe(Math.floor(r.kills[0] / 10));
  });

  it('Strength in Numbers reports a damage bonus that scales with army size', () => {
    const r = new Battle(setupWith([['swarmling', 6]], ['strength_in_numbers'], 3)).run();
    expect(r.relicTriggers.strength_in_numbers).toBeGreaterThan(50);
  });

  it('Catapult Arms makes giants throw stickmen', () => {
    const r = new Battle(setupWith([['giant', 3]], ['catapult_arms'], 3)).run();
    expect(r.relicTriggers.catapult_arms).toBeGreaterThan(0);
  });

  it('commands work once per battle', () => {
    const s = setupWith([['swordsman', 6], ['archer', 3]], ['sky_hammer', 'commanders_horn', 'lich_crown'], 4);
    s.commands = ['charge', 'volley', 'rally', 'meteor'];
    const b = new Battle(s);
    for (let t = 0; t < 400; t++) b.step();
    const before = b.spawned[0];
    expect(b.useCommand(0)).toBe(true);
    expect(b.chargeT).toBeGreaterThan(0);
    expect(b.useCommand(0)).toBe(false);
    expect(b.useCommand(1)).toBe(true);
    expect(b.useCommand(2)).toBe(true);
    expect(b.spawned[0]).toBeGreaterThanOrEqual(before);
    expect(b.useCommand(3)).toBe(true);
    b.run();
    expect(b.result).toBeTruthy();
  });

  it('boss battles include the boss unit', () => {
    const s = setupWith([['swordsman', 3]], [], 4);
    expect(s.enemy.slots.some((x) => x.type === 'warlord')).toBe(true);
    const b = new Battle(s);
    for (let t = 0; t < 300; t++) b.step();
    expect(b.bossIdx).toBeGreaterThanOrEqual(0);
    expect(b.type[b.bossIdx]).toBe(UNIT_INDEX.warlord);
  });

  it('handles 2,000+ stickmen without exceeding capacity', () => {
    const b = new Battle(setupWith([['swarmling', 9], ['swordsman', 9]], ['vanguard_banner', 'brood_mother', 'mitosis'], 8));
    const r = playBattle(b);
    expect(r.spawned[0]).toBeGreaterThan(1000);
    expect(b.hi).toBeLessThanOrEqual(SIM.maxUnits);
  });

  it('a whole bot run finishes', () => {
    const rep = playRun(3, 'greedy');
    expect(rep.battles.length).toBeGreaterThan(0);
    expect(rep.reached).toBeGreaterThanOrEqual(1);
  });
});
