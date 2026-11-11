import { newRun, battleSetup, addUnit, grantRelic, jumpToBattle } from '../src/game/run';
import { Battle } from '../src/sim/battle';
const run = newRun(42);
addUnit(run, 'swarmling', 6); addUnit(run, 'archer', 3); addUnit(run, 'necromancer', 2); addUnit(run, 'giant', 2);
run.army.unshift(run.army.splice(1,1)[0]);
for (const r of process.argv.slice(2)) grantRelic(run, r as any);
jumpToBattle(run, 8);
const b = new Battle(battleSetup(run));
b.emitEvents=false;
console.log(b.setup.enemy.slots.map(s=>s.type+':'+s.count).join(' '), b.setup.player.slots.map(s=>s.type+':'+s.count).join(' '));
for (let k=0;k<3000 && !b.finished;k++){ const t=performance.now(); b.step(); const d=performance.now()-t; if (k%100===0||d>50) console.log(k, d.toFixed(1), b.aliveCount, b.hi, b.pHi); }
console.log(b.result);
