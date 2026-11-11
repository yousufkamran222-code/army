// Procedural stick-figure rig rendered once at startup into a single texture atlas.
// Every unit type x side x pose becomes one atlas frame, so the battle draws in a single batch.

import { Rectangle, Texture } from 'pixi.js';
import { UNITS, UNIT_IDS, type UnitDef } from '../config/units';

export const SIDE_COLORS = [
  { body: '#e2522b', light: '#ff9a5c', dark: '#8f2a12', hex: 0xe2522b }, // player: warm
  { body: '#2f6fd6', light: '#7fb2ff', dark: '#173a7a', hex: 0x2f6fd6 }, // enemy: cool
];

export const WALK_FRAMES = 6;
export const ATK_FRAMES = 4;
// frame layout per unit/side: [walk0..5, atk0..3, hurt, fly]
export const F_WALK = 0;
export const F_ATK = WALK_FRAMES;
export const F_HURT = WALK_FRAMES + ATK_FRAMES;
export const F_FLY = F_HURT + 1;
export const FRAMES_PER = F_FLY + 1;

export interface Atlas {
  res: number; // atlas pixels per world unit
  frames: Texture[][][]; // [typeIdx][side][frame]
  fx: Record<FxName, Texture>;
  anchorY: number[]; // per type: anchor so feet sit at y=0
  drawSize: number[]; // per type: figure scale the frames were drawn at
  canvas: HTMLCanvasElement;
}

export type FxName = 'arrow' | 'bolt' | 'dark' | 'spark' | 'dust' | 'ring' | 'meteor' | 'plus' | 'glow' | 'star' | 'chunk';

interface Pose {
  bob: number;
  lean: number; // torso lean (rad, + = forward)
  thighF: number;
  shinF: number;
  thighB: number;
  shinB: number;
  armF: number; // upper arm angle from straight down (+ = forward)
  foreF: number;
  armB: number;
  foreB: number;
  weapon: number; // weapon angle offset
  head: number;
}

function walkPose(p: number): Pose {
  const a = Math.sin(p * Math.PI * 2);
  const b = Math.cos(p * Math.PI * 2);
  return {
    bob: Math.abs(b) * 1.2,
    lean: 0.1,
    thighF: a * 0.55,
    shinF: Math.max(0, -b) * 0.7 - 0.1,
    thighB: -a * 0.55,
    shinB: Math.max(0, b) * 0.7 - 0.1,
    armF: -a * 0.5 + 0.35,
    foreF: 0.7,
    armB: a * 0.5 + 0.1,
    foreB: 0.5,
    weapon: 0,
    head: 0,
  };
}

function attackPose(t: number, d: UnitDef): Pose {
  // t: 0 windup, 1 strike, 2 follow, 3 recover
  const base = walkPose(0);
  base.thighF = 0.45;
  base.thighB = -0.35;
  base.shinF = 0.1;
  base.shinB = 0.2;
  const ranged = d.behavior === 'ranged';
  const caster = d.behavior === 'mage' || d.behavior === 'necro' || d.behavior === 'support';
  if (ranged) {
    // draw bow: front arm extended, back arm pulls
    const pull = [0.4, 1, 0.2, 0.5][t];
    base.armF = 1.55;
    base.foreF = 0;
    base.armB = 1.3;
    base.foreB = 1.6 * pull + 0.3;
    base.lean = -0.05;
    return base;
  }
  if (caster) {
    const k = [0.3, 1, 0.8, 0.5][t];
    base.armF = 0.6 + 1.6 * k;
    base.foreF = 0.3;
    base.armB = 0.2;
    base.lean = 0.05 * k;
    return base;
  }
  const swing = [-2.4, 1.7, 1.2, 0.4][t];
  base.armF = swing;
  base.foreF = t === 0 ? -0.6 : 0.2;
  base.armB = -0.4 + (t === 1 ? 0.5 : 0);
  base.lean = [-0.15, 0.35, 0.25, 0.1][t];
  base.weapon = t === 0 ? -0.3 : 0.2;
  return base;
}

