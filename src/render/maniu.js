// 马牛 —— 马头 + 牛角的手绘旅伴。全部用墨线画出，无需素材。
// 单位坐标：脚底中心为 (0,0)，整体约 1.0 宽 × 1.05 高，调用处乘 scale。

import { inkStroke, roughLine, roughEllipse, washFill, hatch, roughPoly, boilSeed, PALETTE } from './ink.js';

export const POSES = ['idle', 'walk', 'sleep', 'read', 'sniff'];

export function drawManiu(ctx, { x, y, scale = 120, t = 0, pose = 'idle', facing = 1, satchel = false, scarf = true, hat = false } = {}) {
  const s = boilSeed(t, 17);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);

  const breath = Math.sin(t / 780) * 0.012;
  const bob = pose === 'walk' ? Math.sin(t / 180) * 0.014 : Math.sin(t / 900) * 0.008;
  const tilt = pose === 'sleep' ? 0.16 : 0;

  // ground shadow
  washFill(ctx, ellipsePts(0, -0.01, 0.42, 0.06), PALETTE.inkSoft, 0.16, s + 1);

  ctx.translate(0, bob);
  if (tilt) ctx.rotate(-tilt * 0.4);

  const bodyCy = -0.40;
  const bodyRx = 0.34;
  const bodyRy = 0.19 + breath;

  // ---- legs -------------------------------------------------------------
  const walk = pose === 'walk';
  const legs = [
    [-0.22, -0.20, walk ? Math.sin(t / 180) : 0],
    [-0.10, -0.20, walk ? Math.sin(t / 180 + Math.PI) : 0],
    [0.14, -0.20, walk ? Math.sin(t / 180 + Math.PI) : 0],
    [0.26, -0.20, walk ? Math.sin(t / 180) : 0],
  ];
  for (const [lx, ly, phase] of legs) {
    const footX = lx + phase * 0.06;
    inkStroke(ctx, [[lx, ly], [lx + phase * 0.02, ly - 0.10], [footX, 0]], { width: 2.1, seed: s + Math.round(lx * 100), passes: 2 });
    inkStroke(ctx, [[footX - 0.035, 0], [footX + 0.04, 0]], { width: 2.4, seed: s + 3 + Math.round(lx * 100), passes: 1 });
  }

  // ---- body ------------------------------------------------------------
  const body = ellipsePts(0, bodyCy, bodyRx, bodyRy);
  washFill(ctx, body, '#efe4cf', 0.85, s + 5);
  roughPoly(ctx, body, { width: 2.2, seed: s + 6, jitter: 1.4 });
  hatch(ctx, [[-0.26, bodyCy], [0.20, bodyCy - 0.06], [0.22, bodyCy + 0.12], [-0.22, bodyCy + 0.16]],
    { angle: -Math.PI / 3.4, gap: 8, alpha: 0.30, seed: s + 7 });

  // ---- tail ------------------------------------------------------------
  const tailSway = Math.sin(t / 620) * 0.02;
  inkStroke(ctx, [
    [-bodyRx + 0.01, bodyCy - 0.05],
    [-bodyRx - 0.07, bodyCy + 0.02 + tailSway],
    [-bodyRx - 0.06, bodyCy + 0.12 + tailSway],
  ], { width: 2.0, seed: s + 11, passes: 2 });
  inkStroke(ctx, [
    [-bodyRx - 0.06, bodyCy + 0.12 + tailSway],
    [-bodyRx - 0.12, bodyCy + 0.17 + tailSway],
    [-bodyRx - 0.10, bodyCy + 0.24 + tailSway],
  ], { width: 1.6, seed: s + 12, passes: 2, color: PALETTE.inkSoft });

  // ---- neck ------------------------------------------------------------
  const headCy = -0.90 + (pose === 'sniff' ? 0.18 : 0);
  const headCx = 0.44;
  const neck = [
    [0.20, bodyCy - 0.13],
    [0.30, bodyCy - 0.30],
    [headCx - 0.06, headCy + 0.08],
    [headCx + 0.02, headCy + 0.04],
    [0.26, bodyCy - 0.14],
  ];
  washFill(ctx, neck, '#efe4cf', 0.85, s + 13);
  roughPoly(ctx, neck, { width: 2.1, seed: s + 14, jitter: 1.2, close: true });

  // mane tufts
  for (let i = 0; i < 4; i++) {
    const p = i / 3;
    const mx = 0.20 + (headCx - 0.24) * p;
    const my = bodyCy - 0.16 - (bodyCy - 0.16 - headCy) * p * 0;
    inkStroke(ctx, [
      [mx - 0.02, my - 0.02 - p * 0.0],
      [mx - 0.10 - p * 0.03, my + 0.03 + p * 0.06],
      [mx - 0.06 - p * 0.02, my + 0.11 + p * 0.10],
    ], { width: 1.8, seed: s + 20 + i, passes: 2, color: PALETTE.ink });
  }

  // ---- head (horse: long muzzle) ---------------------------------------
  const head = [
    [headCx - 0.10, headCy - 0.10],
    [headCx + 0.06, headCy - 0.14],
    [headCx + 0.20, headCy - 0.06],
    [headCx + 0.26, headCy + 0.02],
    [headCx + 0.22, headCy + 0.10],
    [headCx + 0.02, headCy + 0.13],
    [headCx - 0.12, headCy + 0.06],
  ];
  washFill(ctx, head, '#f2e8d6', 0.9, s + 30);
  roughPoly(ctx, head, { width: 2.2, seed: s + 31, jitter: 1.1 });

  // muzzle + nostril + mouth
  roughEllipse(ctx, headCx + 0.22, headCy + 0.03, 0.055, 0.045, { width: 1.6, seed: s + 32, passes: 2 });
  inkStroke(ctx, [[headCx + 0.275, headCy + 0.02], [headCx + 0.285, headCy + 0.05]], { width: 1.4, seed: s + 33, passes: 1 });
  inkStroke(ctx, [[headCx + 0.16, headCy + 0.10], [headCx + 0.23, headCy + 0.085]], { width: 1.4, seed: s + 34, passes: 1 });

  // eye (closed when asleep)
  if (pose === 'sleep') {
    inkStroke(ctx, [[headCx + 0.02, headCy - 0.02], [headCx + 0.07, headCy + 0.01], [headCx + 0.11, headCy - 0.01]], { width: 1.6, seed: s + 35, passes: 1 });
  } else {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(headCx + 0.065, headCy - 0.01, 0.019, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    inkStroke(ctx, [[headCx + 0.02, headCy - 0.055], [headCx + 0.075, headCy - 0.045], [headCx + 0.12, headCy - 0.055]], { width: 1.3, seed: s + 36, passes: 1 });
  }

  // ---- ox horns --------------------------------------------------------
  // 牛角：从额顶向两侧弯出再上翘，带两道环纹。
  const hornBase = [headCx - 0.04, headCy - 0.13];
  drawHorn(ctx, hornBase, 1, s + 40);
  drawHorn(ctx, hornBase, -1, s + 50);

  // ---- accessories -----------------------------------------------------
  if (hat) {
    roughPoly(ctx, [
      [headCx - 0.20, headCy - 0.19],
      [headCx + 0.18, headCy - 0.21],
      [headCx + 0.12, headCy - 0.30],
      [headCx - 0.12, headCy - 0.30],
    ], { width: 1.8, seed: s + 60, passes: 2 });
  }
  if (scarf) {
    const scarfY = bodyCy - 0.17;
    washFill(ctx, [[0.06, scarfY + 0.03], [0.30, scarfY - 0.02], [0.32, scarfY + 0.07], [0.08, scarfY + 0.10]], PALETTE.red, 0.55, s + 61);
    inkStroke(ctx, [[0.06, scarfY + 0.03], [0.30, scarfY - 0.02], [0.32, scarfY + 0.07], [0.08, scarfY + 0.10]], { width: 1.6, seed: s + 62, passes: 1, color: PALETTE.red });
    const flap = Math.sin(t / 520) * 0.03;
    inkStroke(ctx, [[0.10, scarfY + 0.09], [0.02, scarfY + 0.18 + flap], [-0.02, scarfY + 0.28 + flap]], { width: 1.7, seed: s + 63, color: PALETTE.red, passes: 2 });
  }
  if (satchel) {
    inkStroke(ctx, [[0.10, bodyCy - 0.12], [-0.06, bodyCy + 0.06]], { width: 1.8, seed: s + 70, passes: 1, color: PALETTE.clay });
    washFill(ctx, [[-0.22, bodyCy + 0.02], [0.02, bodyCy + 0.04], [0.04, bodyCy + 0.18], [-0.20, bodyCy + 0.17]], PALETTE.clay, 0.5, s + 71);
    roughPoly(ctx, [[-0.22, bodyCy + 0.02], [0.02, bodyCy + 0.04], [0.04, bodyCy + 0.18], [-0.20, bodyCy + 0.17]],
      { width: 1.8, seed: s + 72, passes: 2, color: PALETTE.clay });
  }
  if (pose === 'read') {
    washFill(ctx, [[-0.30, bodyCy - 0.02], [-0.06, bodyCy - 0.05], [-0.06, bodyCy + 0.09], [-0.30, bodyCy + 0.11]], '#fbf5e6', 0.9, s + 80);
    roughPoly(ctx, [[-0.30, bodyCy - 0.02], [-0.06, bodyCy - 0.05], [-0.06, bodyCy + 0.09], [-0.30, bodyCy + 0.11]],
      { width: 1.7, seed: s + 81, passes: 2 });
    inkStroke(ctx, [[-0.18, bodyCy - 0.04], [-0.18, bodyCy + 0.10]], { width: 1.2, seed: s + 82, passes: 1 });
  }

  ctx.restore();
}

