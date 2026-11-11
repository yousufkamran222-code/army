// Inspect one bot battle tick by tick: npx tsx scripts/debug-battle.ts <strategy> <battle> [seed]
import { newRun, battleSetup, finishBattle } from '../src/game/run';
import { botShop, botCommands } from '../src/game/bot';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
const [strat = 'greedy', target = '4', seedS = '1000'] = process.argv.slice(2);
const run = newRun(Number(seedS));
const rng = new Rng(1);
while (!run.over) {
  botShop(run, strat as never, rng);
  const b = new Battle(battleSetup(run));
  b.emitEvents = false;
  const verbose = run.battle === Number(target);
  if (verbose) {
    console.log('player', b.setup.player.slots.map((s) => `${s.type}x${s.count} hp${s.hp.toFixed(0)} dmg${s.dmg.toFixed(1)}`).join(', '), run.relics);
    console.log('enemy ', b.setup.enemy.slots.map((s) => `${s.type}x${s.count} hp${s.hp.toFixed(0)} dmg${s.dmg.toFixed(1)}`).join(', '));
  }
  while (!b.finished && b.tick < 3000) {
    if (b.tick % 5 === 0) botCommands(b);
    b.step();
    if (verbose && b.tick % 60 === 0) console.log(`t=${b.time.toFixed(0)} alive ${b.aliveCount} fronts ${b.front.map((f) => f.toFixed(0))} statues ${b.statueHp.map((h) => h.toFixed(0))} boss ${b.bossIdx >= 0 && b.alive[b.bossIdx] ? b.hp[b.bossIdx].toFixed(0) : '-'}`);
  }
  if (verbose) console.log(b.result);
  finishBattle(run, b.result!);
  if (run.battle > Number(target) || run.over) break;
}
