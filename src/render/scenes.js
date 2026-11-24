// 场景绘制：房间 / 庭院 / 明信片 / 访客 / 地图 / 特产图标。
// 全部程序化生成，尺寸自适应，可在手机竖屏与手表窄屏下工作。

import { PALETTE, inkStroke, roughLine, roughEllipse, roughRect, roughPoly, washFill, hatch, paperTexture, sealStamp, boilSeed } from './ink.js';
import { drawManiu } from './maniu.js';
import { POSTCARDS_BY_ID, SPOTS_BY_ID, SPOTS } from '../data/spots.js';
import { VISITORS_BY_ID } from '../data/visitors.js';
import { weatherAt } from '../core/weather.js';
import { seasonAccent, seasonPaper, seasonName, seasonIndex } from '../core/season.js';

/** 每个地点用哪一套手绘景。新增地点时只在这里加一行。 */
export const SPOT_SCENE = {
  houshan: 'hills', reed_marsh: 'water', stone_bridge: 'village',
  creek_town: 'town', old_tea_hill: 'hills', terraces: 'hills',
  old_pier: 'town', bamboo_temple: 'village', lighthouse: 'sea',
  salt_lake: 'desert', desert_post: 'desert', snow_pass: 'snow',
  aurora_field: 'night', islands: 'sea', ginkgo: 'village', star_camp: 'night',
};

export function poseOf(maniu) {
  if (maniu.status === 'away') return null;
  if (maniu.activity && maniu.activity.includes('看书')) return 'read';
  if (maniu.activity && (maniu.activity.includes('打盹') || maniu.activity.includes('睡'))) return 'sleep';
  if (maniu.trip) return 'walk';
  return 'idle';
}

// ------------------------------------------------------------------ 房间

