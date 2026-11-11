import { UNITS, type UnitId } from '../config/units';
import { RELIC_MAP, type RelicId } from '../config/relics';
import { COMMANDS } from '../config/commands';
import { ECONOMY } from '../config/tuning';
import { sfx } from '../audio/sfx';
import {
  type RunState,
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
} from '../game/run';
import { enemySide, enemyStickmen } from '../game/enemies';
import { sidePower, quiverExtraFor } from '../game/power';
import { levelOf, nextLevelAt } from '../sim/stats';
import { fmt, h, hideTip, relicTipContent, showTip, tipOn, unitThumb, unitTipContent } from './dom';

export interface ShopHooks {
  onFight: () => void;
  onDebug: () => void;
  onMute: () => void;
}

/** Pointer-based drag-to-reorder that works with touch and mouse. */
function sortable(container: HTMLElement, count: number, onMove: (from: number, to: number) => void, onTap: (i: number, el: HTMLElement) => void) {
  const items = () => Array.from(container.children).slice(0, count) as HTMLElement[];
  items().forEach((el, idx) => {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      let target = idx;
      const move_ = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          el.classList.add('dragging');
          hideTip(true);
        }
        if (!dragging) return;
        ev.preventDefault();
        el.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
        target = idx;
        items().forEach((o, j) => {
          o.classList.remove('droptarget');
          if (o === el) return;
          const r = o.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
            target = j;
            o.classList.add('droptarget');
          }
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move_);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        el.classList.remove('dragging');
        el.style.transform = '';
        items().forEach((o) => o.classList.remove('droptarget'));
        if (dragging) {
          if (target !== idx) {
            sfx.play('click');
            onMove(idx, target);
          }
        } else onTap(idx, el);
      };
      window.addEventListener('pointermove', move_, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  });
}

function pips(copies: number) {
  const next = nextLevelAt(copies);
  const lvl = levelOf(copies);
  const prev = lvl === 1 ? 0 : ECONOMY.levelCopies[lvl - 1];
  if (!next) return h('div', { class: 'pips' }, h('span', { class: 'tag', style: 'color:var(--gold)' }, 'MAX'));
  const need = next - prev;
  const have = copies - prev;
  return h('div', { class: 'pips', title: `${copies}/${next} copies to Lv ${lvl + 1}` }, ...Array.from({ length: need }, (_, i) => h('span', { class: 'pip' + (i < have ? ' on' : '') })));
}

