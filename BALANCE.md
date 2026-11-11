# Balance and performance report

Everything here comes from `npm run sim` (headless, deterministic) and the benchmark scripts. To reproduce:
`npm run sim -- --runs 150 --stress 3000 --buildtest 30` (about 2 minutes).

## How the simulator plays

- **Bots play full runs.** They shop, order the army, pick commands and fire them at sensible moments: Charge, Volley, Meteor and Hold when the lines meet; Rally after heavy losses.
  - `greedy`: buys whatever raises the estimated army power most per gold. This is the "reasonable build" benchmark.
  - `swarm`, `necro`, `archer`, `giant`: play greedy until they find one of their plan's key relics, then bias hard toward that plan. They behave like a player chasing a synergy.
  - `random`: buys random affordable things. This is the floor.
- **Build test.** Fixed builds at the gold value a player has by battles 3, 5 and 8 (35, 65 and 115 gold), each fought against 30 different real enemy armies.
- **Stress test.** 3,000 random armies (1–5 unit types, 1–9 copies each, 0–5 random relics) at random battle numbers, with and without commands.

## Final results (150 runs per strategy)

| Strategy | Run win % | Avg battle reached | Losses at B1..B8 | Avg stickmen spawned in B8 | Max spawned in one battle |
| --- | --- | --- | --- | --- | --- |
| **greedy (reasonable)** | **64%** | 7.3 | 0 0 2 11 9 7 7 18 | 531 | 3,701 |
| swarm | 57% | 7.1 | 0 1 6 11 7 15 5 20 | 455 | 2,245 |
| necro | 58% | 7.3 | 0 0 3 8 11 9 8 24 | 463 | 2,590 |
| archer | 53% | 7.0 | 0 0 7 11 10 15 12 16 | 452 | 2,590 |
| giant | 61% | 7.4 | 0 0 4 7 6 10 9 22 | 498 | 2,590 |
| random | 45% | 6.2 | 9 8 12 16 2 10 8 17 | 400 | 2,515 |

So a reasonable build wins about **60–65%**, which is inside the 60–70% target. Random play still wins 45%, so new players won't feel lost. Bots are worse than an attentive human at timing commands and spotting combos, so a real player should land at or a little above these numbers.

**Per battle (all strategies):**

| Battle | Win % | Avg time | Your stickmen | Enemy stickmen |
| --- | --- | --- | --- | --- |
| 1 | 99% | 28s | 27 | 20 |
| 2 | 99% | 28s | 49 | 29 |
| 3 | 96% | 35s | 78 | 43 |
| 4 👑 Warlord | 92% | 40s | 130 | 36 |
| 5 | 94% | 37s | 164 | 77 |
| 6 | 91% | 41s | 240 | 99 |
| 7 | 93% | 40s | 300 | 124 |
| 8 👑 Siege Golem | 81% | 50s | 470 | 88 |

Battles average 28–50 seconds, inside the 20–60s target. The Golem is meant to be the final exam.

## Snowball check: do synergy builds reach 1,000+?

Build test, stickmen spawned in one battle (average of 30 fights; every build won 90–100%):

| Build | B3 (35g) | B5 (65g) | **B8 (115g)** | Peak alive at B8 |
| --- | --- | --- | --- | --- |
| plain (no synergy) | 58 | 112 | 223 | 223 |
| **Swarm** (Mitosis, Brood Mother, Vanguard, Strength in Numbers) | 439 | 1,178 | **2,676** | 2,505 |
| **Necro** (Soul Harvest, Grave Pact, Gravedigger, War Drums) | 141 | 416 | **976** (≈1,000) | 606 |
| **Volley** (Shield Quiver, Eagle Eye, Hail of Arrows) | 45 | 83 | 167 | 167 |
| Giant (Catapult Arms, Titan Blood) | 40 | 71 | 124 | 124 |

Swarm passes 1,000 by battle 5 and is near 2,700 by battle 8. Necro reaches about 1,000 by battle 8 and keeps growing the longer a fight lasts. Volley scales **arrows**, not bodies: each archer fires up to 11 arrows per volley, and kills split into more arrows. It wins the fastest of the "quality" builds (31s average at B8). Giants scale through throws instead of numbers. In full bot runs the best single battle reached **3,701 stickmen spawned**.

## Dominance check and what I changed

The "relic presence vs win rate" table is biased upward for relics that only appear late, because only survivors carry them. So I read it together with the build test.

