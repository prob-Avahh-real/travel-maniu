// 界面绑定层：把纯逻辑引擎接上真实时间、DOM 与手绘渲染。
// 这里只做「读状态 → 画」与「点按 → 调引擎动作」，不含任何游戏规则。

import { createEngine } from '../core/engine.js';
import { CURRENCY_LABEL } from '../core/economy.js';
import { drawRoom, drawGarden, drawPostcardScene, drawMap, drawSouvenirGlyph, drawVisitor, drawGameGlyph, SPOT_SCENE } from '../render/scenes.js';
import { SHOP, ITEMS_BY_ID, KIND } from '../data/items.js';
import { SPOTS, SPOTS_BY_ID, POSTCARDS_BY_ID, SOUVENIRS_BY_ID, TOTAL_POSTCARDS, TOTAL_SOUVENIRS, REGIONS } from '../data/spots.js';
import { VISITORS_BY_ID } from '../data/visitors.js';
import { TITLES } from '../core/titles.js';
import { XU_XIAKE_MOTTO, XU_XIAKE_ROUTE } from '../data/xuxiake.js';
import { xuxiakeProgress } from '../core/xuxiake.js';
import { DECOR_SLOTS, DECOR_SLOT_LABELS, allDecor } from '../core/decor.js';
import { WISH_COST } from '../data/floral.js';
import { FOLK_GAMES } from '../data/fgames.js';
import { POEMS } from '../data/poems.js';
import { WORLDLINE_NODES } from '../core/worldline.js';
import { TRAVELERS, TRAVELERS_BY_ID } from '../data/travelers.js';
import { bindWearable } from './wearable.js';

// ------------------------------------------------------------ storage

