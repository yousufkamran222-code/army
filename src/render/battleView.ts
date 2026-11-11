// Pixi renderer for a Battle: interpolated stickmen, projectiles, ragdolls, FX, camera and juice.

import { Application, BitmapFont, BitmapText, Container, Graphics, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { JUICE, SIM, WORLD } from '../config/tuning';
import { UNITS, UNIT_IDS, type Behavior } from '../config/units';
import { Battle, EV, EV_STRIDE, PK } from '../sim/battle';
import type { BattleResult } from '../sim/types';
import { sfx } from '../audio/sfx';
import { buildAtlas, SIDE_COLORS, F_ATK, F_FLY, F_HURT, WALK_FRAMES, ATK_FRAMES, type Atlas, type FxName } from './atlas';
import { buildBackground, buildGround, type Parallax } from './background';

export const DEPTH = 0.72; // world depth (y) -> screen units

const TYPE_BEH: Behavior[] = UNIT_IDS.map((id) => UNITS[id].behavior);
const ANIM_DUR = TYPE_BEH.map((b) => (b === 'giant' || b === 'warlord' || b === 'golem' ? 0.45 : b === 'ranged' || b === 'mage' || b === 'necro' || b === 'support' ? 0.3 : 0.25));

interface Fx {
  p: Particle;
  x: number;
  y: number; // screen-space y (already depth-mapped)
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  rot: number;
  vr: number;
  s0: number;
  s1: number;
  a0: number;
}

interface Ragdoll {
  p: Particle;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  rot: number;
  vr: number;
  t: number;
  flip: number;
  sc: number;
  landed: boolean;
}

interface DmgNum {
  t: BitmapText;
  x: number;
  y: number;
  life: number;
}

export interface ViewHooks {
  onRelic?: (id: string, n: number, set: boolean) => void;
  onFinish?: (r: BattleResult) => void;
  onBanner?: (text: string, color: string) => void;
}

class FxPool {
  pc: ParticleContainer;
  list: Fx[] = [];
  free: Particle[] = [];
  constructor(
    public max: number,
    blend: 'normal' | 'add',
  ) {
    this.pc = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.pc.blendMode = blend;
  }
  add(tex: Texture, x: number, y: number, vx: number, vy: number, g: number, life: number, s0: number, s1: number, tint: number, alpha = 1, vr = 0) {
    if (this.list.length >= this.max) return;
    const p = this.free.pop() ?? new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
    p.texture = tex;
    p.tint = tint;
    p.alpha = alpha;
    this.list.push({ p, x, y, vx, vy, g, life, max: life, rot: Math.random() * 6.28, vr, s0, s1, a0: alpha });
  }
  update(dt: number) {
    const ch = this.pc.particleChildren;
    ch.length = 0;
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const f = l[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.free.push(f.p);
        l[i] = l[l.length - 1];
        l.pop();
        continue;
      }
      f.vy += f.g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      const k = 1 - f.life / f.max;
      const s = f.s0 + (f.s1 - f.s0) * k;
      const p = f.p;
      p.x = f.x;
      p.y = f.y;
      p.scaleX = p.scaleY = s;
      p.rotation = f.rot;
      p.alpha = f.a0 * (1 - k * k);
    }
    for (const f of l) ch.push(f.p);
    this.pc.update();
  }
  clear() {
    for (const f of this.list) this.free.push(f.p);
    this.list.length = 0;
    this.pc.particleChildren.length = 0;
    this.pc.update();
  }
}

export class BattleView {
  app: Application;
  atlas: Atlas;
  battle: Battle | null = null;
  hooks: ViewHooks = {};
  speed = 1;
  paused = false;
  showNumbers = true;

