// CPU cost of the battle simulation at large scale (node, no rendering).
// npx tsx scripts/bench-sim.ts
import { newRun, battleSetup, addUnit, jumpToBattle } from '../src/game/run';
import { preset } from '../src/game/presets';
import { Battle } from '../src/sim/battle';

const run = newRun(7);
preset(run, 'swarm');
addUnit(run, 'swarmling', 6);
addUnit(run, 'swordsman', 6);
jumpToBattle(run, 8);
const setup = battleSetup(run);
setup.enemy.slots = setup.player.slots.map((x) => ({ ...x }));
setup.enemy.mods = setup.player.mods;
setup.enemy.minion = setup.player.minion;
setup.enemy.statueHp = 5000;
const b = new Battle(setup);
b.emitEvents = true; // include event generation cost, like the real game
const samples: { alive: number; ms: number }[] = [];
while (!b.finished && b.tick < 2700) {
  const t = performance.now();
  b.step();
  const ms = performance.now() - t;
  b.events.length = 0;
  samples.push({ alive: b.aliveCount[0] + b.aliveCount[1], ms });
}
const big = samples.filter((s) => s.alive >= 1500);
const avg = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / Math.max(1, xs.length);
const sorted = big.map((s) => s.ms).sort((a, c) => a - c);
console.log(`ticks with >=1500 alive: ${big.length}, peak alive ${Math.max(...samples.map((s) => s.alive))}`);
console.log(`sim step ms at >=1500 alive: avg ${avg(sorted).toFixed(3)}  p95 ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(3)}  max ${sorted[sorted.length - 1]?.toFixed(3)}`);
console.log(`=> at 1x speed (30 ticks/s, ~0.5 tick per 60fps frame) the sim uses ~${(avg(sorted) * 0.5).toFixed(2)} ms per frame; at 4x ~${(avg(sorted) * 2).toFixed(2)} ms`);
