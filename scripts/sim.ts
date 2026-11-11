// Headless balance simulator.
//   npm run sim                 -> 40 runs per strategy + 400 random stress battles
//   npm run sim -- --runs 200 --stress 3000
import { STRATEGIES, playRun, playBattle, type RunReport } from '../src/game/bot';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { BUYABLE_UNITS } from '../src/config/units';
import { RELICS } from '../src/config/relics';
import { newRun, addUnit, grantRelic, jumpToBattle, battleSetup } from '../src/game/run';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf('--' + k);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const RUNS = arg('runs', 40);
const STRESS = arg('stress', 400);
const seed0 = arg('seed', 1000);
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-');
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const t0 = Date.now();
const all: RunReport[] = [];
console.log(`\n=== Full runs: ${RUNS} per strategy ===`);
console.log('strategy | win% | avg reached | lost at (b1..b8) | avg B8 spawned | max spawned | avg peak alive (last battle) | timeouts | avg battle s');
for (const strat of STRATEGIES) {
  if (only && strat !== only) continue;
  const reps: RunReport[] = [];
  for (let i = 0; i < RUNS; i++) reps.push(playRun(seed0 + i * 7919, strat));
  all.push(...reps);
  const wins = reps.filter((r) => r.won).length;
  const lostAt = Array(9).fill(0);
  for (const r of reps) if (!r.won) lostAt[r.reached]++;
  const b8 = reps.flatMap((r) => r.battles.filter((b) => b.battle === 8));
  const times = reps.flatMap((r) => r.battles.map((b) => b.time));
  const tos = reps.flatMap((r) => r.battles).filter((b) => b.timedOut).length;
  console.log(
    `${strat.padEnd(7)} | ${pct(wins, reps.length).padStart(4)} | ${avg(reps.map((r) => r.reached)).toFixed(1)} | ${lostAt.slice(1).join(' ')} | ${avg(b8.map((b) => b.spawned)).toFixed(0)} | ${Math.max(...reps.map((r) => r.maxSpawned))} | ${avg(reps.map((r) => r.battles[r.battles.length - 1].peak)).toFixed(0)} | ${tos} | ${avg(times).toFixed(1)}`,
  );
}

console.log('\n=== Per battle (all strategies) ===');
console.log('battle | n | win% | avg predicted share | avg time | avg player spawned | avg enemy spawned | timeouts');
for (let bi = 1; bi <= 8; bi++) {
  const bs = all.flatMap((r) => r.battles.filter((b) => b.battle === bi));
  if (!bs.length) continue;
  console.log(`B${bi} | ${bs.length} | ${pct(bs.filter((b) => b.won).length, bs.length)} | ${avg(bs.map((b) => b.predicted)).toFixed(2)} | ${avg(bs.map((b) => b.time)).toFixed(1)}s | ${avg(bs.map((b) => b.spawned)).toFixed(0)} | ${avg(bs.map((b) => b.enemyCount)).toFixed(0)} | ${bs.filter((b) => b.timedOut).length}`);
}

// relic and unit presence vs. win rate (all strategies)
if (!only) {
  console.log('\n=== Relic presence in final build (all strategies) ===');
  const rows = RELICS.map((r) => {
    const w = all.filter((x) => x.relics.includes(r.id));
    return { id: r.id, n: w.length, win: w.filter((x) => x.won).length / Math.max(1, w.length), reached: avg(w.map((x) => x.reached)) };
  }).sort((a, b) => b.win - a.win);
  for (const r of rows) console.log(`${r.id.padEnd(22)} n=${String(r.n).padStart(4)} win=${(r.win * 100).toFixed(0).padStart(3)}% reached=${r.reached.toFixed(1)}`);
  console.log('\n=== Unit presence in final army ===');
  for (const u of BUYABLE_UNITS) {
    const w = all.filter((x) => x.army.some((s) => s.type === u && s.copies >= 2));
    console.log(`${u.padEnd(14)} n=${String(w.length).padStart(4)} win=${pct(w.filter((x) => x.won).length, w.length).padStart(4)} reached=${avg(w.map((x) => x.reached)).toFixed(1)}`);
  }
  // power estimate calibration
  console.log('\n=== Shop power-bar calibration (predicted share -> actual win rate) ===');
  const bins = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01];
  const bs = all.flatMap((r) => r.battles);
  for (let i = 0; i < bins.length - 1; i++) {
    const inb = bs.filter((b) => b.predicted >= bins[i] && b.predicted < bins[i + 1]);
    console.log(`  ${bins[i].toFixed(1)}-${bins[i + 1].toFixed(1)}: n=${inb.length} win=${pct(inb.filter((b) => b.won).length, inb.length)}`);
  }
}