function hurtPose(): Pose {
  const p = walkPose(0.25);
  p.lean = -0.45;
  p.armF = -0.9;
  p.armB = -1.4;
  p.foreF = -0.6;
  p.foreB = -0.4;
  p.thighF = 0.3;
  p.thighB = -0.2;
  p.head = -0.3;
  return p;
}

function flyPose(): Pose {
  return { bob: 0, lean: 0, thighF: 0.8, shinF: -0.4, thighB: -0.8, shinB: 0.5, armF: 2.3, foreF: 0.5, armB: -2.2, foreB: -0.4, weapon: 0.5, head: 0.2 };
}

/** Draw one stick figure. Canvas origin = feet centre, facing +x, 1 unit = 1 px (caller scales). */
function drawFigure(g: CanvasRenderingContext2D, d: UnitDef, pose: Pose, side: number) {
  const col = SIDE_COLORS[side];
  const ghost = d.weapon === 'ghost';
  const body = ghost ? (side === 0 ? '#ff8a6a' : '#6aa8ff') : col.body;
  const lw = d.weapon === 'claws' ? 3.4 : 2.6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (d.weapon === 'golem') return drawGolem(g, pose, side);

  const hipY = -18 - pose.bob;
  const hip = { x: 0, y: hipY };
  const torso = 12;
  const sh = { x: hip.x + Math.sin(pose.lean) * torso, y: hip.y - Math.cos(pose.lean) * torso };
  const limb = (o: { x: number; y: number }, a1: number, a2: number, l1: number, l2: number) => {
    const k = { x: o.x + Math.sin(a1) * l1, y: o.y + Math.cos(a1) * l1 };
    const e = { x: k.x + Math.sin(a1 + a2) * l2, y: k.y + Math.cos(a1 + a2) * l2 };
    return [k, e] as const;
  };
  const line = (pts: { x: number; y: number }[], c: string, w = lw) => {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
  };
  if (ghost) {
    g.shadowColor = '#7affc8';
    g.shadowBlur = 6;
  }
  const [kB, fB] = limb(hip, pose.thighB, -Math.abs(pose.shinB), 9, 9);
  const [kF, fF] = limb(hip, pose.thighF, -Math.abs(pose.shinF), 9, 9);
  const [eB, hB] = limb(sh, pose.armB, pose.foreB, 7, 7);
  const [eF, hF] = limb(sh, pose.armF, pose.foreF, 7, 7);

  // back limbs (darker)
  line([hip, kB, fB], col.dark);
  line([sh, eB, hB], col.dark);
  // cape for warlord
  if (d.weapon === 'greatsword') {
    g.fillStyle = col.dark;
    g.beginPath();
    g.moveTo(sh.x - 1, sh.y);
    g.quadraticCurveTo(sh.x - 12, sh.y + 10, hip.x - 12 - pose.bob * 2, hip.y + 12);
    g.lineTo(hip.x - 2, hip.y + 4);
    g.closePath();
    g.fill();
  }
  // back-hand items
  if (d.weapon === 'axes') drawAxe(g, hB, pose.armB + pose.foreB + 1.2, d.accent, 0.8);
  // torso
  if (d.weapon === 'club') {
    // giant belly
    g.fillStyle = col.body;
    g.beginPath();
    g.ellipse((hip.x + sh.x) / 2 + 1.5, (hip.y + sh.y) / 2 + 1, 5, 7, pose.lean, 0, Math.PI * 2);
    g.fill();
  }
  if (d.weapon === 'staff' || d.weapon === 'orb' || d.weapon === 'scythe') {
    // robe
    g.fillStyle = d.weapon === 'staff' ? '#c9a24a' : d.weapon === 'orb' ? '#2a5a8a' : '#3a2a4a';
    g.globalAlpha = 0.9;
    g.beginPath();
    g.moveTo(sh.x - 2.5, sh.y + 1);
    g.lineTo(sh.x + 2.5, sh.y + 1);
    g.lineTo(hip.x + 6, hip.y + 8);
    g.lineTo(hip.x - 6, hip.y + 8);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }
  line([hip, sh], body, lw + 0.4);
  line([hip, kF, fF], body);
  // head
  const hc = { x: sh.x + Math.sin(pose.lean + pose.head) * 5, y: sh.y - Math.cos(pose.lean + pose.head) * 5 };
  g.fillStyle = body;
  g.beginPath();
  g.arc(hc.x, hc.y, d.weapon === 'claws' ? 5.2 : 4.4, 0, Math.PI * 2);
  g.fill();
  drawHeadgear(g, d, hc, side);
  // front arm + weapon
  const wa = pose.armF + pose.foreF + pose.weapon;
  if (d.weapon === 'shield') {
    line([sh, eF, hF], body);
    drawSword(g, hF, wa, '#c8ccd2', 9);
    drawShield(g, { x: (eF.x + hF.x) / 2 + 3, y: (eF.y + hF.y) / 2 }, d.accent, col.dark);
  } else {
    drawWeapon(g, d, hF, wa, side, hB);
    line([sh, eF, hF], body);
  }
  g.shadowBlur = 0;
}

