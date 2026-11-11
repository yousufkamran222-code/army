import { COMMANDS } from '../config/commands';
import { RELIC_MAP, type RelicId } from '../config/relics';
import { JUICE } from '../config/tuning';
import { UNITS, UNIT_IDS } from '../config/units';
import { sfx } from '../audio/sfx';
import type { Battle } from '../sim/battle';
import { fmt, h, relicTipContent, showTip, tipOn } from './dom';

export interface HudHooks {
  onCommand: (k: number) => void;
  onSpeed: (s: number) => void;
  onPause: () => void;
  onNumbers: () => void;
  onMute: () => void;
  getSpeed: () => number;
  isPaused: () => boolean;
  numbersOn: () => boolean;
}

export class Hud {
  root: HTMLElement;
  private el!: HTMLElement;
  private pCount!: HTMLElement;
  private eCount!: HTMLElement;
  private pHp!: HTMLElement;
  private eHp!: HTMLElement;
  private timer!: HTMLElement;
  private boss!: HTMLElement;
  private bossHp!: HTMLElement;
  private cmdBtns: HTMLButtonElement[] = [];
  private relicEls = new Map<string, HTMLElement>();
  private pending = new Map<string, { n: number; set: boolean; t: number }>();
  private ctrlEls: HTMLElement[] = [];
  private lastUpd = 0;
  private battle: Battle | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(b: Battle, relics: RelicId[], hooks: HudHooks, title: string) {
    this.battle = b;
    this.relicEls.clear();
    this.pending.clear();
    const ctrl = (label: string, fn: () => void, on: () => boolean) => {
      const btn = h('button', { onclick: () => (fn(), sfx.play('click'), this.refreshCtrls(hooks)) }, label);
      (btn as unknown as { _on: () => boolean })._on = on;
      this.ctrlEls.push(btn);
      return btn;
    };
    this.ctrlEls = [];
    this.pCount = h('div', { class: 'count' });
    this.eCount = h('div', { class: 'count' });
    this.pHp = h('div', { style: 'width:100%' });
    this.eHp = h('div', { style: 'width:100%' });
    this.timer = h('div', { class: 'timer' });
    this.bossHp = h('div', { style: 'width:100%' });
    const bossIdx = b.setup.enemy.slots.findIndex((s) => UNITS[s.type].tags.includes('Boss'));
    this.boss = h('div', { class: 'bossbar' + (bossIdx < 0 ? ' hidden' : '') }, bossIdx >= 0 ? `👑 ${UNITS[b.setup.enemy.slots[bossIdx].type].name.toUpperCase()}` : '', h('div', { class: 'hpbar' }, this.bossHp));
    const cmdbar = h('div', { class: 'cmdbar' });
    this.cmdBtns = b.setup.commands.map((c, k) => {
      const d = COMMANDS[c];
      const btn = h('button', { class: 'cmdbtn', onclick: () => hooks.onCommand(k) }, h('span', { class: 'ic' }, d.icon), h('span', {}, d.name)) as HTMLButtonElement;
      tipOn(btn, () => h('div', {}, h('h4', {}, d.icon, d.name), d.desc));
      cmdbar.append(btn);
      return btn;
    });
    const relicbar = h('div', { class: 'relicbar' });
    for (const id of relics) {
      const r = RELIC_MAP[id];
      const ic = h('div', { class: `relicic ${r.rarity}` }, r.icon);
      tipOn(ic, () => relicTipContent(id));
      ic.addEventListener('click', () => showTip(ic, relicTipContent(id), true));
      this.relicEls.set(id, ic);
      relicbar.append(ic);
    }
    this.el = h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'hudtop' },
        h('div', { class: 'side p' }, h('div', { class: 'hpbar' }, this.pHp), this.pCount),
        h(
          'div',
          { class: 'hudmid' },
          h(
            'div',
            { class: 'ctrls' },
            ctrl('1×', () => hooks.onSpeed(1), () => hooks.getSpeed() === 1 && !hooks.isPaused()),
            ctrl('2×', () => hooks.onSpeed(2), () => hooks.getSpeed() === 2 && !hooks.isPaused()),
            ctrl('4×', () => hooks.onSpeed(4), () => hooks.getSpeed() === 4 && !hooks.isPaused()),
            ctrl('⏸', hooks.onPause, hooks.isPaused),
            ctrl('123', hooks.onNumbers, hooks.numbersOn),
            ctrl(sfx.muted ? '🔇' : '🔊', () => {
              hooks.onMute();
              this.ctrlEls[5].textContent = sfx.muted ? '🔇' : '🔊';
            }, () => false),
          ),
          h('div', { class: 'timer' }, title),
          this.timer,
          this.boss,
        ),
        h('div', { class: 'side e enemy-side' }, h('div', { class: 'hpbar' }, this.eHp), this.eCount),
      ),
      h('div', { class: 'rotate-hint' }, '↻ rotate for a bigger battlefield'),
      h('div', { class: 'hudbot' }, cmdbar, relicbar),
    );
    this.root.append(this.el);
    this.refreshCtrls(hooks);
    this.update(true);
  }

  refreshCtrls(_hooks: HudHooks) {
    for (const b of this.ctrlEls) b.classList.toggle('on', (b as unknown as { _on: () => boolean })._on());
  }

  unmount() {
    this.el?.remove();
    this.battle = null;
  }

  banner(text: string, color = '#fff', top = '30%') {
    const b = h('div', { class: 'banner', style: `color:${color};top:${top}` }, text);
    this.root.append(b);
    setTimeout(() => b.remove(), 1500);
  }

  /** Called by the view for each relic trigger. Labels aggregate over a short window. */
  pulse(id: string, n: number, set: boolean) {
    const p = this.pending.get(id);
    if (p) p.n = set ? n : p.n + n;
    else this.pending.set(id, { n, set, t: performance.now() });
  }

  update(force = false) {
    const b = this.battle;
    if (!b) return;
    const now = performance.now();
    // relic labels
    for (const [id, p] of this.pending) {
      if (now - p.t < JUICE.relicLabelWindow * 1000 && !force) continue;
      this.pending.delete(id);
      const el = this.relicEls.get(id);
      const def = RELIC_MAP[id as RelicId];
      if (!el || !def) continue;
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
      const lab = h('div', { class: 'rlabel' }, def.label(Math.round(p.n)));
      el.append(lab);
      setTimeout(() => lab.remove(), 1100);
    }
    if (!force && now - this.lastUpd < 90) return;
    this.lastUpd = now;
    const deploying = b.deploying;
    this.pCount.innerHTML = `${fmt(b.aliveCount[0])} <small>alive</small>`;
    this.eCount.innerHTML = `<small>alive</small> ${fmt(b.aliveCount[1])}`;
    this.pHp.style.width = `${(100 * b.statueHp[0]) / b.statueMax[0]}%`;
    this.eHp.style.width = `${(100 * b.statueHp[1]) / b.statueMax[1]}%`;
    this.timer.textContent = deploying ? 'Deploying…' : `${b.time.toFixed(0)}s`;
    if (b.bossIdx >= 0) {
      const hp = b.alive[b.bossIdx] && UNIT_IDS[b.type[b.bossIdx]] !== undefined && b.flags[b.bossIdx] & 4 ? b.hp[b.bossIdx] : 0;
      this.bossHp.style.width = `${Math.max(0, (100 * hp) / b.bossMaxHp)}%`;
    }
    this.cmdBtns.forEach((btn, k) => {
      btn.classList.toggle('used', b.commandsUsed[k]);
      btn.disabled = b.commandsUsed[k] || b.finished;
      const id = b.setup.commands[k];
      btn.classList.toggle('active', (id === 'charge' && b.chargeT > 0) || (id === 'hold' && b.holdT > 0));
    });
  }
}
