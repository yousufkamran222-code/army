// Deterministic, render-agnostic battle simulation.
// Struct-of-arrays + x-bins so thousands of stickmen stay cheap.

import { SIM, WORLD, JUICE, ENEMY } from '../config/tuning';
import { UNITS, UNIT_IDS, UNIT_INDEX, BOSS, type Behavior, type UnitId } from '../config/units';
import { COMMANDS, type CommandId } from '../config/commands';
import { Rng } from './rng';
import type { BattleResult, BattleSetup, SideSetup, SlotStats } from './types';
import type { Mods } from './mods';

export const EV = {
  Hit: 1, // x y dmg side big
  Death: 2, // x y typeIdx+side*32 vx vz size
  Shoot: 3, // x y kind side
  Split: 4, // x y side
  Statue: 5, // x y dmg side
  Slam: 6, // x y radius side
  Explode: 7, // x y radius side
  Meteor: 8, // x y radius
  Raise: 9, // x y side
  Heal: 10, // x y amount
  Cry: 11, // x y
  Land: 12, // x y dmg
  Command: 13, // cmdIndex
  StatueFall: 14, // side
  Swing: 15, // x y size side (heavy swing)
} as const;
export const EV_STRIDE = 7;

export const PK = { Arrow: 0, Bolt: 1, Dark: 2, Body: 3, Meteor: 4 } as const;

const BEHAVIOR_CODE: Record<Behavior, number> = { melee: 0, ranged: 1, mage: 2, support: 3, necro: 4, giant: 5, warlord: 6, golem: 7 };
const TYPE_BEHAVIOR = UNIT_IDS.map((id) => BEHAVIOR_CODE[UNITS[id].behavior]);
const TYPE_BIG = UNIT_IDS.map((id) => (UNITS[id].big ? 1 : 0));
const TYPE_RAGE = UNIT_IDS.map((id) => UNITS[id].rage);
const TYPE_BIGBONUS = UNIT_IDS.map((id) => UNITS[id].bigBonus);
const TYPE_SHIELD = UNIT_IDS.map((id) => (UNITS[id].tags.includes('Shield') ? 1 : 0));
const T_SWARM = UNIT_INDEX.swarmling;
const T_MINION = UNIT_INDEX.minion;
const T_ARCHER = UNIT_INDEX.archer;

const F_MINION = 1;
const F_THROWN = 2;
const F_BOSS = 4;

interface Corpse {
  x: number;
  y: number;
  t: number;
  type: number;
  side: number;
}
interface DeathRec {
  slot: number;
  x: number;
  y: number;
  gen: number;
}

export class Battle {
  readonly setup: BattleSetup;
  readonly rng: Rng;
  readonly N = SIM.maxUnits;
  readonly PN = SIM.maxProjectiles;
  emitEvents = true;

  // ---- units (SoA) ----
  alive = new Uint8Array(this.N);
  side = new Uint8Array(this.N);
  type = new Uint8Array(this.N);
  slot = new Int16Array(this.N);
  gen = new Uint8Array(this.N);
  flags = new Uint8Array(this.N);
  state = new Uint8Array(this.N); // 0 walk, 1 fight/idle, 2 airborne
  stacks = new Uint8Array(this.N);
  x = new Float32Array(this.N);
  y = new Float32Array(this.N);
  z = new Float32Array(this.N);
  px = new Float32Array(this.N);
  pz = new Float32Array(this.N);
  vx = new Float32Array(this.N);
  vz = new Float32Array(this.N);
  hp = new Float32Array(this.N);
  maxHp = new Float32Array(this.N);
  dmg = new Float32Array(this.N);
  cooldown = new Float32Array(this.N);
  cool = new Float32Array(this.N);
  reach = new Float32Array(this.N);
  range = new Float32Array(this.N);
  speed = new Float32Array(this.N);
  armor = new Float32Array(this.N);
  size = new Float32Array(this.N);
  aoe = new Float32Array(this.N);
  knock = new Float32Array(this.N);
  special = new Float32Array(this.N);
  anim = new Float32Array(this.N); // attack anim timer (counts down)
  hurt = new Float32Array(this.N); // hit flash timer
  airT = new Float32Array(this.N);
  thrownDmg = new Float32Array(this.N);
  target = new Int32Array(this.N);
  walk = new Float32Array(this.N); // walk phase
  hi = 0; // high-water mark
  private free: number[] = [];

  // ---- projectiles ----
  pAlive = new Uint8Array(this.PN);
  pKind = new Uint8Array(this.PN);
  pSide = new Uint8Array(this.PN);
  pGen = new Uint8Array(this.PN);
  pX = new Float32Array(this.PN);
  pY = new Float32Array(this.PN);
  pZ = new Float32Array(this.PN);
  pPX = new Float32Array(this.PN);
  pPZ = new Float32Array(this.PN);
  pVx = new Float32Array(this.PN);
  pVy = new Float32Array(this.PN);
  pVz = new Float32Array(this.PN);
  pT = new Float32Array(this.PN);
  pTtl = new Float32Array(this.PN);
  pTarget = new Int32Array(this.PN);
  pDmg = new Float32Array(this.PN);
  pAoe = new Float32Array(this.PN);
  pType = new Uint8Array(this.PN);
  pHi = 0;
  private pFree: number[] = [];

  // ---- bins ----
  readonly nb = Math.ceil(WORLD.length / WORLD.binSize) + 2;
  head = new Int32Array(2 * this.nb);
  next = new Int32Array(this.N);
  binCount = new Int32Array(2 * this.nb);

  // ---- side state ----
  aliveCount: [number, number] = [0, 0];
  front: [number, number] = [WORLD.playerStatueX, WORLD.enemyStatueX];
  statueHp: [number, number];
  statueMax: [number, number];
  sideMult: [number, number] = [1, 1];
  spawned: [number, number] = [0, 0];
  kills: [number, number] = [0, 0];
  peakAlive: [number, number] = [0, 0];
  biggestHit = 0;
  chainStacks = 0;
  numbersBonus = 0;
  time = 0;
  tick = 0;
  finished = false;
  result: BattleResult | null = null;
  bossIdx = -1;
  bossMaxHp = 0;

  private queues: { slot: number; left: number }[][] = [[], []];
  private spawnAcc: [number, number] = [0, 0];
  private spawnRate: [number, number] = [0, 0];
  private corpses: Corpse[] = [];
  private deaths: DeathRec[][] = [[], []];
  private pendingExplosions: number[] = [];
  private pendingMeteors: { t: number; dmg: number }[] = [];
  private initialHp: [number, number] = [0, 0];

