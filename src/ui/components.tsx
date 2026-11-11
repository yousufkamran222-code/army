import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { UNITS, type UnitId } from '../config/units';
import { RELIC_MAP, type RelicId } from '../config/relics';
import { COMMANDS, type CommandId } from '../config/commands';
import { ECONOMY } from '../config/tuning';
import { levelOf, nextLevelAt, unitStats } from '../sim/stats';
import type { Mods } from '../sim/mods';
import { Icon } from './icons';
import { sfx } from '../audio/sfx';

export function fmt(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

export function Btn(p: { kind?: 'primary' | 'gold' | 'ghost' | 'danger'; onClick?: () => void; disabled?: boolean; class?: string; children: ComponentChildren; title?: string; silent?: boolean }) {
  return (
    <button
      class={`btn ${p.kind ?? ''} ${p.class ?? ''}`}
      disabled={p.disabled}
      title={p.title}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.silent) sfx.play('click');
        p.onClick?.();
      }}
    >
      {p.children}
    </button>
  );
}

export function IconBtn(p: { icon: string; onClick: () => void; title: string; on?: boolean; class?: string }) {
  return (
    <button
      class={`iconbtn ${p.on ? 'on' : ''} ${p.class ?? ''}`}
      title={p.title}
      aria-label={p.title}
      onClick={(e) => {
        e.stopPropagation();
        sfx.play('click');
        p.onClick();
      }}
    >
      <Icon name={p.icon} />
    </button>
  );
}

export function Gold({ n, small }: { n: number | string; small?: boolean }) {
  return (
    <span class={'gold' + (small ? ' small' : '')}>
      <Icon name="coin" />
      {n}
    </span>
  );
}

export function Tags({ type }: { type: UnitId }) {
  return (
    <div class="tags">
      {UNITS[type].tags.map((t) => (
        <span class={`tag t-${t.toLowerCase()}`}>{t}</span>
      ))}
    </div>
  );
}

export function LevelPips({ copies }: { copies: number }) {
  const next = nextLevelAt(copies);
  const lvl = levelOf(copies);
  if (!next) return <div class="pips max">MAX</div>;
  const prev = lvl === 1 ? 0 : ECONOMY.levelCopies[lvl - 1];
  const need = next - prev;
  const have = copies - prev;
  return (
    <div class="pips" title={`${copies}/${next} copies to level ${lvl + 1}`}>
      {Array.from({ length: need }, (_, i) => (
        <i class={i < have ? 'on' : ''} />
      ))}
    </div>
  );
}

export function RelicBadge({ id, size = 'md' }: { id: RelicId; size?: 'sm' | 'md' | 'lg' }) {
  const r = RELIC_MAP[id];
  return (
    <span class={`relic-badge ${r.rarity} ${size}`}>
      <Icon name={id} />
    </span>
  );
}

export function CmdBadge({ id }: { id: CommandId }) {
  return (
    <span class="cmd-badge">
      <Icon name={id} />
    </span>
  );
}

/** Stats grid for a unit (with relic mods applied). */
export function UnitStats({ type, copies, mods }: { type: UnitId; copies: number; mods: Mods }) {
  const st = unitStats(type, Math.max(1, copies), mods);
  const d = UNITS[type];
  const rows: [string, string][] = [
    ['Stickmen', String(st.count)],
    ['HP', String(Math.round(st.hp))],
    [d.behavior === 'support' ? 'Heal' : 'Damage', st.dmg.toFixed(1)],
    ['Per sec', (st.dmg / st.cooldown).toFixed(1)],
    ['Range', String(Math.round(st.range || st.reach))],
    ['Armor', Math.round(st.armor * 100) + '%'],
  ];
  return (
    <div class="statgrid">
      {rows.map(([k, v]) => (
        <div>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export function CommandText({ id }: { id: CommandId }) {
  return <p class="desc">{COMMANDS[id].desc}</p>;
}

/** Pointer-based drag-to-reorder for a row of items. Works for touch and mouse. */
export function useSortable(onMove: (from: number, to: number) => void, onTap: (i: number) => void) {
  const [drag, setDrag] = useState<{ i: number; dx: number; dy: number; over: number } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const bind = (i: number) => ({
    'data-sort': i,
    class: drag?.i === i ? 'dragging' : drag && drag.over === i ? 'droptarget' : '',
    style: drag?.i === i ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.06)` } : undefined,
    onPointerDown: (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      let over = i;
      const mv = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        moved = true;
        ev.preventDefault();
        over = i;
        container.current?.querySelectorAll<HTMLElement>('[data-sort]').forEach((el) => {
          const j = Number(el.dataset.sort);
          if (j === i) return;
          const r = el.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 20 && ev.clientY <= r.bottom + 20) over = j;
        });
        setDrag({ i, dx, dy, over });
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setDrag(null);
        if (moved) {
          if (over !== i) {
            sfx.play('click');
            onMove(i, over);
          }
        } else onTap(i);
      };
      window.addEventListener('pointermove', mv, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
  });
  return { bind, container, dragging: drag !== null };
}
