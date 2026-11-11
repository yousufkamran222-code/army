import { UNITS, type UnitId } from '../config/units';
import { RELIC_MAP } from '../config/relics';
import { COMMANDS } from '../config/commands';
import { ECONOMY } from '../config/tuning';
import { sfx } from '../audio/sfx';
import {
  TOTAL_BATTLES,
  availableCommands,
  buyRelic,
  buySlot,
  buyUnit,
  canBuyUnit,
  commandSlots,
  interestFor,
  isBossBattle,
  maxSlots,
  move,
  playerSide,
  relicCost,
  reroll,
  rerollCost,
  runMods,
  sellRelic,
  sellUnit,
  sellValueRelic,
  sellValueUnit,
  slotCost,
  toggleCommand,
  unitCost,
  type RunState,
} from '../game/run';
import { enemySide, enemyStickmen } from '../game/enemies';
import { sidePower, quiverExtraFor } from '../game/power';
import { levelOf } from '../sim/stats';
import type { Mods } from '../sim/mods';
import { Icon } from './icons';
import { Portrait, Squad } from './art';
import { Btn, CmdBadge, Gold, IconBtn, LevelPips, RelicBadge, Tags, UnitStats, fmt, useSortable } from './components';
import { actions, toast, update, useGame, type Selection } from './store';
import { SettingsMenu } from './Menus';

const select = (sel: Selection) =>
  update((s) => {
    const same = JSON.stringify(s.sel) === JSON.stringify(sel);
    s.sel = same ? null : sel;
  });

function failMsg(e: string): string {
  return e === 'gold' ? 'Not enough gold' : e === 'slots' ? 'No free slot: sell a unit or buy a slot' : e === 'relics' ? 'Relic bar is full: sell one first' : e === 'max' ? 'Already at 7 slots' : 'Sold out';
}

function doBuy(fn: () => string | null) {
  const e = fn();
  if (e) {
    sfx.play('error');
    toast(failMsg(e), true);
  } else {
    sfx.play('buy');
    update((s) => (s.sel = null));
  }
}

// ---------------------------------------------------------------- top bar
function TopBar({ run }: { run: RunState }) {
  const g = useGame();
  const interest = interestFor(run.gold, runMods(run));
  return (
    <header class="topbar">
      <div class="tb-title">
        <span class="battle-no">
          Battle {run.battle}
          <small>/{TOTAL_BATTLES}</small>
        </span>
        <div class="progress">
          {Array.from({ length: TOTAL_BATTLES }, (_, i) => (
            <i class={(i + 1 < run.battle ? 'done ' : i + 1 === run.battle ? 'now ' : '') + (isBossBattle(i + 1) ? 'boss' : '')}>{isBossBattle(i + 1) ? <Icon name="crown" /> : null}</i>
          ))}
        </div>
      </div>
      <div class="tb-right">
        <div class="goldbox" title="Interest: +1 gold per 5 held, paid after each win">
          <Gold n={run.gold} />
          <small>+{interest} interest</small>
        </div>
        <IconBtn icon="menu" title="Menu" on={g.menuOpen} onClick={() => update((s) => (s.menuOpen = !s.menuOpen))} />
      </div>
      {g.menuOpen && <SettingsMenu />}
    </header>
  );
}

