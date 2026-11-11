# Decisions log

## Stack & repo structure

- **TypeScript + Vite + PixiJS 8.** Stickmen are drawn as `Particle`s inside a WebGL `ParticleContainer`. Every unit-type frame comes from one atlas texture, so the whole army draws in one batched call.
- **The simulation is deterministic and separate from rendering.** It uses a fixed 30 Hz timestep, a seeded RNG (mulberry32) and struct-of-arrays typed arrays. The renderer interpolates between ticks. The same `Battle` class runs headless in `npm run sim` and in Vitest.
- **The UI for shop, HUD, tooltips, summary and debug menu is plain DOM** over the canvas. That's responsive on phone and desktop for free, and keeps the WebGL side focused on the battle.
- **Audio** is synthesized with the Web Audio API. There are no assets at all.

```
src/
  config/    tuning.ts (all numbers), units.ts, relics.ts, commands.ts, bosses (in units.ts)
  sim/       rng.ts, types.ts, stats.ts (relic mods -> per-slot stats), battle.ts (the sim)
  game/      run.ts (run state machine), shop.ts, economy.ts, enemies.ts, power.ts, bot.ts (AI shopper for sims)
  render/    atlas.ts (procedural stick rig -> texture atlas), battleView.ts, background.ts
  ui/        shop.ts, hud.ts, summary.ts, debug.ts, tooltip.ts, dom.ts
  audio/     sfx.ts
scripts/     sim.ts (headless balance runner), shots.mjs (Playwright screenshots), perf.mjs
tests/       vitest suites
```

## Design decisions

(The list grows as I build. Each entry says what was ambiguous and what I picked.)
