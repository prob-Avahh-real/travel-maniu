// 手绘墨线（ink）绘制原语 —— 全部由代码生成，不依赖任何图片素材。
// 关键手法：wobble（抖动点）+ 多遍叠加描边 + 留白填充（水彩感）+ 排线阴影。
// 抖动种子按时间取整，形成 4-5fps 的“boiling line”呼吸感 —— 这是手绘动画的特征。

import { createRng } from '../core/rng.js';

export const PALETTE = {
  paper: '#f6efe0',
  paperShade: '#e9dfc9',
  ink: '#3b3630',
  inkSoft: '#6b6255',
  green: '#7c9a52',
  greenDeep: '#4f6b36',
  clay: '#a9704a',
  red: '#a8402f',
  blue: '#5b7f96',
  gold: '#c9a34e',
  night: '#2f3542',
};

/** Stable seed for a frame: identical during a frame, jumps every ~220ms. */
export function boilSeed(t, salt = 0) {
  return (Math.floor(t / 220) * 2654435761 + salt * 40503) >>> 0;
}

/** Jitter a list of points with a seeded rng (the core of the hand-drawn look). */
export function wobble(points, amp = 1.2, seed = 1) {
  const rng = createRng(seed);
  return points.map(([x, y]) => [x + (rng.next() - 0.5) * 2 * amp, y + (rng.next() - 0.5) * 2 * amp]);
}

export function jitter(seed, amp = 1.2) {
  const rng = createRng(seed);
  return (v) => v + (rng.next() - 0.5) * 2 * amp;
}

/**
 * Ink stroke through a polyline. `passes` > 1 is what makes it look drawn by hand
 * rather than plotted: each pass is independently jittered at slightly lower alpha.
 */
export function inkStroke(ctx, points, o = {}) {
  if (!points || points.length < 2) return;
  const rng = createRng(o.seed ?? 1);
  const passes = o.passes ?? 2;
  const amp = o.jitter ?? 1.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  for (let p = 0; p < passes; p++) {
    const pts = wobble(points, p === 0 ? amp : amp * 1.9, (rng.next() * 1e9) >>> 0);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.strokeStyle = o.color || PALETTE.ink;
    ctx.lineWidth = (o.width ?? 1.5) * (p === 0 ? 1 : 0.7) * (0.82 + rng.next() * 0.45);
    ctx.globalAlpha = (o.alpha ?? 1) * (p === 0 ? 1 : 0.45);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function roughLine(ctx, x1, y1, x2, y2, o = {}) {
  const n = o.samples ?? 4;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  return inkStroke(ctx, pts, o);
}

/** Closed-ish polygon outline. */
export function roughPoly(ctx, points, o = {}) {
  const pts = o.close === false ? points : [...points, points[0]];
  return inkStroke(ctx, pts, o);
}

export function roughRect(ctx, x, y, w, h, o = {}) {
  const bow = o.bow ?? 1.5;
  const rng = createRng(o.seed ?? 7);
  const mid = () => (rng.next() - 0.5) * bow * 2;
  return roughPoly(ctx, [
    [x, y], [x + w / 2, y + mid()], [x + w, y],
    [x + w + mid(), y + h / 2], [x + w, y + h],
    [x + w / 2, y + h + mid()], [x, y + h],
    [x + mid(), y + h / 2],
  ], o);
}

export function roughEllipse(ctx, cx, cy, rx, ry, o = {}) {
  const steps = o.steps ?? 16;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return roughPoly(ctx, pts, { ...o, jitter: o.jitter ?? 0.9 });
}

/** Water-colour-ish fill: the outline offset a little, low alpha, no hard edge. */
export function washFill(ctx, points, color, alpha = 0.35, seed = 3) {
  const pts = wobble(points, 2.2, seed);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Parallel hatching clipped to a polygon — cheap shading that reads as pencil. */
export function hatch(ctx, points, o = {}) {
  const angle = o.angle ?? -Math.PI / 4;
  const gap = o.gap ?? 7;
  const seed = o.seed ?? 5;
  const rng = createRng(seed);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.4;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.clip();
  const n = Math.ceil(span / gap);
  for (let i = -n; i <= n; i++) {
    const ox = cx + dx * i * gap - dy * span;
    const oy = cy + dy * i * gap + dx * span;
    const ex = cx + dx * i * gap + dy * span;
    const ey = cy + dy * i * gap - dx * span;
    const pts = [];
    for (let k = 0; k <= 3; k++) {
      pts.push([ox + ((ex - ox) * k) / 3 + (rng.next() - 0.5) * 2, oy + ((ey - oy) * k) / 3 + (rng.next() - 0.5) * 2]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[3][0], pts[3][1]);
    ctx.strokeStyle = o.color || PALETTE.inkSoft;
    ctx.lineWidth = o.width ?? 0.8;
    ctx.globalAlpha = (o.alpha ?? 0.5) * (0.6 + rng.next() * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Seeded speckle + fibre paper background. Deterministic per (w,h,seed). */
export function paperTexture(ctx, w, h, seed = 1) {
  const rng = createRng(seed);
  const g = ctx.createLinearGradient(0, 0, w * 0.6, h);
  g.addColorStop(0, PALETTE.paper);
  g.addColorStop(1, PALETTE.paperShade);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const speckles = Math.round((w * h) / 4200);
  for (let i = 0; i < speckles; i++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    ctx.fillStyle = rng.next() < 0.5 ? '#d8cbaf' : '#fffaf0';
    ctx.globalAlpha = 0.25 + rng.next() * 0.35;
    ctx.fillRect(x, y, 1 + rng.next() * 2, 1 + rng.next() * 1.5);
  }
  for (let i = 0; i < 26; i++) {
    const y = rng.next() * h;
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#cbbda0';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + (rng.next() - 0.5) * 14, w * 0.7, y + (rng.next() - 0.5) * 14, w, y + (rng.next() - 0.5) * 8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 印章（红色小方章），给画面一点传统味道。 */
export function sealStamp(ctx, x, y, size = 18, seed = 9) {
  const rng = createRng(seed);
  ctx.save();
  ctx.globalAlpha = 0.78;
  roughRect(ctx, x, y, size, size, { color: PALETTE.red, width: 1.8, seed, passes: 2 });
  for (let i = 0; i < 3; i++) {
    const yy = y + size * (0.28 + i * 0.22);
    inkStroke(ctx, [[x + size * 0.22, yy], [x + size * 0.5 + (rng.next() - 0.5) * 3, yy], [x + size * 0.78, yy]],
      { color: PALETTE.red, width: 1.4, seed: seed + i * 31, passes: 1 });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** A rough "brush" bundling a seed so callers don't thread it through. */
export function brush(seed = 1) {
  let n = seed;
  return {
    next: () => (n = (n * 1103515245 + 12345) >>> 0),
    line: (ctx, a, b, o) => roughLine(ctx, a[0], a[1], b[0], b[1], { ...o, seed: o?.seed ?? n }),
    stroke: (ctx, pts, o) => inkStroke(ctx, pts, { ...o, seed: o?.seed ?? n }),
  };
}