  private bg: Parallax;
  private world = new Container();
  private ground: Graphics;
  private statues: Graphics[] = [];
  private statueFall = [0, 0];
  private statueFlash = [0, 0];
  private corpsePC: ParticleContainer;
  private unitPC: ParticleContainer;
  private projPC: ParticleContainer;
  private fxN: FxPool;
  private fxA: FxPool;
  private numLayer = new Container();
  private unitPool: Particle[] = [];
  private projPool: Particle[] = [];
  private ragdolls: Ragdoll[] = [];
  private ragFree: Particle[] = [];
  private nums: DmgNum[] = [];
  private numFree: BitmapText[] = [];
  private numGap = 0;
  private order = new Int32Array(SIM.maxUnits);
  private bucket = new Int32Array(130);

  private acc = 0;
  private hitStop = 0;
  private slowMo = 0;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private camX = WORLD.length / 2;
  private camW = WORLD.length;
  private time = 0;
  private finishT = -1;
  private finishedSent = false;
  private sndClash = 0;

  constructor(app: Application) {
    this.app = app;
    this.atlas = buildAtlas(Math.min(4096, (app.renderer as unknown as { gl?: WebGLRenderingContext }).gl?.getParameter(0x0d33) ?? 2048, 2048));
    BitmapFont.install({
      name: 'dmg',
      style: { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: 36, fill: '#ffffff', stroke: { color: '#000000', width: 5 }, fontWeight: '900' },
      chars: [['0', '9'], '+-×!%.kKx '],
      resolution: 1,
    });
    this.bg = buildBackground();
    this.ground = buildGround(WORLD.laneDepth * DEPTH + 6);
    this.corpsePC = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.unitPC = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.projPC = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.fxN = new FxPool(JUICE.maxSparks, 'normal');
    this.fxA = new FxPool(JUICE.maxSparks, 'add');
    for (let s = 0; s < 2; s++) {
      const g = this.drawStatue(s);
      this.statues.push(g);
    }
    this.world.addChild(this.ground, this.statues[0], this.statues[1], this.corpsePC, this.fxN.pc, this.unitPC, this.projPC, this.fxA.pc, this.numLayer);
    app.stage.addChild(this.bg.root, this.world);
    this.bg.root.visible = this.world.visible = false;
  }

  private drawStatue(side: number): Graphics {
    const col = SIDE_COLORS[side];
    const g = new Graphics();
    const dir = side === 0 ? 1 : -1;
    // pedestal
    g.rect(-24, -14, 48, 14).fill(0x9a9690).stroke({ width: 1.5, color: 0x5a5650 });
    g.rect(-18, -24, 36, 10).fill(0xb4b0a8).stroke({ width: 1.5, color: 0x5a5650 });
    // stick hero
    const c = col.hex;
    const w = 5;
    g.moveTo(0, -24).lineTo(-8, -50).stroke({ width: w, color: c, cap: 'round' });
    g.moveTo(0, -24).lineTo(8 * dir, -50).stroke({ width: w, color: c, cap: 'round' });
    g.moveTo(0, -50).lineTo(0, -82).stroke({ width: w + 1, color: c, cap: 'round' });
    g.circle(0, -92, 10).fill(c);
    g.moveTo(0, -76).lineTo(16 * dir, -96).stroke({ width: w, color: c, cap: 'round' });
    g.moveTo(0, -76).lineTo(-12 * dir, -62).stroke({ width: w, color: c, cap: 'round' });
    // sword raised
    g.moveTo(16 * dir, -96).lineTo(26 * dir, -126).stroke({ width: 4, color: 0xe8ecf2, cap: 'round' });
    // banner pole + flag
    g.moveTo(-20 * dir, -14).lineTo(-20 * dir, -120).stroke({ width: 2.5, color: 0x6a4a2a });
    g.poly([-20 * dir, -120, -50 * dir, -112, -20 * dir, -102]).fill(c);
    g.position.set(side === 0 ? WORLD.playerStatueX : WORLD.enemyStatueX, WORLD.laneDepth * DEPTH * 0.5 + 6);
    return g;
  }

  show(v: boolean) {
    this.bg.root.visible = this.world.visible = v;
  }