// ---------------------------------------------------------------- enemy preview
function EnemyPanel({ run, ratio, pp, ep }: { run: RunState; ratio: number; pp: number; ep: number }) {
  const g = useGame();
  const es = enemySide(run.enemy);
  const verdict = ratio > 0.62 ? 'You should crush them' : ratio > 0.52 ? 'Favoured, not safe' : ratio > 0.45 ? 'Coin flip' : 'Outmatched on paper';
  return (
    <section class="panel enemy-panel">
      <div class="panel-head">
        <span class="label">Next enemy</span>
        <span class="enemy-name">{run.enemy.name}</span>
        <span class="muted">{fmt(enemyStickmen(run.enemy))} stickmen</span>
      </div>
      <div class="enemy-units">
        {run.enemy.slots.map((s, i) => {
          const boss = UNITS[s.type].tags.includes('Boss');
          const sel = g.sel?.kind === 'enemy' && g.sel.i === i;
          return (
            <button class={`enemy-chip ${boss ? 'boss' : ''} ${sel ? 'sel' : ''}`} onClick={() => select({ kind: 'enemy', i })}>
              <Portrait type={s.type} side={1} />
              <span>×{es.slots[i].count}</span>
              {es.slots[i].level > 1 && <em>Lv{es.slots[i].level}</em>}
            </button>
          );
        })}
      </div>
      <div class="power">
        <span class="you">{fmt(pp)}</span>
        <div class="powerbar">
          <div style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
          <span>{verdict}</span>
        </div>
        <span class="them">{fmt(ep)}</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- army formation
function ArmyPanel({ run, mods }: { run: RunState; mods: Mods }) {
  const g = useGame();
  const ps = playerSide(run);
  const slots = maxSlots(run);
  const total = ps.slots.reduce((a, s) => a + s.count, 0);
  const { bind, container } = useSortable(
    (a, b) => update(() => move(run.army, a, b)),
    (i) => select({ kind: 'slot', i }),
  );
  return (
    <section class="panel army-panel">
      <div class="panel-head">
        <span class="label">Your army</span>
        <span class="big-count">{fmt(total)}</span>
        <span class="muted">stickmen · {run.army.length}/{slots} slots</span>
        <span class="hint">drag to reorder</span>
      </div>
      <div class="formation" ref={container}>
        <div class="front-label">
          FRONT <Icon name="arrow" />
        </div>
        {run.army.map((s, i) => {
          const b = bind(i);
          const st = ps.slots[i];
          const sel = g.sel?.kind === 'slot' && g.sel.i === i;
          return (
            <div {...b} class={`squad-card ${b.class} ${sel ? 'sel' : ''}`} key={s.type}>
              <span class={'ord' + (i === 0 ? ' front' : '')}>{i === 0 ? '1 · FRONT' : i + 1}</span>
              <Squad type={s.type} count={st.count} />
              <div class="sq-name">{UNITS[s.type].name}</div>
              <div class="sq-count">×{fmt(st.count)}</div>
              <div class="sq-lv">
                <b>Lv{st.level}</b>
                <LevelPips copies={s.copies} />
              </div>
            </div>
          );
        })}
        {Array.from({ length: slots - run.army.length }, () => (
          <div class="squad-card empty">
            <span>empty slot</span>
          </div>
        ))}
        {slots < ECONOMY.maxSlots && (
          <button class="squad-card empty buyslot" onClick={() => doBuy(() => buySlot(run))}>
            <Icon name="plus" />
            <span>Add slot</span>
            <Gold n={slotCost(run)} small />
          </button>
        )}
        {Array.from({ length: Math.max(0, ECONOMY.maxSlots - slots - 1) }, () => (
          <div class="squad-card empty locked">
            <Icon name="lock" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- relic bar
function RelicPanel({ run }: { run: RunState }) {
  const g = useGame();
  const { bind, container } = useSortable(
    (a, b) => update(() => move(run.relics, a, b)),
    (i) => select({ kind: 'relic', i }),
  );
  return (
    <section class="panel relic-panel">
      <span class="label vert">Relics</span>
      <div class="relic-row" ref={container}>
        {run.relics.map((id, i) => {
          const b = bind(i);
          const sel = g.sel?.kind === 'relic' && g.sel.i === i;
          return (
            <div {...b} class={`relic-slot ${RELIC_MAP[id].rarity} ${b.class} ${sel ? 'sel' : ''}`} key={id}>
              <RelicBadge id={id} />
              <span class="rs-name">{RELIC_MAP[id].name}</span>
            </div>
          );
        })}
        {Array.from({ length: ECONOMY.maxRelics - run.relics.length }, () => (
          <div class="relic-slot empty" />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- shop offers
function UnitOffer({ run, t, i, mods }: { run: RunState; t: UnitId | null; i: number; mods: Mods }) {
  const g = useGame();
  if (!t) return <div class="offer sold">SOLD</div>;
  const owned = run.army.find((s) => s.type === t);
  const err = canBuyUnit(run, t);
  const d = UNITS[t];
  const sel = g.sel?.kind === 'offerUnit' && g.sel.i === i;
  const levelUp = owned && levelOf(owned.copies + 1) > levelOf(owned.copies);
  return (
    <div class={`offer unit ${sel ? 'sel' : ''}`} onClick={() => select({ kind: 'offerUnit', i })}>
      {owned && <span class={'owned' + (levelUp ? ' lvup' : '')}>{levelUp ? `Lv${levelOf(owned.copies + 1)}!` : `own ×${owned.copies}`}</span>}
      <Portrait type={t} />
      <div class="o-name">{d.name}</div>
      <Tags type={t} />
      <div class="o-sub">+{Math.round(d.count * (mods.countMult[t] ?? 1))} stickmen</div>
      <Btn kind={err ? undefined : 'gold'} class="buy" silent onClick={() => doBuy(() => buyUnit(run, i))}>
        <Gold n={unitCost(t)} small />
      </Btn>
    </div>
  );
}

function RelicOffer({ run, i }: { run: RunState; i: number }) {
  const g = useGame();
  const id = run.shop.relics[i];
  if (!id) return <div class="offer relic sold">SOLD</div>;
  const r = RELIC_MAP[id];
  const ok = run.gold >= relicCost(id) && run.relics.length < ECONOMY.maxRelics;
  const sel = g.sel?.kind === 'offerRelic' && g.sel.i === i;
  return (
    <div class={`offer relic ${r.rarity} ${sel ? 'sel' : ''}`} onClick={() => select({ kind: 'offerRelic', i })}>
      <RelicBadge id={id} size="lg" />
      <div class="o-text">
        <div class="o-name">{r.name}</div>
        <div class={`rar ${r.rarity}`}>{r.rarity}</div>
        <div class="o-desc">{r.desc}</div>
      </div>
      <Btn kind={ok ? 'gold' : undefined} class="buy" silent onClick={() => doBuy(() => buyRelic(run, i))}>
        <Gold n={relicCost(id)} small />
      </Btn>
    </div>
  );
}

function ShopPanel({ run, mods }: { run: RunState; mods: Mods }) {
  return (
    <section class="panel shop-panel">
      <div class="panel-head">
        <span class="label">Shop</span>
        <span class="hint">tap a card for details</span>
        <Btn class="reroll" onClick={() => doBuy(() => reroll(run))} silent>
          <Icon name="dice" /> Reroll <Gold n={rerollCost(run)} small />
        </Btn>
      </div>
      <div class="offers-units">
        {run.shop.units.map((t, i) => (
          <UnitOffer run={run} t={t} i={i} mods={mods} />
        ))}
      </div>
      <div class="offers-relics">
        {run.shop.relics.map((_, i) => (
          <RelicOffer run={run} i={i} />
        ))}
      </div>
    </section>
  );
}

function CommandPanel({ run }: { run: RunState }) {
  const g = useGame();
  const n = commandSlots(run);
  return (
    <section class="panel cmd-panel">
      <span class="label">
        Commands {run.commands.length}/{n}
      </span>
      <div class="cmd-row">
        {availableCommands(run).map((c) => {
          const on = run.commands.includes(c);
          return (
            <button
              class={`cmd-chip ${on ? 'on' : ''} ${g.sel?.kind === 'cmd' && g.sel.id === c ? 'sel' : ''}`}
              title={COMMANDS[c].desc}
              onClick={() => {
                sfx.play('click');
                update((s) => {
                  toggleCommand(run, c);
                  s.sel = { kind: 'cmd', id: c };
                });
              }}
            >
              <CmdBadge id={c} />
              <span>{COMMANDS[c].name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- detail panel
function Detail({ run, mods }: { run: RunState; mods: Mods }) {
  const g = useGame();
  const sel = g.sel;
  if (!sel) return null;
  const close = () => update((s) => (s.sel = null));
  let body: preact.JSX.Element | null = null;
  if (sel.kind === 'offerUnit' || sel.kind === 'slot' || sel.kind === 'enemy') {
    const type = sel.kind === 'offerUnit' ? run.shop.units[sel.i] : sel.kind === 'slot' ? run.army[sel.i]?.type : run.enemy.slots[sel.i]?.type;
    if (!type) return null;
    const d = UNITS[type];
    const owned = run.army.find((s) => s.type === type);
    const copies = sel.kind === 'enemy' ? run.enemy.slots[sel.i].copies : sel.kind === 'offerUnit' ? (owned?.copies ?? 0) + 1 : owned!.copies;
    const statMods = sel.kind === 'enemy' ? enemySide(run.enemy).mods : mods;
    body = (
      <>
        <div class="d-head">
          <Portrait type={type} side={sel.kind === 'enemy' ? 1 : 0} class="d-portrait" />
          <div>
            <h3>{d.name}</h3>
            <Tags type={type} />
            {sel.kind === 'offerUnit' && owned && <div class="muted">You own {owned.copies}. This makes {owned.copies + 1}.</div>}
          </div>
        </div>
        <p class="desc">{d.role}</p>
        <UnitStats type={type} copies={copies} mods={statMods} />
        <p class="fine">Each copy adds stickmen. 3 copies = Lv2, 9 = Lv3 (×1.6 stats per level).</p>
        <div class="d-actions">
          {sel.kind === 'offerUnit' && (
            <Btn kind="gold" silent onClick={() => doBuy(() => buyUnit(run, sel.i))}>
              Buy <Gold n={unitCost(type)} small />
            </Btn>
          )}
          {sel.kind === 'slot' && (
            <>
              <Btn disabled={sel.i === 0} onClick={() => update((s) => (move(run.army, sel.i, sel.i - 1), (s.sel = { kind: 'slot', i: sel.i - 1 })))}>
                Forward
              </Btn>
              <Btn disabled={sel.i === run.army.length - 1} onClick={() => update((s) => (move(run.army, sel.i, sel.i + 1), (s.sel = { kind: 'slot', i: sel.i + 1 })))}>
                Back
              </Btn>
              <Btn
                kind="danger"
                disabled={run.army.length <= 1}
                silent
                onClick={() =>
                  update((s) => {
                    if (sellUnit(run, sel.i)) sfx.play('coin');
                    s.sel = null;
                  })
                }
              >
                Sell +{sellValueUnit(run.army[sel.i])}
              </Btn>
            </>
          )}
        </div>
      </>
    );
  } else if (sel.kind === 'offerRelic' || sel.kind === 'relic') {
    const id = sel.kind === 'offerRelic' ? run.shop.relics[sel.i] : run.relics[sel.i];
    if (!id) return null;
    const r = RELIC_MAP[id];
    body = (
      <>
        <div class="d-head">
          <RelicBadge id={id} size="lg" />
          <div>
            <h3>{r.name}</h3>
            <div class={`rar ${r.rarity}`}>{r.rarity}</div>
          </div>
        </div>
        <p class="desc">{r.desc}</p>
        {r.combo && <p class="combo">Combo: {r.combo}</p>}
        <div class="d-actions">
          {sel.kind === 'offerRelic' && (
            <Btn kind="gold" silent onClick={() => doBuy(() => buyRelic(run, sel.i))}>
              Buy <Gold n={relicCost(id)} small />
            </Btn>
          )}
          {sel.kind === 'relic' && (
            <>
              <Btn disabled={sel.i === 0} onClick={() => update((s) => (move(run.relics, sel.i, sel.i - 1), (s.sel = { kind: 'relic', i: sel.i - 1 })))}>
                Left
              </Btn>
              <Btn disabled={sel.i === run.relics.length - 1} onClick={() => update((s) => (move(run.relics, sel.i, sel.i + 1), (s.sel = { kind: 'relic', i: sel.i + 1 })))}>
                Right
              </Btn>
              <Btn
                kind="danger"
                silent
                onClick={() =>
                  update((s) => {
                    sellRelic(run, sel.i);
                    sfx.play('coin');
                    s.sel = null;
                  })
                }
              >
                Sell +{sellValueRelic(id)}
              </Btn>
            </>
          )}
        </div>
      </>
    );
  } else if (sel.kind === 'cmd') {
    const c = COMMANDS[sel.id];
    body = (
      <>
        <div class="d-head">
          <CmdBadge id={sel.id} />
          <div>
            <h3>{c.name}</h3>
            <div class="muted">{run.commands.includes(sel.id) ? 'Equipped' : 'Not equipped'}: tap the chip to toggle</div>
          </div>
        </div>
        <p class="desc">{c.desc}</p>
      </>
    );
  }
  return (
    <div class="detail" onClick={(e) => e.stopPropagation()}>
      <button class="d-close" onClick={close} aria-label="Close">
        <Icon name="close" />
      </button>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------- screen
export function ShopScreen() {
  const g = useGame();
  const run = g.run;
  const mods = runMods(run);
  const ps = playerSide(run);
  const es = enemySide(run.enemy);
  const pp = sidePower(ps, quiverExtraFor(ps));
  const ep = sidePower(es);
  const ratio = pp / (pp + ep);
  return (
    <div
      class="screen shop"
      onClick={(e) => {
        const keep = (e.target as HTMLElement).closest('.offer,.squad-card,.relic-slot,.enemy-chip,.cmd-chip,.detail,.menu,.iconbtn');
        if (!keep && (g.sel || g.menuOpen)) update((s) => ((s.sel = null), (s.menuOpen = false)));
      }}
    >
      <TopBar run={run} />
      <main class="shop-main">
        <div class="col col-left">
          <EnemyPanel run={run} ratio={ratio} pp={pp} ep={ep} />
          <ArmyPanel run={run} mods={mods} />
          <RelicPanel run={run} />
        </div>
        <div class="col col-right">
          <ShopPanel run={run} mods={mods} />
          <CommandPanel run={run} />
          <Btn kind="primary" class="fight" onClick={actions.startBattle}>
            <Icon name="charge" /> Fight battle {run.battle}
          </Btn>
          <Detail run={run} mods={mods} />
        </div>
      </main>
    </div>
  );
}
