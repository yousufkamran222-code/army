// Tiny global store. The game mutates `state` (and the run inside it) and calls update();
// Preact components re-render by diffing, so the DOM is patched instead of rebuilt.

import { useEffect, useState } from 'preact/hooks';
import type { RunState, RewardBreakdown } from '../game/run';
import type { Battle } from '../sim/battle';
import type { BattleResult } from '../sim/types';
import type { CommandId } from '../config/commands';

export type Screen = 'title' | 'shop' | 'battle' | 'reward' | 'summary';

export type Selection =
  | { kind: 'offerUnit'; i: number }
  | { kind: 'offerRelic'; i: number }
  | { kind: 'slot'; i: number }
  | { kind: 'relic'; i: number }
  | { kind: 'enemy'; i: number }
  | { kind: 'cmd'; id: CommandId }
  | null;

export interface Banner {
  id: number;
  text: string;
  color: string;
  big?: boolean;
}

export interface State {
  screen: Screen;
  run: RunState;
  battle: Battle | null;
  result: BattleResult | null;
  reward: RewardBreakdown | null;
  sel: Selection;
  debugOpen: boolean;
  menuOpen: boolean;
  toast: { id: number; text: string; bad?: boolean } | null;
  banners: Banner[];
  speed: number;
  paused: boolean;
  numbers: boolean;
  muted: boolean;
}

export interface Actions {
  startRun: () => void;
  startBattle: () => void;
  continueFromReward: () => void;
  command: (k: number) => void;
  setSpeed: (s: number) => void;
  togglePause: () => void;
  toggleNumbers: () => void;
  toggleMute: () => void;
  forceWin: () => void;
  refreshShop: () => void;
  quitBattle: () => void;
}

let state: State;
const subs = new Set<() => void>();
export const actions = {} as Actions;

export function initState(s: State) {
  state = s;
}
export function getState(): State {
  return state;
}

let raf = 0;
/** Apply a change and schedule a re-render (batched to one per frame). */
export function update(fn?: (s: State) => void) {
  fn?.(state);
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    for (const f of subs) f();
  });
}

export function useGame(): State {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((v) => v + 1);
    subs.add(f);
    f(); // catch any update that happened before we subscribed
    return () => void subs.delete(f);
  }, []);
  return state;
}

/** Re-render a component every `ms` (used by the battle HUD to show live counts). */
export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

let nextId = 1;
export function toast(text: string, bad = false) {
  const id = nextId++;
  update((s) => (s.toast = { id, text, bad }));
  setTimeout(() => update((s) => (s.toast?.id === id ? (s.toast = null) : null)), 1600);
}

export function banner(text: string, color = '#fff', big = false) {
  const id = nextId++;
  update((s) => s.banners.push({ id, text, color, big }));
  setTimeout(() => update((s) => (s.banners = s.banners.filter((b) => b.id !== id))), 1600);
}

// relic trigger bus (high frequency; HUD listens directly)
type PulseFn = (id: string, n: number, set: boolean) => void;
const pulseSubs = new Set<PulseFn>();
export function emitPulse(id: string, n: number, set: boolean) {
  for (const f of pulseSubs) f(id, n, set);
}
export function onPulse(f: PulseFn) {
  pulseSubs.add(f);
  return () => void pulseSubs.delete(f);
}
