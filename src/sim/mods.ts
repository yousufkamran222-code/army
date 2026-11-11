import type { Tag, UnitId } from '../config/units';
import type { CommandId } from '../config/commands';

const TAGS: Tag[] = ['Blade', 'Shield', 'Ranged', 'Rage', 'Arcane', 'Support', 'Death', 'Brute', 'Swarm', 'Boss'];

function tagRecord(v: number): Record<Tag, number> {
  return Object.fromEntries(TAGS.map((t) => [t, v])) as Record<Tag, number>;
}

/** Every knob relics can turn. Relics write into this; stats.ts + battle.ts + economy read it. */
export interface Mods {
  dmg: Record<Tag, number>;
  hp: Record<Tag, number>;
  atkSpeed: Record<Tag, number>;
  range: Record<Tag, number>;
  countMult: Partial<Record<UnitId, number>>;
  firstSlotCount: number;

  swarmSplit: number; // generations of splitting (0 = off)
  swarmNoShrink: boolean;
  shieldQuiverPer: number; // shield stickmen per extra arrow (0 = off)
  shieldQuiverMax: number;
  minionBlade: boolean;
  minionHp: number;
  raisePerCorpse: number;
  raiseSpeed: number;
  raiseRange: number;
  minionExplode: number; // explosion damage (0 = off)
  giantThrow: number; // landing damage as fraction of giant damage (0 = off)
  giantSize: number;
  giantHp: number;
  knockMult: number;
  rageMult: number;
  rageHeal: number; // fraction of max hp healed on kill
  chant: number; // dmg bonus per heal stack (0 = off)
  chantMax: number;
  numbersPct: number; // damage bonus per living ally
  numbersCap: number;
  chainEvery: number; // kills per stack (0 = off)
  chainMult: number;
  hailSplit: number; // arrow split generations (0 = off)
  autoMeteorEvery: number; // kills per free meteor (0 = off)

  // run-level
  bountyPer: number; // enemy kills per gold (0 = off)
  bountyGold: number;
  interestCap: number;
  extraCommands: number;
  extraSlots: number;
  unlocks: CommandId[];
}

export function defaultMods(): Mods {
  return {
    dmg: tagRecord(1),
    hp: tagRecord(1),
    atkSpeed: tagRecord(1),
    range: tagRecord(1),
    countMult: {},
    firstSlotCount: 1,
    swarmSplit: 0,
    swarmNoShrink: false,
    shieldQuiverPer: 0,
    shieldQuiverMax: 0,
    minionBlade: false,
    minionHp: 1,
    raisePerCorpse: 1,
    raiseSpeed: 1,
    raiseRange: 1,
    minionExplode: 0,
    giantThrow: 0,
    giantSize: 1,
    giantHp: 1,
    knockMult: 1,
    rageMult: 1,
    rageHeal: 0,
    chant: 0,
    chantMax: 5,
    numbersPct: 0,
    numbersCap: 0,
    chainEvery: 0,
    chainMult: 1,
    hailSplit: 0,
    autoMeteorEvery: 0,
    bountyPer: 0,
    bountyGold: 0,
    interestCap: 0,
    extraCommands: 0,
    extraSlots: 0,
    unlocks: [],
  };
}