function drawHorn(ctx, [bx, by], dir, seed) {
  const pts = [
    [bx, by],
    [bx + 0.05 * dir, by - 0.06],
    [bx + 0.13 * dir, by - 0.08],
    [bx + 0.17 * dir, by - 0.17],
    [bx + 0.14 * dir, by - 0.26],
  ];
  washFill(ctx, pts.map(([px, py]) => [px, py]), '#e8dcc2', 0.9, seed);
  inkStroke(ctx, pts, { width: 2.0, seed: seed + 1, passes: 2 });
  for (let i = 0; i < 2; i++) {
    const p = pts[1 + i];
    inkStroke(ctx, [[p[0] - 0.018 * dir, p[1]], [p[0] + 0.02 * dir, p[1] + 0.012]], { width: 1.1, seed: seed + 10 + i, passes: 1 });
  }
  roughLine(ctx, bx - 0.02 * dir, by + 0.004, bx + 0.03 * dir, by - 0.01, { width: 1.2, seed: seed + 20, passes: 1 });
}

function ellipsePts(cx, cy, rx, ry, steps = 18) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Convenience: the little "away" stamp shown while 马牛 is travelling. */
export function drawManiuPostmark(ctx, x, y, scale, t, label = '在路上') {
  const s = boilSeed(t, 91);
  roughEllipse(ctx, x, y, 0.5 * scale, 0.34 * scale, { width: 2, seed: s, color: PALETTE.inkSoft, passes: 2 });
  ctx.save();
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = `${Math.round(scale * 0.24)}px "Songti SC", "STSong", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.85;
  ctx.fillText(label, x, y);
  ctx.restore();
  ctx.globalAlpha = 1;
}
