import { ENEMY, STATUE } from '../config/tuning';
import { UNITS, type UnitId } from '../config/units';
import { Rng, hashSeed } from '../sim/rng';
import { defaultMods } from '../sim/mods';
import { unitStats, minionStats } from '../sim/stats';
import type { ArmySlot, SideSetup } from '../sim/types';

export interface EnemyArmy {
  name: string;
  slots: ArmySlot[];
  boss: UnitId | null;
  battle: number;
}

interface Theme {
  name: string;
  weights: Partial<Record<UnitId, number>>;
}

const THEMES: Theme[] = [
  { name: 'Blade Horde', weights: { swordsman: 5, berserker: 2, spearman: 2, archer: 1 } },
  { name: 'Shield Wall', weights: { shieldbearer: 4, spearman: 3, archer: 3 } },
  { name: 'Swarm Nest', weights: { swarmling: 6, swordsman: 1, archer: 2 } },
  { name: 'Arcane Circle', weights: { mage: 3, monk: 2, swordsman: 3, shieldbearer: 2 } },
  { name: 'Grave Host', weights: { necromancer: 2, swordsman: 4, shieldbearer: 2 } },
  { name: 'Giant Clan', weights: { giant: 2, swarmling: 2, swordsman: 3 } },
  { name: 'War Band', weights: { swordsman: 2, shieldbearer: 2, archer: 2, berserker: 1, mage: 1, spearman: 1, giant: 1 } },
];

const ORDER: Record<string, number> = { shieldbearer: 0, giant: 1, spearman: 2, swordsman: 3, berserker: 3, swarmling: 4, warlord: 5, golem: 1, monk: 6, archer: 7, mage: 8, necromancer: 9 };

export function generateEnemy(runSeed: number, battle: number): EnemyArmy {
  const rng = new Rng(hashSeed(runSeed, 'enemy', battle));
  const isBoss = ENEMY.bossBattles.includes(battle);
  const boss: UnitId | null = isBoss ? (battle === ENEMY.bossBattles[0] ? 'warlord' : 'golem') : null;
  const themePool = battle <= 2 ? THEMES.filter((t) => ['Blade Horde', 'Shield Wall', 'Swarm Nest'].includes(t.name)) : THEMES;
  const theme = rng.pick(themePool);
  let budget = ENEMY.budget(battle) * (isBoss ? 0.75 : 1);
  const slots: ArmySlot[] = [];
  const types = Object.keys(theme.weights) as UnitId[];
  let guard = 0;
  while (guard++ < 100) {
    const affordable = types.filter((t) => UNITS[t].cost <= budget && (slots.length < 5 || slots.some((s) => s.type === t)));
    if (!affordable.length) break;
    const t = rng.weighted(affordable, (u) => theme.weights[u]!);
    const owned = slots.find((s) => s.type === t);
    if (owned) owned.copies++;
    else slots.push({ type: t, copies: 1 });
    budget -= UNITS[t].cost;
  }
  if (boss) slots.push({ type: boss, copies: 1 });
  slots.sort((a, b) => (ORDER[a.type] ?? 5) - (ORDER[b.type] ?? 5));
  return { name: boss ? `${UNITS[boss].name}'s ${theme.name}` : theme.name, slots, boss, battle };
}

export function enemySide(enemy: EnemyArmy): SideSetup {
  const mods = defaultMods();
  const mult = ENEMY.statMult(enemy.battle);
  return {
    slots: enemy.slots.map((s) => unitStats(s.type, s.copies, mods, mult)),
    statueHp: STATUE.enemyHpBase + STATUE.enemyHpPerBattle * (enemy.battle - 1),
    mods,
    minion: minionStats(mods, mult, enemy.battle),
  };
}

export function enemyStickmen(enemy: EnemyArmy): number {
  return enemySide(enemy).slots.reduce((a, s) => a + s.count, 0);
}