  start(b: Battle) {
    this.battle = b;
    this.acc = 0;
    this.hitStop = 0;
    this.slowMo = 0;
    this.shake = 0;
    this.finishT = -1;
    this.finishedSent = false;
    this.camX = WORLD.length / 2;
    this.camW = WORLD.length + 80;
    this.time = 0;
    this.statueFall = [0, 0];
    for (let s = 0; s < 2; s++) {
      const g = this.statues[s];
      g.rotation = 0;
      g.alpha = 1;
      g.position.y = WORLD.laneDepth * DEPTH * 0.5 + 6;
      g.tint = 0xffffff;
    }
    for (const r of this.ragdolls) this.ragFree.push(r.p);
    this.ragdolls.length = 0;
    for (const n of this.nums) {
      n.t.visible = false;
      this.numFree.push(n.t);
    }
    this.nums.length = 0;
    this.fxN.clear();
    this.fxA.clear();
    this.show(true);
  }

  stop() {
    this.battle = null;
    this.show(false);
  }

  // ------------------------------------------------------------------ frame
  update(dtReal: number) {
    const b = this.battle;
    if (!b) return;
    dtReal = Math.min(dtReal, 0.1);
    let scale = this.paused ? 0 : this.speed;
    if (this.slowMo > 0) {
      this.slowMo -= dtReal;
      scale *= JUICE.statueSlowMo;
    }
    let simDt = dtReal * scale;
    if (this.hitStop > 0) {
      this.hitStop -= dtReal;
      simDt = 0;
    }
    this.acc += simDt;
    let steps = 0;
    while (this.acc >= SIM.dt && steps < 10) {
      b.step();
      this.handleEvents(b);
      this.acc -= SIM.dt;
      steps++;
    }
    if (steps >= 10) this.acc = 0;
    const alpha = Math.min(1, this.acc / SIM.dt);
    const fxDt = simDt;
    this.time += fxDt;

    if (b.finished && this.finishT < 0) this.finishT = 0;
    if (this.finishT >= 0) {
      this.finishT += dtReal;
      if (this.finishT > JUICE.statueSlowMoTime + 0.4 && !this.finishedSent) {
        this.finishedSent = true;
        this.hooks.onFinish?.(b.result!);
      }
    }
    for (const [id, p] of b.relicPulse) this.hooks.onRelic?.(id, p.n, p.set);
    b.relicPulse.clear();

    this.updateCamera(b, dtReal);
    this.drawUnits(b, alpha);
    this.drawProjectiles(b, alpha);
    this.updateRagdolls(fxDt);
    this.fxN.update(fxDt);
    this.fxA.update(fxDt);
    this.updateNums(dtReal);
    this.updateStatues(b, dtReal);
    this.updateBackground(dtReal);
  }