const storage = (() => {
  try {
    const probe = '__maniu_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
})();

// 时间是宿主注入的：core 里不允许出现 Date.now()
const engine = createEngine({ storage, seed: Date.now() % 2147483647, now: Date.now() });
const state = () => engine.state;

// 无障碍：尊重系统的「减少动态」偏好 —— 冻结手绘笔迹的沸腾，也不再走动画。
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reducedMotionQuery.matches;
reducedMotionQuery.addEventListener?.('change', (e) => {
  reducedMotion = e.matches;
  view.lastKey = '';
});

// -------------------------------------------------------------- time

const SPEEDS = [
  { label: '真实时间', scale: 1 },
  { label: '×8 快进', scale: 8 },
  { label: '×60 演示', scale: 60 },
];
let speedIndex = 0;
let activeDecorSlot = 'shelf'; // 特产装饰当前选中的槽位
let lastReal = Date.now();
let virtualNow = state().now;
let pendingEvents = [];

/** Advance virtual time by (real elapsed × speed) and run the engine clock. */
function advance(realMs = Date.now()) {
  const dt = Math.max(0, realMs - lastReal) * SPEEDS[speedIndex].scale;
  lastReal = realMs;
  virtualNow += dt;
  const { events } = engine.tick(virtualNow);
  if (events.length) pendingEvents.push(...events);
  return events;
}

// --------------------------------------------------------------- view

const view = {
  screen: window.innerWidth <= 320 ? 'garden' : 'room',
  sheet: null,
  lastKey: '',
};

const el = {
  canvas: document.getElementById('scene'),
  clover: document.getElementById('clover-count'),
  ready: document.getElementById('ready-count'),
  floral: document.getElementById('floral-count'),
  status: document.getElementById('maniu-status'),
  pick: document.getElementById('btn-pick'),
  floralBtn: document.getElementById('btn-floral'),
  wish: document.getElementById('btn-wish'),
  feed: document.getElementById('btn-feed'),
  sheet: document.getElementById('sheet'),
  sheetTitle: document.getElementById('sheet-title'),
  sheetBody: document.getElementById('sheet-body'),
  toast: document.getElementById('toast'),
};

const sceneCtx = createSceneCanvas();

function createSceneCanvas() {
  const c = el.canvas;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth || 360;
  const h = c.clientHeight || 520;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function sceneSize() {
  return { w: el.canvas.clientWidth || 360, h: el.canvas.clientHeight || 520 };
}

function stateSignature() {
  const s = state();
  return [
    view.screen,
    s.clovers,
    s.patches.map((p) => (p.readyAt <= s.now ? 1 : 0)).join(''),
    s.maniu.status,
    s.maniu.activity,
    s.album.length,
    Object.keys(s.collection || {}).length,
    s.visitors.current ? s.visitors.current.id : '-',
    s.maniu.trip ? s.maniu.trip.weather : '-',
    s.luggage.snack, s.luggage.tool, s.luggage.charm,
    Object.keys(s.souvenirs).length,
  ].join('|');
}

function paintScene(t) {
  const { w, h } = sceneSize();
  const ctx = sceneCtx;
  ctx.clearRect(0, 0, w, h);
  const s = state();
  if (view.screen === 'garden') {
    drawGarden(ctx, w, h, s, t, s.visitors.current ? { ...s.visitors.current, info: VISITORS_BY_ID[s.visitors.current.id] } : null);
  } else {
    drawRoom(ctx, w, h, s, t);
  }
}

// --------------------------------------------------------------- HUD

let lastHud = '';
function updateHud() {
  const snap = engine.snapshot();
  const line = snap.maniu.status === 'away'
    ? `马牛在${snap.maniu.trip ? SPOTS_BY_ID[snap.maniu.trip.spotId].name : '路上'}`
    : `${snap.maniu.activity} · 在家`;
  const key = `${snap.clovers}|${snap.readyPatches}|${line}|${snap.weather}|${snap.visitor ? snap.visitor.info.name + (snap.visitor.interaction ? ':' + snap.visitor.interaction.with : '') : '-'}|${snap.florals.petal}|${snap.florals.leaf}|${snap.floralKind}|${snap.floralAt}`;
  el.pick.disabled = snap.readyPatches === 0;
  const florals = snap.florals.petal + snap.florals.leaf;
  el.floral.hidden = florals === 0;
  el.floral.textContent = `🌸${snap.florals.petal} 🍂${snap.florals.leaf}`;
  // 拾花叶：只在花叶季节（春/秋）且庭院里可见
  const inSeason = snap.floralKind != null;
  el.floralBtn.hidden = !inSeason;
  if (inSeason) {
    el.floralBtn.textContent = snap.floralKind === 'petal' ? '拾花瓣' : '拾落叶';
    el.floralBtn.disabled = snap.floralAt > snap.now;
  }
  el.wish.hidden = florals < WISH_COST;
  const visitorHere = Boolean(snap.visitor);
  el.feed.hidden = !visitorHere;
  if (visitorHere) {
    const v = snap.visitor.info;
    el.feed.textContent = `招待${v.name}`;
    el.feed.disabled = snap.visitor.fed;
  }
  if (key === lastHud) return;
  lastHud = key;
  el.clover.textContent = `🪙 ${snap.clovers}`;
  el.ready.textContent = `成熟 ${snap.readyPatches}/${snap.patchCount}`;
  el.status.textContent = `${snap.weatherLabel}　${visitorHere ? (snap.visitor.interaction ? `${line}\n${snap.visitor.interaction.line}` : `${line}\n${snap.visitor.info.name}在门外`) : line}`;
}

let toastTimer = null;
function toast(text) {
  if (!text) return;
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

function flushEvents() {
  if (!pendingEvents.length) return;
  const evs = pendingEvents;
  pendingEvents = [];
  for (const ev of evs) {
    if (ev.type === 'return') {
      const p = POSTCARDS_BY_ID[ev.postcardId];
      const spot = ev.spotName || '';
      const extra = ev.encounter ? ` · ${ev.encounter.name}` : '';
      toast(p ? `${spot} · ${p.title}${ev.duplicate ? '（重复）' : ''}${extra}` : `从${spot}回来了${extra}`);
      if (ev.traveler) toast(`遇见${ev.traveler.name}：「${ev.traveler.note}」`);
      if (ev.travelerGift) toast(`${ev.travelerGift.name}捎来${ev.travelerGift.amount}${CURRENCY_LABEL[ev.travelerGift.currency]}`);
      if (view.sheet === 'album') renderSheet();
    } else if (ev.type === 'worldline') {
      const node = WORLDLINE_NODES.find((n) => n.id === ev.id);
      if (node) toast(`世界线转动：${node.name}`);
    } else if (ev.type === 'title') {
      const title = TITLES.find((x) => x.id === ev.id);
      if (title) toast(`获得称号「${title.name}」`);
      if (view.sheet === 'titles') renderSheet();
    } else if (ev.type === 'depart') {
      toast(`马牛往${ev.spotName}去了`);
    } else if (ev.type === 'visitor-arrive') {
      if (view.sheet) renderSheet();
    }
  }
}

// -------------------------------------------------------------- loop

function frame() {
  advance();
  const motionT = reducedMotion ? 0 : virtualNow;
  const boil = Math.floor(motionT / 220);
  const key = `${boil}|${stateSignature()}|${sceneSize().w}x${sceneSize().h}`;
  if (key !== view.lastKey) {
    view.lastKey = key;
    paintScene(motionT);
  }
  updateHud();
  flushEvents();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  createSceneCanvas();
  view.lastKey = '';
});

// 回到前台：补算离线时间并落盘
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    advance(Date.now());
    view.lastKey = '';
  } else {
    engine.save();
  }
});
window.addEventListener('pagehide', () => engine.save());
setInterval(() => engine.save(), 20000);

