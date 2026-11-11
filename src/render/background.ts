import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { WORLD } from '../config/tuning';
import { Rng } from '../sim/rng';

export interface Parallax {
  root: Container;
  sky: Sprite;
  layers: { c: Container; f: number }[];
  clouds: { s: Sprite; v: number }[];
}

function skyTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#5a8fd8');
  grd.addColorStop(0.55, '#a9d2f0');
  grd.addColorStop(1, '#f6e2b8');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  return Texture.from(c);
}

function cloudTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, r] of [
    [60, 60, 30],
    [100, 45, 38],
    [150, 55, 32],
    [190, 64, 24],
    [120, 70, 30],
  ])
    (g.beginPath(), g.arc(x, y, r, 0, Math.PI * 2), g.fill());
  return Texture.from(c);
}

function hillLayer(rng: Rng, color: number, baseY: number, amp: number, step: number, x0: number, x1: number, snow = false): Graphics {
  const g = new Graphics();
  const pts: number[] = [x0, 600];
  for (let x = x0; x <= x1; x += step) {
    const y = baseY - amp * (0.5 + 0.5 * Math.sin(x * 0.004 + rng.next() * 0.6)) - rng.next() * amp * 0.35;
    pts.push(x, y);
  }
  pts.push(x1, 600);
  g.poly(pts).fill(color);
  if (snow) {
    for (let i = 2; i < pts.length - 2; i += 2) {
      const y = pts[i + 1];
      if (y < baseY - amp * 0.8) g.circle(pts[i], y + 4, 6).fill({ color: 0xffffff, alpha: 0.6 });
    }
  }
  return g;
}

export function buildBackground(): Parallax {
  const root = new Container();
  const sky = new Sprite(skyTexture());
  root.addChild(sky);
  const rng = new Rng(7);
  const layers: { c: Container; f: number }[] = [];
  const sun = new Graphics().circle(0, 0, 40).fill({ color: 0xfff3c0, alpha: 0.9 }).circle(0, 0, 70).fill({ color: 0xfff3c0, alpha: 0.18 });
  const sunL = new Container();
  sun.position.set(950, -190);
  sunL.addChild(sun);
  layers.push({ c: sunL, f: 0.05 });
  const far = new Container();
  far.addChild(hillLayer(rng, 0x8aa6c8, -18, 130, 60, -1400, 3000));
  layers.push({ c: far, f: 0.25 });
  const mid = new Container();
  mid.addChild(hillLayer(rng, 0x7fae6a, -8, 60, 40, -1200, 2800));
  // a few trees on the mid hills
  const trees = new Graphics();
  for (let i = 0; i < 40; i++) {
    const x = -1000 + i * 95 + rng.next() * 40;
    const y = -12 - rng.next() * 18;
    trees.rect(x - 1.5, y, 3, 10).fill(0x5a4a3a);
    trees.circle(x, y - 4, 7 + rng.next() * 4).fill(0x4f8a4a);
  }
  mid.addChild(trees);
  layers.push({ c: mid, f: 0.55 });
  const clouds: { s: Sprite; v: number }[] = [];
  const ct = cloudTexture();
  const cloudL = new Container();
  for (let i = 0; i < 7; i++) {
    const s = new Sprite(ct);
    s.anchor.set(0.5);
    s.position.set(-800 + i * 480 + rng.next() * 200, -260 + rng.next() * 140);
    s.scale.set(0.6 + rng.next() * 0.9);
    s.alpha = 0.7 + rng.next() * 0.3;
    cloudL.addChild(s);
    clouds.push({ s, v: 4 + rng.next() * 8 });
  }
  layers.splice(1, 0, { c: cloudL, f: 0.12 });
  for (const l of layers) root.addChild(l.c);
  return { root, sky, layers, clouds };
}

export function buildGround(LANE_H: number): Graphics {
  const g = new Graphics();
  const L = WORLD.length;
  // grass field
  g.rect(-1500, -6, L + 3000, 900).fill(0x6aa04a);
  g.rect(-1500, -6, L + 3000, 4).fill({ color: 0x8cc35a, alpha: 0.8 });
  // the lane (packed dirt)
  g.rect(-1500, 0, L + 3000, LANE_H).fill({ color: 0xc8a46a, alpha: 0.55 });
  g.rect(-1500, LANE_H - 2, L + 3000, 3).fill({ color: 0x8a6a3a, alpha: 0.35 });
  const rng = new Rng(3);
  for (let i = 0; i < 320; i++) {
    const x = -1200 + rng.next() * (L + 2400);
    const y = rng.next() < 0.5 ? -4 + rng.next() * 6 : LANE_H + 2 + rng.next() * 200;
    g.moveTo(x, y).lineTo(x - 2, y - 5).moveTo(x, y).lineTo(x + 2, y - 6).stroke({ width: 1, color: 0x4f8a3a, alpha: 0.8 });
  }
  for (let i = 0; i < 60; i++) {
    const x = -1000 + rng.next() * (L + 2000);
    g.circle(x, 6 + rng.next() * (LANE_H - 10), 1 + rng.next() * 1.5).fill({ color: 0x8a7a5a, alpha: 0.5 });
  }
  return g;
}
