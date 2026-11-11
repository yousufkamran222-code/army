// Data-driven relic definitions. Each relic writes into Mods (sim/mods.ts).
// `power` is 1 normally, higher when an Echo Stone sits to its left.

import type { Mods } from '../sim/mods';
import type { ArmySlot } from '../sim/types';
import { UNITS } from './units';

export type Rarity = 'common' | 'uncommon' | 'rare';
export type RelicId =
  | 'war_drums'
  | 'eagle_eye'
  | 'thick_skin'
  | 'brood_mother'
  | 'bounty_board'
  | 'piggy_bank'
  | 'gravedigger'
  | 'vanguard_banner'
  | 'mitosis'
  | 'shield_quiver'
  | 'grave_pact'
  | 'soul_harvest'
  | 'catapult_arms'
  | 'blood_frenzy'
  | 'arcane_resonance'
  | 'commanders_horn'
  | 'war_chant'
  | 'titan_blood'
  | 'barracks'
  | 'strength_in_numbers'
  | 'echo_stone'
  | 'chain_reaction'
  | 'sky_hammer'
  | 'lich_crown'
  | 'hail_of_arrows';

export interface RelicDef {
  id: RelicId;
  name: string;
  icon: string;
  rarity: Rarity;
  desc: string;
  /** combo hint shown in the tooltip */
  combo?: string;
  apply: (m: Mods, power: number, army: ArmySlot[]) => void;
  /** label for a trigger popup, n = how many times it fired in the window */
  label: (n: number) => string;
}

const countTag = (army: ArmySlot[], tag: string) => army.filter((s) => UNITS[s.type].tags.includes(tag as never)).length;