// ------------------------------------------------------------- actions

el.pick.addEventListener('click', () => {
  const r = engine.pickAll();
  if (!r.ok) return toast('铜钱草还没长好');
  toast(r.fourLeaf ? `金铜钱草！+${r.gained}` : `摘了 ${r.picked} 丛，+${r.gained}`);
});

el.feed.addEventListener('click', () => openSheet('feed'));

el.floralBtn.addEventListener('click', () => {
  const r = engine.collectFloral();
  if (!r.ok) return toast(r.reason === 'not-ready' ? '花叶还没长出来' : '这个季节没有花叶');
  toast(`拾了${r.gained}片${r.kind === 'petal' ? '花瓣' : '落叶'}`);
});

el.wish.addEventListener('click', () => {
  const r = engine.wish();
  if (!r.ok) return toast('花叶还不够');
  toast(`许愿成功，漂来${r.gained}株铜钱草`);
});

// ---- 智能硬件：戒指（倾斜/摇动）+ 手杖（敲击/挥动） ----------------------
const SHEET_ORDER = ['luggage', 'shop', 'album', 'souvenirs', 'map', 'games', 'titles'];

function setScreen(next) {
  view.screen = next;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.view === next));
  view.lastKey = '';
}

function cycleSheet(step) {
  const at = SHEET_ORDER.indexOf(view.sheet);
  const next = SHEET_ORDER[(at + step + SHEET_ORDER.length) % SHEET_ORDER.length];
  openSheet(next);
}

function trySend() {
  const r = engine.send();
  toast(r.ok ? `马牛往${r.spot.name}去了` : reasonText(r.reason, engine.tierWindow()));
  view.lastKey = '';
  updateHud();
}

function onWearableGesture(kind, detail = {}) {
  switch (kind) {
    case 'tap': el.pick.click(); break; // 手杖敲一下 = 摘铜钱草
    case 'shake': trySend(); break; // 戒指摇动 = 送行
    case 'swing': openSheet('album'); break; // 手杖挥动 = 翻相册
    case 'tilt':
      if (detail.dir === 'up' || detail.dir === 'down') setScreen(detail.dir === 'up' ? 'room' : 'garden');
      else cycleSheet(detail.dir === 'left' ? -1 : 1);
      break;
  }
}

bindWearable({ onGesture: onWearableGesture });

document.querySelectorAll('.tab').forEach((b) => {
  b.addEventListener('click', () => setScreen(b.dataset.view));
});

document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const name = b.dataset.sheet;
    if (view.sheet === name) return closeSheet();
    openSheet(name);
  });
});

document.getElementById('sheet-close').addEventListener('click', closeSheet);
document.getElementById('btn-settings').addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  toast(`时间：${SPEEDS[speedIndex].label}（点⋯切换）`);
});

function openSheet(name) {
  view.sheet = name;
  el.sheet.hidden = false;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
  renderSheet();
}