function drawHeadgear(g: CanvasRenderingContext2D, d: UnitDef, hc: { x: number; y: number }, side: number) {
  const col = SIDE_COLORS[side];
  switch (d.weapon) {
    case 'sword':
    case 'spear':
      // helmet
      g.fillStyle = '#c8ccd2';
      g.beginPath();
      g.arc(hc.x, hc.y - 0.5, 4.8, Math.PI, 0);
      g.fill();
      if (d.weapon === 'spear') {
        g.fillStyle = col.light;
        g.fillRect(hc.x - 0.8, hc.y - 8.5, 1.6, 3.5);
      }
      break;
    case 'shield':
      g.fillStyle = '#9aa0a8';
      g.beginPath();
      g.arc(hc.x, hc.y, 5, Math.PI * 1.05, Math.PI * 1.95);
      g.lineTo(hc.x + 5, hc.y + 1);
      g.lineTo(hc.x - 5, hc.y + 1);
      g.fill();
      break;
    case 'axes':
      // horns
      g.strokeStyle = '#f0e0c0';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(hc.x - 3, hc.y - 3);
      g.quadraticCurveTo(hc.x - 7, hc.y - 6, hc.x - 5, hc.y - 10);
      g.moveTo(hc.x + 3, hc.y - 3);
      g.quadraticCurveTo(hc.x + 7, hc.y - 6, hc.x + 5, hc.y - 10);
      g.stroke();
      break;
    case 'bow':
      // hood
      g.fillStyle = '#4a7a3a';
      g.beginPath();
      g.arc(hc.x - 0.5, hc.y - 0.5, 5, Math.PI * 0.9, Math.PI * 2.05);
      g.fill();
      break;
    case 'staff':
      g.strokeStyle = '#ffe28a';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(hc.x, hc.y - 6.5, 4, 1.4, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'orb':
      // pointy hat
      g.fillStyle = '#2a5a8a';
      g.beginPath();
      g.moveTo(hc.x - 6, hc.y - 2.5);
      g.lineTo(hc.x + 6, hc.y - 2.5);
      g.lineTo(hc.x - 1.5, hc.y - 14);
      g.closePath();
      g.fill();
      break;
    case 'scythe':
      g.fillStyle = '#3a2a4a';
      g.beginPath();
      g.arc(hc.x, hc.y, 5.6, Math.PI * 0.75, Math.PI * 2.25);
      g.fill();
      g.fillStyle = '#d58aff';
      g.fillRect(hc.x + 1, hc.y - 1, 1.6, 1.6);
      break;
    case 'club':
      g.fillStyle = '#6a4a2a';
      g.fillRect(hc.x - 4.5, hc.y - 4.5, 9, 2.2);
      break;
    case 'claws':
      // little ears / antennae
      g.strokeStyle = d.accent;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(hc.x - 2, hc.y - 4);
      g.lineTo(hc.x - 4, hc.y - 9);
      g.moveTo(hc.x + 2, hc.y - 4);
      g.lineTo(hc.x + 4, hc.y - 9);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(hc.x + 1.5, hc.y - 1.5, 2, 2);
      break;
    case 'ghost':
      g.fillStyle = '#7affc8';
      g.fillRect(hc.x + 1, hc.y - 1.5, 1.8, 1.8);
      g.fillRect(hc.x - 2.5, hc.y - 1.5, 1.8, 1.8);
      break;
    case 'greatsword':
      g.fillStyle = '#ffcf3a';
      g.beginPath();
      g.moveTo(hc.x - 4.5, hc.y - 3);
      g.lineTo(hc.x - 4.5, hc.y - 9);
      g.lineTo(hc.x - 2, hc.y - 6);
      g.lineTo(hc.x, hc.y - 10);
      g.lineTo(hc.x + 2, hc.y - 6);
      g.lineTo(hc.x + 4.5, hc.y - 9);
      g.lineTo(hc.x + 4.5, hc.y - 3);
      g.closePath();
      g.fill();
      break;
  }
}

function drawSword(g: CanvasRenderingContext2D, h: { x: number; y: number }, a: number, c: string, len: number) {
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  g.strokeStyle = c;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(h.x, h.y);
  g.lineTo(h.x + dx * len, h.y + dy * len);
  g.stroke();
  g.strokeStyle = '#6a4a2a';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(h.x - dy * 2, h.y + dx * 2);
  g.lineTo(h.x + dy * 2, h.y - dx * 2);
  g.stroke();
}

function drawAxe(g: CanvasRenderingContext2D, h: { x: number; y: number }, a: number, c: string, s = 1) {
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  g.strokeStyle = '#6a4a2a';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(h.x - dx * 2, h.y - dy * 2);
  g.lineTo(h.x + dx * 9 * s, h.y + dy * 9 * s);
  g.stroke();
  g.fillStyle = c;
  const tx = h.x + dx * 8 * s;
  const ty = h.y + dy * 8 * s;
  g.beginPath();
  g.moveTo(tx, ty);
  g.lineTo(tx + dy * 5 * s + dx * 2, ty - dx * 5 * s + dy * 2);
  g.lineTo(tx + dy * 5 * s - dx * 4, ty - dx * 5 * s - dy * 4);
  g.closePath();
  g.fill();
}

function drawShield(g: CanvasRenderingContext2D, c: { x: number; y: number }, accent: string, dark: string) {
  g.fillStyle = dark;
  g.strokeStyle = accent;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(c.x - 1, c.y - 8);
  g.lineTo(c.x + 4, c.y - 8);
  g.lineTo(c.x + 4, c.y + 3);
  g.quadraticCurveTo(c.x + 1.5, c.y + 9, c.x - 1, c.y + 4);
  g.closePath();
  g.fill();
  g.stroke();
}

function drawWeapon(g: CanvasRenderingContext2D, d: UnitDef, h: { x: number; y: number }, a: number, side: number, hB: { x: number; y: number }) {
  const col = SIDE_COLORS[side];
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  switch (d.weapon) {
    case 'sword':
      drawSword(g, h, a, d.accent, 11);
      break;
    case 'spear': {
      g.strokeStyle = '#7a5a3a';
      g.lineWidth = 1.6;
      const sa = Math.PI / 2 - 0.15 + (a - 1.2) * 0.25;
      const sx = Math.sin(sa);
      const sy = Math.cos(sa);
      g.beginPath();
      g.moveTo(h.x - sx * 9, h.y - sy * 9);
      g.lineTo(h.x + sx * 16, h.y + sy * 16);
      g.stroke();
      g.fillStyle = d.accent;
      const tx = h.x + sx * 16;
      const ty = h.y + sy * 16;
      g.beginPath();
      g.moveTo(tx + sx * 5, ty + sy * 5);
      g.lineTo(tx - sy * 2, ty + sx * 2);
      g.lineTo(tx + sy * 2, ty - sx * 2);
      g.closePath();
      g.fill();
      break;
    }
    case 'axes':
      drawAxe(g, h, a, d.accent);
      break;
    case 'bow': {
      g.strokeStyle = d.accent;
      g.lineWidth = 1.8;
      g.beginPath();
      g.arc(h.x - 3, h.y, 8, -1.2, 1.2);
      g.stroke();
      g.strokeStyle = '#eeeeee';
      g.lineWidth = 0.7;
      const top = { x: h.x - 3 + Math.cos(-1.2) * 8, y: h.y + Math.sin(-1.2) * 8 };
      const bot = { x: h.x - 3 + Math.cos(1.2) * 8, y: h.y + Math.sin(1.2) * 8 };
      g.beginPath();
      g.moveTo(top.x, top.y);
      g.lineTo(Math.min(hB.x, h.x - 2), (top.y + bot.y) / 2);
      g.lineTo(bot.x, bot.y);
      g.stroke();
      break;
    }
    case 'staff':
    case 'orb':
    case 'scythe': {
      const len = 20;
      g.strokeStyle = d.weapon === 'staff' ? '#8a6a3a' : '#5a4a6a';
      g.lineWidth = 1.7;
      const top = { x: h.x + dx * 0.3 - 1, y: h.y - 13 };
      g.beginPath();
      g.moveTo(h.x + 1, h.y + len - 13);
      g.lineTo(top.x, top.y);
      g.stroke();
      if (d.weapon === 'scythe') {
        g.strokeStyle = '#d8d0e8';
        g.lineWidth = 1.8;
        g.beginPath();
        g.moveTo(top.x, top.y);
        g.quadraticCurveTo(top.x + 9, top.y - 3, top.x + 11, top.y + 5);
        g.stroke();
      }
      g.fillStyle = d.accent;
      g.shadowColor = d.accent;
      g.shadowBlur = 6;
      g.beginPath();
      g.arc(top.x, top.y, d.weapon === 'orb' ? 3.2 : 2.2, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      break;
    }
    case 'club': {
      g.fillStyle = '#7a5a3a';
      g.strokeStyle = '#4a3a2a';
      g.lineWidth = 1;
      g.save();
      g.translate(h.x, h.y);
      g.rotate(-a + Math.PI);
      g.beginPath();
      g.moveTo(-1.5, 0);
      g.lineTo(-3.5, -16);
      g.quadraticCurveTo(0, -20, 3.5, -16);
      g.lineTo(1.5, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      break;
    }
    case 'claws':
      g.strokeStyle = d.accent;
      g.lineWidth = 1.4;
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        g.moveTo(h.x, h.y);
        g.lineTo(h.x + dx * 4 + k * dy * 1.5, h.y + dy * 4 - k * dx * 1.5);
      }
      g.stroke();
      break;
    case 'ghost':
      g.strokeStyle = '#7affc8';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(h.x, h.y);
      g.lineTo(h.x + dx * 7, h.y + dy * 7);
      g.stroke();
      break;
    case 'greatsword':
      g.strokeStyle = '#e8ecf2';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(h.x, h.y);
      g.lineTo(h.x + dx * 20, h.y + dy * 20);
      g.stroke();
      g.strokeStyle = d.accent;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(h.x - dy * 3.5, h.y + dx * 3.5);
      g.lineTo(h.x + dy * 3.5, h.y - dx * 3.5);
      g.stroke();
      break;
    default:
      void col;
  }
}

function drawGolem(g: CanvasRenderingContext2D, pose: Pose, side: number) {
  const col = SIDE_COLORS[side];
  const stone = '#7d838c';
  const dark = '#555a62';
  const b = pose.bob;
  g.lineJoin = 'round';
  const block = (x: number, y: number, w: number, h: number, c: string, r = 0) => {
    g.save();
    g.translate(x, y);
    g.rotate(r);
    g.fillStyle = c;
    g.strokeStyle = '#3a3e44';
    g.lineWidth = 1;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  };
  // legs
  block(-5 - pose.thighB * 3, -6, 6, 12, dark, pose.thighB * 0.4);
  block(5 + pose.thighF * 3, -6, 6, 12, stone, pose.thighF * 0.4);
  // back arm
  block(-9, -24 - b + pose.armB * 2, 6, 14, dark, pose.armB * 0.5);
  // body
  block(Math.sin(pose.lean) * 4, -22 - b, 20, 18, stone, pose.lean * 0.3);
  // runes
  g.fillStyle = col.light;
  g.shadowColor = col.body;
  g.shadowBlur = 5;
  g.fillRect(-3 + Math.sin(pose.lean) * 4, -26 - b, 6, 2);
  g.fillRect(-1 + Math.sin(pose.lean) * 4, -22 - b, 2, 6);
  g.shadowBlur = 0;
  // head
  block(2 + Math.sin(pose.lean) * 8, -36 - b, 10, 8, stone);
  g.fillStyle = col.light;
  g.fillRect(4 + Math.sin(pose.lean) * 8, -37 - b, 3, 2);
  // front arm (big fist)
  const ax = 10 + Math.sin(pose.armF) * 6;
  const ay = -26 - b + (1 - Math.cos(pose.armF)) * 6;
  block(ax, ay, 7, 15, stone, -pose.armF * 0.6);
  block(ax + Math.sin(pose.armF) * 9, ay + Math.cos(pose.armF) * 9, 10, 9, dark);
}

// ---------------------------------------------------------------- fx textures
function drawFx(name: FxName, g: CanvasRenderingContext2D, s: number) {
  g.lineCap = 'round';
  switch (name) {
    case 'arrow':
      g.strokeStyle = '#5a3a1a';
      g.lineWidth = 1.6 * s;
      g.beginPath();
      g.moveTo(2 * s, 4 * s);
      g.lineTo(16 * s, 4 * s);
      g.stroke();
      g.fillStyle = '#d8dde6';
      g.beginPath();
      g.moveTo(20 * s, 4 * s);
      g.lineTo(15 * s, 1.5 * s);
      g.lineTo(15 * s, 6.5 * s);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(1 * s, 2.5 * s, 3 * s, 3 * s);
      break;
    case 'bolt':
    case 'dark':
    case 'glow': {
      const c = name === 'bolt' ? '90,224,255' : name === 'dark' ? '190,100,255' : '255,255,255';
      const r = 8 * s;
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.3, `rgba(${c},0.9)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, 2 * r, 2 * r);
      break;
    }
    case 'spark':
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(8 * s, 0);
      g.lineTo(9.5 * s, 6.5 * s);
      g.lineTo(16 * s, 8 * s);
      g.lineTo(9.5 * s, 9.5 * s);
      g.lineTo(8 * s, 16 * s);
      g.lineTo(6.5 * s, 9.5 * s);
      g.lineTo(0, 8 * s);
      g.lineTo(6.5 * s, 6.5 * s);
      g.closePath();
      g.fill();
      break;
    case 'star':
      g.fillStyle = '#ffffff';
      g.fillRect(3 * s, 0, 2 * s, 8 * s);
      g.fillRect(0, 3 * s, 8 * s, 2 * s);
      break;
    case 'dust': {
      const r = 8 * s;
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 2 * r, 2 * r);
      break;
    }
    case 'ring':
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2 * s;
      g.beginPath();
      g.arc(16 * s, 16 * s, 14 * s, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'meteor': {
      const r = 12 * s;
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      grd.addColorStop(0, '#fff6c0');
      grd.addColorStop(0.35, '#ffb040');
      grd.addColorStop(0.7, 'rgba(255,80,20,0.8)');
      grd.addColorStop(1, 'rgba(255,40,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 2 * r, 2 * r);
      break;
    }
    case 'plus':
      g.fillStyle = '#ffffff';
      g.fillRect(3 * s, 0, 2.4 * s, 8.4 * s);
      g.fillRect(0, 3 * s, 8.4 * s, 2.4 * s);
      break;
    case 'chunk':
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 6 * s, 5 * s);
      break;
  }
}
const FX_SIZE: Record<FxName, [number, number]> = {
  arrow: [21, 8],
  bolt: [16, 16],
  dark: [16, 16],
  glow: [16, 16],
  spark: [16, 16],
  star: [8, 8],
  dust: [16, 16],
  ring: [32, 32],
  meteor: [24, 24],
  plus: [8.4, 8.4],
  chunk: [6, 5],
};

// ---------------------------------------------------------------- packing
interface Item {
  w: number;
  h: number;
  x: number;
  y: number;
  draw: (g: CanvasRenderingContext2D) => void;
  done: (t: Texture) => void;
}

function pack(items: Item[], width: number): number {
  const sorted = [...items].sort((a, b) => b.h - a.h);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of sorted) {
    if (x + it.w > width) {
      x = 0;
      y += rowH + 1;
      rowH = 0;
    }
    it.x = x;
    it.y = y;
    x += it.w + 1;
    rowH = Math.max(rowH, it.h);
  }
  return y + rowH;
}

export function buildAtlas(maxSize = 2048): Atlas {
  let res = 2.2;
  let items: Item[] = [];
  const frames: Texture[][][] = UNIT_IDS.map(() => [[], []]);
  const anchorY: number[] = [];
  const drawSize: number[] = [];
  const fx = {} as Record<FxName, Texture>;
  let height = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    items = [];
    for (let ti = 0; ti < UNIT_IDS.length; ti++) {
      const d = UNITS[UNIT_IDS[ti]];
      const sz = d.size * (d.behavior === 'giant' ? 1.35 : 1); // headroom for Titan Blood
      const wU = 64; // units at size 1
      const hU = 60;
      const padB = 4;
      const w = Math.ceil(wU * sz * res);
      const h = Math.ceil(hU * sz * res);
      anchorY[ti] = (h - padB * sz * res) / h;
      drawSize[ti] = sz;
      for (let side = 0; side < 2; side++) {
        for (let f = 0; f < FRAMES_PER; f++) {
          const pose = f < F_ATK ? walkPose(f / WALK_FRAMES) : f < F_HURT ? attackPose(f - F_ATK, d) : f === F_HURT ? hurtPose() : flyPose();
          const scale = sz * res;
          items.push({
            w,
            h,
            x: 0,
            y: 0,
            draw: (g) => {
              g.translate(w / 2, h - padB * scale);
              g.scale(scale, scale);
              drawFigure(g, d, pose, side);
            },
            done: (t) => (frames[ti][side][f] = t),
          });
        }
      }
    }
    for (const name of Object.keys(FX_SIZE) as FxName[]) {
      const [fw, fh] = FX_SIZE[name];
      const s = res * 1.5;
      items.push({ w: Math.ceil(fw * s), h: Math.ceil(fh * s), x: 0, y: 0, draw: (g) => drawFx(name, g, s), done: (t) => (fx[name] = t) });
    }
    height = pack(items, maxSize);
    if (height <= maxSize) break;
    res *= 0.9;
  }
  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = Math.min(maxSize, Math.pow(2, Math.ceil(Math.log2(height))));
  const g = canvas.getContext('2d')!;
  for (const it of items) {
    g.save();
    g.beginPath();
    g.rect(it.x, it.y, it.w, it.h);
    g.clip();
    g.translate(it.x, it.y);
    it.draw(g);
    g.restore();
  }
  const base = Texture.from(canvas);
  base.source.scaleMode = 'linear';
  for (const it of items) it.done(new Texture({ source: base.source, frame: new Rectangle(it.x, it.y, it.w, it.h) }));
  return { res, frames, fx, anchorY, drawSize, canvas };
}
