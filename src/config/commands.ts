export type CommandId = 'charge' | 'hold' | 'volley' | 'rally' | 'meteor' | 'raise' | 'burst';

export interface CommandDef {
  id: CommandId;
  name: string;
  icon: string;
  desc: string;
  base: boolean; // available without relics
  duration: number;
  power: number;
}

export const COMMANDS: Record<CommandId, CommandDef> = {
  charge: { id: 'charge', name: 'Charge', icon: '⚔️', desc: 'All units sprint (×1.8 speed) and deal ×1.5 damage for 5s.', base: true, duration: 5, power: 1.5 },
  hold: { id: 'hold', name: 'Hold the Line', icon: '🛡️', desc: 'Front-line units brace for 6s: they stop and take 60% less damage.', base: true, duration: 6, power: 0.4 },
  volley: { id: 'volley', name: 'Volley', icon: '🏹', desc: 'Every ranged unit fires instantly with double arrows, then reloads.', base: true, duration: 0, power: 2 },
  rally: { id: 'rally', name: 'Rally', icon: '📯', desc: 'Revive your last 10 fallen stickmen where they fell, at full health.', base: true, duration: 0, power: 10 },
  meteor: { id: 'meteor', name: 'Meteor', icon: '☄️', desc: 'Drop 3 meteors on the enemy front. +3 damage for every enemy killed this battle.', base: false, duration: 0, power: 70 },
  raise: { id: 'raise', name: 'Raise Dead', icon: '💀', desc: 'Every fresh corpse on the field (up to 150) rises as your minion.', base: false, duration: 0, power: 150 },
  burst: { id: 'burst', name: 'Swarm Burst', icon: '🐜', desc: 'Every living Swarmling instantly splits in two.', base: false, duration: 0, power: 1 },
};

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];
export const BASE_COMMANDS = COMMAND_IDS.filter((c) => COMMANDS[c].base);