/** 点开一张明信片：大图 + 本地保存（toDataURL → <a download>，不发任何网络请求）。 */
function openPostcardDetail(id) {
  view.sheet = 'postcard';
  const rec = (state().collection || {})[id];
  const spotId = POSTCARDS_BY_ID[id] ? POSTCARDS_BY_ID[id].spotId : id.replace(/_rare$/, '');
  const meta = POSTCARDS_BY_ID[id];
  el.sheetTitle.textContent = meta ? meta.title : '明信片';
  el.sheetBody.innerHTML = `
    <canvas id="share-canvas" width="792" height="570" style="width:100%;height:auto;border:1.5px solid var(--ink-soft);border-radius:8px 6px 9px 7px"></canvas>
    <div class="section-title">把这张明信片保存到相册，发给朋友</div>
    <button id="btn-save-postcard" class="action">保存图片</button>`;
  const c = el.sheetBody.querySelector('#share-canvas');
  const ctx = c.getContext('2d');
  const dpr = 3;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPostcardScene(ctx, 0, 0, 264, 190, SPOTS_BY_ID[spotId], 0, {
    postcardId: id, wet: Boolean(rec && rec.wet), now: rec ? rec.firstAt : 0,
  });
  el.sheetBody.querySelector('#btn-save-postcard').onclick = () => {
    const link = document.createElement('a');
    link.download = `旅行马牛-${(meta && meta.title) || '明信片'}.png`;
    link.href = c.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast('已生成图片，请到下载目录查看');
  };
  el.sheet.hidden = false;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
}

function closeSheet() {
  view.sheet = null;
  el.sheet.hidden = true;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  view.lastKey = '';
}

// ------------------------------------------------------------- sheets

function renderSheet() {
  const name = view.sheet;
  if (!name) return;
  const paint = SHEETS[name];
  if (!paint) return;
  const out = paint();
  el.sheetTitle.textContent = out.title;
  el.sheetBody.innerHTML = out.html;
  if (out.paint) out.paint(el.sheetBody);
}

function itemRow(item, action, opts = {}) {
  const owned = state().inventory[item.id] || 0;
  return `<div class="row ${opts.equipped ? 'equipped' : ''} ${opts.locked ? 'locked' : ''}">
    <div class="grow">
      <div class="name">${item.name}${owned ? ` <span class="desc">×${owned}</span>` : ''}</div>
      <div class="desc">${item.desc || ''}</div>
    </div>
    ${action}
  </div>`;
}

