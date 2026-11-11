import type { UnitId } from '../config/units';
import type { CommandId } from '../config/commands';
import type { Mods } from './mods';

/** One army slot as owned by a player or enemy. */
export interface ArmySlot {
  type: UnitId;
  copies: number;
}

/** Final per-slot numbers the battle sim uses (relics already applied). */
export interface SlotStats {
  type: UnitId;
  level: number;
  count: number;
  hp: number;
  dmg: number;
  cooldown: number;
  reach: number;
  range: number;
  speed: number;
  armor: number;
  size: number;
  aoe: number;
  knock: number;
}

export interface SideSetup {
  slots: SlotStats[];
  statueHp: number;
  mods: Mods;
  /** stat multiplier applied to minions raised by this side */
  minion: SlotStats;
}

export interface BattleSetup {
  seed: number;
  battleIndex: number;
  player: SideSetup;
  enemy: SideSetup;
  commands: CommandId[];
}

export interface BattleResult {
  winner: 0 | 1; // 0 = player
  time: number;
  timedOut: boolean;
  playerStatueFrac: number;
  enemyStatueFrac: number;
  spawned: [number, number];
  kills: [number, number]; // kills BY side
  peakAlive: [number, number];
  biggestHit: number;
  relicTriggers: Record<string, number>;
  bountyGold: number;
}