  // commands
  commandsUsed: boolean[];
  chargeT = 0;
  holdT = 0;
  cryT = 0;

  // feedback
  events: number[] = [];
  relicPulse = new Map<string, { n: number; set: boolean }>();
  relicTotals: Record<string, number> = {};
  bountyGold = 0;
  private quiverExtra = 0;
  private numbersTimer = 0;

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.statueHp = [setup.player.statueHp, setup.enemy.statueHp];
    this.statueMax = [setup.player.statueHp, setup.enemy.statueHp];
    this.commandsUsed = setup.commands.map(() => false);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? setup.player : setup.enemy;
      let total = 0;
      side.slots.forEach((st, i) => {
        if (st.count > 0) this.queues[s].push({ slot: i, left: st.count });
        total += st.count;
        this.initialHp[s] += st.count * st.hp;
      });
      this.spawnRate[s] = Math.max(SIM.spawnRateMin, total / SIM.deployTime);
    }
    // Shield Quiver: extra arrows from shield stickmen
    const pm = setup.player.mods;
    if (pm.shieldQuiverPer > 0) {
      let shields = 0;
      for (const st of setup.player.slots) if (TYPE_SHIELD[UNIT_INDEX[st.type]]) shields += st.count;
      this.quiverExtra = Math.min(pm.shieldQuiverMax, Math.floor(shields / pm.shieldQuiverPer));
    }
    this.target.fill(-1);
    this.pTarget.fill(-1);
  }

  sideSetup(s: number): SideSetup {
    return s === 0 ? this.setup.player : this.setup.enemy;
  }
  mods(s: number): Mods {
    return s === 0 ? this.setup.player.mods : this.setup.enemy.mods;
  }

  // ------------------------------------------------------------------ events
  private ev(t: number, a = 0, b = 0, c = 0, d = 0, e = 0, f = 0) {
    if (this.emitEvents) this.events.push(t, a, b, c, d, e, f);
  }
  trig(id: string, n = 1, set = false) {
    this.relicTotals[id] = set ? Math.max(this.relicTotals[id] ?? 0, n) : (this.relicTotals[id] ?? 0) + n;
    if (!this.emitEvents) return;
    const p = this.relicPulse.get(id);
    if (!p) this.relicPulse.set(id, { n, set });
    else p.n = set ? n : p.n + n;
  }

  // ------------------------------------------------------------------ spawning
  spawn(side: number, st: SlotStats, slot: number, x: number, y: number, gen = 0, flags = 0): number {
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.hi < this.N) i = this.hi++;
    else return -1;
    const t = UNIT_INDEX[st.type];
    this.alive[i] = 1;
    this.side[i] = side;
    this.type[i] = t;
    this.slot[i] = slot;
    this.gen[i] = gen;
    this.flags[i] = flags | (TYPE_BEHAVIOR[t] >= 6 ? F_BOSS : 0);
    this.state[i] = 0;
    this.stacks[i] = 0;
    this.x[i] = this.px[i] = x;
    this.y[i] = y;
    this.z[i] = this.pz[i] = 0;
    this.vx[i] = 0;
    this.vz[i] = 0;
    this.hp[i] = this.maxHp[i] = st.hp;
    this.dmg[i] = st.dmg;
    this.cooldown[i] = st.cooldown;
    this.cool[i] = this.rng.next() * st.cooldown;
    this.reach[i] = st.reach;
    this.range[i] = st.range;
    this.speed[i] = st.speed * this.rng.range(0.92, 1.08);
    this.armor[i] = st.armor;
    this.size[i] = st.size;
    this.aoe[i] = st.aoe;
    this.knock[i] = st.knock;
    const beh = TYPE_BEHAVIOR[t];
    this.special[i] = beh === 4 ? UNITS.necromancer.raiseCooldown : beh === 6 ? BOSS.warlord.cryEvery : beh === 7 ? BOSS.golem.slamEvery * 0.6 : 0;
    this.anim[i] = 0;
    this.hurt[i] = 0;
    this.airT[i] = 0;
    this.thrownDmg[i] = 0;
    this.target[i] = -1;
    this.walk[i] = this.rng.next() * 6;
    this.spawned[side]++;
    if (this.flags[i] & F_BOSS) {
      this.bossIdx = i;
      this.bossMaxHp = st.hp;
    }
    return i;
  }

  private spawnStep(dt: number) {
    for (let s = 0; s < 2; s++) {
      const q = this.queues[s];
      if (!q.length) continue;
      this.spawnAcc[s] += this.spawnRate[s] * dt;
      const side = this.sideSetup(s);
      const sx = s === 0 ? WORLD.playerStatueX + 10 : WORLD.enemyStatueX - 10;
      while (this.spawnAcc[s] >= 1 && q.length) {
        this.spawnAcc[s] -= 1;
        const head = q[0];
        const st = side.slots[head.slot];
        const big = TYPE_BIG[UNIT_INDEX[st.type]];
        const y = big ? WORLD.laneDepth * this.rng.range(0.4, 0.75) : this.rng.range(4, WORLD.laneDepth - 4);
        this.spawn(s, st, head.slot, sx + this.rng.range(-8, 8), y);
        if (--head.left <= 0) q.shift();
      }
    }
  }

  get deploying(): boolean {
    return this.queues[0].length > 0 || this.queues[1].length > 0;
  }

  // ------------------------------------------------------------------ bins
  private rebuild() {
    this.head.fill(-1);
    this.binCount.fill(0);
    const nb = this.nb;
    let pf = -1e9;
    let ef = 1e9;
    let c0 = 0;
    let c1 = 0;
    const bs = WORLD.binSize;
    for (let i = 0; i < this.hi; i++) {
      if (!this.alive[i]) continue;
      const s = this.side[i];
      if (s === 0) c0++;
      else c1++;
      if (this.state[i] === 2) continue;
      const x = this.x[i];
      let b = (x / bs) | 0;
      if (b < 0) b = 0;
      else if (b >= nb) b = nb - 1;
      const k = s * nb + b;
      this.next[i] = this.head[k];
      this.head[k] = i;
      this.binCount[k]++;
      if (s === 0) {
        if (x > pf) pf = x;
      } else if (x < ef) ef = x;
    }
    this.aliveCount[0] = c0;
    this.aliveCount[1] = c1;
    if (c0 > this.peakAlive[0]) this.peakAlive[0] = c0;
    if (c1 > this.peakAlive[1]) this.peakAlive[1] = c1;
    this.front[0] = pf > -1e9 ? pf : WORLD.playerStatueX;
    this.front[1] = ef < 1e9 ? ef : WORLD.enemyStatueX;
  }

  private binOf(x: number): number {
    let b = (x / WORLD.binSize) | 0;
    if (b < 0) b = 0;
    else if (b >= this.nb) b = this.nb - 1;
    return b;
  }

  /** nearest enemy of side `s` within [x-r, x+r] */
  private nearestEnemy(s: number, x: number, y: number, r: number): number {
    const es = 1 - s;
    const b0 = this.binOf(x - r);
    const b1 = this.binOf(x + r);
    let best = -1;
    let bd = 1e9;
    const base = es * this.nb;
    for (let b = b0; b <= b1; b++) {
      for (let j = this.head[base + b]; j >= 0; j = this.next[j]) {
        const dx = Math.abs(this.x[j] - x);
        if (dx > r) continue;
        const d = dx + Math.abs(this.y[j] - y) * 0.15;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
    }
    return best;
  }

  /** pick a random-ish enemy near the enemy front, within range of x */
  private pickRangedTarget(s: number, x: number, range: number): number {
    const es = 1 - s;
    const dir = s === 0 ? 1 : -1;
    const fx = this.front[es];
    if ((fx - x) * dir > range) return -1;
    const depth = this.rng.next() * this.rng.next() * 140;
    let tx = fx + dir * depth;
    if ((tx - x) * dir > range) tx = x + dir * range;
    let b = this.binOf(tx);
    const base = es * this.nb;
    for (let tries = 0; tries < 14; tries++) {
      const cnt = this.binCount[base + b];
      if (cnt > 0) {
        let k = this.rng.int(cnt);
        let j = this.head[base + b];
        while (k-- > 0 && this.next[j] >= 0) j = this.next[j];
        return j;
      }
      b -= dir; // step back toward the shooter / enemy front
      if (b < 0 || b >= this.nb) break;
    }
    return this.nearestEnemy(s, fx, 60, 40);
  }

  // ------------------------------------------------------------------ combat
  private unitMult(i: number, t: number): number {
    let m = this.sideMult[this.side[i]];
    const ty = this.type[i];
    const rage = TYPE_RAGE[ty];
    if (rage > 0) {
      const rm = this.mods(this.side[i]).rageMult;
      m *= 1 + rage * rm * (1 - this.hp[i] / this.maxHp[i]);
    }
    if (this.stacks[i]) m *= 1 + this.mods(this.side[i]).chant * this.stacks[i];
    if (t >= 0 && TYPE_BIG[this.type[t]]) m *= TYPE_BIGBONUS[ty];
    return m;
  }

  /** Deal damage to unit t. attacker may be -1. Returns true if killed. */
  damage(t: number, amount: number, attacker: number, kvx = 0, kvz = 0): boolean {
    if (!this.alive[t]) return false;
    let amt = amount * (1 - this.armor[t]);
    const s = this.side[t];
    if (s === 0 && this.holdT > 0 && this.x[t] >= this.front[0] - 120) amt *= COMMANDS.hold.power;
    this.hp[t] -= amt;
    this.hurt[t] = 0.12;
    if (amt > this.biggestHit) this.biggestHit = amt;
    this.ev(EV.Hit, this.x[t], this.y[t], amt, 1 - s, TYPE_BIG[this.type[t]] || (attacker >= 0 && TYPE_BIG[this.type[attacker]]) ? 1 : 0);
    if (this.hp[t] <= 0) {
      this.kill(t, 1 - s, kvx, kvz, attacker);
      return true;
    }
    return false;
  }

  private kill(t: number, killerSide: number, kvx: number, kvz: number, attacker: number) {
    const s = this.side[t];
    const ty = this.type[t];
    const x = this.x[t];
    const y = this.y[t];
    this.alive[t] = 0;
    this.free.push(t);
    this.kills[killerSide]++;
    const fl = this.flags[t];
    this.ev(EV.Death, x, y, ty + s * 32, kvx, kvz + this.z[t], this.size[t]);

    if (!(fl & F_BOSS)) {
      // minions leave corpses too, so a necromancer army keeps re-raising itself
      if (this.corpses.length >= SIM.maxCorpses) this.corpses.shift();
      this.corpses.push({ x, y, t: this.time, type: ty, side: s });
    }
    if (!(fl & F_BOSS)) {
      const dl = this.deaths[s];
      dl.push({ slot: this.slot[t], x, y, gen: this.gen[t] });
      if (dl.length > 40) dl.shift();
    }

    const km = this.mods(killerSide);
    // berserker heal on kill
    if (attacker >= 0 && this.alive[attacker] && TYPE_RAGE[this.type[attacker]] > 0 && km.rageHeal > 0) {
      this.hp[attacker] = Math.min(this.maxHp[attacker], this.hp[attacker] + this.maxHp[attacker] * km.rageHeal);
      this.trig('blood_frenzy');
    }
    if (killerSide === 0) {
      const k = this.kills[0];
      if (km.bountyPer > 0 && k % km.bountyPer === 0) {
        this.bountyGold += km.bountyGold;
        this.trig('bounty_board', km.bountyGold);
      }
      if (km.chainEvery > 0 && k % km.chainEvery === 0) {
        this.chainStacks++;
        this.trig('chain_reaction', this.chainStacks, true);
      }
      if (km.autoMeteorEvery > 0 && k % km.autoMeteorEvery === 0) {
        this.queueMeteors(1, 0);
        this.trig('sky_hammer');
      }
    }

    const sm = this.mods(s);
    // Mitosis
    if (ty === T_SWARM && this.gen[t] < sm.swarmSplit) {
      const st = this.sideSetup(s).slots[this.slot[t]] ?? null;
      if (st) {
        const g = this.gen[t] + 1;
        const shrink = sm.swarmNoShrink ? 1 : Math.pow(0.75, g);
        for (let k = 0; k < 2; k++) {
          const j = this.spawn(s, st, this.slot[t], x + this.rng.range(-6, 6), Math.min(WORLD.laneDepth, Math.max(0, y + this.rng.range(-8, 8))), g);
          if (j < 0) break;
          this.hp[j] = this.maxHp[j] = st.hp * shrink;
          this.dmg[j] = st.dmg * (sm.swarmNoShrink ? 1 : Math.pow(0.85, g));
          this.size[j] = st.size * (sm.swarmNoShrink ? 1 : Math.pow(0.88, g));
          // pop out of the dying one
          this.state[j] = 2;
          this.z[j] = 2;
          this.vz[j] = this.rng.range(80, 140);
          this.vx[j] = (s === 0 ? -1 : 1) * this.rng.range(10, 40) * (k ? 1 : -0.5);
        }
        if (s === 0) this.trig('mitosis');
        this.ev(EV.Split, x, y, s);
      }
    }
    // Lich crown
    if (fl & F_MINION && sm.minionExplode > 0) {
      this.pendingExplosions.push(x, y, s, sm.minionExplode);
    }
  }

  /** debug: destroy the enemy statue */
  forceWin() {
    if (!this.finished) this.hitStatue(1, this.statueHp[1] + 1);
  }

  private hitStatue(side: number, amt: number) {
    if (this.statueHp[side] <= 0) return;
    this.statueHp[side] -= amt;
    const sx = side === 0 ? WORLD.playerStatueX : WORLD.enemyStatueX;
    this.ev(EV.Statue, sx, WORLD.laneDepth * 0.5, amt, side);
    if (this.statueHp[side] <= 0) {
      this.statueHp[side] = 0;
      this.ev(EV.StatueFall, side);
      this.finish((1 - side) as 0 | 1, false);
    }
  }

  private aoeDamage(s: number, x: number, y: number, r: number, amount: number, attacker: number, knock: number, maxHits = 40): number {
    // s = side doing damage
    const es = 1 - s;
    const b0 = this.binOf(x - r);
    const b1 = this.binOf(x + r);
    const base = es * this.nb;
    let hits = 0;
    const victims: number[] = [];
    for (let b = b0; b <= b1 && victims.length < maxHits; b++) {
      for (let j = this.head[base + b]; j >= 0 && victims.length < maxHits; j = this.next[j]) {
        if (!this.alive[j] || this.state[j] === 2) continue;
        const dx = this.x[j] - x;
        const dy = (this.y[j] - y) * 0.6;
        if (dx * dx + dy * dy > r * r) continue;
        victims.push(j);
      }
    }
    const dir = s === 0 ? 1 : -1;
    for (const j of victims) {
      const big = TYPE_BIG[this.type[j]];
      const mult = attacker >= 0 && big ? TYPE_BIGBONUS[this.type[attacker]] : 1;
      const kvx = dir * this.rng.range(60, 140) * Math.max(0.4, knock);
      const kvz = this.rng.range(120, 240) * Math.max(0.5, Math.sqrt(knock));
      const killed = this.damage(j, amount * mult, attacker, knock > 0 ? kvx : dir * 30, knock > 0 ? kvz : 60);
      hits++;
      if (!killed && knock > 0 && !big) this.launch(j, kvx, kvz);
    }
    return hits;
  }

  private launch(j: number, vx: number, vz: number) {
    this.state[j] = 2;
    this.vx[j] = vx;
    this.vz[j] = vz;
    this.z[j] = Math.max(this.z[j], 1);
    this.airT[j] = 0;
    this.target[j] = -1;
  }

  // ------------------------------------------------------------------ projectiles
  private newProj(kind: number, side: number, x: number, y: number, z: number, tx: number, ty: number, ttl: number, dmg: number, aoe: number, target: number, gen = 0, utype = 0): number {
    let p: number;
    if (this.pFree.length) p = this.pFree.pop()!;
    else if (this.pHi < this.PN) p = this.pHi++;
    else return -1;
    this.pAlive[p] = 1;
    this.pKind[p] = kind;
    this.pSide[p] = side;
    this.pGen[p] = gen;
    this.pType[p] = utype;
    this.pX[p] = this.pPX[p] = x;
    this.pY[p] = y;
    this.pZ[p] = this.pPZ[p] = z;
    this.pT[p] = 0;
    this.pTtl[p] = ttl;
    this.pVx[p] = (tx - x) / ttl;
    this.pVy[p] = (ty - y) / ttl;
    const g = kind === PK.Bolt || kind === PK.Dark ? WORLD.gravity * 0.35 : WORLD.gravity;
    this.pVz[p] = (0 - z) / ttl + 0.5 * g * ttl;
    this.pDmg[p] = dmg;
    this.pAoe[p] = aoe;
    this.pTarget[p] = target;
    return p;
  }

  private fireArrow(i: number, t: number, extraSpread = 0) {
    this.fireArrowFrom(this.side[i], this.x[i], this.y[i], 20 * this.size[i], t, this.dmg[i] * this.unitMult(i, t), 0, extraSpread);
  }

  private fireArrowFrom(s: number, x: number, y: number, z: number, t: number, dmg: number, gen: number, extraSpread: number) {
    let tx: number;
    let ty: number;
    if (t >= 0) {
      tx = this.x[t];
      ty = this.y[t];
    } else {
      tx = s === 0 ? WORLD.enemyStatueX : WORLD.playerStatueX;
      ty = WORLD.laneDepth * 0.5;
    }
    tx += this.rng.range(-4, 4) * (1 + extraSpread);
    ty += this.rng.range(-3, 3) * (1 + extraSpread);
    const dist = Math.abs(tx - x);
    const ttl = Math.max(0.35, dist / SIM.arrowSpeed) * this.rng.range(0.95, 1.08);
    this.newProj(PK.Arrow, s, x, y, z, tx, ty, ttl, dmg, 0, t, gen);
  }

  private queueMeteors(n: number, delay: number) {
    const dmg = COMMANDS.meteor.power + 3 * this.kills[0];
    for (let k = 0; k < n; k++) this.pendingMeteors.push({ t: this.time + delay + k * 0.35, dmg });
  }

  private landProjectile(p: number) {
    const kind = this.pKind[p];
    const s = this.pSide[p];
    const x = this.pX[p];
    const y = this.pY[p];
    const t = this.pTarget[p];
    const es = 1 - s;
    const statueX = es === 0 ? WORLD.playerStatueX : WORLD.enemyStatueX;
    const nearStatue = Math.abs(x - statueX) < WORLD.statueHalfWidth + 6;
    if (kind === PK.Arrow || kind === PK.Dark) {
      let hit = -1;
      if (t >= 0 && this.alive[t] && this.side[t] === es && this.state[t] !== 2 && Math.abs(this.x[t] - x) < 16) hit = t;
      else hit = this.nearestEnemy(s, x, y, 12);
      if (hit >= 0) {
        const dir = s === 0 ? 1 : -1;
        const killed = this.damage(hit, this.pDmg[p], -1, dir * 40, 70);
        if (killed && kind === PK.Arrow && s === 0) {
          const m = this.mods(0);
          if (this.pGen[p] < m.hailSplit) {
            for (let k = 0; k < 2; k++) {
              const nt = this.pickRangedTarget(0, x - 30, 160);
              if (nt < 0) break;
              this.fireArrowFrom(0, x, y, 16, nt, this.pDmg[p] * 0.8, this.pGen[p] + 1, 1);
            }
            this.trig('hail_of_arrows', 2);
          }
        }
      } else if (nearStatue && t < 0) this.hitStatue(es, this.pDmg[p]);
      else if (nearStatue) this.hitStatue(es, this.pDmg[p] * 0.5);
    } else if (kind === PK.Bolt) {
      this.ev(EV.Explode, x, y, this.pAoe[p], s);
      const hits = this.aoeDamage(s, x, y, this.pAoe[p], this.pDmg[p], -1, 0.25, 30);
      if (hits === 0 && nearStatue) this.hitStatue(es, this.pDmg[p]);
    } else if (kind === PK.Body) {
      // thrown corpse lands on its own army (es = thrower's enemy)... pSide = thrower side
      this.ev(EV.Land, x, y, this.pDmg[p]);
      this.aoeDamage(s, x, y, 24, this.pDmg[p], -1, 0.5, 12);
    } else if (kind === PK.Meteor) {
      this.ev(EV.Meteor, x, y, 70);
      this.aoeDamage(s, x, y, 70, this.pDmg[p], -1, 1.6, 80);
    }
  }

  private stepProjectiles(dt: number) {
    const g = WORLD.gravity;
    for (let p = 0; p < this.pHi; p++) {
      if (!this.pAlive[p]) continue;
      const kind = this.pKind[p];
      this.pPX[p] = this.pX[p];
      this.pPZ[p] = this.pZ[p];
      const gg = kind === PK.Bolt || kind === PK.Dark ? g * 0.35 : g;
      this.pX[p] += this.pVx[p] * dt;
      this.pY[p] += this.pVy[p] * dt;
      this.pZ[p] += this.pVz[p] * dt;
      this.pVz[p] -= gg * dt;
      this.pT[p] += dt;
      if (this.pT[p] >= this.pTtl[p]) {
        this.pZ[p] = 0;
        this.pAlive[p] = 0;
        this.pFree.push(p);
        this.landProjectile(p);
      }
    }
  }

  // ------------------------------------------------------------------ commands
  canUse(k: number): boolean {
    return k < this.setup.commands.length && !this.commandsUsed[k] && !this.finished;
  }

  useCommand(k: number): boolean {
    if (!this.canUse(k)) return false;
    this.commandsUsed[k] = true;
    const id = this.setup.commands[k];
    this.ev(EV.Command, k);
    this.applyCommand(id);
    return true;
  }

  private applyCommand(id: CommandId) {
    const c = COMMANDS[id];
    if (id === 'charge') this.chargeT = c.duration;
    else if (id === 'hold') this.holdT = c.duration;
    else if (id === 'volley') {
      for (let i = 0; i < this.hi; i++) {
        if (!this.alive[i] || this.side[i] !== 0) continue;
        const b = TYPE_BEHAVIOR[this.type[i]];
        if (b !== 1 && b !== 2) continue;
        const reachRange = this.range[i] * 1.3;
        const n = b === 1 ? (1 + this.extraArrows(i)) * c.power : 2;
        for (let k = 0; k < n; k++) {
          const t = this.pickRangedTarget(0, this.x[i], reachRange);
          if (b === 1) this.fireArrow(i, t, 1.5);
          else this.fireBolt(i, t);
        }
        this.cool[i] = this.cooldown[i];
        this.anim[i] = 0.3;
      }
    } else if (id === 'rally') {
      const dl = this.deaths[0];
      const n = Math.min(c.power, dl.length);
      const ps = this.setup.player;
      for (let k = 0; k < n; k++) {
        const d = dl.pop()!;
        const st = d.slot >= 0 ? ps.slots[d.slot] : ps.minion;
        const j = this.spawn(0, st, d.slot, d.x, d.y, d.gen, d.slot < 0 ? F_MINION : 0);
        if (j >= 0) this.ev(EV.Raise, d.x, d.y, 0);
      }
    } else if (id === 'meteor') this.queueMeteors(3, 0.2);
    else if (id === 'raise') {
      let n = 0;
      const now = this.time;
      while (this.corpses.length && n < c.power) {
        const cp = this.corpses.pop()!;
        if (now - cp.t > SIM.corpseLife) continue;
        this.raiseAt(0, cp.x, cp.y);
        n++;
      }
    } else if (id === 'burst') {
      const ps = this.setup.player;
      const hi = this.hi;
      for (let i = 0; i < hi; i++) {
        if (!this.alive[i] || this.side[i] !== 0 || this.type[i] !== T_SWARM) continue;
        const st = ps.slots[this.slot[i]];
        if (!st) continue;
        const j = this.spawn(0, st, this.slot[i], this.x[i] + this.rng.range(-5, 5), this.y[i], this.gen[i]);
        if (j < 0) break;
        this.hp[j] = this.maxHp[j] = this.maxHp[i];
        this.dmg[j] = this.dmg[i];
        this.size[j] = this.size[i];
        this.launch(j, this.rng.range(-20, 60), this.rng.range(90, 150));
        this.ev(EV.Split, this.x[i], this.y[i], 0);
      }
    }
  }

  private extraArrows(i: number): number {
    return this.side[i] === 0 && this.type[i] === T_ARCHER ? this.quiverExtra : 0;
  }

  private fireBolt(i: number, t: number) {
    const s = this.side[i];
    const x = this.x[i];
    const tx = t >= 0 ? this.x[t] : s === 0 ? WORLD.enemyStatueX : WORLD.playerStatueX;
    const ty = t >= 0 ? this.y[t] : WORLD.laneDepth / 2;
    const ttl = Math.max(0.3, Math.abs(tx - x) / SIM.boltSpeed);
    this.newProj(PK.Bolt, s, x, this.y[i], 26 * this.size[i], tx, ty, ttl, this.dmg[i] * this.unitMult(i, -1), this.aoe[i], t);
    this.ev(EV.Shoot, x, this.y[i], PK.Bolt, s);
  }

  private raiseAt(s: number, x: number, y: number): number {
    const j = this.spawn(s, this.sideSetup(s).minion, -1, x, y, 0, F_MINION);
    if (j >= 0) {
      this.ev(EV.Raise, x, y, s);
      this.z[j] = 0;
    }
    return j;
  }

  // ------------------------------------------------------------------ main step
  step() {
    const dt = SIM.dt;
    this.tick++;
    this.time += dt;
    this.spawnStep(dt);
    this.rebuild();

    // side multipliers
    for (let s = 0; s < 2; s++) {
      const m = this.mods(s);
      let mult = 1;
      if (s === 0 && this.chargeT > 0) mult *= COMMANDS.charge.power;
      if (m.numbersPct > 0) {
        const b = Math.min(m.numbersCap, m.numbersPct * this.aliveCount[s]);
        mult *= 1 + b;
        if (s === 0) this.numbersBonus = b;
      }
      if (s === 0 && this.chainStacks) mult *= Math.pow(m.chainMult, this.chainStacks);
      if (s === 1 && this.bossIdx >= 0 && this.alive[this.bossIdx] && this.type[this.bossIdx] === UNIT_INDEX.warlord) {
        mult *= BOSS.warlord.aura;
        if (this.cryT > 0) mult *= BOSS.warlord.cryMult;
      }
      this.sideMult[s] = mult;
    }
    if (this.setup.player.mods.numbersPct > 0) {
      this.numbersTimer -= dt;
      if (this.numbersTimer <= 0) {
        this.numbersTimer = 1;
        this.trig('strength_in_numbers', Math.round(this.numbersBonus * 100), true);
      }
    }

    const cap0 = SIM.crowdBase + this.aliveCount[0] * SIM.crowdPerAlive;
    const cap1 = SIM.crowdBase + this.aliveCount[1] * SIM.crowdPerAlive;
    const g = WORLD.gravity;
    const hiNow = this.hi;
    for (let i = 0; i < hiNow; i++) {
      if (!this.alive[i]) continue;
      this.px[i] = this.x[i];
      this.pz[i] = this.z[i];
      if (this.hurt[i] > 0) this.hurt[i] -= dt;
      if (this.anim[i] > 0) this.anim[i] -= dt;
      const s = this.side[i];
      if (this.state[i] === 2) {
        // airborne
        this.airT[i] += dt;
        this.x[i] += this.vx[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.vz[i] -= g * dt;
        if (this.x[i] < 10) this.x[i] = 10;
        else if (this.x[i] > WORLD.length - 10) this.x[i] = WORLD.length - 10;
        if (this.z[i] <= 0) {
          this.z[i] = 0;
          this.state[i] = 0;
          this.cool[i] = Math.max(this.cool[i], 0.35);
          if (this.flags[i] & F_THROWN) {
            this.flags[i] &= ~F_THROWN;
            // land on own army: damage dealt by the thrower's side
            this.ev(EV.Land, this.x[i], this.y[i], this.thrownDmg[i]);
            this.aoeDamage(1 - s, this.x[i], this.y[i], 22, this.thrownDmg[i], -1, 0, 10);
            this.damage(i, this.thrownDmg[i] * 0.5, -1);
            if (s === 1) this.trig('catapult_arms');
          }
        }
        continue;
      }
      this.cool[i] -= dt;
      this.updateUnit(i, s, dt, s === 0 ? cap0 : cap1);
    }

    // explosions queued from lich crown
    while (this.pendingExplosions.length) {
      const amt = this.pendingExplosions.pop()!;
      const s = this.pendingExplosions.pop()!;
      const y = this.pendingExplosions.pop()!;
      const x = this.pendingExplosions.pop()!;
      this.ev(EV.Explode, x, y, 30, s);
      this.aoeDamage(s, x, y, 30, amt * this.sideMult[s], -1, 0.4, 16);
      if (s === 0) this.trig('lich_crown');
    }
    // meteors
    if (this.pendingMeteors.length) {
      for (let k = this.pendingMeteors.length - 1; k >= 0; k--) {
        const m = this.pendingMeteors[k];
        if (m.t > this.time) continue;
        this.pendingMeteors.splice(k, 1);
        const tx = Math.min(WORLD.enemyStatueX - 20, this.front[1] + this.rng.range(0, 90));
        const ty = this.rng.range(20, WORLD.laneDepth - 20);
        this.newProj(PK.Meteor, 0, tx - 160, ty, 600, tx, ty, 0.7, m.dmg, 70, -1);
      }
    }
    this.stepProjectiles(dt);

    if (this.chargeT > 0) this.chargeT -= dt;
    if (this.holdT > 0) this.holdT -= dt;
    if (this.cryT > 0) this.cryT -= dt;
    if (this.tick % 30 === 0) {
      const now = this.time;
      while (this.corpses.length && now - this.corpses[0].t > SIM.corpseLife) this.corpses.shift();
    }

    if (!this.finished) this.checkEnd();
  }

  private moveForward(i: number, s: number, dt: number, cap: number, mult = 1) {
    const dir = s === 0 ? 1 : -1;
    if (s === 0 && this.holdT > 0 && this.x[i] >= this.front[0] - 120) return;
    let sp = this.speed[i] * mult;
    if (s === 0 && this.chargeT > 0) sp *= 1.8;
    const x = this.x[i];
    let nx = x + dir * sp * dt;
    // don't walk through the enemy front
    const ef = this.front[1 - s];
    const lim = ef - dir * Math.max(4, this.reach[i] * 0.6);
    if ((nx - lim) * dir > 0) nx = (x - lim) * dir > 0 ? x : lim;
    const b = this.binOf(nx);
    if (b !== this.binOf(x) && this.binCount[s * this.nb + b] >= cap) {
      // crowded: shuffle sideways a little instead
      this.y[i] += this.rng.range(-1.5, 1.5);
      if (this.y[i] < 2) this.y[i] = 2;
      else if (this.y[i] > WORLD.laneDepth - 2) this.y[i] = WORLD.laneDepth - 2;
      return;
    }
    const sx = s === 0 ? WORLD.enemyStatueX - WORLD.statueHalfWidth : WORLD.playerStatueX + WORLD.statueHalfWidth;
    if ((nx - sx) * dir > 0) nx = sx;
    this.x[i] = nx;
    this.walk[i] += sp * dt * 0.12;
    this.state[i] = 0;
  }

  private moveBack(i: number, s: number, dt: number) {
    const dir = s === 0 ? 1 : -1;
    const home = s === 0 ? WORLD.playerStatueX + 30 : WORLD.enemyStatueX - 30;
    const nx = this.x[i] - dir * this.speed[i] * 0.6 * dt;
    if ((nx - home) * dir > 0) {
      this.x[i] = nx;
      this.walk[i] -= this.speed[i] * dt * 0.08;
    }
  }

  private statueInReach(i: number, s: number, r: number): boolean {
    const sx = s === 0 ? WORLD.enemyStatueX : WORLD.playerStatueX;
    return Math.abs(sx - this.x[i]) <= r + WORLD.statueHalfWidth;
  }

  private updateUnit(i: number, s: number, dt: number, cap: number) {
    const beh = TYPE_BEHAVIOR[this.type[i]];
    const dir = s === 0 ? 1 : -1;
    const x = this.x[i];
    switch (beh) {
      case 0: // melee
      case 5: // giant
      case 6: // warlord
      case 7: {
        // golem
        const r = this.reach[i] + 2;
        let t = this.target[i];
        if (t < 0 || !this.alive[t] || this.state[t] === 2 || Math.abs(this.x[t] - x) > r) {
          t = this.nearestEnemy(s, x + dir * r * 0.3, this.y[i], r);
          this.target[i] = t;
        }
        if (beh === 6) this.warlordTick(i, dt);
        if (beh === 7 && this.golemTick(i, dt)) return;
        if (t >= 0) {
          this.state[i] = 1;
          if (this.cool[i] <= 0) {
            this.cool[i] = this.cooldown[i] * this.rng.range(0.9, 1.1);
            this.anim[i] = beh >= 5 ? 0.45 : 0.25;
            const amt = this.dmg[i] * this.unitMult(i, t);
            if (beh >= 5) {
              this.ev(EV.Swing, x + dir * r * 0.6, this.y[i], this.size[i], s);
              this.bigSwing(i, s, amt);
            } else {
              this.damage(t, amt, i, dir * this.rng.range(20, 50), this.rng.range(40, 90));
            }
          }
        } else if (this.statueInReach(i, s, r)) {
          this.state[i] = 1;
          if (this.cool[i] <= 0) {
            this.cool[i] = this.cooldown[i];
            this.anim[i] = 0.25;
            this.hitStatue(1 - s, this.dmg[i] * this.unitMult(i, -1) * (beh >= 5 ? 2 : 1));
          }
        } else this.moveForward(i, s, dt, cap);
        break;
      }
      case 1: // ranged
      case 2: // mage
      case 4: {
        // necro
        const es = 1 - s;
        const hasEnemy = this.aliveCount[es] > 0 && Math.abs(this.front[es] - x) < 2000;
        const tgtX = hasEnemy ? this.front[es] : s === 0 ? WORLD.enemyStatueX : WORLD.playerStatueX;
        const dist = (tgtX - x) * dir;
        const range = this.range[i];
        if (beh === 4) this.necroTick(i, s, dt);
        if (dist <= range) {
          this.state[i] = 1;
          if (dist < 35 && hasEnemy) this.moveBack(i, s, dt);
          const t0 = this.cool[i] <= 0 && hasEnemy ? this.pickRangedTarget(s, x, range) : -1;
          if (this.cool[i] <= 0 && hasEnemy && t0 < 0) this.cool[i] = 0.2; // nothing in reach yet
          else if (this.cool[i] <= 0) {
            this.cool[i] = this.cooldown[i] * this.rng.range(0.9, 1.15);
            this.anim[i] = 0.3;
            if (beh === 1) {
              const n = 1 + this.extraArrows(i);
              for (let k = 0; k < n; k++) {
                const tk = k === 0 || !hasEnemy ? t0 : this.pickRangedTarget(s, x, range);
                this.fireArrow(i, tk < 0 && hasEnemy ? t0 : tk, n > 1 ? 1.5 : 0);
              }
              this.ev(EV.Shoot, x, this.y[i], PK.Arrow, s, n);
              if (n > 1) this.trig('shield_quiver', n - 1);
            } else if (beh === 2) {
              this.fireBolt(i, t0);
            } else {
              const t = t0;
              const tx = t >= 0 ? this.x[t] : tgtX;
              const ttl = Math.max(0.3, Math.abs(tx - x) / SIM.boltSpeed);
              this.newProj(PK.Dark, s, x, this.y[i], 24, tx, t >= 0 ? this.y[t] : 60, ttl, this.dmg[i] * this.unitMult(i, t), 0, t);
              this.ev(EV.Shoot, x, this.y[i], PK.Dark, s);
            }
          }
        }
        if (dist > range * 0.92) this.moveForward(i, s, dt, cap);
        break;
      }
      case 3: {
        // support: follow the army, heal the most hurt ally in range
        const goal = this.front[s] - dir * 45;
        if ((goal - x) * dir > 6) this.moveForward(i, s, dt, cap);
        else if ((goal - x) * dir < -30) this.moveBack(i, s, dt);
        else this.state[i] = 1;
        if (this.cool[i] <= 0) {
          const t = this.mostHurtAlly(s, x, this.range[i]);
          if (t >= 0) {
            const amt = this.dmg[i] * this.unitMult(i, -1) / this.sideMult[s];
            this.hp[t] = Math.min(this.maxHp[t], this.hp[t] + amt);
            this.cool[i] = this.cooldown[i];
            this.anim[i] = 0.3;
            this.ev(EV.Heal, this.x[t], this.y[t], amt);
            const m = this.mods(s);
            if (m.chant > 0 && this.stacks[t] < m.chantMax) {
              this.stacks[t]++;
              if (s === 0) this.trig('war_chant');
            }
          } else this.cool[i] = 0.3;
        }
        break;
      }
    }
  }

  private mostHurtAlly(s: number, x: number, r: number): number {
    const b0 = this.binOf(x - r);
    const b1 = this.binOf(x + r);
    const base = s * this.nb;
    let best = -1;
    let bf = 0.97;
    for (let b = b0; b <= b1; b++) {
      for (let j = this.head[base + b]; j >= 0; j = this.next[j]) {
        const f = this.hp[j] / this.maxHp[j];
        if (f < bf) {
          bf = f;
          best = j;
        }
      }
    }
    return best;
  }

  private bigSwing(i: number, s: number, amt: number) {
    const dir = s === 0 ? 1 : -1;
    const cx = this.x[i] + dir * (this.reach[i] * 0.6);
    const r = this.aoe[i];
    const es = 1 - s;
    const b0 = this.binOf(cx - r);
    const b1 = this.binOf(cx + r);
    const base = es * this.nb;
    const victims: number[] = [];
    for (let b = b0; b <= b1 && victims.length < 14; b++)
      for (let j = this.head[base + b]; j >= 0 && victims.length < 14; j = this.next[j]) {
        if (this.state[j] === 2) continue;
        if (Math.abs(this.x[j] - cx) <= r && Math.abs(this.y[j] - this.y[i]) < r * 1.8) victims.push(j);
      }
    const m = this.mods(s);
    const throwF = TYPE_BEHAVIOR[this.type[i]] === 5 ? m.giantThrow : 0;
    const kn = this.knock[i];
    for (const j of victims) {
      const big = TYPE_BIG[this.type[j]];
      const vx = dir * this.rng.range(70, 150) * kn;
      const vz = this.rng.range(150, 260) * Math.sqrt(kn);
      const mult = big ? TYPE_BIGBONUS[this.type[i]] : 1;
      const killed = this.damage(j, amt * mult, i, vx * 1.3, vz * 1.2);
      if (!killed && !big && kn > 0) {
        this.launch(j, vx, vz);
        if (throwF > 0) {
          this.flags[j] |= F_THROWN;
          this.thrownDmg[j] = amt * throwF;
          if (s === 0) this.trig('catapult_arms');
        }
      } else if (killed && throwF > 0 && !big) {
        // dead bodies become projectiles
        const tx = this.x[j] + vx * 1.2;
        this.newProj(PK.Body, s, this.x[j], this.y[j], 10, tx, this.y[j] + this.rng.range(-10, 10), Math.max(0.5, (vz * 2.4) / WORLD.gravity), amt * throwF, 24, -1, 0, this.type[j]);
        if (s === 0) this.trig('catapult_arms');
      }
    }
    if (victims.length === 0 && this.statueInReach(i, s, this.reach[i] + 4)) this.hitStatue(es, amt * 2);
  }

  private warlordTick(i: number, dt: number) {
    this.special[i] -= dt;
    if (this.special[i] <= 0) {
      this.special[i] = BOSS.warlord.cryEvery;
      this.cryT = BOSS.warlord.cryTime;
      this.ev(EV.Cry, this.x[i], this.y[i]);
    }
  }

  private golemTick(i: number, dt: number): boolean {
    this.special[i] -= dt;
    if (this.special[i] > 0) return false;
    const s = this.side[i];
    const dir = s === 0 ? 1 : -1;
    const ef = this.front[1 - s];
    const R = BOSS.golem.slamRadius;
    if (this.aliveCount[1 - s] === 0 || Math.abs(ef - this.x[i]) > R) {
      this.special[i] = 0.5;
      return false;
    }
    this.special[i] = BOSS.golem.slamEvery;
    this.anim[i] = 0.6;
    const cx = this.x[i] + dir * R * 0.5;
    this.ev(EV.Slam, cx, this.y[i], R, s);
    this.aoeDamage(s, cx, WORLD.laneDepth / 2, R * 0.75, BOSS.golem.slamDmg * this.sideMult[s] * this.setupStatMult(), i, BOSS.golem.slamKnock, 120);
    return true;
  }

  private setupStatMult(): number {
    return ENEMY.statMult(this.setup.battleIndex);
  }

  private necroTick(i: number, s: number, dt: number) {
    const m = this.mods(s);
    this.special[i] -= dt * m.raiseSpeed;
    if (this.special[i] > 0) return;
    this.special[i] = UNITS.necromancer.raiseCooldown;
    const r = this.range[i] * m.raiseRange;
    const x = this.x[i];
    const now = this.time;
    let best = -1;
    let bd = r;
    for (let k = this.corpses.length - 1; k >= 0; k--) {
      const c = this.corpses[k];
      if (now - c.t > SIM.corpseLife) break;
      const d = Math.abs(c.x - x);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) {
      this.special[i] = 0.3;
      return;
    }
    const c = this.corpses[best];
    this.corpses.splice(best, 1);
    for (let k = 0; k < m.raisePerCorpse; k++) this.raiseAt(s, c.x + k * 5 * (s === 0 ? 1 : -1), c.y);
    if (s === 0) {
      if (m.raisePerCorpse > 1) this.trig('soul_harvest', m.raisePerCorpse - 1);
      if (m.raiseSpeed > 1) this.trig('gravedigger');
      if (m.minionBlade) this.trig('grave_pact', m.raisePerCorpse);
    }
  }

  private checkEnd() {
    if (this.time >= SIM.timeLimit) {
      const score = (s: number) => {
        let hp = 0;
        for (let i = 0; i < this.hi; i++) if (this.alive[i] && this.side[i] === s) hp += this.hp[i];
        return this.statueHp[s] / this.statueMax[s] + 0.5 * (hp / Math.max(1, this.initialHp[s]));
      };
      this.finish(score(0) > score(1) ? 0 : 1, true);
      return;
    }
    if (!this.deploying && this.aliveCount[0] === 0 && this.aliveCount[1] === 0 && !this.pendingMeteors.length) {
      const f0 = this.statueHp[0] / this.statueMax[0];
      const f1 = this.statueHp[1] / this.statueMax[1];
      this.finish(f0 > f1 ? 0 : 1, false);
    }
  }

  private finish(winner: 0 | 1, timedOut: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.result = {
      winner,
      time: this.time,
      timedOut,
      playerStatueFrac: this.statueHp[0] / this.statueMax[0],
      enemyStatueFrac: this.statueHp[1] / this.statueMax[1],
      spawned: [this.spawned[0], this.spawned[1]],
      kills: [this.kills[0], this.kills[1]],
      peakAlive: [this.peakAlive[0], this.peakAlive[1]],
      biggestHit: this.biggestHit,
      relicTriggers: { ...this.relicTotals },
      bountyGold: this.bountyGold,
    };
  }

  /** run headless until finished */
  run(maxTicks = Math.ceil(SIM.timeLimit / SIM.dt) + 10): BattleResult {
    this.emitEvents = false;
    while (!this.finished && this.tick < maxTicks) this.step();
    return this.result!;
  }
}

export function unitTypeId(idx: number): UnitId {
  return UNIT_IDS[idx];
}

export { JUICE };