export function drawRoom(ctx, w, h, state, t) {
  const s = boilSeed(t, 3);
  paperTexture(ctx, w, h, 11);
  const floorY = h * 0.70;

  // back wall + floor (seasonal tint on the wall)
  washFill(ctx, [[0, 0], [w, 0], [w, floorY], [0, floorY]], seasonPaper(state.now), 0.55, s + 1);
  hatch(ctx, [[0, floorY - 2], [w, floorY - 2], [w, h], [0, h]], { angle: Math.PI / 12, gap: 16, alpha: 0.18, seed: s + 2 });
  roughLine(ctx, 0, floorY, w, floorY, { width: 2, seed: s + 3, jitter: 1.6 });

  // window
  const wx = w * 0.52, wy = h * 0.10, ww = w * 0.40, wh = h * 0.30;
  washFill(ctx, [[wx, wy], [wx + ww, wy], [wx + ww, wy + wh], [wx, wy + wh]], '#dfe7ef', 0.75, s + 4);
  roughRect(ctx, wx, wy, ww, wh, { width: 2, seed: s + 5 });
  inkStroke(ctx, [[wx + ww / 2, wy], [wx + ww / 2, wy + wh]], { width: 1.6, seed: s + 6 });
  inkStroke(ctx, [[wx, wy + wh / 2], [wx + ww, wy + wh / 2]], { width: 1.6, seed: s + 7 });
  // moon + hills outside
  roughEllipse(ctx, wx + ww * 0.72, wy + wh * 0.30, ww * 0.07, wh * 0.11, { width: 1.4, seed: s + 8, color: PALETTE.gold });
  inkStroke(ctx, [[wx + 2, wy + wh * 0.80], [wx + ww * 0.4, wy + wh * 0.62], [wx + ww - 2, wy + wh * 0.82]], { width: 1.6, seed: s + 9, color: PALETTE.blue });
  drawThroughWindow(ctx, wx, wy, ww, wh, weatherAt(state.now), t, s + 200);

  // shelf with jars
  const shx = w * 0.06, shy = h * 0.20, shw = w * 0.34;
  roughLine(ctx, shx, shy, shx + shw, shy, { width: 2.2, seed: s + 10 });
  for (let i = 0; i < 3; i++) {
    const jx = shx + shw * (0.16 + i * 0.30);
    const jw = w * 0.055, jh = h * 0.055;
    washFill(ctx, [[jx, shy - jh], [jx + jw, shy - jh], [jx + jw, shy], [jx, shy]], i % 2 ? '#e2d3b0' : '#dfe4d6', 0.85, s + 11 + i);
    roughPoly(ctx, [[jx, shy - jh], [jx + jw, shy - jh], [jx + jw, shy], [jx, shy]], { width: 1.5, seed: s + 20 + i });
    roughLine(ctx, jx, shy - jh * 1.25, jx + jw, shy - jh * 1.25, { width: 1.2, seed: s + 30 + i });
  }

  // desk + lamp + book
  const dx = w * 0.08, dy = h * 0.52;
  roughLine(ctx, dx, dy, dx + w * 0.26, dy, { width: 2.4, seed: s + 40 });
  roughLine(ctx, dx + 3, dy, dx + 3, dy + h * 0.10, { width: 2, seed: s + 41 });
  roughLine(ctx, dx + w * 0.26 - 3, dy, dx + w * 0.26 - 3, dy + h * 0.10, { width: 2, seed: s + 42 });
  washFill(ctx, [[dx + w * 0.03, dy - h * 0.045], [dx + w * 0.12, dy - h * 0.05], [dx + w * 0.12, dy - 2], [dx + w * 0.03, dy - 2]], '#fdf7e8', 0.95, s + 43);
  roughPoly(ctx, [[dx + w * 0.03, dy - h * 0.045], [dx + w * 0.12, dy - h * 0.05], [dx + w * 0.12, dy - 2], [dx + w * 0.03, dy - 2]], { width: 1.5, seed: s + 44 });
  inkStroke(ctx, [[dx + w * 0.075, dy - h * 0.045], [dx + w * 0.075, dy - 4]], { width: 1, seed: s + 45 });

  // 摆出来的收藏：四个槽位（桌台/窗台/地板/墙上挂画），各自有不同的画法。
  const decor = state.decor || {};
  // 桌台：桌角的小木台
  if (decor.shelf) {
    const gx = dx + w * 0.20, gy = dy - h * 0.05;
    roughLine(ctx, gx - Math.min(w, h) * 0.055, gy + h * 0.008, gx + Math.min(w, h) * 0.055, gy + h * 0.008, { width: 1.6, seed: s + 46 });
    roughLine(ctx, gx, gy + h * 0.008, gx, gy + h * 0.024, { width: 1.4, seed: s + 47 });
    drawSouvenirGlyph(ctx, gx, gy, Math.min(w, h) * 0.045, decor.shelf, t);
  }
  // 窗台：窗下一条台沿
  if (decor.sill) {
    const sx = wx + ww * 0.5, sy = wy + wh + h * 0.055;
    const r = Math.min(w, h) * 0.045;
    roughLine(ctx, sx - r * 1.5, sy + r * 0.9, sx + r * 1.5, sy + r * 0.9, { width: 1.6, seed: s + 48 });
    drawSouvenirGlyph(ctx, sx, sy, r, decor.sill, t);
  }
  // 地板：一块小垫子上的摆件
  if (decor.floor) {
    const fx = w * 0.70, fy = floorY + h * 0.14;
    const r = Math.min(w, h) * 0.06;
    roughEllipse(ctx, fx, fy + r * 0.75, r * 1.4, r * 0.45, { width: 1.4, seed: s + 49 });
    drawSouvenirGlyph(ctx, fx, fy, r, decor.floor, t);
  }
  // 墙上：挂画（挂绳 + 卷轴框）
  if (decor.wall) {
    const wx2 = w * 0.46, wy2 = h * 0.30;
    const r = Math.min(w, h) * 0.045;
    roughLine(ctx, wx2, wy2 - r * 2.4, wx2, wy2 - r * 1.2, { width: 1.2, seed: s + 52 });
    roughRect(ctx, wx2 - r * 1.1, wy2 - r * 1.1, r * 2.2, r * 2.2, { width: 1.4, seed: s + 53 });
    drawSouvenirGlyph(ctx, wx2, wy2, r * 0.8, decor.wall, t);
  }

  // bed / quilt at the left front
  const bx = w * 0.03, by = h * 0.84, bw = w * 0.42, bh = h * 0.13;
  washFill(ctx, [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]], '#cfc3ad', 0.5, s + 50);
  roughRect(ctx, bx, by, bw, bh, { width: 1.8, seed: s + 51 });
  for (let i = 0; i < 3; i++) {
    const px = bx + bw * (0.18 + i * 0.26);
    inkStroke(ctx, [[px, by + 3], [px + 6, by + bh - 3]], { width: 1, seed: s + 60 + i, color: PALETTE.clay, alpha: 0.6 });
  }

  // 马牛
  const pose = poseOf(state.maniu);
  if (pose) {
    const satchel = Boolean(state.luggage.snack || state.luggage.tool);
    const hat = state.luggage.tool === 'straw_hat';
    const scale = Math.min(h * 0.34, w * 0.30);
    drawManiu(ctx, { x: w * 0.30, y: floorY + h * 0.12, scale, t, pose, satchel, hat, facing: 1 });
  } else {
    ctx.save();
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.font = `${Math.round(Math.min(w, h) * 0.035)}px "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.8;
    const spot = state.maniu.trip ? SPOTS_BY_ID[state.maniu.trip.spotId] : null;
    ctx.fillText(spot ? `马牛正在 ${spot.name} 的路上` : '马牛出门了', w * 0.5, floorY + h * 0.06);
    ctx.restore();
    ctx.globalAlpha = 1;
    // a postmark-y stamp
    roughEllipse(ctx, w * 0.78, floorY + h * 0.05, Math.min(w, h) * 0.10, Math.min(w, h) * 0.07, { width: 1.6, seed: s + 70, color: PALETTE.inkSoft });
  }

  // framed postcard on the wall (memory of the last trip)
  const last = state.album[state.album.length - 1];
  if (last) {
    const fx = w * 0.06, fy = h * 0.36, fw = w * 0.16, fh = h * 0.11;
    roughRect(ctx, fx, fy, fw, fh, { width: 2, seed: s + 80 });
    drawPostcardScene(ctx, fx + 3, fy + 3, fw - 6, fh - 6, SPOTS_BY_ID[last.spotId], t, { bare: true });
  }
  sealStamp(ctx, w - 34, h - 34, 20, 5);
}

// ---------------------------------------------------------------- 庭院

export function drawGarden(ctx, w, h, state, t, visitor = null) {
  const s = boilSeed(t, 13);
  paperTexture(ctx, w, h, 21);
  const horizon = h * 0.42;

  const sky = weatherAt(state.now);
  washFill(ctx, [[0, 0], [w, 0], [w, horizon], [0, horizon]], sky === 'rain' ? '#dbe3e6' : '#eaf0f3', 0.6, s + 1);
  // far hills
  inkStroke(ctx, [[0, horizon], [w * 0.22, horizon - h * 0.10], [w * 0.46, horizon - h * 0.02], [w * 0.70, horizon - h * 0.13], [w, horizon]], { width: 2, seed: s + 2, color: PALETTE.inkSoft });
  hatch(ctx, [[0, horizon], [w, horizon], [w, h], [0, h]], { angle: -Math.PI / 8, gap: 14, alpha: 0.14, seed: s + 3 });

  if (sky !== 'clear') drawRainOrWind(ctx, 0, 0, w, horizon * 1.05, sky, t, s + 300);

  // fence
  const fy = h * 0.52;
  roughLine(ctx, w * 0.04, fy, w * 0.96, fy, { width: 2, seed: s + 4 });
  roughLine(ctx, w * 0.04, fy + 12, w * 0.96, fy + 12, { width: 1.6, seed: s + 5 });
  for (let i = 0; i <= 8; i++) {
    const x = w * 0.04 + (w * 0.92 * i) / 8;
    roughLine(ctx, x, fy - 12, x, fy + 22, { width: 1.6, seed: s + 6 + i });
  }

  // 铜钱草地（货币：摘了当钱用）
  const bedY = h * 0.62, bedH = h * 0.30;
  washFill(ctx, [[w * 0.04, bedY], [w * 0.96, bedY + 6], [w * 0.96, bedY + bedH], [w * 0.04, bedY + bedH]], '#d9cdb4', 0.55, s + 20);
  roughRect(ctx, w * 0.04, bedY, w * 0.92, bedH, { width: 1.6, seed: s + 21 });

  const patches = state.patches;
  const cols = 4;
  const rows = Math.ceil(patches.length / cols);
  patches.forEach((p, i) => {
    const cx = w * (0.16 + (i % cols) * 0.225);
    const cy = bedY + bedH * ((i / cols + 0.5) / rows);
    const ready = p.readyAt <= state.now;
    drawCoinGrass(ctx, cx, cy, Math.min(w, h) * 0.055, ready, t, s + 100 + i);
  });

  // 马牛 in the yard
  const pose = poseOf(state.maniu);
  if (pose) {
    drawManiu(ctx, {
      x: w * 0.30, y: h * 0.90, scale: Math.min(h * 0.30, w * 0.26), t,
      pose: pose === 'read' ? 'sniff' : pose,
      satchel: Boolean(state.luggage.snack),
      hat: state.luggage.tool === 'straw_hat',
    });
  }

  if (visitor && visitor.info) {
    drawVisitor(ctx, w * 0.74, h * 0.575, Math.min(w, h) * 0.055, visitor.info.id, t);
    if (sky === 'rain') {
      // 躲雨：给访客画一片小屋檐
      const vx = w * 0.74, vy = h * 0.575;
      inkStroke(ctx, [[vx - w * 0.07, vy - h * 0.045], [vx + w * 0.05, vy - h * 0.06]], { width: 1.8, seed: s + 90 });
      washFill(ctx, [[vx - w * 0.07, vy - h * 0.045], [vx + w * 0.05, vy - h * 0.06], [vx + w * 0.04, vy - h * 0.02], [vx - w * 0.06, vy - h * 0.015]], PALETTE.clay, 0.4, s + 91);
      roughLine(ctx, vx - w * 0.055, vy - h * 0.02, vx - w * 0.055, vy - h * 0.035, { width: 1.3, seed: s + 92 });
    }
  }

  // tree in the corner
  const tx = w * 0.88, ty = h * 0.52;
  inkStroke(ctx, [[tx, ty + h * 0.16], [tx - 3, ty + h * 0.05], [tx, ty]], { width: 2.4, seed: s + 40 });
  washFill(ctx, [[tx, ty - h * 0.10], [tx + w * 0.11, ty - h * 0.02], [tx + w * 0.02, ty + h * 0.07], [tx - w * 0.09, ty - h * 0.01]], PALETTE.green, 0.35, s + 41);
  roughPoly(ctx, [[tx, ty - h * 0.10], [tx + w * 0.11, ty - h * 0.02], [tx + w * 0.02, ty + h * 0.07], [tx - w * 0.09, ty - h * 0.01]], { width: 1.8, seed: s + 42 });

  // 流水 + 落花飞叶（春=落花，秋=飞叶）
  drawStream(ctx, w, h, t, s + 70);
  drawFallingFlorals(ctx, w, h, state, t, s + 80);
}

/** 流水：庭院底边一道弯弯的溪流，用来投花叶许愿。 */
function drawStream(ctx, w, h, t, s) {
  const y = h * 0.945;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const x = (w * i) / 10;
    pts.push([x, y + Math.sin(x / 14 + t / 900) * 3]);
  }
  inkStroke(ctx, pts, { width: 1.6, seed: s, color: PALETTE.blue, alpha: 0.7, passes: 1 });
}

/** 落花飞叶：春天落花、秋天飞叶，随季节在庭院里飘（确定性：时间 + hash）。 */
function drawFallingFlorals(ctx, w, h, state, t, s) {
  const season = seasonIndex(state.now);
  if (season !== 0 && season !== 2) return;
  const petal = season === 0;
  const n = petal ? 7 : 6;
  for (let i = 0; i < n; i++) {
    const hx = w * (0.06 + (hash((petal ? 'p' : 'l') + i) % 88) / 100);
    const fall = ((t / (petal ? 60 : 42) + (hash('f' + i) % 40) / 40) % 1);
    const hy = fall * h * 0.55;
    const r = Math.min(w, h) * (petal ? 0.015 : 0.022);
    const x = hx + Math.sin(t / 520 + i * 2.3) * r * 1.8;
    if (petal) {
      washFill(ctx, circlePts(x, hy, r), PALETTE.red, 0.5, s + i);
      roughEllipse(ctx, x, hy, r, r * 0.7, { width: 1, seed: s + 20 + i, color: PALETTE.red, passes: 1 });
    } else {
      inkStroke(ctx, [[x, hy - r], [x + r * 1.3, hy], [x, hy + r], [x - r * 1.3, hy], [x, hy - r]], { width: 1.1, seed: s + 20 + i, color: PALETTE.clay, passes: 1 });
    }
  }
}

/** 窗外天气：雨丝斜落 / 风把云吹成斜线。 */
function drawThroughWindow(ctx, x, y, w, h, sky, t, seed) {
  if (sky === 'clear') {
    // a few drifting clouds so the outdoors never looks static
    const drift = (t / 90) % (w + 40) - 20;
    inkStroke(ctx, [[x + drift - 16, y + h * 0.24], [x + drift + 14, y + h * 0.22]], { width: 1.2, seed, color: PALETTE.inkSoft, alpha: 0.5, passes: 1 });
    return;
  }
  const slant = sky === 'wind' ? 0.55 : 0.28;
  for (let i = 0; i < 7; i++) {
    const rx = x + 4 + ((i * 37 + ((t / 40) | 0)) % Math.max(8, w - 8));
    const ry = y + 5 + ((i * 23) % Math.max(8, h - 10));
    inkStroke(ctx, [[rx, ry], [rx - w * slant * 0.12, ry + h * 0.18]], { width: 1, seed: seed + i, color: PALETTE.blue, alpha: 0.65, passes: 1 });
  }
}

/** 庭院里的天气：雨丝（带伞感的疏密）或风线。 */
function drawRainOrWind(ctx, x, y, w, h, sky, t, seed) {
  const lines = sky === 'rain' ? 46 : 14;
  for (let i = 0; i < lines; i++) {
    const rx = x + (((i * 61 + ((t / 26) | 0) * 3) % 100) / 100) * w;
    const ry = y + (((i * 37) % 100) / 100) * h;
    if (sky === 'rain') {
      inkStroke(ctx, [[rx, ry], [rx - w * 0.008, ry + h * 0.05]], { width: 0.9, seed: seed + i, color: PALETTE.blue, alpha: 0.55, passes: 1 });
    } else {
      inkStroke(ctx, [[rx, ry], [rx + w * 0.10, ry - h * 0.012]], { width: 0.9, seed: seed + i, color: PALETTE.inkSoft, alpha: 0.4, passes: 1 });
    }
  }
}

/** 铜钱草：圆圆的叶子像一枚枚铜钱。成熟 = 一轮圆叶；未成熟 = 一个小芽。 */
function drawCoinGrass(ctx, cx, cy, r, ready, t, seed) {
  const sway = Math.sin(t / 640 + seed) * 0.04;
  if (!ready) {
    inkStroke(ctx, [[cx, cy + r * 0.3], [cx, cy - r * 0.05]], { width: 1.4, seed, color: PALETTE.greenDeep, passes: 1 });
    roughEllipse(ctx, cx, cy - r * 0.14, r * 0.22, r * 0.17, { width: 1.4, seed: seed + 1, color: PALETTE.greenDeep, passes: 1 });
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sway);
  // 主茎
  inkStroke(ctx, [[0, r * 0.4], [0, -r * 0.1]], { width: 1.6, seed, color: PALETTE.greenDeep, passes: 1 });
  // 几片圆叶向四周伸开
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI / 2 + (k - 1.5) * Math.PI / 3.2;
    const hx = Math.cos(a) * r * 0.52;
    const hy = Math.sin(a) * r * 0.52;
    inkStroke(ctx, [[0, -r * 0.08], [hx, hy]], { width: 1.2, seed: seed + 10 + k, color: PALETTE.greenDeep, passes: 1 });
    washFill(ctx, circlePts(hx, hy, r * 0.30), PALETTE.green, 0.4, seed + 30 + k);
    roughEllipse(ctx, hx, hy, r * 0.30, r * 0.24, { width: 1.5, seed: seed + 20 + k, color: PALETTE.greenDeep, passes: 1 });
    // 铜钱心（叶柄着生点）
    ctx.save();
    ctx.fillStyle = PALETTE.greenDeep;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// --------------------------------------------------------------- 明信片

export function drawPostcardScene(ctx, x, y, w, h, spot, t, opts = {}) {
  const family = (spot && SPOT_SCENE[spot.id]) || 'hills';
  const s = boilSeed(t, (spot ? spot.id.length * 31 : 5) + 7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (!opts.bare) paperTexture(ctx, x + w, y + h, 31);
  const paper = opts.wet ? '#eef0ee' : seasonPaper(opts.now ?? 0);
  washFill(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], paper, 0.9, s + 1);
  (SCENES[family] || SCENES.hills)(ctx, x, y, w, h, t, s);
  if (opts.wet) drawWetMarks(ctx, x, y, w, h, t, s);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (!opts.bare) {
    roughRect(ctx, x, y, w, h, { width: 1.6, seed: s + 2, bow: 1.2 });
    const p = POSTCARDS_BY_ID[opts.postcardId];
    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `${Math.max(9, Math.round(h * 0.09))}px "Songti SC", "STSong", serif`;
    ctx.globalAlpha = 0.85;
    ctx.fillText((p ? p.title : (spot ? spot.name : '')) + (opts.wet ? ' · 淋湿' : ''), x + w * 0.06, y + h * 0.94);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** 淋湿的一角：水渍与斜雨，覆盖在明信片画面上。 */
function drawWetMarks(ctx, x, y, w, h, t, seed) {
  for (let i = 0; i < 12; i++) {
    const rx = x + (((i * 53 + ((t / 40) | 0)) % 100) / 100) * w;
    const ry = y + (((i * 31) % 100) / 100) * h;
    inkStroke(ctx, [[rx, ry], [rx - w * 0.012, ry + h * 0.06]], { width: 0.9, seed: seed + 500 + i, color: PALETTE.blue, alpha: 0.5, passes: 1 });
  }
  // a water-stained corner
  const wx = x + w * 0.82, wy = y + h * 0.78;
  washFill(ctx, [[wx, wy], [wx + w * 0.16, wy], [wx + w * 0.12, wy + h * 0.16], [wx, wy + h * 0.14]], '#cdd9d8', 0.35, seed + 600);
  inkStroke(ctx, [[wx, wy], [wx + w * 0.16, wy], [wx + w * 0.12, wy + h * 0.16], [wx, wy + h * 0.14]], { width: 1.1, seed: seed + 601, color: PALETTE.blue, alpha: 0.6, passes: 1 });
}

const SCENES = {
  hills(ctx, x, y, w, h, t, s) {
    inkStroke(ctx, [[x, y + h * 0.62], [x + w * 0.3, y + h * 0.34], [x + w * 0.52, y + h * 0.58], [x + w * 0.78, y + h * 0.30], [x + w, y + h * 0.55]], { width: 2, seed: s, color: PALETTE.inkSoft });
    hatch(ctx, [[x, y + h * 0.55], [x + w * 0.42, y + h * 0.3], [x + w, y + h * 0.5], [x + w, y + h], [x, y + h]], { angle: -Math.PI / 5, gap: 9, alpha: 0.2, seed: s + 1 });
    for (let i = 0; i < 4; i++) {
      const tx = x + w * (0.62 + i * 0.09);
      roughLine(ctx, tx, y + h * 0.72, tx, y + h * 0.58, { width: 1.4, seed: s + 10 + i, color: PALETTE.greenDeep });
      roughEllipse(ctx, tx, y + h * 0.54, w * 0.035, h * 0.07, { width: 1.3, seed: s + 20 + i, color: PALETTE.greenDeep, passes: 1 });
    }
    roughEllipse(ctx, x + w * 0.20, y + h * 0.20, w * 0.06, h * 0.10, { width: 1.4, seed: s + 30, color: PALETTE.gold });
  },
  water(ctx, x, y, w, h, t, s) {
    inkStroke(ctx, [[x, y + h * 0.55], [x + w, y + h * 0.5]], { width: 1.8, seed: s, color: PALETTE.blue });
    for (let i = 0; i < 5; i++) {
      const yy = y + h * (0.58 + i * 0.08);
      inkStroke(ctx, [[x + w * 0.08, yy], [x + w * 0.5, yy - 1.5], [x + w * 0.9, yy]], { width: 1.2, seed: s + 5 + i, color: PALETTE.blue, alpha: 0.6, passes: 1 });
    }
    for (let i = 0; i < 7; i++) {
      const rx = x + w * (0.08 + i * 0.13);
      inkStroke(ctx, [[rx, y + h * 0.56], [rx + 2, y + h * 0.30]], { width: 1.4, seed: s + 20 + i, color: PALETTE.inkSoft, passes: 1 });
    }
  },
  village(ctx, x, y, w, h, t, s) {
    washFill(ctx, [[x + w * 0.10, y + h * 0.55], [x + w * 0.44, y + h * 0.55], [x + w * 0.40, y + h * 0.34], [x + w * 0.14, y + h * 0.34]], '#efe0c4', 0.9, s);
    roughPoly(ctx, [[x + w * 0.08, y + h * 0.56], [x + w * 0.46, y + h * 0.56], [x + w * 0.40, y + h * 0.32], [x + w * 0.14, y + h * 0.32]], { width: 1.8, seed: s + 1 });
    inkStroke(ctx, [[x + w * 0.10, y + h * 0.34], [x + w * 0.27, y + h * 0.22], [x + w * 0.44, y + h * 0.33]], { width: 2, seed: s + 2, color: PALETTE.clay });
    hatch(ctx, [[x + w * 0.10, y + h * 0.34], [x + w * 0.27, y + h * 0.22], [x + w * 0.44, y + h * 0.33]], { angle: -Math.PI / 3, gap: 6, alpha: 0.3, seed: s + 3, color: PALETTE.clay });
    roughRect(ctx, x + w * 0.22, y + h * 0.42, w * 0.09, h * 0.14, { width: 1.4, seed: s + 4 });
    // bridge
    inkStroke(ctx, [[x + w * 0.52, y + h * 0.70], [x + w * 0.66, y + h * 0.56], [x + w * 0.86, y + h * 0.56], [x + w * 0.98, y + h * 0.68]], { width: 2, seed: s + 5 });
    inkStroke(ctx, [[x, y + h * 0.78], [x + w, y + h * 0.74]], { width: 1.6, seed: s + 6, color: PALETTE.blue });
  },
  town(ctx, x, y, w, h, t, s) {
    for (let i = 0; i < 4; i++) {
      const bx = x + w * (0.06 + i * 0.23);
      const bw = w * 0.19, bh = h * (0.22 + (i % 2) * 0.08);
      washFill(ctx, [[bx, y + h * 0.72 - bh], [bx + bw, y + h * 0.72 - bh], [bx + bw, y + h * 0.72], [bx, y + h * 0.72]], '#eee1c6', 0.85, s + i);
      roughPoly(ctx, [[bx, y + h * 0.72 - bh], [bx + bw, y + h * 0.72 - bh], [bx + bw, y + h * 0.72], [bx, y + h * 0.72]], { width: 1.6, seed: s + 10 + i });
      inkStroke(ctx, [[bx - 3, y + h * 0.72 - bh], [bx + bw / 2, y + h * 0.72 - bh - h * 0.06], [bx + bw + 3, y + h * 0.72 - bh]], { width: 1.7, seed: s + 20 + i, color: PALETTE.inkSoft });
      roughRect(ctx, bx + bw * 0.3, y + h * 0.62, bw * 0.34, h * 0.10, { width: 1.2, seed: s + 30 + i });
    }
    for (let i = 0; i < 3; i++) {
      const lx = x + w * (0.16 + i * 0.30);
      roughEllipse(ctx, lx, y + h * 0.80, w * 0.03, h * 0.05, { width: 1.3, seed: s + 40 + i, color: PALETTE.red });
    }
    inkStroke(ctx, [[x, y + h * 0.80], [x + w, y + h * 0.78]], { width: 1.6, seed: s + 50, color: PALETTE.blue });
  },
  sea(ctx, x, y, w, h, t, s) {
    inkStroke(ctx, [[x, y + h * 0.52], [x + w, y + h * 0.48]], { width: 1.8, seed: s, color: PALETTE.blue });
    for (let i = 0; i < 4; i++) {
      const yy = y + h * (0.56 + i * 0.09);
      inkStroke(ctx, [[x + w * 0.05, yy], [x + w * 0.5, yy + 2], [x + w * 0.95, yy]], { width: 1.2, seed: s + i, color: PALETTE.blue, alpha: 0.55, passes: 1 });
    }
    washFill(ctx, [[x + w * 0.70, y + h * 0.54], [x + w * 0.78, y + h * 0.24], [x + w * 0.86, y + h * 0.54]], '#e7dcc6', 0.9, s + 10);
    roughPoly(ctx, [[x + w * 0.70, y + h * 0.54], [x + w * 0.78, y + h * 0.24], [x + w * 0.86, y + h * 0.54]], { width: 1.7, seed: s + 11 });
    roughEllipse(ctx, x + w * 0.78, y + h * 0.20, w * 0.022, h * 0.035, { width: 1.2, seed: s + 12, color: PALETTE.gold });
    inkStroke(ctx, [[x + w * 0.10, y + h * 0.46], [x + w * 0.24, y + h * 0.52]], { width: 1.3, seed: s + 13, color: PALETTE.inkSoft });
    inkStroke(ctx, [[x + w * 0.24, y + h * 0.52], [x + w * 0.24, y + h * 0.44]], { width: 1.1, seed: s + 14, color: PALETTE.inkSoft });
  },
  desert(ctx, x, y, w, h, t, s) {
    inkStroke(ctx, [[x, y + h * 0.52], [x + w * 0.34, y + h * 0.47], [x + w, y + h * 0.54]], { width: 2, seed: s });
    hatch(ctx, [[x, y + h * 0.50], [x + w, y + h * 0.52], [x + w, y + h], [x, y + h]], { angle: -Math.PI / 7, gap: 8, alpha: 0.22, seed: s + 1, color: PALETTE.clay });
    roughEllipse(ctx, x + w * 0.74, y + h * 0.26, w * 0.075, h * 0.13, { width: 1.5, seed: s + 2, color: PALETTE.gold });
    // dunes
    for (let i = 0; i < 3; i++) {
      inkStroke(ctx, [[x + w * (0.1 + i * 0.3), y + h * 0.80], [x + w * (0.24 + i * 0.3), y + h * 0.68], [x + w * (0.38 + i * 0.3), y + h * 0.80]], { width: 1.5, seed: s + 10 + i, color: PALETTE.clay, passes: 1 });
    }
  },
  snow(ctx, x, y, w, h, t, s) {
    inkStroke(ctx, [[x, y + h * 0.70], [x + w * 0.28, y + h * 0.30], [x + w * 0.46, y + h * 0.52], [x + w * 0.70, y + h * 0.22], [x + w, y + h * 0.66]], { width: 2, seed: s, color: PALETTE.inkSoft });
    hatch(ctx, [[x + w * 0.28, y + h * 0.30], [x + w * 0.46, y + h * 0.52], [x + w * 0.30, y + h * 0.70]], { angle: Math.PI / 3.2, gap: 6, alpha: 0.16, seed: s + 1 });
    roughLine(ctx, x + w * 0.52, y + h * 0.86, x + w * 0.56, y + h * 0.64, { width: 1.5, seed: s + 2, color: PALETTE.clay });
    for (let i = 0; i < 5; i++) {
      inkStroke(ctx, [[x + w * 0.56, y + h * (0.66 + i * 0.03)], [x + w * (0.60 + (i % 2) * 0.06), y + h * (0.68 + i * 0.03)]], { width: 1.1, seed: s + 10 + i, color: PALETTE.red, passes: 1 });
    }
  },
  night(ctx, x, y, w, h, t, s) {
    washFill(ctx, [[x, y], [x + w, y], [x + w, y + h * 0.72], [x, y + h * 0.72]], '#3a4358', 0.5, s);
    for (let i = 0; i < 22; i++) {
      const sx = x + ((i * 97) % 100) / 100 * w;
      const sy = y + ((i * 53) % 60) / 100 * h;
      ctx.save();
      ctx.fillStyle = '#fdf7e2';
      ctx.globalAlpha = 0.5 + ((i * 7) % 10) / 25;
      ctx.fillRect(sx, sy, 1.6, 1.6);
      ctx.restore();
    }
    for (let i = 0; i < 3; i++) {
      inkStroke(ctx, [
        [x + w * (0.05 + i * 0.02), y + h * (0.10 + i * 0.06)],
        [x + w * 0.5, y + h * (0.04 + i * 0.06)],
        [x + w * 0.95, y + h * (0.14 + i * 0.06)],
      ], { width: 3 - i, seed: s + 10 + i, color: i % 2 ? '#7fbf9a' : '#8fa6d8', alpha: 0.5, passes: 1 });
    }
    inkStroke(ctx, [[x, y + h * 0.72], [x + w * 0.3, y + h * 0.62], [x + w * 0.62, y + h * 0.74], [x + w, y + h * 0.66]], { width: 1.8, seed: s + 20, color: PALETTE.inkSoft });
  },
};

// -------------------------------------------------------------- 访客

export function drawVisitor(ctx, x, y, scale, id, t) {
  const s = boilSeed(t, 200 + id.length * 13);
  const bob = Math.sin(t / 700) * 0.01;
  ctx.save();
  ctx.translate(x, y + bob * scale);
  ctx.scale(scale, scale);
  switch (id) {
    case 'snail':
      roughEllipse(ctx, 0, -0.16, 0.26, 0.20, { width: 1.8, seed: s });
      inkStroke(ctx, [[-0.26, -0.16], [-0.5, -0.10], [-0.72, -0.14]], { width: 1.6, seed: s + 1 });
      inkStroke(ctx, [[-0.72, -0.14], [-0.80, -0.34]], { width: 1.2, seed: s + 2, passes: 1 });
      inkStroke(ctx, [[-0.72, -0.14], [-0.74, -0.36]], { width: 1.2, seed: s + 3, passes: 1 });
      break;
    case 'bee':
      roughEllipse(ctx, 0, -0.18, 0.20, 0.15, { width: 1.8, seed: s, color: PALETTE.gold });
      inkStroke(ctx, [[-0.06, -0.32], [-0.08, -0.04]], { width: 1.2, seed: s + 1, passes: 1 });
      roughEllipse(ctx, -0.10, -0.36 + Math.sin(t / 90) * 0.02, 0.13, 0.07, { width: 1.1, seed: s + 2, passes: 1, color: PALETTE.inkSoft });
      break;
    case 'turtle':
      roughEllipse(ctx, 0, -0.16, 0.28, 0.18, { width: 1.9, seed: s, color: PALETTE.greenDeep });
      inkStroke(ctx, [[-0.28, -0.16], [-0.46, -0.14]], { width: 1.6, seed: s + 1 });
      inkStroke(ctx, [[0.26, -0.16], [0.40, -0.13]], { width: 1.5, seed: s + 2 });
      hatch(ctx, [[-0.2, -0.3], [0.2, -0.3], [0.2, -0.02], [-0.2, -0.02]], { angle: Math.PI / 4, gap: 6, alpha: 0.3, seed: s + 3 });
      break;
    default: // crane
      inkStroke(ctx, [[0, 0], [0, -0.34], [0.06, -0.52]], { width: 2, seed: s });
      roughEllipse(ctx, 0.02, -0.24, 0.16, 0.20, { width: 1.8, seed: s + 1 });
      inkStroke(ctx, [[0.08, -0.54], [0.24, -0.60]], { width: 1.5, seed: s + 2 });
      inkStroke(ctx, [[0.08, -0.58], [0.26, -0.52]], { width: 1.3, seed: s + 3, color: PALETTE.red, passes: 1 });
      inkStroke(ctx, [[0, -0.06], [-0.10, 0]], { width: 1.4, seed: s + 4, passes: 1 });
      inkStroke(ctx, [[0, -0.06], [0.10, 0]], { width: 1.4, seed: s + 5, passes: 1 });
      break;
  }
  ctx.restore();
}

// -------------------------------------------------------------- 地图

export function drawMap(ctx, w, h, state, t) {
  const s = boilSeed(t, 77);
  paperTexture(ctx, w, h, 41);
  const visited = new Set(state.album.map((a) => a.spotId));
  const cols = w < 380 ? 3 : 4;
  const rows = Math.ceil(SPOTS.length / cols);
  const padX = w / (cols + 1);
  const padY = h / (rows + 1.6);
  const pts = SPOTS.map((spot, i) => {
    const cx = padX * ((i % cols) + 1);
    const cy = padY * (Math.floor(i / cols) + 1) + h * 0.06;
    return { spot, cx, cy };
  });

  // unlocking lines first (only between visited/unlocked pairs)
  for (const { spot, cx, cy } of pts) {
    for (const req of spot.unlockAfter || []) {
      const from = pts.find((p) => p.spot.id === req);
      if (!from) continue;
      const seen = visited.has(req) || visited.has(spot.id);
      inkStroke(ctx, [[from.cx, from.cy], [(from.cx + cx) / 2 + 8, (from.cy + cy) / 2], [cx, cy]],
        { width: 1.4, seed: s + spot.id.length, color: seen ? PALETTE.inkSoft : '#c9c0ad', alpha: seen ? 0.75 : 0.4, passes: 1 });
    }
  }
  for (const { spot, cx, cy } of pts) {
    const seen = visited.has(spot.id);
    const r = seen ? 7 : 5;
    washFill(ctx, circlePts(cx, cy, r + 3), seen ? PALETTE.green : '#ded4bd', seen ? 0.5 : 0.4, s + 1);
    roughEllipse(ctx, cx, cy, r, r, { width: 1.8, seed: s + 2 + spot.name.length, color: seen ? PALETTE.ink : '#b8ab92' });
    ctx.save();
    ctx.font = `${Math.max(9, Math.round(Math.min(w, h) * 0.026))}px "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = seen ? PALETTE.ink : '#a99b83';
    ctx.globalAlpha = seen ? 0.95 : 0.7;
    ctx.fillText(spot.name, cx, cy + r + Math.max(12, h * 0.022));
    ctx.restore();
  }
  // the home marker
  roughEllipse(ctx, w * 0.5, h * 0.97, 10, 6, { width: 1.6, seed: s + 99, color: PALETTE.red });
  sealStamp(ctx, w - 32, 32, 20, 12);
}