const SHEETS = {
  luggage() {
    const s = state();
    const labels = { snack: '干粮', tool: '道具', charm: '护身符' };
    const hints = {
      snack: '决定能走多远、去多久。出发后会被吃掉。',
      tool: '可以一直带着，反复使用。',
      charm: '路上保平安，回来时就用掉了。',
    };
    let html = '';
    for (const slot of ['snack', 'tool', 'charm']) {
      const cur = s.luggage[slot];
      html += `<div class="section-title">${labels[slot]}</div>`;
      html += cur
        ? itemRow(ITEMS_BY_ID[cur], `<button data-act="unpack" data-slot="${slot}" class="danger">取下</button>`, { equipped: true })
        : `<div class="row locked"><div class="grow"><div class="desc">${hints[slot]}</div></div></div>`;
      const options = SHOP.find((g) => g.kind === slot).items.filter((i) => (s.inventory[i.id] || 0) > 0);
      for (const item of options) {
        if (item.id === cur) continue;
        html += itemRow(item, `<button data-act="pack" data-slot="${slot}" data-item="${item.id}" class="primary">装上</button>`);
      }
    }
    const can = engine.canDepart();
    const win = engine.tierWindow();
    html += `<div class="section-title">出发</div>`;
    html += can.ok
      ? `<div class="row"><div class="grow"><div class="desc">可去的地方：${engine.eligibleSpots().map((x) => x.name).join('、') || '无'}</div></div>
         <button data-act="send" class="primary">送它出门</button></div>`
      : `<div class="row locked"><div class="grow"><div class="desc">${reasonText(can.reason, win)}</div></div></div>`;
    html += `<div class="row locked"><div class="grow"><div class="desc">不用你催，备好干粮它也会自己走。当前时间：${SPEEDS[speedIndex].label}</div></div></div>`;
    return { title: '行囊', html };
  },

  shop() {
    let html = '';
    for (const group of SHOP) {
      html += `<div class="section-title">${{ snack: '干粮', tool: '道具', charm: '护身符' }[group.kind]}</div>`;
      for (const item of group.items) {
        const owned = state().inventory[item.id] || 0;
        const afford = state().clovers >= item.cost;
        html += itemRow(item, `<button data-act="buy" data-item="${item.id}" class="${afford ? 'primary' : ''}" ${afford ? '' : 'disabled'}>🪙 ${item.cost}${owned ? ` · 有${owned}` : ''}</button>`);
      }
    }
    return { title: `商店 · 🪙 ${state().clovers}`, html };
  },

  album() {
    const collection = state().collection || {};
    const entries = [];
    for (const spot of SPOTS) {
      for (const p of spot.postcards) {
        if (collection[p.id]) entries.push({ spot, id: p.id, title: p.title, rare: false, wet: collection[p.id].wet, n: collection[p.id].count });
      }
      const rareId = `${spot.id}_rare`;
      if (collection[rareId]) entries.push({ spot, id: rareId, title: `${spot.name}·奇遇`, rare: true, wet: collection[rareId].wet, n: collection[rareId].count });
    }
    if (!entries.length) return { title: '相册', html: `<div class="empty">还没有明信片。备好行囊，等它自己出门。</div>` };
    const cardOf = (e) => `<div class="card ${e.rare ? 'rare' : ''} ${e.wet ? 'wet' : ''}" data-postcard="${e.id}">
      <canvas data-card="${e.id}" width="264" height="190"></canvas>
      <div class="cap"><b>${e.title}${e.wet ? ' ☂' : ''}</b>${e.spot.name}${e.n > 1 ? ` · 共${e.n}张` : ''}</div>
    </div>`;
    // 按地区分组：山 / 水 / 城 / 荒，只显示有收藏的分组
    const grouped = REGIONS.map((region) => {
      const cards = entries.filter((e) => e.spot.region === region).map(cardOf).join('');
      return cards ? `<div class="section-title">${region} · ${entries.filter((e) => e.spot.region === region).length}</div><div class="grid cards">${cards}</div>` : '';
    }).join('');
    const cards = grouped;
    const recent = state().album.slice(-24).reverse().map((a) => {
      const spot = SPOTS_BY_ID[a.spotId];
      const meta = POSTCARDS_BY_ID[a.postcardId];
      return `<div class="row ${a.rare ? 'equipped' : ''}"><div class="grow">
        <div class="name">${meta ? meta.title : `${spot ? spot.name : ''}·奇遇`}${a.wet ? ' ☂' : ''}${a.duplicate ? ' <span class="desc">重复</span>' : ''}</div>
        <div class="desc">${spot ? spot.name : ''} · ${new Date(a.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${a.encounter ? ` · ${a.encounter}` : ''}</div>
      </div></div>`;
    }).join('');
    return {
      title: `相册 ${entries.length}/${TOTAL_POSTCARDS + SPOTS.length}`,
      html: `<div class="grid cards">${cards}</div><div class="section-title">最近的旅程</div>${recent || '<div class="empty">还没有记录。</div>'}`,
      paint(root) {
        root.querySelectorAll('canvas[data-card]').forEach((c) => {
          const id = c.dataset.card;
          const spotId = POSTCARDS_BY_ID[id] ? POSTCARDS_BY_ID[id].spotId : id.replace(/_rare$/, '');
          const ctx = c.getContext('2d');
          const dpr = 2;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const rec = (state().collection || {})[id];
          const wet = Boolean(rec && rec.wet);
          drawPostcardScene(ctx, 0, 0, 132, 95, SPOTS_BY_ID[spotId], 0, { postcardId: id, wet, now: rec ? rec.firstAt : 0 });
        });
      },
    };
  },

  souvenirs() {
    const decor = allDecor(state());
    const all = Object.values(SOUVENIRS_BY_ID);
    const gifts = [];
    for (const v of Object.values(VISITORS_BY_ID)) {
      gifts.push({ id: v.gift.id, name: v.gift.name, from: v.name });
      gifts.push({ id: v.rareGift.id, name: v.rareGift.name, from: v.name, rare: true });
    }
    const list = [...all.map((v) => ({ id: v.id, name: v.name, from: SPOTS_BY_ID[v.spotId].name })), ...gifts];
    const seen = new Set();
    const uniq = list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    const slotRow = DECOR_SLOTS.map((s) => `<button class="slot ${s === activeDecorSlot ? 'active' : ''}" data-decor-slot="${s}">${DECOR_SLOT_LABELS[s]}</button>`).join('');
    const tiles = uniq.map((x) => {
      const holder = DECOR_SLOTS.find((s) => decor[s] === x.id);
      return `<div class="tile ${holder ? 'placed' : ''}" data-decor="${x.id}">
        <canvas data-glyph="${x.id}" width="108" height="108"></canvas>
        <div class="cap"><b>${x.name}</b><span class="n">${holder ? `在${DECOR_SLOT_LABELS[holder]}` : state().souvenirs[x.id] ? `×${state().souvenirs[x.id]}` : ''}</span></div>
      </div>`;
    }).join('');
    return {
      title: `特产 ${Object.keys(state().souvenirs).length}/${uniq.length}`,
      html: `<div class="slot-row">${slotRow}</div><div class="grid icons">${tiles}</div>`,
      paint(root) {
        root.querySelectorAll('canvas[data-glyph]').forEach((c) => {
          const id = c.dataset.glyph;
          const ctx = c.getContext('2d');
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          if (!state().souvenirs[id]) ctx.globalAlpha = 0.28;
          drawSouvenirGlyph(ctx, 27, 27, 20, id, 0);
          ctx.globalAlpha = 1;
        });
      },
    };
  },

  map() {
    const s = state();
    const visited = new Set(s.album.map((a) => a.spotId));
    // 开放世界：马牛在家且备好干粮时，可达的地方都能点「去这里」自由前往。
    const elig = s.maniu.status === 'home' ? engine.eligibleSpots().map((x) => x.id) : [];
    const rows = SPOTS.map((spot) => {
      const got = spot.postcards.filter((p) => s.album.some((a) => a.postcardId === p.id)).length;
      const open = (spot.unlockAfter || []).every((r) => visited.has(r));
      const goBtn = elig.includes(spot.id) ? `<button data-act="go" data-spot="${spot.id}" class="primary">去这里</button>` : '';
      return `<div class="row ${open ? '' : 'locked'}">
        <div class="grow"><div class="name">${spot.name} <span class="desc">${spot.flavour}</span></div>
        <div class="desc">明信片 ${got}/${spot.postcards.length} · 特产 ${spot.souvenirs.filter((v) => state().souvenirs[v.id]).length}/${spot.souvenirs.length}${open ? '' : ` · 需先去 ${spot.unlockAfter.map((r) => SPOTS_BY_ID[r].name).join('、')}`}</div></div>
        ${goBtn}
      </div>`;
    }).join('');
    const route = xuxiakeProgress(state());
    const routeRows = XU_XIAKE_ROUTE.map((s, i) => {
      const done = route.stages[i] && route.stages[i].visited;
      const name = SPOTS_BY_ID[s.spotId].name;
      return `<div class="row ${done ? '' : 'locked'}">
        <div class="grow"><div class="name">${done ? '✓ ' : ''}${s.stage} · ${name}</div><div class="desc">${s.note}</div></div>
      </div>`;
    }).join('');
    return {
      title: `地图 ${visited.size}/${SPOTS.length}`,
      html: `<canvas data-map width="640" height="380" style="width:100%;height:auto;border:1.5px solid var(--ink-soft);border-radius:8px 6px 9px 7px"></canvas><div class="section-title">地方</div>${rows}<div class="section-title">徐霞客的路线 · ${route.done}/${route.total}</div><div class="desc motto">「${XU_XIAKE_MOTTO}」</div>${routeRows}`,
      paint(root) {
        const c = root.querySelector('canvas[data-map]');
        const ctx = c.getContext('2d');
        const dpr = 2;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawMap(ctx, 320, 190, state(), 0);
      },
    };
  },

  titles() {
    const s = state();
    const have = new Set(s.titles);
    const wl = s.worldline || [];
    const wlRows = WORLDLINE_NODES.map((n) => {
      const on = wl.includes(n.id);
      return `<div class="row ${on ? 'equipped' : 'locked'}">
        <div class="grow"><div class="name">${on ? '✧ ' : ''}${n.name}</div><div class="desc">${n.desc}</div></div>
      </div>`;
    }).join('');
    const met = (s.travelers || []).map((id) => TRAVELERS_BY_ID[id]).filter(Boolean);
    const travelerRows = met.map((t) => `<div class="row"><div class="grow"><div class="name">${t.name}</div><div class="desc">${t.note}</div>${t.gift ? `<div class="desc">重逢：${t.gift.line}</div>` : ''}</div></div>`).join('');
    const rows = TITLES.map((t) => `<div class="row ${have.has(t.id) ? 'equipped' : 'locked'}">
      <div class="grow"><div class="name">${have.has(t.id) ? '🎖 ' : ''}${t.name}</div><div class="desc">${t.desc}</div></div>
    </div>`).join('');
    return {
      title: `称号 ${have.size}/${TITLES.length}`,
      html: `<div class="section-title">世界线 · ${wl.length}/${WORLDLINE_NODES.length}</div>${wlRows || '<div class="empty">完成里程碑，世界线会随你转动。</div>'}<div class="section-title">旅途偶遇 · ${met.length}/${TRAVELERS.length} · 捎礼 ${s.travelerGifts} 次</div>${travelerRows || '<div class="empty">在路上会遇见别的旅人，留下他们的消息。</div>'}<div class="section-title">称号</div>${rows}`,
    };
  },

  games() {
    const s = state();
    const now = s.now;
    const rows = FOLK_GAMES.map((g) => {
      const rec = s.fgames[g.id];
      const cooldown = rec && rec.cooldownAt > now;
      const played = rec ? rec.played : 0;
      const best = rec ? rec.best : 0;
      return `<div class="row">
        <canvas data-game="${g.id}" width="108" height="108"></canvas>
        <div class="grow"><div class="name">${g.name}</div><div class="desc">${g.desc}</div>
        <div class="desc">${played ? `玩过 ${played} 局 · 最好 ${best}/${g.attempts}` : '还没玩过'}</div></div>
        <button data-act="play-game" data-game="${g.id}" class="primary" ${cooldown ? 'disabled' : ''}>${cooldown ? '歇会儿' : '玩一局'}</button>
      </div>`;
    }).join('');
    const collected = (s.poems || []);
    const poemRows = POEMS.filter((p) => collected.includes(p.id)).map((p) =>
      `<div class="row"><div class="grow"><div class="name">${p.line}</div><div class="desc">《${p.title}》 · ${p.author}</div></div></div>`
    ).join('');
    return {
      title: `坊间游戏 · 已玩 ${s.stats.gamesPlayed} 局`,
      html: `<div class="desc motto">古人闲时的玩艺儿，练练手气。</div>${rows}<div class="section-title">诗笺 ${collected.length}/${POEMS.length}</div>${poemRows || '<div class="empty">诗社、飞花令里对出的句子会收在这里。</div>'}`,
      paint(root) {
        root.querySelectorAll('canvas[data-game]').forEach((c) => {
          const ctx = c.getContext('2d');
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          drawGameGlyph(ctx, 27, 27, 18, c.dataset.game, 0);
        });
      },
    };
  },

  feed() {
    const s = state();
    const v = s.visitors.current ? VISITORS_BY_ID[s.visitors.current.id] : null;
    if (!v) return { title: '招待', html: `<div class="empty">门外没人。</div>` };
    const items = Object.keys(s.inventory);
    if (!items.length) return { title: `招待${v.name}`, html: `<div class="empty">背包里没有能吃的东西。</div>` };
    const rows = items.map((id) => {
      const item = ITEMS_BY_ID[id] || { name: id };
      const fav = v.favours.includes(id);
      return itemRow(item, `<button data-act="feed" data-item="${id}" class="${fav ? 'primary' : ''}">${fav ? '它喜欢 · 喂' : '喂'}</button>`);
    }).join('');
    return { title: `招待${v.name}`, html: `<div class="row locked"><div class="grow"><div class="desc">它待一会儿就走。喂对了口味，交情涨得快。</div></div></div>${rows}` };
  },
};

