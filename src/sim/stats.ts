import { ECONOMY, SIM } from '../config/tuning';
import { UNITS, type Tag, type UnitId } from '../config/units';
import { RELIC_MAP, relicPowers, type RelicId } from '../config/relics';
import { defaultMods, type Mods } from './mods';
import type { ArmySlot, SlotStats } from './types';

export function levelOf(copies: number): number {
  let lvl = 1;
  for (let i = 0; i < ECONOMY.levelCopies.length; i++) if (copies >= ECONOMY.levelCopies[i]) lvl = i + 1;
  return lvl;
}

/** copies needed to reach the next level, or 0 if max */
export function nextLevelAt(copies: number): number {
  for (const c of ECONOMY.levelCopies) if (copies < c) return c;
  return 0;
}

export function computeMods(relics: RelicId[], army: ArmySlot[]): Mods {
  const m = defaultMods();
  for (const { id, power } of relicPowers(relics)) RELIC_MAP[id].apply(m, power, army);
  return m;
}

function tagProduct(rec: Record<Tag, number>, tags: Tag[]): number {
  let p = 1;
  for (const t of tags) p *= rec[t];
  return p;
}

export function unitStats(type: UnitId, copies: number, mods: Mods, statMult = 1, extraTags: Tag[] = []): SlotStats {
  const d = UNITS[type];
  const level = levelOf(copies);
  const lm = Math.pow(ECONOMY.levelStatMult, level - 1);
  const tags = [...d.tags, ...extraTags];
  let hp = d.hp * lm * statMult * tagProduct(mods.hp, tags);
  let size = d.size * Math.pow(d.big ? 1.05 : ECONOMY.levelSizeMult, level - 1);
  if (d.behavior === 'giant') {
    hp *= mods.giantHp;
    size *= mods.giantSize;
  }
  if (type === 'minion') hp *= mods.minionHp;
  const count = Math.max(1, Math.round(d.count * copies * (mods.countMult[type] ?? 1)));
  return {
    type,
    level,
    count,
    hp,
    dmg: d.dmg * lm * statMult * tagProduct(mods.dmg, tags),
    cooldown: d.cooldown / tagProduct(mods.atkSpeed, tags),
    reach: d.reach * (d.behavior === 'giant' ? Math.sqrt(size / d.size) : 1),
    range: d.range * (tags.includes('Ranged') ? mods.range.Ranged : 1),
    speed: d.speed * SIM.speedScale,
    armor: d.armor,
    size,
    aoe: d.aoe * (d.behavior === 'giant' ? Math.sqrt(size / d.size) : 1),
    knock: d.knock * mods.knockMult,
  };
}

export function armyStats(army: ArmySlot[], mods: Mods, statMult = 1): SlotStats[] {
  return army.map((s, i) => {
    const st = unitStats(s.type, s.copies, mods, statMult);
    if (i === 0 && mods.firstSlotCount !== 1) st.count = Math.round(st.count * mods.firstSlotCount);
    return st;
  });
}

export function minionStats(mods: Mods, statMult = 1, battleIndex = 1): SlotStats {
  // minions get a little stronger as the run goes on so necro builds keep up
  const st = unitStats('minion', 1, mods, statMult * (1 + 0.08 * (battleIndex - 1)), mods.minionBlade ? ['Blade'] : []);
  st.count = 1;
  return st;
}