// build test: fixed builds at equal gold value vs. the real enemies of battle N
const BUILDS: Record<string, { units: [string, number][]; relics: string[] }> = {
  plain: { units: [['shieldbearer', 2], ['swordsman', 3], ['spearman', 2], ['archer', 2]], relics: ['war_drums', 'thick_skin'] },
  swarm: { units: [['swarmling', 5], ['shieldbearer', 1], ['archer', 1]], relics: ['vanguard_banner', 'mitosis', 'brood_mother', 'strength_in_numbers'] },
  necro: { units: [['shieldbearer', 2], ['swordsman', 2], ['necromancer', 4]], relics: ['soul_harvest', 'grave_pact', 'gravedigger', 'war_drums'] },
  volley: { units: [['shieldbearer', 4], ['spearman', 1], ['archer', 4]], relics: ['shield_quiver', 'eagle_eye', 'hail_of_arrows', 'thick_skin'] },
  giant: { units: [['swordsman', 2], ['giant', 4], ['swarmling', 1]], relics: ['catapult_arms', 'titan_blood', 'war_drums'] },
  berserk: { units: [['shieldbearer', 1], ['berserker', 4], ['monk', 2]], relics: ['blood_frenzy', 'war_chant', 'war_drums'] },
  arcane: { units: [['shieldbearer', 2], ['mage', 3], ['monk', 2], ['necromancer', 1]], relics: ['arcane_resonance', 'eagle_eye', 'thick_skin'] },
};
const BT = arg('buildtest', 20);
if (BT > 0) {
  console.log(`\n=== Build test (${BT} enemy seeds each; gold value of build = what a player has by then) ===`);
  for (const [battle, value] of [[3, 35], [5, 65], [8, 115]] as const) {
    const line: string[] = [];
    for (const [name, bd] of Object.entries(BUILDS)) {
      let wins = 0;
      let spawned = 0;
      let peak = 0;
      let time = 0;
      for (let k = 0; k < BT; k++) {
        const run = newRun(777 + k * 31);
        run.army = [];
        let gold = value;
        const rel = bd.relics.slice(0, battle <= 3 ? 2 : battle <= 5 ? 3 : 5);
        for (const r of rel) {
          grantRelic(run, r as never);
          gold -= ({ common: 4, uncommon: 6, rare: 9 } as Record<string, number>)[RELICS.find((x) => x.id === r)!.rarity];
        }
        // buy copies round-robin by weight until out of gold
        const counts = new Map<string, number>();
        let guard = 0;
        while (gold > 0 && guard++ < 200) {
          let bought = false;
          for (const [u, w] of bd.units) {
            const have = counts.get(u) ?? 0;
            const total = [...counts.values()].reduce((a, b) => a + b, 0) + 1;
            if (have / total > w / bd.units.reduce((a, x) => a + x[1], 0) && total > 2) continue;
            const c = ({ swordsman: 3, shieldbearer: 3, archer: 4, spearman: 4, berserker: 5, monk: 5, mage: 6, necromancer: 6, giant: 7, swarmling: 3 } as Record<string, number>)[u];
            if (c > gold) continue;
            gold -= c;
            counts.set(u, have + 1);
            bought = true;
          }
          if (!bought) break;
        }
        for (const [u] of bd.units) if (counts.get(u)) addUnit(run, u as never, counts.get(u)!);
        jumpToBattle(run, battle);
        const r = playBattle(new Battle(battleSetup(run, k)));
        if (r.winner === 0) wins++;
        spawned += r.spawned[0];
        peak += r.peakAlive[0];
        time += r.time;
      }
      line.push(`${name}: ${pct(wins, BT)} (spawned ${Math.round(spawned / BT)}, peak ${Math.round(peak / BT)}, ${(time / BT).toFixed(0)}s)`);
    }
    console.log(`B${battle} @${value}g -> ` + line.join(' | '));
  }
}

// stress: random armies at random battles, with random relics, check for crashes/stalls
if (STRESS > 0) {
  console.log(`\n=== Stress: ${STRESS} random battles ===`);
  const rng = new Rng(4242);
  let timeouts = 0;
  let errors = 0;
  let maxTime = 0;
  let maxUnits = 0;
  let slowest = 0;
  for (let i = 0; i < STRESS; i++) {
    const run = newRun(rng.int(1e9));
    run.army = [];
    const nSlots = 1 + rng.int(5);
    for (let k = 0; k < nSlots; k++) addUnit(run, rng.pick(BUYABLE_UNITS), 1 + rng.int(9));
    const nRel = rng.int(6);
    for (let k = 0; k < nRel; k++) grantRelic(run, rng.pick(RELICS).id);
    jumpToBattle(run, 1 + rng.int(8));
    try {
      const b = new Battle(battleSetup(run, i));
      const s = Date.now();
      const r = playBattle(b, rng.next() < 0.7);
      slowest = Math.max(slowest, Date.now() - s);
      if (!r) throw new Error('no result');
      if (r.timedOut) timeouts++;
      maxTime = Math.max(maxTime, r.time);
      maxUnits = Math.max(maxUnits, r.peakAlive[0] + r.peakAlive[1]);
    } catch (e) {
      errors++;
      if (errors < 5) console.log('ERROR', e);
    }
  }
  console.log(`errors=${errors} timeouts=${timeouts} (${pct(timeouts, STRESS)}) longest=${maxTime.toFixed(1)}s peakUnitsInOneBattle=${maxUnits} slowestBattleWallMs=${slowest}`);
}
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