function reasonText(reason, win) {
  switch (reason) {
    case 'no-snack': return '行囊里还没有干粮 —— 先去商店买一份，再装进干粮格。';
    case 'no-destination': return win ? '这个等级的干粮还走不到任何没去过的地方。' : '先装一份干粮。';
    case 'unreachable': return '那里现在还去不了，先去它前面的地方。';
    case 'away': return '马牛还在外面。';
    default: return '暂时出不去。';
  }
}

// ------------------------------------------------------ sheet actions

el.sheetBody.addEventListener('click', (e) => {
  // 特产的「摆上墙」是整块可点，不通过 button[data-act]
  const slotBtn = e.target.closest('button[data-decor-slot]');
  if (slotBtn) {
    activeDecorSlot = slotBtn.dataset.decorSlot;
    view.lastKey = '';
    renderSheet();
    return;
  }

  const decorTile = e.target.closest('.tile[data-decor]');
  if (decorTile) {
    const id = decorTile.dataset.decor;
    const decor = allDecor(state());
    const held = DECOR_SLOTS.find((s) => decor[s] === id);
    let msg = '';
    if (held === activeDecorSlot) {
      engine.decorate(activeDecorSlot, null);
      msg = '收起来了';
    } else {
      const r = engine.decorate(activeDecorSlot, id);
      msg = r.ok ? `摆上${DECOR_SLOT_LABELS[activeDecorSlot]}了` : '还没收集到';
    }
    view.lastKey = '';
    toast(msg);
    renderSheet();
    return;
  }

  const cardEl = e.target.closest('.card[data-postcard]');
  if (cardEl) {
    openPostcardDetail(cardEl.dataset.postcard);
    return;
  }

  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const item = btn.dataset.item;
  let msg = '';
  if (act === 'buy') {
    const r = engine.buy(item);
    msg = r.ok ? `买了${r.item.name}` : r.reason === 'poor' ? '铜钱草不够' : '买不了';
  } else if (act === 'pack') {
    const r = engine.pack(btn.dataset.slot, item);
    msg = r.ok ? '装好了' : '装不上';
  } else if (act === 'unpack') {
    engine.pack(btn.dataset.slot, null);
    msg = '取下来了';
  } else if (act === 'send') {
    const r = engine.send();
    msg = r.ok ? `马牛往${r.spot.name}去了` : reasonText(r.reason, engine.tierWindow());
  } else if (act === 'go') {
    const r = engine.sendTo(btn.dataset.spot);
    msg = r.ok ? `马牛往${r.spot.name}去了` : reasonText(r.reason, engine.tierWindow());
  } else if (act === 'feed') {
    const r = engine.feed(item);
    msg = r.ok ? `吃下了 · ${r.line || ''}` : '喂不了';
  } else if (act === 'play-game') {
    const r = engine.playGame(btn.dataset.game);
    if (r.ok && r.poems && r.poems.length) {
      msg = `投进 ${r.hits}/${r.attempts} · 对出一句「${r.poems[0].line}」`;
    } else {
      msg = r.ok ? `投进 ${r.hits}/${r.attempts}${r.gained ? ` · +${r.gained}${r.label}` : ' · 没中'}` : r.reason === 'cooldown' ? '歇一会儿再玩' : '玩不了';
    }
  }
  announceTitles();
  if (msg) toast(msg);
  view.lastKey = '';
  renderSheet();
  updateHud();
});

// -------------------------------------------------------------- start

let titleCount = state().titles.length;

/** Player actions award titles synchronously (no tick event) — announce them here. */
function announceTitles() {
  const titles = state().titles;
  while (titleCount < titles.length) {
    const t = TITLES.find((x) => x.id === titles[titleCount]);
    titleCount++;
    if (t) toast(`获得称号「${t.name}」`);
  }
  if (view.sheet === 'titles') renderSheet();
}

advance(Date.now());
paintScene(reducedMotion ? 0 : virtualNow);
updateHud();
requestAnimationFrame(frame);
if (state().stats.trips === 0) setTimeout(() => toast('先摘铜钱草，再给马牛备一份干粮。'), 700);