  private updateCamera(b: Battle, dt: number) {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    // frame the action: everything alive, gently following the front lines
    let minX = 1e9;
    let maxX = -1e9;
    for (let i = 0; i < b.hi; i++) {
      if (!b.alive[i]) continue;
      const x = b.x[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (minX > maxX || b.deploying) {
      minX = WORLD.playerStatueX - 40;
      maxX = WORLD.enemyStatueX + 40;
    }
    if (b.finished) {
      const s = b.result!.winner === 0 ? 1 : 0;
      const sx = s === 0 ? WORLD.playerStatueX : WORLD.enemyStatueX;
      minX = Math.min(minX, sx - 150);
      maxX = Math.max(maxX, sx + 150);
    }
    const tW = Math.max(JUICE.cameraMinView, Math.min(WORLD.length + 80, maxX - minX + 260));
    let tX = (minX + maxX) / 2;
    tX = Math.max(tW / 2 - 40, Math.min(WORLD.length + 40 - tW / 2, tX));
    const k = 1 - Math.exp(-JUICE.cameraLerp * dt);
    this.camW += (tW - this.camW) * k;
    this.camX += (tX - this.camX) * k;
    // fit: width, but also keep the lane readable vertically
    let zoom = Math.min(W / this.camW, H / 250);
    // portrait phones: crop the sides and follow the action instead of shrinking to a sliver
    if (H > W) zoom = Math.max(zoom, Math.min(H / 900, W / 520));
    // shake
    this.shake *= Math.exp(-JUICE.shakeDecay * dt);
    if (this.shake < 0.2) this.shake = 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shake;
    this.shakeY = (Math.random() * 2 - 1) * this.shake;
    const viewW = W / zoom;
    if (viewW < this.camW) {
      // keep the camera on the front line when cropped
      const fx = b.aliveCount[0] && b.aliveCount[1] ? (b.front[0] + b.front[1]) / 2 : this.camX;
      this.camX += (Math.max(viewW / 2 - 40, Math.min(WORLD.length + 40 - viewW / 2, fx)) - this.camX) * k;
    }
    this.world.scale.set(zoom);
    this.world.x = W / 2 - this.camX * zoom + this.shakeX;
    this.world.y = H * (H > W ? 0.56 : 0.6) - WORLD.laneDepth * DEPTH * 0.5 * zoom + this.shakeY;
    this.zoom = zoom;
  }
  zoom = 1;

  private updateBackground(dt: number) {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const bg = this.bg;
    bg.sky.width = W;
    bg.sky.height = H;
    for (const l of bg.layers) {
      l.c.scale.set(this.zoom);
      l.c.x = W / 2 - this.camX * this.zoom * l.f + this.shakeX * l.f;
      l.c.y = this.world.y;
    }
    for (const c of bg.clouds) {
      c.s.x += c.v * dt;
      if (c.s.x > 2800) c.s.x = -1200;
    }
  }

  private drawUnits(b: Battle, alpha: number) {
    const A = this.atlas;
    const inv = 1 / A.res;
    // counting sort by depth so back rows draw first
    const bucket = this.bucket;
    bucket.fill(0);
    const hi = b.hi;
    let n = 0;
    for (let i = 0; i < hi; i++) {
      if (!b.alive[i]) continue;
      bucket[Math.min(127, Math.max(0, b.y[i] | 0)) + 1]++;
      n++;
    }
    for (let k = 1; k < 130; k++) bucket[k] += bucket[k - 1];
    const order = this.order;
    for (let i = 0; i < hi; i++) {
      if (!b.alive[i]) continue;
      order[bucket[Math.min(127, Math.max(0, b.y[i] | 0))]++] = i;
    }
    const pool = this.unitPool;
    while (pool.length < n) pool.push(new Particle({ texture: A.frames[0][0][0], anchorX: 0.5, anchorY: 0.9 }));
    const ch = this.unitPC.particleChildren;
    ch.length = 0;
    const t = this.time;
    for (let k = 0; k < n; k++) {
      const i = order[k];
      const p = pool[k];
      const ty = b.type[i];
      const side = b.side[i];
      const fr = A.frames[ty][side];
      let f: number;
      let rot = 0;
      const st = b.state[i];
      if (st === 2) {
        f = F_FLY;
        rot = b.airT[i] * (i & 1 ? 9 : -9) * (side === 0 ? -1 : 1);
      } else if (b.anim[i] > 0) {
        const d = ANIM_DUR[ty];
        f = F_ATK + Math.min(ATK_FRAMES - 1, Math.floor((1 - b.anim[i] / d) * ATK_FRAMES));
      } else if (b.hurt[i] > 0.05) f = F_HURT;
      else if (st === 0) f = (b.walk[i] | 0) % WALK_FRAMES;
      else f = ((t * 2 + i * 0.37) | 0) % 2 === 0 ? 0 : 3;
      p.texture = fr[f];
      const x = b.px[i] + (b.x[i] - b.px[i]) * alpha;
      const z = b.pz[i] + (b.z[i] - b.pz[i]) * alpha;
      const depth = b.y[i];
      const persp = 0.92 + 0.08 * (depth / WORLD.laneDepth);
      const sc = (b.size[i] / A.drawSize[ty]) * inv * persp;
      p.x = x;
      p.y = depth * DEPTH - z;
      p.scaleX = side === 0 ? sc : -sc;
      p.scaleY = sc;
      p.anchorX = 0.5;
      p.anchorY = st === 2 ? 0.6 : A.anchorY[ty];
      p.rotation = rot;
      p.alpha = b.flags[i] & 1 ? 0.8 : 1;
      p.tint = b.hurt[i] > 0.06 ? 0xffd0c0 : 0xffffff;
      ch.push(p);
    }
    this.unitPC.update();
  }

  private drawProjectiles(b: Battle, alpha: number) {
    const A = this.atlas;
    const pool = this.projPool;
    const ch = this.projPC.particleChildren;
    ch.length = 0;
    let k = 0;
    const inv = 1 / A.res / 1.5;
    for (let p = 0; p < b.pHi; p++) {
      if (!b.pAlive[p]) continue;
      if (k >= pool.length) pool.push(new Particle({ texture: A.fx.arrow, anchorX: 0.5, anchorY: 0.5 }));
      const q = pool[k++];
      const kind = b.pKind[p];
      const x = b.pPX[p] + (b.pX[p] - b.pPX[p]) * alpha;
      const z = b.pPZ[p] + (b.pZ[p] - b.pPZ[p]) * alpha;
      const y = b.pY[p] * DEPTH - z;
      q.x = x;
      q.y = y;
      q.tint = 0xffffff;
      q.alpha = 1;
      if (kind === PK.Arrow) {
        q.texture = A.fx.arrow;
        const vx = b.pVx[p];
        const vz = b.pVz[p];
        q.rotation = Math.atan2(-vz, vx);
        q.scaleX = q.scaleY = inv * 0.9;
      } else if (kind === PK.Body) {
        const ty = b.pType[p];
        q.texture = A.frames[ty][1 - b.pSide[p]][F_FLY];
        q.rotation = b.pT[p] * 10;
        q.scaleX = q.scaleY = UNITS[UNIT_IDS[ty]].size / A.drawSize[ty] / A.res;
      } else if (kind === PK.Meteor) {
        q.texture = A.fx.meteor;
        q.rotation = 0;
        q.scaleX = q.scaleY = inv * 2.6;
        if (Math.random() < 0.7) this.fxA.add(A.fx.glow, x, y, (Math.random() - 0.5) * 20, -10, 0, 0.4, 1.2, 0.2, 0xff8030, 0.8);
      } else {
        q.texture = kind === PK.Bolt ? A.fx.bolt : A.fx.dark;
        q.rotation = 0;
        q.scaleX = q.scaleY = inv * 1.6;
        if (Math.random() < 0.3) this.fxA.add(A.fx.glow, x, y, 0, 0, 0, 0.25, 0.5, 0.1, kind === PK.Bolt ? 0x5ae0ff : 0xb45aff, 0.7);
      }
      ch.push(q);
    }
    this.projPC.update();
  }

  // ------------------------------------------------------------------ events
  private handleEvents(b: Battle) {
    const e = b.events;
    const A = this.atlas;
    const fx = A.fx;
    let hits = 0;
    let deaths = 0;
    for (let k = 0; k < e.length; k += EV_STRIDE) {
      const type = e[k];
      const x = e[k + 1];
      const y = e[k + 2] * DEPTH;
      switch (type) {
        case EV.Hit: {
          hits++;
          const amt = e[k + 3];
          const big = e[k + 5];
          if (hits < 30 || Math.random() < 0.15) {
            const sy = y - 12;
            this.fxA.add(fx.spark, x, sy, 0, 0, 0, 0.14, big ? 0.6 : 0.3, 0.05, big ? 0xfff0a0 : 0xffffff, 1, 0);
            if (big) for (let q = 0; q < 3; q++) this.fxA.add(fx.star, x, sy, (Math.random() - 0.5) * 160, -Math.random() * 140, 400, 0.4, 0.4, 0.1, 0xffe080);
          }
          if (this.showNumbers) this.damageNumber(x, y - 20, amt, e[k + 4] === 0 ? 0xffe0a0 : 0xa0c8ff, big === 1);
          break;
        }
        case EV.Death: {
          deaths++;
          const code = e[k + 3];
          this.addRagdoll(code % 32, (code / 32) | 0, x, e[k + 2], e[k + 4], e[k + 5], e[k + 6]);
          if (deaths < 3) sfx.play(e[k + 6] > 1.5 ? 'thud' : 'pop', 0.6);
          break;
        }
        case EV.Shoot:
          if (e[k + 3] === PK.Arrow) sfx.play('arrow', 0.5);
          else sfx.play('magic', 0.5);
          break;
        case EV.Split:
          for (let q = 0; q < 3; q++) this.fxA.add(fx.dust, x, y - 4, (Math.random() - 0.5) * 60, -Math.random() * 60, 100, 0.35, 0.3, 0.6, 0x9aff5a, 0.8);
          sfx.play('split', 0.5);
          break;
        case EV.Statue: {
          const side = e[k + 4];
          this.statueFlash[side] = 0.12;
          this.shake = Math.max(this.shake, 1.5);
          if (Math.random() < 0.3) this.fxN.add(fx.dust, x + (side === 0 ? 20 : -20), y - 30 + Math.random() * 30, (side === 0 ? 1 : -1) * 40, -30, 60, 0.6, 0.6, 1.4, 0xd8d0c0, 0.8);
          if (Math.random() < 0.2) sfx.play('thud', 0.4);
          break;
        }
        case EV.Slam: {
          const r = e[k + 3];
          this.shake = Math.max(this.shake, JUICE.shakeBoss);
          this.hitStop = Math.max(this.hitStop, JUICE.hitStopBoss);
          this.fxA.add(fx.ring, x, y, 0, 0, 0, 0.5, 0.4, (r / 14) * 1.2 / A.res, 0xffffff, 0.9);
          for (let q = 0; q < 24; q++) this.fxN.add(fx.dust, x + (Math.random() - 0.5) * r * 1.6, y + Math.random() * 20, (Math.random() - 0.5) * 120, -Math.random() * 120, 120, 0.9, 0.8, 2.2, 0xc8b490, 0.9);
          for (let q = 0; q < 12; q++) this.fxN.add(fx.chunk, x + (Math.random() - 0.5) * r, y, (Math.random() - 0.5) * 300, -150 - Math.random() * 250, 700, 0.8, 0.8, 0.6, 0x8a7a5a, 1, (Math.random() - 0.5) * 20);
          sfx.play('boom', 1);
          this.hooks.onBanner?.('SLAM!', '#c8ccd2');
          break;
        }
        case EV.Explode: {
          const r = e[k + 3];
          this.fxA.add(fx.glow, x, y - 6, 0, 0, 0, 0.3, 0.5, (r / 8) / A.res / 1.5, e[k + 4] === 0 ? 0x80e8ff : 0xb0a0ff, 0.9);
          this.fxA.add(fx.ring, x, y - 2, 0, 0, 0, 0.3, 0.2, (r / 14) / A.res / 1.5, 0xffffff, 0.7);
          if (Math.random() < 0.5) sfx.play('magic', 0.6);
          break;
        }
        case EV.Meteor: {
          this.shake = Math.max(this.shake, JUICE.shakeHeavy * 1.6);
          this.hitStop = Math.max(this.hitStop, JUICE.hitStopHeavy);
          this.fxA.add(fx.glow, x, y - 10, 0, 0, 0, 0.5, 2, 8 / A.res, 0xffa040, 1);
          this.fxA.add(fx.ring, x, y, 0, 0, 0, 0.5, 0.5, 6 / A.res, 0xffd080, 1);
          for (let q = 0; q < 16; q++) this.fxN.add(fx.chunk, x, y, (Math.random() - 0.5) * 400, -200 - Math.random() * 300, 700, 0.9, 0.9, 0.6, 0x5a4a3a, 1, 10);
          sfx.play('boom', 1);
          break;
        }
        case EV.Raise:
          this.fxA.add(fx.glow, x, y - 8, 0, -20, 0, 0.6, 0.6, 1.4, e[k + 3] === 0 ? 0x7affc8 : 0xb45aff, 0.9);
          if (Math.random() < 0.4) sfx.play('magic', 0.4);
          break;
        case EV.Heal:
          if (Math.random() < 0.5) this.fxA.add(fx.plus, x, y - 26, 0, -30, 0, 0.6, 0.5, 0.6, 0x80ff80, 0.9);
          break;
        case EV.Cry:
          this.shake = Math.max(this.shake, JUICE.shakeHeavy);
          this.fxA.add(fx.ring, x, y - 30, 0, 0, 0, 0.7, 0.5, 9 / A.res, 0xffcf3a, 1);
          sfx.play('horn');
          this.hooks.onBanner?.('WAR CRY! Enemies ×2 damage', '#ffcf3a');
          break;
        case EV.Land:
          this.fxN.add(fx.dust, x, y, 0, -10, 0, 0.5, 0.6, 1.5, 0xd8c8a0, 0.8);
          this.shake = Math.max(this.shake, 1.2);
          if (Math.random() < 0.3) sfx.play('thud', 0.5);
          break;
        case EV.Command:
          sfx.play('horn');
          break;
        case EV.StatueFall: {
          const side = e[k + 1];
          this.statueFall[side] = 0.001;
          this.slowMo = JUICE.statueSlowMoTime;
          this.shake = JUICE.shakeBoss;
          sfx.play('rumble');
          const sx = side === 0 ? WORLD.playerStatueX : WORLD.enemyStatueX;
          for (let q = 0; q < 40; q++) this.fxN.add(fx.dust, sx + (Math.random() - 0.5) * 60, 30 - Math.random() * 100, (Math.random() - 0.5) * 120, -Math.random() * 60, 40, 1.6, 1, 3, 0xd0c8b8, 0.9);
          for (let q = 0; q < 20; q++) this.fxN.add(fx.chunk, sx, -40 - Math.random() * 60, (Math.random() - 0.5) * 300, -100 - Math.random() * 200, 500, 1.4, 1.2, 0.8, 0x9a9690, 1, 8);
          break;
        }
        case EV.Swing: {
          const sz = e[k + 3];
          if (sz > 2.6) {
            this.shake = Math.max(this.shake, JUICE.shakeHeavy);
            this.hitStop = Math.max(this.hitStop, JUICE.hitStopBoss * 0.6);
          } else this.shake = Math.max(this.shake, JUICE.shakeHeavy * 0.4);
          this.fxN.add(fx.dust, x, y, 0, -10, 0, 0.5, 0.6, 1.6 * sz * 0.5, 0xd8c8a0, 0.7);
          sfx.play('thud', 0.7);
          break;
        }
      }
    }
    if (hits) {
      this.sndClash += hits;
      if (this.sndClash > 2) {
        sfx.play('clash', Math.min(1, 0.3 + hits * 0.05));
        this.sndClash = 0;
      }
    }
    e.length = 0;
  }

  private addRagdoll(ty: number, side: number, x: number, y: number, kvx: number, kvz: number, size: number) {
    const A = this.atlas;
    if (this.ragdolls.length >= JUICE.maxRagdolls) {
      const old = this.ragdolls.shift()!;
      this.ragFree.push(old.p);
    }
    const p = this.ragFree.pop() ?? new Particle({ texture: A.frames[ty][side][F_FLY], anchorX: 0.5, anchorY: 0.6 });
    p.texture = A.frames[ty][side][F_FLY];
    p.alpha = 1;
    const sc = size / A.drawSize[ty] / A.res;
    const big = Math.abs(kvx) > 80;
    this.ragdolls.push({
      p,
      x,
      y,
      z: 6 * size,
      vx: kvx * (0.8 + Math.random() * 0.4),
      vz: Math.max(40, kvz) * (0.8 + Math.random() * 0.4),
      rot: 0,
      vr: (big ? 12 : 5) * (Math.random() < 0.5 ? -1 : 1),
      t: 0,
      flip: side === 0 ? 1 : -1,
      sc,
      landed: false,
    });
    if (big) this.shake = Math.max(this.shake, 0.8);
  }

  private updateRagdolls(dt: number) {
    const ch = this.corpsePC.particleChildren;
    ch.length = 0;
    const g = WORLD.gravity;
    const list = this.ragdolls;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      r.t += dt;
      if (!r.landed) {
        r.x += r.vx * dt;
        r.z += r.vz * dt;
        r.vz -= g * dt;
        r.rot += r.vr * dt;
        if (r.z <= 0) {
          r.z = 0;
          if (Math.abs(r.vz) > 140) {
            // bounce once
            r.vz = -r.vz * 0.3;
            r.vx *= 0.5;
            r.vr *= 0.5;
          } else {
            r.landed = true;
            r.rot = (Math.PI / 2) * (r.rot % (Math.PI * 2) > Math.PI ? -1 : 1);
          }
        }
      }
      const life = 2.2;
      if (r.t > life) {
        this.ragFree.push(r.p);
        list.splice(i, 1);
        continue;
      }
      const p = r.p;
      p.x = r.x;
      p.y = r.y * DEPTH - r.z - (r.landed ? 2 : 0);
      p.scaleX = r.sc * r.flip;
      p.scaleY = r.sc;
      p.rotation = r.rot;
      p.alpha = r.t > life - 0.7 ? (life - r.t) / 0.7 : 1;
      p.tint = 0xb8b8b8;
    }
    for (const r of list) ch.push(r.p);
    this.corpsePC.update();
  }

  private damageNumber(x: number, y: number, amt: number, tint: number, big: boolean) {
    if (amt < 1) return;
    this.numGap -= 1;
    if (!big && (this.nums.length >= JUICE.maxDamageNumbers || this.numGap > 0)) return;
    this.numGap = this.nums.length / 6;
    let t = this.numFree.pop();
    if (!t) {
      t = new BitmapText({ text: '0', style: { fontFamily: 'dmg', fontSize: 20 } });
      t.anchor.set(0.5);
      this.numLayer.addChild(t);
    }
    t.visible = true;
    t.text = amt >= 1000 ? (amt / 1000).toFixed(1) + 'k' : String(Math.round(amt));
    t.tint = big ? 0xffd040 : tint;
    const s = (big ? 0.9 : 0.5) * Math.min(2.2, 0.8 + Math.log10(amt + 1) * 0.35);
    t.scale.set(s);
    this.nums.push({ t, x: x + (Math.random() - 0.5) * 8, y, life: big ? 0.9 : 0.6 });
  }

  private updateNums(dt: number) {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.y -= 30 * dt;
      if (n.life <= 0) {
        n.t.visible = false;
        this.numFree.push(n.t);
        this.nums.splice(i, 1);
        continue;
      }
      n.t.x = n.x;
      n.t.y = n.y;
      n.t.alpha = Math.min(1, n.life * 3);
    }
  }

  private updateStatues(b: Battle, dt: number) {
    for (let s = 0; s < 2; s++) {
      const g = this.statues[s];
      if (this.statueFlash[s] > 0) {
        this.statueFlash[s] -= dt;
        g.tint = 0xffb0a0;
      } else g.tint = 0xffffff;
      const frac = b.statueHp[s] / b.statueMax[s];
      g.scale.y = 1;
      if (this.statueFall[s] > 0) {
        this.statueFall[s] += dt;
        const k = Math.min(1, this.statueFall[s] / 1.6);
        g.rotation = (s === 0 ? -1 : 1) * k * k * 1.4;
        g.position.y = WORLD.laneDepth * DEPTH * 0.5 + 6 + k * k * 30;
        g.alpha = 1 - k * 0.6;
      } else {
        // wobble when low
        g.rotation = frac < 0.3 ? Math.sin(this.time * 20) * 0.02 : 0;
      }
    }
  }
}
