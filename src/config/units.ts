// Data-driven unit definitions. Add a unit by adding an entry here (plus a weapon style in render/atlas.ts).

export type Tag = 'Blade' | 'Shield' | 'Ranged' | 'Rage' | 'Arcane' | 'Support' | 'Death' | 'Brute' | 'Swarm' | 'Boss';

export type UnitId =
  | 'swordsman'
  | 'shieldbearer'
  | 'archer'
  | 'spearman'
  | 'berserker'
  | 'monk'
  | 'mage'
  | 'necromancer'
  | 'giant'
  | 'swarmling'
  | 'minion'
  | 'warlord'
  | 'golem';

export type Behavior = 'melee' | 'ranged' | 'mage' | 'support' | 'necro' | 'giant' | 'warlord' | 'golem';

export type Weapon =
  | 'sword'
  | 'shield'
  | 'bow'
  | 'spear'
  | 'axes'
  | 'staff'
  | 'orb'
  | 'scythe'
  | 'club'
  | 'claws'
  | 'ghost'
  | 'greatsword'
  | 'golem';

export interface UnitDef {
  id: UnitId;
  name: string;
  tags: Tag[];
  role: string;
  behavior: Behavior;
  buyable: boolean;
  cost: number; // shop price per copy
  count: number; // stickmen per copy
  hp: number;
  dmg: number; // damage per attack (heal amount for support)
  cooldown: number; // seconds between attacks
  reach: number; // melee reach
  range: number; // ranged/support/necro range
  speed: number; // world units / s
  armor: number; // fraction of damage blocked
  size: number; // visual & physical scale (1 = normal stickman)
  aoe: number; // splash radius (0 = single target)
  knock: number; // knockback strength (giants, bosses)
  bigBonus: number; // damage multiplier vs units with size >= 1.8
  rage: number; // berserker: extra damage multiplier at 0 hp
  raiseCooldown: number; // necromancer
  weapon: Weapon;
  accent: string; // accent colour for weapons/details
  big: boolean;
}

const base: Omit<UnitDef, 'id' | 'name' | 'tags' | 'role' | 'behavior' | 'weapon' | 'accent'> = {
  buyable: true,
  cost: 3,
  count: 1,
  hp: 30,
  dmg: 5,
  cooldown: 1,
  reach: 14,
  range: 0,
  speed: 40,
  armor: 0,
  size: 1,
  aoe: 0,
  knock: 0,
  bigBonus: 1,
  rage: 0,
  raiseCooldown: 0,
  big: false,
};

function def(d: Partial<UnitDef> & Pick<UnitDef, 'id' | 'name' | 'tags' | 'role' | 'behavior' | 'weapon' | 'accent'>): UnitDef {
  return { ...base, ...d };
}

