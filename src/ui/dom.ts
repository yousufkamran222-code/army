import { UNITS, UNIT_INDEX, type UnitId } from '../config/units';
import { RELIC_MAP, type RelicId } from '../config/relics';
import type { Atlas } from '../render/atlas';
import { levelOf, unitStats } from '../sim/stats';
import type { Mods } from '../sim/mods';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let atlasRef: Atlas | null = null;
export function setAtlas(a: Atlas) {
  atlasRef = a;
}

const thumbCache = new Map<string, HTMLCanvasElement>();
/** Draw a unit's idle frame from the atlas into a small canvas. */
export function unitThumb(type: UnitId, side = 0, px = 64): HTMLCanvasElement {
  const key = `${type}:${side}:${px}`;
  const c = document.createElement('canvas');
  c.width = px * 2;
  c.height = px * 2;
  const cached = thumbCache.get(key);
  const g = c.getContext('2d')!;
  if (cached) {
    g.drawImage(cached, 0, 0);
    return c;
  }
  const A = atlasRef;
  if (A) {
    const t = A.frames[UNIT_INDEX[type]][side][side === 0 ? 0 : 0];
    const f = t.frame;
    const scale = Math.min((c.width * 0.98) / f.width, (c.height * 0.98) / f.height);
    const w = f.width * scale;
    const hh = f.height * scale;
    if (side === 1) {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(A.canvas, f.x, f.y, f.width, f.height, (c.width - w) / 2, (c.height - hh) / 2 + c.height * 0.04, w, hh);
    const cc = document.createElement('canvas');
    cc.width = c.width;
    cc.height = c.height;
    cc.getContext('2d')!.drawImage(c, 0, 0);
    thumbCache.set(key, cc);
  }
  return c;
}

export function fmt(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

// ---------------------------------------------------------------- tooltip
const tip = () => document.getElementById('tooltip')!;
let tipPinned = false;

export function showTip(anchor: HTMLElement, content: HTMLElement, pinned = false) {
  const t = tip();
  t.innerHTML = '';
  t.append(content);
  t.classList.remove('hidden');
  tipPinned = pinned;
  const r = anchor.getBoundingClientRect();
  const tw = Math.min(290, window.innerWidth - 16);
  t.style.maxWidth = tw + 'px';
  const th = t.offsetHeight;
  let x = r.left + r.width / 2 - t.offsetWidth / 2;
  x = Math.max(8, Math.min(window.innerWidth - t.offsetWidth - 8, x));
  let y = r.top - th - 8;
  if (y < 8) y = Math.min(window.innerHeight - th - 8, r.bottom + 8);
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}

export function hideTip(force = false) {
  if (tipPinned && !force) return;
  tip().classList.add('hidden');
  tipPinned = false;
}

document.addEventListener('pointerdown', (e) => {
  const t = tip();
  if (!t.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-tip]')) hideTip(true);
});

/** Attach hover tooltip (desktop) + tap-to-pin tooltip (touch). build() is called lazily. */
export function tipOn(el: HTMLElement, build: () => HTMLElement) {
  el.dataset.tip = '1';
  el.addEventListener('pointerenter', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse' && !tipPinned) showTip(el, build());
  });
  el.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse') hideTip();
  });
}

export function unitTipContent(type: UnitId, copies: number, mods: Mods | null, actions?: HTMLElement): HTMLElement {
  const d = UNITS[type];
  const st = mods ? unitStats(type, copies, mods) : null;
  const lvl = levelOf(Math.max(1, copies));
  const box = h(
    'div',
    {},
    h('h4', {}, d.name, copies > 0 ? h('span', { class: 'tag' }, `Lv ${lvl}`) : null),
    h('div', { class: 'row', style: 'gap:4px' }, ...d.tags.map((t) => h('span', { class: 'tag' }, t))),
    h('div', { style: 'margin-top:4px' }, d.role),
  );
  if (st) {
    const dps = (st.dmg / st.cooldown).toFixed(1);
    box.append(
      h(
        'div',
        { class: 'stats' },
        'Count',
        h('b', {}, String(st.count)),
        'HP',
        h('b', {}, String(Math.round(st.hp))),
        d.behavior === 'support' ? 'Heal' : 'Dmg',
        h('b', {}, st.dmg.toFixed(1)),
        'DPS',
        h('b', {}, dps),
        'Range',
        h('b', {}, String(Math.round(st.range || st.reach))),
        'Armor',
        h('b', {}, Math.round(st.armor * 100) + '%'),
      ),
    );
  }
  box.append(h('div', { style: 'font-size:11px;color:var(--dim)' }, 'Buying a copy adds stickmen. 3 copies → Lv 2, 9 → Lv 3 (×1.6 stats per level).'));
  if (actions) box.append(actions);
  return box;
}

export function relicTipContent(id: RelicId, actions?: HTMLElement): HTMLElement {
  const r = RELIC_MAP[id];
  return h(
    'div',
    {},
    h('h4', {}, r.icon, r.name),
    h('div', { class: `rar ${r.rarity}` }, r.rarity),
    h('div', { style: 'margin-top:4px' }, r.desc),
    r.combo ? h('div', { class: 'combo' }, '💡 ' + r.combo) : null,
    actions ?? null,
  );
}
