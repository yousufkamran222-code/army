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

### Game rules

- **Losing any battle ends the run**, as the brief says. To keep that fair, each normal battle is tuned to about 90–97% for a sensible build. The two bosses are the real danger. Numbers are in BALANCE.md.
- **Runs start with 10 gold and 1 Swordsman copy (9 stickmen)**, so battle 1 is never an empty field.
- **Unit copies:** each purchase adds one *copy*. Count = base count × copies × relic multipliers. Level 2 comes at 3 copies and level 3 at 9 copies (×1.6 HP/damage per level, slightly bigger body). Cards show pips toward the next level. Buying a type you already own never needs a free slot.
- **5 slots at start, up to 7.** Each extra slot costs 8, then 12 gold in the shop, or comes from the **Barracks** relic. Brief: "relics or the shop". I did both.
- **Selling** gives back half of everything spent on that slot or relic, rounded down, minimum 1. You can't sell your last unit.
- **Reward:** 7 + battle number, +2 for a win under 30s, +2 if your statue is untouched, Bounty Board gold, plus interest of +1 per 5 gold held (cap 5; Piggy Bank raises it). Reroll costs 1, +1 per reroll in the same shop.
- **Commands:** pick 2 before each battle in the shop (3 with Commander's Horn) from those you've unlocked. Base pool: Charge, Hold the Line, Volley, Rally. Mitosis unlocks Swarm Burst, Sky Hammer unlocks Meteor, Lich Crown unlocks Raise Dead. A newly unlocked command is equipped automatically, so players notice it.
- **Enemy armies** are bought from a gold budget (`ENEMY.budget` in tuning.ts) using a themed weight table (Blade Horde, Shield Wall, Swarm Nest, Arcane Circle, Grave Host, Giant Clan, War Band). They level up like yours and get a small stat multiplier per battle. Battles 1–2 only use simple themes, and enemy Giants are capped early.
- **Bosses:** the *Warlord* (battle 4) stays in the back line. While he's alive all enemies deal +20% damage, and every 10s his War Cry gives ×1.5 for 3s (golden ring, horn, banner). The *Siege Golem* (battle 8) walks in front and slams every 6s: area damage and everyone nearby is flung (screen shake + hit-stop). Spearmen do ×2.5 damage to both.
- **Fallback winner:** if a battle reaches 90 s, the side with more (statue HP fraction + half of remaining army HP fraction) wins. Stress tests hit this in about 4% of random-army battles and rarely in real runs.

### Relic interpretations

- **"Every 3rd battle, permanently copy your rightmost relic's effect onto a random unit slot"** was hard to read and invisible in play. I replaced it with **Echo Stone: the relic directly to its right triggers twice**. It keeps the brief's "order matters, left to right" idea, chains (two Echo Stones = ×3), and is easy to see. Every relic is written as `apply(mods, power)`, so "triggers twice" really means power 2 for any relic.
- **Shield Quiver** counts Shield *stickmen*: +1 arrow per 4, capped at +10 per volley. Counting per stickman instead of per slot makes it scale with army size without spawning a million projectiles.
- **Strength in Numbers** is capped at +500% so the late game stays readable. The cap is still huge.
- **Mitosis children shrink** (×0.6 HP and ×0.75 damage per generation) so it's a snowball and not an instant win. Sim data drove that change.
- **Minions leave corpses** that can be raised again. That's what makes the necromancer army grow over a battle, and it matches "raises fallen stickmen (either side)".

### Tech

- **The renderer** draws every stickman and ragdoll as a Pixi `Particle` in a `ParticleContainer`. Frames come from one runtime-generated atlas (13 unit types × 2 sides × 12 poses: 6 walk, 4 attack, hurt, fly), each drawn by a small procedural rig (`render/atlas.ts`). Back rows are drawn first using a counting sort by depth, which is O(n) per frame.
- **The sim** stores units in typed arrays and uses 16-unit spatial bins along the lane. Targeting, area damage and healing only scan nearby bins. Units queue behind allies when a bin is crowded, which forms readable blobs and keeps "front units engage first" true.
- **Juice lives in the view**, driven by a flat event buffer from the sim: sparks, ragdolls that tumble, bounce and fade, shake, hit-stop, slow-mo on statue fall, damage numbers (BitmapText, rate-limited), relic pulses.
- **Audio** is all synthesized, with per-sound voice caps per 50 ms and random pitch, so big fights sound like a crowd.
- **Phone:** the battle HUD scales and the camera follows the front line in portrait. Landscape is recommended (an on-screen hint says so). Render resolution is capped at 1.5× on touch devices.
- **Saved data:** only settings (mute, speed, damage numbers) in localStorage.
- **Deployment:** a GitHub Actions workflow builds, type-checks and tests, then deploys `dist/` to Pages on pushes to `main` and to the working branch. Vite uses `base: './'`, so the build works under `/army/`.
- **Playwright** isn't a project dependency. The screenshot and perf scripts use a globally installed Playwright, which keeps `npm install` small for players.