// -------------------------------------------------------------- 特产图标

const GLYPHS = ['leaf', 'shell', 'stone', 'vessel', 'cloth', 'tool'];

export function drawSouvenirGlyph(ctx, x, y, r, id, t) {
  const seed = hash(id);
  const kind = GLYPHS[seed % GLYPHS.length];
  const s = boilSeed(t, seed % 997) + seed;
  switch (kind) {
    case 'leaf':
      washFill(ctx, [[x, y + r], [x - r * 0.7, y], [x, y - r], [x + r * 0.7, y]], PALETTE.green, 0.4, s);
      roughPoly(ctx, [[x, y + r], [x - r * 0.7, y], [x, y - r], [x + r * 0.7, y]], { width: 1.4, seed: s + 1, color: PALETTE.greenDeep, passes: 1 });
      inkStroke(ctx, [[x, y + r], [x, y - r * 0.8]], { width: 1, seed: s + 2, color: PALETTE.greenDeep, passes: 1 });
      break;
    case 'shell':
      roughEllipse(ctx, x, y, r * 0.8, r * 0.9, { width: 1.4, seed: s, passes: 1, color: PALETTE.inkSoft });
      for (let i = 0; i < 3; i++) {
        inkStroke(ctx, [[x, y + r * 0.7], [x + (i - 1) * r * 0.5, y - r * 0.7]], { width: 0.9, seed: s + 3 + i, color: PALETTE.inkSoft, passes: 1 });
      }
      break;
    case 'stone':
      roughPoly(ctx, [[x - r * 0.9, y + r * 0.6], [x - r * 0.3, y - r * 0.8], [x + r * 0.8, y - r * 0.3], [x + r * 0.6, y + r * 0.8]], { width: 1.5, seed: s, passes: 1 });
      hatch(ctx, [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]], { angle: Math.PI / 5, gap: 5, alpha: 0.25, seed: s + 1 });
      break;
    case 'vessel':
      washFill(ctx, [[x - r * 0.7, y - r * 0.5], [x + r * 0.7, y - r * 0.5], [x + r * 0.55, y + r * 0.9], [x - r * 0.55, y + r * 0.9]], '#e4d5b4', 0.85, s);
      roughPoly(ctx, [[x - r * 0.7, y - r * 0.5], [x + r * 0.7, y - r * 0.5], [x + r * 0.55, y + r * 0.9], [x - r * 0.55, y + r * 0.9]], { width: 1.5, seed: s + 1 });
      roughLine(ctx, x - r * 0.9, y - r * 0.55, x + r * 0.9, y - r * 0.55, { width: 1.3, seed: s + 2 });
      break;
    case 'cloth':
      washFill(ctx, [[x - r, y - r * 0.6], [x + r, y - r * 0.8], [x + r * 0.9, y + r * 0.7], [x - r * 0.9, y + r * 0.5]], PALETTE.blue, 0.35, s);
      roughPoly(ctx, [[x - r, y - r * 0.6], [x + r, y - r * 0.8], [x + r * 0.9, y + r * 0.7], [x - r * 0.9, y + r * 0.5]], { width: 1.4, seed: s + 1, close: true });
      for (let i = 0; i < 3; i++) inkStroke(ctx, [[x - r * 0.6 + i * r * 0.6, y - r * 0.7], [x - r * 0.5 + i * r * 0.6, y + r * 0.6]], { width: 0.8, seed: s + 4 + i, color: PALETTE.blue, passes: 1 });
      break;
    default:
      roughLine(ctx, x - r * 0.8, y + r * 0.5, x + r * 0.8, y + r * 0.5, { width: 1.6, seed: s });
      inkStroke(ctx, [[x - r * 0.6, y - r * 0.4], [x + r * 0.6, y - r * 0.6]], { width: 1.8, seed: s + 1, color: PALETTE.clay });
      inkStroke(ctx, [[x + r * 0.6, y - r * 0.6], [x + r * 0.75, y + r * 0.2]], { width: 1.4, seed: s + 2, color: PALETTE.clay, passes: 1 });
      break;
  }
}

