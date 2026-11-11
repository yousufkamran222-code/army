// Draw atlas stickmen into DOM canvases (unit portraits and little squads in the formation).
import { useEffect, useRef } from 'preact/hooks';
import { UNIT_INDEX, UNITS, type UnitId } from '../config/units';
import type { Atlas } from '../render/atlas';

let atlas: Atlas | null = null;
export function setAtlas(a: Atlas) {
  atlas = a;
}

function drawFrame(g: CanvasRenderingContext2D, type: UnitId, side: number, frame: number, cx: number, feetY: number, scale: number) {
  if (!atlas) return;
  const ti = UNIT_INDEX[type];
  const t = atlas.frames[ti][side][frame];
  const f = t.frame;
  const w = f.width * scale;
  const h = f.height * scale;
  const ay = atlas.anchorY[ti];
  g.save();
  g.translate(cx, feetY);
  if (side === 1) g.scale(-1, 1);
  g.drawImage(atlas.canvas, f.x, f.y, f.width, f.height, -w / 2, -h * ay, w, h);
  g.restore();
}

/** Canvas that redraws whenever its CSS size changes (crisp at any layout size). */
function useCanvas(draw: (c: HTMLCanvasElement, g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => {
      if (!atlas) return;
      const r = c.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      g.imageSmoothingQuality = 'high';
      draw(c, g);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
  }, deps);
  return ref;
}

/** body height of a frame in atlas pixels (frames have headroom for raised weapons) */
function bodyPx(ti: number): number {
  const f = atlas!.frames[ti][0][0].frame;
  return f.height * atlas!.anchorY[ti] * 0.74;
}

/** Single unit portrait, fitted to the box. */
export function Portrait({ type, side = 0, frame = 0, class: cls = '' }: { type: UnitId; side?: number; frame?: number; class?: string }) {
  const ref = useCanvas(
    (c, g) => {
      const ti = UNIT_INDEX[type];
      const big = UNITS[type].big;
      const scale = Math.min((c.height * (big ? 0.8 : 0.82)) / bodyPx(ti), (c.width * 0.9) / (atlas!.frames[ti][0][0].frame.width * 0.62));
      drawFrame(g, type, side, frame, c.width / 2, c.height * 0.96, scale);
    },
    [type, side, frame],
  );
  return <canvas ref={ref} class={'portrait ' + cls} />;
}

/** A small formation of `count` stickmen standing in loose ranks on the ground. */
export function Squad({ type, count, side = 0, class: cls = '' }: { type: UnitId; count: number; side?: number; class?: string }) {
  const ref = useCanvas(
    (c, g) => {
      const d = UNITS[type];
      const ti = UNIT_INDEX[type];
      const n = d.big ? Math.min(count, 2) : Math.min(count, d.size < 0.8 ? 12 : 8);
      const ranks = d.big ? 1 : n >= 6 ? 3 : n >= 3 ? 2 : 1;
      const perRank = Math.ceil(n / ranks);
      // body height H so the cluster fits both width and height
      const spread = d.big ? 0.5 : 0.27;
      const H = Math.min((c.width * 0.92) / (spread * (perRank - 1) + 0.5), (c.height * 0.82) / (1 + (ranks - 1) * 0.22), c.width * 1.1);
      const scale = H / bodyPx(ti);
      const groundY = c.height * 0.96;
      // ground shadow
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(c.width / 2, groundY, c.width * 0.46, Math.max(3, H * 0.08), 0, 0, Math.PI * 2);
      g.fill();
      const spots: { x: number; y: number; k: number }[] = [];
      let k = 0;
      for (let r = 0; r < ranks; r++) {
        const inRank = Math.min(perRank, n - r * perRank);
        const rowW = spread * H * (inRank - 1);
        for (let j = 0; j < inRank; j++, k++) {
          const off = r % 2 ? spread * H * 0.5 : 0;
          spots.push({ x: c.width / 2 - rowW / 2 + j * spread * H + off - (r % 2 ? spread * H * 0.25 : 0), y: groundY - (ranks - 1 - r) * H * 0.18, k });
        }
      }
      spots.sort((a, b) => a.y - b.y);
      for (const s of spots) drawFrame(g, type, side, (s.k * 2) % 6, s.x, s.y, scale * (1 - ((groundY - s.y) / H) * 0.25));
    },
    [type, count, side],
  );
  return <canvas ref={ref} class={'squad ' + cls} />;
}