| Finding | Action |
| --- | --- |
| **Mitosis** owners won 89% (first pass). That's strong, but only inside swarm builds, not every build | Split children now shrink harder (×0.6 HP and ×0.75 damage per generation). It now sits at 85%. I kept it strong on purpose: it's the poster-child snowball |
| **War Chant** at 21%, Monks the weakest unit | Monk heal 8→12 and range 80→100. War Chant gives +25% per stack (was 15%) and +50% healing. Now 38%; still the weakest relic. **Worth a redesign later** |
| **Blood Frenzy** 37%, **Catapult Arms** 38% | Frenzy heals 40% per kill (was 25%). Thrown stickmen deal 100% of the Giant's damage over a bigger area. Now 60% and 58% |
| **Hail of Arrows** 45% | Split arrows keep full damage. Now 50% |
| **Necro** build only reached ~400 stickmen by battle 8 | Minions now leave corpses that can be raised again, and raise cooldown is 0.9s (was 1.2s). Now ~1,000 |
| **Warlord** walled most armies at B4 (7% win) | He now leads from the back, aura +20%, War Cry ×1.5, HP 2600→700. B4 is 92% |
| **Siege Golem** at 7% (slams knocked the whole front line ~200 units back every 5s, so nobody could hit him) | Slam knockback 2.2→1.3, every 6s, HP 8500→1500. B8 is 81% |
| Early game too hard (all bots dead by B3 on the first pass) | Enemy budget curve lowered to `7 + 4(i-1) + 0.32(i-1)²`, base reward 5→7, statues weaker, enemy Giants capped early |
| **Bug found by the sim:** archers and mages hit the enemy statue from across the map when target-picking failed (an 11-second "win") | Fixed: ranged units only shoot at targets actually in range |

Units with the highest end-of-run win rates are Mage (82%), Necromancer (82%) and Giant (78%). They're the expensive late-game units, so this mostly reflects runs that survived long enough to afford them. No single unit or relic appears in a dominant share of winning builds. The most-owned relics (Thick Skin, War Drums, Brood Mother, Bounty Board, around 400 runs each) all sit at 58–65%.

**Shop power bar calibration** (predicted "you" share → actual win rate): 0.3–0.4 → 53%, 0.4–0.5 → 89%, 0.5–0.6 → 92%, 0.6–0.7 → 94%, 0.7+ → 95–99%. It ranks fights correctly but is a little pessimistic, because it can't see commands or how the fight plays out. The verdict text under the bar is worded with that in mind.

## Stability

- **3,000 random-army stress battles: 0 crashes, 0 stalls.** 3% hit the 90s time limit and were settled by the fallback rule (statue HP plus remaining army). The longest wall-clock time for one headless battle was 71 ms.
- Vitest: 32 tests covering shop, economy, relic effects, Echo Stone ordering, command unlocks, battle determinism, termination, Mitosis, necro raising, Shield Quiver arrow counts, Bounty gold, bosses, and 2,000+ units.

## Performance

Target: 1,500+ stickmen at 60 fps on a mid-range laptop, and smooth on a phone.

**CPU (measured).** `npx tsx scripts/bench-sim.ts` runs a mirrored swarm-vs-swarm battle, peak **2,419 alive**:
- Sim step with ≥1,500 alive: **0.52 ms average**, 1.1 ms p95. The sim ticks 30 times per second, so that's about **0.26 ms per frame at 1×** and about 1 ms per frame at 4×.
- In the browser (`npm run perf`, 2,000–2,200 alive, damage numbers on), all JavaScript per frame (sim + interpolation + depth sort + particle updates + FX) averaged **2.6 ms**, with p95 8 ms on frames that run several sim steps. That's about 15% of a 16.7 ms frame.

**GPU (honest caveat).** This build container has **no GPU**, so headless Chromium renders WebGL in software (SwiftShader). There I measured about 8–10 fps at 2,000 stickmen, and that's software rasterization, not the game. The render path is built for real GPUs:
- one texture atlas, so all stickmen, ragdolls, arrows and sparks draw in about 5 batched draw calls
- about 2,500 quads at peak
- no per-frame allocations in the hot paths
- render resolution capped at 1.5× on touch devices to save fill-rate

That workload is far below what integrated laptop GPUs and modern phones handle at 60 fps (Pixi's ParticleContainer is routinely used for 10k+ sprites). **Please confirm on your laptop and phone:** play the Swarm quick build at battle 8, or open `?screen=battle&preset=swarm&battle=8&extra=swarmling:6,swordsman:6&mirror=1&prewarm=1` for a 2,000+ stickman clash.

## Tuning knobs

- Everything is in `src/config/tuning.ts`: economy, enemy budget curve, statue HP, juice timings, crowding, camera.
- Unit stats and boss abilities: `src/config/units.ts`.
- Relic numbers: `src/config/relics.ts`.