export function renderShop(root: HTMLElement, run: RunState, hooks: ShopHooks) {
  const rerender = () => renderShop(root, run, hooks);
  const fail = (why: string) => {
    sfx.play('error');
    flash(why);
  };
  const flash = (msg: string) => {
    const f = h('div', { class: 'banner', style: 'top:50%;font-size:22px;color:#ff9a8a' }, msg);
    root.append(f);
    setTimeout(() => f.remove(), 1300);
  };
  const ok = () => {
    sfx.play('buy');
    hideTip(true);
    rerender();
  };
  const mods = runMods(run);
  const ps = playerSide(run);
  const es = enemySide(run.enemy);
  const pp = sidePower(ps, quiverExtraFor(ps));
  const ep = sidePower(es);
  const ratio = pp / (pp + ep);
  const interest = interestFor(run.gold, mods);
  const slots = maxSlots(run);
  const myCount = ps.slots.reduce((a, s) => a + s.count, 0);

  root.innerHTML = '';
  const shop = h('div', { class: 'shop' });
  const inner = h('div', { class: 'shop-inner' });
  shop.append(inner);
  root.append(shop);

  // ---- top bar
  inner.append(
    h(
      'div',
      { class: 'topbar' },
      h('span', { class: 'battle' }, `Battle ${run.battle}/${TOTAL_BATTLES}`),
      isBossBattle(run.battle) ? h('span', { class: 'boss' }, 'BOSS') : null,
      h('span', { class: 'spacer' }),
      h('span', { class: 'goldpill', title: 'Interest: +1 per 5 gold held after a win' }, `💰 ${run.gold} `, h('small', {}, `+${interest} interest`)),
      h('button', { class: 'iconbtn', title: 'Mute', onclick: () => (hooks.onMute(), rerender()) }, sfx.muted ? '🔇' : '🔊'),
      h('button', { class: 'iconbtn', title: 'Debug menu (`)', onclick: hooks.onDebug }, '🐞'),
    ),
  );

  // ---- enemy preview
  const echips = h('div', { class: 'chips' });
  run.enemy.slots.forEach((s, i) => {
    const st = es.slots[i];
    const boss = UNITS[s.type].tags.includes('Boss');
    const chip = h('span', { class: 'chip' + (boss ? ' boss' : '') }, unitThumb(s.type, 1, 26), `${UNITS[s.type].name} ×${st.count}`, st.level > 1 ? h('span', { class: 'tag' }, `Lv${st.level}`) : null);
    tipOn(chip, () => unitTipContent(s.type, s.copies, es.mods));
    chip.addEventListener('click', () => showTip(chip, unitTipContent(s.type, s.copies, es.mods), true));
    echips.append(chip);
  });
  const verdict = ratio > 0.62 ? 'You should crush them.' : ratio > 0.52 ? 'Favoured, but not safe.' : ratio > 0.45 ? 'A coin flip. Use your commands well.' : 'They outmatch you on paper. Synergies and commands can swing it.';
  inner.append(
    h(
      'div',
      { class: 'panel enemy' },
      h('h3', {}, 'Next enemy', h('span', { class: 'hint' }, `${fmt(enemyStickmen(run.enemy))} stickmen`)),
      h('div', { class: 'name' }, run.enemy.name),
      echips,
      h('div', { class: 'powerbar' }, h('span', { class: 'you' }, `You ${fmt(pp)}`), h('div', { class: 'bar' }, h('div', { style: `width:${(ratio * 100).toFixed(1)}%` })), h('span', { class: 'them' }, `${fmt(ep)} Them`)),
      h('div', { class: 'verdict' }, `Estimated power (army HP × DPS, synergies included). ${verdict}`),
    ),
  );

  // ---- army
  const slotGrid = h('div', { class: 'slots' });
  run.army.forEach((s, i) => {
    const st = ps.slots[i];
    const d = UNITS[s.type];
    const card = h(
      'div',
      { class: 'card' },
      h('span', { class: 'lv' }, `Lv${st.level}`),
      h('span', { class: 'ord' }, `#${i + 1}`),
      unitThumb(s.type, 0, 64),
      h('div', { class: 'nm' }, d.name),
      h('div', { class: 'ct' }, `×${fmt(st.count)}`),
      pips(s.copies),
      h('div', { class: 'tags' }, ...d.tags.map((t) => h('span', { class: 'tag' }, t))),
    );
    tipOn(card, () => unitTipContent(s.type, s.copies, mods));
    slotGrid.append(card);
  });
  for (let i = run.army.length; i < ECONOMY.maxSlots; i++) {
    const locked = i >= slots;
    slotGrid.append(h('div', { class: 'card empty' + (locked ? ' locked' : '') }, locked ? '🔒' : 'empty slot'));
  }
  sortable(
    slotGrid,
    run.army.length,
    (a, b) => {
      move(run.army, a, b);
      rerender();
    },
    (i, el) => {
      const s = run.army[i];
      const acts = h(
        'div',
        { class: 'acts' },
        h('button', { onclick: () => (i > 0 ? (move(run.army, i, i - 1), sfx.play('click'), hideTip(true), rerender()) : null), disabled: i === 0 }, '◀ Front'),
        h('button', { onclick: () => (i < run.army.length - 1 ? (move(run.army, i, i + 1), sfx.play('click'), hideTip(true), rerender()) : null), disabled: i === run.army.length - 1 }, 'Back ▶'),
        h('button', { class: 'gold', disabled: run.army.length <= 1, onclick: () => (sellUnit(run, i) ? (sfx.play('coin'), hideTip(true), rerender()) : null) }, `Sell +${sellValueUnit(s)}`),
      );
      showTip(el, unitTipContent(s.type, s.copies, mods, acts), true);
    },
  );
  inner.append(h('div', { class: 'panel' }, h('h3', {}, `Army · ${run.army.length}/${slots} slots · ${fmt(myCount)} stickmen`, h('span', { class: 'hint' }, 'Drag to reorder: #1 deploys first and fights at the front')), slotGrid));

  // ---- relics
  const relicGrid = h('div', { class: 'relics' });
  run.relics.forEach((id, i) => {
    const r = RELIC_MAP[id];
    const card = h('div', { class: `card relic ${r.rarity}` }, h('span', { class: 'ord' }, `${i + 1}`), h('div', { class: 'ic' }, r.icon), h('div', { class: 'nm' }, r.name), h('div', { class: `rar ${r.rarity}` }, r.rarity));
    tipOn(card, () => relicTipContent(id));
    relicGrid.append(card);
  });
  for (let i = run.relics.length; i < ECONOMY.maxRelics; i++) relicGrid.append(h('div', { class: 'card relic empty' }, 'empty'));
  sortable(
    relicGrid,
    run.relics.length,
    (a, b) => {
      move(run.relics, a, b);
      rerender();
    },
    (i, el) => {
      const id = run.relics[i];
      const acts = h(
        'div',
        { class: 'acts' },
        h('button', { disabled: i === 0, onclick: () => (move(run.relics, i, i - 1), hideTip(true), rerender()) }, '◀'),
        h('button', { disabled: i === run.relics.length - 1, onclick: () => (move(run.relics, i, i + 1), hideTip(true), rerender()) }, '▶'),
        h('button', { class: 'gold', onclick: () => (sellRelic(run, i), sfx.play('coin'), hideTip(true), rerender()) }, `Sell +${sellValueRelic(id)}`),
      );
      showTip(el, relicTipContent(id, acts), true);
    },
  );
  inner.append(h('div', { class: 'panel' }, h('h3', {}, `Relics · ${run.relics.length}/${ECONOMY.maxRelics}`, h('span', { class: 'hint' }, 'Order matters for Echo Stone (it boosts the relic to its right)')), relicGrid));

  // ---- shop offers
  const offers = h('div', { class: 'offers' });
  run.shop.units.forEach((t, i) => {
    if (!t) {
      offers.append(h('div', { class: 'card sold' }, 'sold'));
      return;
    }
    const owned = run.army.find((s) => s.type === t);
    const err = canBuyUnit(run, t);
    const d = UNITS[t];
    const buy = () => {
      const e = buyUnit(run, i);
      if (e) fail(e === 'gold' ? 'Not enough gold' : 'No free slot. Sell a unit or buy a slot');
      else ok();
    };
    const card = h(
      'div',
      { class: 'card' },
      owned ? h('span', { class: 'lv' }, `owned ×${owned.copies}`) : null,
      unitThumb(t, 0, 64),
      h('div', { class: 'nm' }, d.name),
      h('div', { class: 'tags' }, ...d.tags.map((tg) => h('span', { class: 'tag' }, tg))),
      h('div', { style: 'font-size:11px;color:var(--dim)' }, `+${Math.round(d.count * (mods.countMult[t] ?? 1))} stickmen`),
      h('div', { class: 'price' }, h('button', { class: err ? '' : 'gold', onclick: buy }, `Buy 💰${unitCost(t)}`)),
    );
    tipOn(card, () => unitTipContent(t, (owned?.copies ?? 0) + 1, mods));
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      showTip(card, unitTipContent(t, (owned?.copies ?? 0) + 1, mods, h('div', { class: 'acts' }, h('button', { class: 'gold', onclick: buy }, `Buy 💰${unitCost(t)}`))), true);
    });
    offers.append(card);
  });
  run.shop.relics.forEach((id, i) => {
    if (!id) {
      offers.append(h('div', { class: 'card sold relic' }, 'sold'));
      return;
    }
    const r = RELIC_MAP[id];
    const cost = relicCost(id);
    const buy = () => {
      const e = buyRelic(run, i);
      if (e) fail(e === 'gold' ? 'Not enough gold' : 'Relic bar full. Sell one first');
      else ok();
    };
    const card = h(
      'div',
      { class: `card relic ${r.rarity}` },
      h('div', { class: 'ic' }, r.icon),
      h('div', { class: 'nm' }, r.name),
      h('div', { class: `rar ${r.rarity}` }, r.rarity),
      h('div', { style: 'font-size:11px;color:var(--dim);text-align:center;line-height:1.2' }, r.desc.length > 60 ? r.desc.slice(0, 58) + '…' : r.desc),
      h('div', { class: 'price' }, h('button', { class: run.gold >= cost && run.relics.length < ECONOMY.maxRelics ? 'gold' : '', onclick: buy }, `Buy 💰${cost}`)),
    );
    tipOn(card, () => relicTipContent(id));
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      showTip(card, relicTipContent(id, h('div', { class: 'acts' }, h('button', { class: 'gold', onclick: buy }, `Buy 💰${cost}`))), true);
    });
    offers.append(card);
  });
  const canSlot = slots < ECONOMY.maxSlots;
  inner.append(
    h(
      'div',
      { class: 'panel' },
      h('h3', {}, 'Shop', h('span', { class: 'hint' }, 'Tap or hover any card for details')),
      offers,
      h(
        'div',
        { class: 'shopactions' },
        h('button', { onclick: () => (reroll(run) ? fail('Not enough gold') : (sfx.play('click'), hideTip(true), rerender())) }, `🎲 Reroll 💰${rerollCost(run)}`),
        canSlot ? h('button', { onclick: () => (buySlot(run) ? fail('Not enough gold') : ok()) }, `➕ Unit slot 💰${slotCost(run)}`) : null,
      ),
    ),
  );

  // ---- commands
  const cmdRow = h('div', { class: 'cmds' });
  for (const c of availableCommands(run)) {
    const cd = COMMANDS[c];
    const on = run.commands.includes(c);
    const b = h('button', { class: 'cmd' + (on ? ' on' : ''), onclick: () => (toggleCommand(run, c), sfx.play('click'), rerender()) }, h('span', {}, cd.icon), cd.name);
    tipOn(b, () => h('div', {}, h('h4', {}, cd.icon, cd.name), cd.desc));
    cmdRow.append(b);
  }
  inner.append(h('div', { class: 'panel' }, h('h3', {}, `Commands · pick ${commandSlots(run)}`, h('span', { class: 'hint' }, 'Each one can be used once per battle')), cmdRow));

  // ---- fight
  root.append(h('div', { class: 'fightbar' }, h('button', { class: 'primary', onclick: hooks.onFight }, `⚔️ Fight battle ${run.battle}`)));
}
