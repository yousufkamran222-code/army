# Stickstorm

> **One-time setup to get the play link:** in this repo on GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Then open the **Actions** tab and re-run the latest "Build, test and deploy" run (or push any commit).
> The game will then be at **https://yousufkamran222-code.github.io/army/**.
> If the deploy step says the branch is not allowed, go to **Settings → Environments → github-pages** and add this branch (or `main`) to the allowed deployment branches.

A Balatro-style roguelite prototype with huge stick-figure army battles. Build an army in the shop, stack relics that **multiply**, and watch a dozen stickmen snowball into thousands that flatten everything.

- 8 battles per run, with bosses at 4 (Warlord) and 8 (Siege Golem). About 15–20 minutes.
- 10 unit types, 25 relics, 7 commands (4 base, 3 unlocked by relics).
- Battles run on a deterministic 30 Hz simulation. It's tested headlessly with 1,500–2,400 stickmen on the field.
- Everything (stickmen, landscape, sounds) is generated in code. There are no asset files.

**How to play, and three builds to try:** see [DEMO_GUIDE.md](DEMO_GUIDE.md).

## Run locally

```bash
npm install
npm run dev        # open the printed URL (works on your phone on the same Wi-Fi too)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm test` | Vitest unit tests (shop, economy, relics, battle sim) |
| `npm run typecheck` | TypeScript check |
| `npm run sim` | Headless balance simulator: bot-played full runs, build tests, a random-army stress test. Options: `-- --runs 100 --stress 2000 --buildtest 30 --only greedy` |
| `npx tsx scripts/bench-sim.ts` | CPU cost of the sim with 1,500–2,400 stickmen |
| `npx tsx scripts/debug-battle.ts greedy 4` | Tick-by-tick log of one bot battle |
| `npm run shots` | Playwright screenshots of every screen at phone and desktop sizes (needs Playwright and Chromium installed, then `npm run build` first) |
| `npm run e2e` | Playwright end-to-end UI test: shop fits one screen, buying doesn't move anything, drag-reorder, detail panel, sell, a full 8-battle run, a lost run, the portrait rotate prompt. Covers two phone sizes and desktop (needs `npm run build` first) |
| `npm run perf` | Playwright frame-time benchmark of a 2,000-stickman battle |

## URL parameters (testing shortcuts)

`?screen=shop|battle|summary&battle=6&preset=swarm|necro|archer|giant&relics=mitosis,echo_stone&gold=50&extra=swarmling:3&speed=2&seed=7`

Benchmark helpers: `&mirror=1` gives the enemy a copy of your army, and `&prewarm=1` fast-forwards to the clash.

## Code map

```
src/config/   all tuning numbers (tuning.ts) and data-driven units, relics, commands
src/sim/      deterministic battle simulation (battle.ts), relic mods -> stats, seeded RNG
src/game/     run state, shop and economy (run.ts), enemy generation, power estimate, bot player, presets
src/render/   Pixi renderer: procedural stick-figure atlas, battle view (camera, juice, FX), parallax background
src/ui/       Preact UI: store.ts (state + batched re-render), Shop.tsx, Hud.tsx, Screens.tsx, Menus.tsx, icons.tsx, art.tsx (atlas portraits)
src/audio/    Web Audio synthesized sound effects
scripts/      sim, benchmarks, screenshots
tests/        Vitest
```

To add a unit or relic, add one entry to `src/config/units.ts` or `src/config/relics.ts`. A relic is a small `apply(mods, power, army)` function that writes into `Mods` (`src/sim/mods.ts`). New mechanics read a new `Mods` field in `battle.ts`.

See also [DECISIONS.md](DECISIONS.md) (design and tech choices) and [BALANCE.md](BALANCE.md) (sim results, tuning, performance).
