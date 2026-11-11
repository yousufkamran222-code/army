// Ready-made builds used by the debug menu, the title-screen demo and benchmarks.
import { grantRelic, type RunState } from './run';

export type PresetName = 'swarm' | 'necro' | 'archer' | 'giant';

export function preset(run: RunState, kind: PresetName) {
  const P = {
    swarm: { army: [['swarmling', 9], ['shieldbearer', 3], ['monk', 3], ['archer', 3]], relics: ['vanguard_banner', 'brood_mother', 'mitosis', 'strength_in_numbers', 'chain_reaction'] },
    necro: { army: [['shieldbearer', 3], ['swordsman', 3], ['necromancer', 9], ['monk', 3]], relics: ['soul_harvest', 'gravedigger', 'grave_pact', 'war_drums', 'lich_crown'] },
    archer: { army: [['shieldbearer', 9], ['spearman', 3], ['archer', 9], ['monk', 3]], relics: ['echo_stone', 'shield_quiver', 'eagle_eye', 'hail_of_arrows', 'thick_skin'] },
    giant: { army: [['swordsman', 3], ['giant', 9], ['swarmling', 3], ['archer', 3]], relics: ['echo_stone', 'catapult_arms', 'titan_blood', 'war_drums', 'strength_in_numbers'] },
  }[kind];
  run.army = P.army.map(([t, c]) => ({ type: t as never, copies: c as number }));
  run.relics = [];
  for (const r of P.relics) grantRelic(run, r as never);
}
