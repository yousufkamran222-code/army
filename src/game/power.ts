// Rough army strength estimate (Lanchester-style: sqrt(total HP x total DPS)), used for the
// shop's "you vs them" bar and by the bot shopper. Dynamic relics get heuristic multipliers.

import { UNITS } from '../config/units';
import { BOSS } from '../config/units';
import type { Mods } from '../sim/mods';
import type { SideSetup, SlotStats } from '../sim/types';

export function slotPower(st: SlotStats, mods: Mods, quiverExtra: number): { hp: number; dps: number; count: number } {
  const d = UNITS[st.type];
  let count = st.count;
  let hp = st.hp / (1 - st.armor);
  let dps = st.dmg / st.cooldown;
  switch (d.behavior) {
    case 'ranged':
      dps *= 1.6 * (1 + quiverExtra) * (1 + 0.5 * Math.min(1, mods.hailSplit));
      break;
    case 'mage':
      dps *= 1 + st.aoe / 10;
      break;
    case 'support':
      dps *= 1.6 * (1 + (mods.chant > 0 ? 0.6 : 0));
      break;
    case 'necro': {
      // value of raised minions over a battle
      const raises = (30 / d.raiseCooldown) * mods.raiseSpeed * mods.raisePerCorpse * 0.35;
      hp += raises * 14 * mods.minionHp;
      dps += raises * 3.5 * (mods.minionBlade ? mods.dmg.Blade : 1) * 0.6 * (mods.minionExplode > 0 ? 1.5 : 1);
      break;
    }
    case 'giant':
      dps *= 3.2 * (1 + st.knock * 0.3) * (1 + mods.giantThrow);
      break;
    case 'warlord':
      dps *= 3 * BOSS.warlord.aura;
      break;
    case 'golem':
      dps *= 3 + BOSS.golem.slamDmg / 30;
      break;
  }
  if (d.rage > 0) dps *= 1 + d.rage * mods.rageMult * 0.35 + mods.rageHeal;
  if (st.type === 'swarmling' && mods.swarmSplit > 0) {
    // generations: 1 + 2*0.75 + 4*0.56 ...
    let f = 1;
    let g = 1;
    for (let k = 1; k <= mods.swarmSplit; k++) {
      g *= 2 * (mods.swarmNoShrink ? 1 : 0.7);
      f += g;
    }
    count *= f;
  }
  return { hp: hp * count, dps: dps * count, count };
}

export function sidePower(side: SideSetup, quiverExtra = 0): number {
  let hp = 0;
  let dps = 0;
  let n = 0;
  for (const st of side.slots) {
    const p = slotPower(st, side.mods, quiverExtra);
    hp += p.hp;
    dps += p.dps;
    n += p.count;
  }
  const m = side.mods;
  if (m.numbersPct > 0) dps *= 1 + Math.min(m.numbersCap, m.numbersPct * n * 0.55);
  if (m.chainEvery > 0) dps *= 1 + 0.15 * (m.chainMult - 1) * 10;
  hp += side.statueHp * 0.15;
  return Math.round(Math.sqrt(hp * dps));
}

export function quiverExtraFor(side: SideSetup): number {
  const m = side.mods;
  if (m.shieldQuiverPer <= 0) return 0;
  let shields = 0;
  for (const st of side.slots) if (UNITS[st.type].tags.includes('Shield')) shields += st.count;
  return Math.min(m.shieldQuiverMax, Math.floor(shields / m.shieldQuiverPer));
}