export const RELICS: RelicDef[] = [
  // ---------- common ----------
  {
    id: 'war_drums', name: 'War Drums', icon: '🥁', rarity: 'common',
    desc: 'Blade units deal ×1.3 damage.',
    combo: 'Grave Pact makes minions count as Blade.',
    apply: (m, p) => { m.dmg.Blade *= Math.pow(1.3, p); },
    label: (n) => `Blade ×1.3 ×${n}`,
  },
  {
    id: 'eagle_eye', name: 'Eagle Eye', icon: '🦅', rarity: 'common',
    desc: 'Ranged units get +35% range and deal ×1.25 damage.',
    apply: (m, p) => { m.range.Ranged *= Math.pow(1.35, p); m.dmg.Ranged *= Math.pow(1.25, p); },
    label: (n) => `Ranged ×1.25 ×${n}`,
  },
  {
    id: 'thick_skin', name: 'Thick Skin', icon: '🪨', rarity: 'common',
    desc: 'Shield units have ×1.5 HP.',
    apply: (m, p) => { m.hp.Shield *= Math.pow(1.5, p); },
    label: (n) => `Shield HP ×1.5 ×${n}`,
  },
  {
    id: 'brood_mother', name: 'Brood Mother', icon: '🥚', rarity: 'common',
    desc: 'Swarmling slots deploy ×1.5 stickmen.',
    combo: 'Mitosis splits each of them, Vanguard Banner doubles slot 1.',
    apply: (m, p) => { m.countMult.swarmling = (m.countMult.swarmling ?? 1) * Math.pow(1.5, p); },
    label: (n) => `+${n} Swarmlings`,
  },
  {
    id: 'bounty_board', name: 'Bounty Board', icon: '📜', rarity: 'common',
    desc: 'Gain 1 gold for every 10 enemy stickmen killed.',
    apply: (m, p) => { m.bountyPer = 10; m.bountyGold += p; },
    label: (n) => `+${n} gold`,
  },
  {
    id: 'piggy_bank', name: 'Piggy Bank', icon: '🐷', rarity: 'common',
    desc: 'Interest cap raised by 5 (max +10 gold per round).',
    apply: (m, p) => { m.interestCap += 5 * p; },
    label: () => `Interest +`,
  },
  {
    id: 'gravedigger', name: 'Gravedigger', icon: '⚰️', rarity: 'common',
    desc: 'Necromancers raise twice as fast with ×1.5 reach.',
    apply: (m, p) => { m.raiseSpeed *= Math.pow(2, p); m.raiseRange *= Math.pow(1.5, p); },
    label: (n) => `Raise ×2 ×${n}`,
  },
  // ---------- uncommon ----------
  {
    id: 'vanguard_banner', name: 'Vanguard Banner', icon: '🚩', rarity: 'uncommon',
    desc: 'Your first unit slot deploys double its count every battle.',
    combo: 'Put Swarmlings first.',
    apply: (m, p) => { m.firstSlotCount *= Math.pow(2, p); },
    label: (n) => `Slot 1 ×2 (+${n})`,
  },
  {
    id: 'mitosis', name: 'Mitosis', icon: '🧫', rarity: 'uncommon',
    desc: 'When a Swarmling dies, it splits into 2 smaller Swarmlings (max 3 generations). Unlocks Swarm Burst.',
    combo: 'Every split feeds Strength in Numbers.',
    apply: (m, p) => { m.swarmSplit = Math.max(m.swarmSplit, 2 + p); if (!m.unlocks.includes('burst')) m.unlocks.push('burst'); },
    label: (n) => `Split ×${n}`,
  },
  {
    id: 'shield_quiver', name: 'Shield Quiver', icon: '🎯', rarity: 'uncommon',
    desc: 'Every Archer volley fires +1 arrow for each 4 Shield stickmen in your army (max +10).',
    combo: 'Shieldbearers + Spearmen in front, Archers behind.',
    apply: (m, p) => { m.shieldQuiverPer = 4 / p; m.shieldQuiverMax = 10 * p; },
    label: (n) => `+arrows ×${n}`,
  },
  {
    id: 'grave_pact', name: 'Grave Pact', icon: '🩸', rarity: 'uncommon',
    desc: 'Necromancer minions count as Blade (inherit all Blade bonuses) and have ×1.5 HP.',
    combo: 'War Drums, Strength in Numbers.',
    apply: (m, p) => { m.minionBlade = true; m.minionHp *= Math.pow(1.5, p); },
    label: (n) => `Blade minion ×${n}`,
  },
  {
    id: 'soul_harvest', name: 'Soul Harvest', icon: '👻', rarity: 'uncommon',
    desc: 'Necromancers raise 2 minions from every corpse.',
    apply: (m, p) => { m.raisePerCorpse += p; },
    label: (n) => `+${n} minions`,
  },
  {
    id: 'catapult_arms', name: 'Catapult Arms', icon: '🏋️', rarity: 'uncommon',
    desc: 'Giants throw the stickmen they hit. Thrown stickmen crash down, damaging their own army.',
    combo: 'Titan Blood throws them further.',
    apply: (m, p) => { m.giantThrow = Math.max(m.giantThrow, 0.6 * p); },
    label: (n) => `Thrown ×${n}`,
  },
  {
    id: 'blood_frenzy', name: 'Blood Frenzy', icon: '😡', rarity: 'uncommon',
    desc: 'Berserker rage is tripled, and they heal 25% HP on every kill.',
    combo: 'Monks keep them topped up... or not.',
    apply: (m, p) => { m.rageMult *= Math.pow(3, p); m.rageHeal += 0.25 * p; },
    label: (n) => `Frenzy ×${n}`,
  },
  {
    id: 'arcane_resonance', name: 'Arcane Resonance', icon: '🔮', rarity: 'uncommon',
    desc: 'Arcane units deal ×1.25 damage (and heal) for each Arcane slot you have, compounding.',
    combo: 'Mage + Monk + Necromancer = ×1.95.',
    apply: (m, p, army) => { m.dmg.Arcane *= Math.pow(1.25, countTag(army, 'Arcane') * p); },
    label: (n) => `Arcane ×${n}`,
  },
  {
    id: 'commanders_horn', name: "Commander's Horn", icon: '📣', rarity: 'uncommon',
    desc: '+1 command per battle.',
    apply: (m, p) => { m.extraCommands += p; },
    label: () => `+1 command`,
  },
  {
    id: 'war_chant', name: 'War Chant', icon: '🎶', rarity: 'uncommon',
    desc: 'Every Monk heal also gives the ally +15% damage (stacks 5 times).',
    combo: 'Monks behind Berserkers.',
    apply: (m, p) => { m.chant = 0.15 * p; },
    label: (n) => `Chant ×${n}`,
  },
  {
    id: 'titan_blood', name: 'Titan Blood', icon: '🧬', rarity: 'uncommon',
    desc: 'Giants are ×1.25 bigger with ×2 HP, and knock stickmen ×1.5 further.',
    apply: (m, p) => { m.giantSize *= Math.pow(1.25, p); m.giantHp *= Math.pow(2, p); m.knockMult *= Math.pow(1.5, p); },
    label: (n) => `Titan ×${n}`,
  },
  {
    id: 'barracks', name: 'Barracks', icon: '🏰', rarity: 'uncommon',
    desc: '+1 unit slot (max 7).',
    apply: (m, p) => { m.extraSlots += p; },
    label: () => `+1 slot`,
  },
  // ---------- rare ----------
  {
    id: 'strength_in_numbers', name: 'Strength in Numbers', icon: '👥', rarity: 'rare',
    desc: 'Your units deal +1% damage for each of your stickmen currently alive (max +500%).',
    combo: 'Swarms, minions, anything big.',
    apply: (m, p) => { m.numbersPct += 0.01 * p; m.numbersCap = 5 * p; },
    label: (n) => `+${n}% dmg`,
  },
  {
    id: 'echo_stone', name: 'Echo Stone', icon: '🔁', rarity: 'rare',
    desc: 'The relic directly to the RIGHT of this one triggers twice.',
    combo: 'Order matters. Two Echo Stones in a row = ×3.',
    apply: () => {},
    label: () => `Echo!`,
  },
  {
    id: 'chain_reaction', name: 'Chain Reaction', icon: '⛓️', rarity: 'rare',
    desc: 'Every 40 enemies killed this battle, your units deal ×1.1 more damage (compounding).',
    apply: (m, p) => { m.chainEvery = 40; m.chainMult *= Math.pow(1.1, p); },
    label: (n) => `Chain stack ${n}`,
  },
  {
    id: 'sky_hammer', name: 'Sky Hammer', icon: '☄️', rarity: 'rare',
    desc: 'Unlocks the Meteor command. Every 30 enemies killed, a free meteor falls.',
    apply: (m, p) => { if (!m.unlocks.includes('meteor')) m.unlocks.push('meteor'); m.autoMeteorEvery = Math.round(30 / p); },
    label: (n) => `Meteor ×${n}`,
  },
  {
    id: 'lich_crown', name: 'Lich Crown', icon: '👑', rarity: 'rare',
    desc: 'Your minions explode when they die, hurting nearby enemies. Unlocks Raise Dead.',
    combo: 'Explosion kills make fresh corpses to raise.',
    apply: (m, p) => { m.minionExplode = 14 * p; if (!m.unlocks.includes('raise')) m.unlocks.push('raise'); },
    label: (n) => `Boom ×${n}`,
  },
  {
    id: 'hail_of_arrows', name: 'Hail of Arrows', icon: '🌧️', rarity: 'rare',
    desc: 'Arrows that kill split into 2 new arrows (up to 3 generations).',
    combo: 'More arrows = more kills = more arrows.',
    apply: (m, p) => { m.hailSplit = 2 + p; },
    label: (n) => `Split arrows ×${n}`,
  },
];

export const RELIC_MAP: Record<RelicId, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r])) as Record<RelicId, RelicDef>;

/** Effective relic list with Echo Stone power applied (left to right). */
export function relicPowers(ids: RelicId[]): { id: RelicId; power: number }[] {
  const out = ids.map((id) => ({ id, power: 1 }));
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].id === 'echo_stone') out[i + 1].power += out[i].power;
  }
  return out;
}