/** 坊间游戏图标：每种古代游戏一个手绘小图形。新增游戏 = 加一个 case。 */
export function drawGameGlyph(ctx, x, y, r, id, t) {
  const s = boilSeed(t, hash(id) % 997) + hash(id);
  switch (id) {
    case 'pitchpot': // 投壶：壶 + 一支斜箭
      washFill(ctx, [[x - r * 0.6, y - r * 0.3], [x + r * 0.6, y - r * 0.3], [x + r * 0.4, y + r * 0.8], [x - r * 0.4, y + r * 0.8]], '#d8c9a8', 0.8, s);
      roughPoly(ctx, [[x - r * 0.6, y - r * 0.3], [x + r * 0.6, y - r * 0.3], [x + r * 0.4, y + r * 0.8], [x - r * 0.4, y + r * 0.8]], { width: 1.4, seed: s + 1 });
      inkStroke(ctx, [[x - r * 1.1, y - r * 0.5], [x + r * 0.2, y + r * 0.1]], { width: 1.2, seed: s + 2, color: PALETTE.clay, passes: 1 });
      break;
    case 'cuju': // 蹴鞠：圆球 + 缝线
      roughEllipse(ctx, x, y, r, r, { width: 1.5, seed: s });
      inkStroke(ctx, [[x - r, y], [x + r, y]], { width: 1, seed: s + 1, passes: 1 });
      inkStroke(ctx, [[x, y - r], [x, y + r]], { width: 1, seed: s + 2, passes: 1 });
      break;
    case 'knucklebones': // 抓子儿：几颗小石子
      for (let i = 0; i < 3; i++) roughEllipse(ctx, x + (i - 1) * r * 0.5, y + (i % 2) * r * 0.3 - r * 0.2, r * 0.22, r * 0.22, { width: 1.2, seed: s + i });
      break;
    case 'guess_coin': // 猜枚：铜钱（圆 + 方孔）
      roughEllipse(ctx, x, y, r, r, { width: 1.5, seed: s });
      roughRect(ctx, x - r * 0.35, y - r * 0.35, r * 0.7, r * 0.7, { width: 1, seed: s + 1 });
      break;
    case 'chuiwan': // 捶丸：球 + 杆
      roughEllipse(ctx, x + r * 0.4, y + r * 0.3, r * 0.35, r * 0.35, { width: 1.3, seed: s });
      inkStroke(ctx, [[x - r * 1.1, y - r * 0.7], [x + r * 0.2, y - r * 0.1]], { width: 1.4, seed: s + 1, color: PALETTE.clay, passes: 1 });
      break;
    case 'doucao': // 斗草：两根交叉的草茎
      inkStroke(ctx, [[x - r, y + r], [x + r, y - r]], { width: 1.2, seed: s, color: PALETTE.greenDeep, passes: 1 });
      inkStroke(ctx, [[x - r, y - r], [x + r, y + r]], { width: 1.2, seed: s + 1, color: PALETTE.greenDeep, passes: 1 });
      break;
    case 'shefu': // 射覆：倒扣的碗
      washFill(ctx, [[x - r * 0.8, y + r * 0.6], [x + r * 0.8, y + r * 0.6], [x + r * 0.6, y - r * 0.5], [x - r * 0.6, y - r * 0.5]], '#e4d5b4', 0.85, s);
      roughPoly(ctx, [[x - r * 0.8, y + r * 0.6], [x + r * 0.8, y + r * 0.6], [x + r * 0.6, y - r * 0.5], [x - r * 0.6, y - r * 0.5]], { width: 1.4, seed: s + 1 });
      break;
    case 'jianzi': // 踢毽子：毽子（圆 + 羽毛）
      washFill(ctx, circlePts(x, y + r * 0.2, r * 0.3), PALETTE.red, 0.5, s);
      roughEllipse(ctx, x, y + r * 0.2, r * 0.3, r * 0.3, { width: 1.2, seed: s + 1, color: PALETTE.red, passes: 1 });
      for (let i = 0; i < 3; i++) inkStroke(ctx, [[x, y + r * 0.05], [x + (i - 1) * r * 0.4, y - r]], { width: 0.9, seed: s + 3 + i, color: PALETTE.clay, passes: 1 });
      break;
    case 'top': // 抽陀螺：陀螺（锥形）
      roughPoly(ctx, [[x - r * 0.5, y - r * 0.7], [x + r * 0.5, y - r * 0.7], [x, y + r * 0.7]], { width: 1.3, seed: s });
      roughLine(ctx, x, y - r * 0.7, x, y - r, { width: 1, seed: s + 1 });
      break;
    case 'kite': // 放风筝：菱形风筝 + 尾巴
      roughPoly(ctx, [[x, y - r], [x + r * 0.8, y], [x, y + r], [x - r * 0.8, y]], { width: 1.4, seed: s });
      inkStroke(ctx, [[x, y + r], [x + r * 0.2, y + r * 1.4]], { width: 0.9, seed: s + 1, passes: 1 });
      break;
    case 'feihua': // 飞花令：花
      drawFlower(ctx, x, y, r, s);
      break;
    case 'poetry': // 诗社：书卷
      roughRect(ctx, x - r * 0.6, y - r * 0.8, r * 1.2, r * 1.6, { width: 1.3, seed: s });
      inkStroke(ctx, [[x, y - r * 0.5], [x, y + r * 0.5]], { width: 0.9, seed: s + 1, color: PALETTE.inkSoft, passes: 1 });
      break;
    case 'archery': // 骑射：弓 + 弦
      inkStroke(ctx, [[x - r, y + r * 0.7], [x, y - r * 0.6], [x + r, y + r * 0.7]], { width: 1.4, seed: s, color: PALETTE.clay, passes: 1 });
      inkStroke(ctx, [[x - r, y + r * 0.7], [x + r, y + r * 0.7]], { width: 0.9, seed: s + 1, passes: 1 });
      break;
    case 'curling': // 冰壶：壶 + 手柄
      washFill(ctx, circlePts(x, y, r * 0.7), '#9aa7b4', 0.6, s);
      roughEllipse(ctx, x, y, r * 0.7, r * 0.7, { width: 1.4, seed: s + 1 });
      roughLine(ctx, x - r * 0.5, y - r * 0.7, x + r * 0.5, y - r * 0.7, { width: 1.2, seed: s + 2 });
      break;
    case 'wrestling': // 摔角：两个较力的小人
      roughEllipse(ctx, x - r * 0.4, y - r * 0.3, r * 0.25, r * 0.25, { width: 1.2, seed: s });
      roughEllipse(ctx, x + r * 0.4, y - r * 0.3, r * 0.25, r * 0.25, { width: 1.2, seed: s + 1 });
      inkStroke(ctx, [[x - r * 0.35, y + r * 0.15], [x + r * 0.35, y + r * 0.15]], { width: 1.2, seed: s + 2, passes: 1 });
      break;
    case 'flower_view': // 赏花：花（同飞花令）
      drawFlower(ctx, x, y, r, s);
      break;
    default:
      roughEllipse(ctx, x, y, r, r, { width: 1.4, seed: s });
  }
}

/** 一朵五瓣小花（飞花令 / 赏花共用）。 */
function drawFlower(ctx, x, y, r, s) {
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    roughEllipse(ctx, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.35, r * 0.22, { width: 1, seed: s + k, color: PALETTE.red, passes: 1 });
  }
  roughEllipse(ctx, x, y, r * 0.22, r * 0.22, { width: 1, seed: s + 10 });
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

function circlePts(cx, cy, r, steps = 14) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