export const UNITS: Record<UnitId, UnitDef> = {
  swordsman: def({
    id: 'swordsman', name: 'Swordsman', tags: ['Blade'], role: 'Cheap, reliable melee.',
    behavior: 'melee', weapon: 'sword', accent: '#d8dde6',
    cost: 3, count: 9, hp: 30, dmg: 6, cooldown: 0.9, reach: 14, speed: 42,
  }),
  shieldbearer: def({
    id: 'shieldbearer', name: 'Shieldbearer', tags: ['Shield'], role: 'Tanky front line. Slow, blocks 35% damage.',
    behavior: 'melee', weapon: 'shield', accent: '#c9a25a',
    cost: 3, count: 6, hp: 85, dmg: 3, cooldown: 1.2, reach: 13, speed: 30, armor: 0.35, size: 1.05,
  }),
  archer: def({
    id: 'archer', name: 'Archer', tags: ['Ranged'], role: 'Fires arrow volleys from the back.',
    behavior: 'ranged', weapon: 'bow', accent: '#9a6a3a',
    cost: 4, count: 7, hp: 18, dmg: 5, cooldown: 1.6, range: 250, speed: 38,
  }),
  spearman: def({
    id: 'spearman', name: 'Spearman', tags: ['Blade', 'Shield'], role: 'Long reach. ×2.5 damage vs big units and bosses.',
    behavior: 'melee', weapon: 'spear', accent: '#b0b8c0',
    cost: 4, count: 6, hp: 40, dmg: 7, cooldown: 1.1, reach: 24, speed: 36, armor: 0.1, bigBonus: 2.5,
  }),
  berserker: def({
    id: 'berserker', name: 'Berserker', tags: ['Blade', 'Rage'], role: 'Hits harder the more it is hurt (up to ×2.5).',
    behavior: 'melee', weapon: 'axes', accent: '#ff5a3a',
    cost: 5, count: 4, hp: 48, dmg: 9, cooldown: 0.75, reach: 14, speed: 50, rage: 1.5,
  }),
  monk: def({
    id: 'monk', name: 'Monk', tags: ['Arcane', 'Support'], role: 'Follows the army and heals the most hurt ally nearby.',
    behavior: 'support', weapon: 'staff', accent: '#ffd35a',
    cost: 5, count: 3, hp: 26, dmg: 8, cooldown: 1.0, range: 80, speed: 38,
  }),
  mage: def({
    id: 'mage', name: 'Mage', tags: ['Arcane', 'Ranged'], role: 'Lobs exploding bolts that hit a whole crowd.',
    behavior: 'mage', weapon: 'orb', accent: '#5ae0ff',
    cost: 6, count: 3, hp: 22, dmg: 9, cooldown: 2.3, range: 210, speed: 36, aoe: 36,
  }),
  necromancer: def({
    id: 'necromancer', name: 'Necromancer', tags: ['Arcane', 'Death'], role: 'Raises fallen stickmen (either side) as minions.',
    behavior: 'necro', weapon: 'scythe', accent: '#b45aff',
    cost: 6, count: 2, hp: 30, dmg: 4, cooldown: 1.5, range: 170, speed: 36, raiseCooldown: 0.9,
  }),
  giant: def({
    id: 'giant', name: 'Giant', tags: ['Brute'], role: 'Huge and slow. Smashes crowds and knocks stickmen flying.',
    behavior: 'giant', weapon: 'club', accent: '#8a6a4a',
    cost: 7, count: 1, hp: 420, dmg: 26, cooldown: 1.9, reach: 30, speed: 22, armor: 0.15, size: 2.4, aoe: 36, knock: 1, big: true,
  }),
  swarmling: def({
    id: 'swarmling', name: 'Swarmling', tags: ['Swarm'], role: 'Very weak, but comes in huge numbers.',
    behavior: 'melee', weapon: 'claws', accent: '#9aff5a',
    cost: 3, count: 20, hp: 7, dmg: 2, cooldown: 0.6, reach: 10, speed: 58, size: 0.62,
  }),
  minion: def({
    id: 'minion', name: 'Minion', tags: ['Death'], role: 'Raised by a Necromancer.',
    behavior: 'melee', weapon: 'ghost', accent: '#7affc8', buyable: false,
    cost: 0, count: 1, hp: 14, dmg: 3.5, cooldown: 0.9, reach: 12, speed: 46, size: 0.92,
  }),
  warlord: def({
    id: 'warlord', name: 'Warlord', tags: ['Boss', 'Blade'], role: 'BOSS. All enemies deal +20% damage while he lives. Leads from the back. War Cry every 10s: enemies deal ×1.5 damage for 3s.',
    behavior: 'warlord', weapon: 'greatsword', accent: '#ffcf3a', buyable: false,
    cost: 0, count: 1, hp: 700, dmg: 20, cooldown: 1.3, reach: 32, speed: 26, armor: 0.3, size: 1.9, aoe: 30, knock: 0.6, big: true,
  }),
  golem: def({
    id: 'golem', name: 'Siege Golem', tags: ['Boss', 'Brute'], role: 'BOSS. Slams the front line every 6s, crushing and flinging everything nearby.',
    behavior: 'golem', weapon: 'golem', accent: '#9aa0a8', buyable: false,
    cost: 0, count: 1, hp: 1800, dmg: 34, cooldown: 2.0, reach: 44, speed: 14, armor: 0.4, size: 3.3, aoe: 50, knock: 1.0, big: true,
  }),
};

export const BOSS = {
  warlord: { aura: 1.2, cryEvery: 10, cryMult: 1.5, cryTime: 3 },
  golem: { slamEvery: 6, slamRadius: 110, slamDmg: 34, slamKnock: 1.3 },
};

export const BUYABLE_UNITS: UnitId[] = (Object.keys(UNITS) as UnitId[]).filter((k) => UNITS[k].buyable);

export const UNIT_IDS = Object.keys(UNITS) as UnitId[];
export const UNIT_INDEX: Record<UnitId, number> = Object.fromEntries(UNIT_IDS.map((k, i) => [k, i])) as Record<UnitId, number>;
