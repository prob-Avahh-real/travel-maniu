#!/usr/bin/env node
// Conformance harness: evaluates spec/mechanics.json against the real core engine.
// Emits `METRIC name=value` lines. A clause with no implementation counts as FAIL,
// so the primary metric doubles as a machine-checkable to-do list.
//
// Usage: node tests/conformance.mjs [--verbose]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createState, rngOf, serialize, deserialize, syncRng, SAVE_KEY, ALBUM_CAP } from '../src/core/state.js';
import { createRng } from '../src/core/rng.js';
import { MIN, HOUR, DAY, CFG } from '../src/core/config.js';
import { pickClover, pickAll, buy, pack, unpackAll, isReady } from '../src/core/economy.js';
import { depart, departTo, finishTrip, planTrip, resolveTrip, canDepart, eligibleSpots, tierWindow } from '../src/core/trip.js';
import { arriveVisitor, leaveVisitor, feedVisitor, currentVisitor, companionBonus } from '../src/core/visitors.js';
import { newlyEarnedTitles, summarize, TITLES } from '../src/core/titles.js';
import { tick, createEngine, snapshot } from '../src/core/engine.js';
import { weatherAt, WEATHER_KINDS, WEATHER_BUCKET_MS } from '../src/core/weather.js';
import { solarTermIndex, seasonAccent, SEASON_ACCENT, SEASON_PAPER } from '../src/core/season.js';
import { SPOTS, SPOTS_BY_ID, TOTAL_POSTCARDS, POSTCARDS_BY_ID, SOUVENIRS_BY_ID, REGIONS, SEASONAL, SEASONAL_SOUVENIRS_BY_ID } from '../src/data/spots.js';
import { ALL_ITEMS, ITEMS_BY_ID, SNACKS, TOOLS, CHARMS } from '../src/data/items.js';
import { VISITORS, VISITORS_BY_ID } from '../src/data/visitors.js';
import { drawRoom, drawGarden, drawMap, drawPostcardScene, drawVisitor, drawSouvenirGlyph, drawGameGlyph } from '../src/render/scenes.js';
import { placeDecor, allDecor, DECOR_SLOTS } from '../src/core/decor.js';
import { XU_XIAKE_ROUTE, XU_XIAKE_MOTTO } from '../src/data/xuxiake.js';
import { xuxiakeProgress, xuxiakeComplete } from '../src/core/xuxiake.js';
import { NATURE_ENCOUNTERS } from '../src/data/encounters.js';
import { rollEncounter } from '../src/core/encounters.js';
import { FLORAL } from '../src/data/floral.js';
import { floralKind, collectFloral, wishAtStream } from '../src/core/floral.js';
import { FOLK_GAMES, FOLK_GAMES_BY_ID } from '../src/data/fgames.js';
import { playFolkGame } from '../src/core/fgames.js';
import { POEMS } from '../src/data/poems.js';
import { WORLDLINE_NODES, worldlineEffects, newlyActivatedNodes } from '../src/core/worldline.js';
import { TRAVELERS, TRAVELERS_BY_ID } from '../src/data/travelers.js';
import { rollTraveler, rollTravelerGift } from '../src/core/travelers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------- helpers

const FAST = {
  cloverRegrowMs: MIN,
  departDelayMs: [MIN, 2 * MIN],
  minRestMs: 0,
  maxRestMs: 0,
  visitorIntervalMs: [MIN, MIN],
  visitorStayMs: 5 * MIN,
};

function mk(opts = {}) {
  const now = opts.now ?? 0;
  const cfg = { ...FAST, ...(opts.cfg || {}) };
  const state = createState({ seed: opts.seed ?? 1, now, cfg });
  if (opts.clovers != null) state.clovers = opts.clovers;
  if (opts.inventory) state.inventory = { ...opts.inventory };
  if (opts.luggage) state.luggage = { ...state.luggage, ...opts.luggage };
  if (opts.album) state.album = opts.album.map((a) => ({ ...a }));
  if (opts.souvenirs) state.souvenirs = { ...opts.souvenirs };
  if (opts.friendship) state.visitors.friendship = { ...opts.friendship };
  if (opts.visitor) state.visitors.current = { id: opts.visitor, arriveAt: now, leaveAt: now + 5 * MIN, fed: false };
  const rng = opts.rng || rngOf(state);
  return { state, rng, cfg, now };
}

function equip(state, snackId, toolId = null, charmId = null) {
  state.luggage = { snack: snackId, tool: toolId, charm: charmId };
  return state;
}

const ALL_POSTCARD_IDS = SPOTS.flatMap((s) => s.postcards.map((p) => p.id));
const ALL_SPOT_IDS = SPOTS.map((s) => s.id);
const FULL_ALBUM = SPOTS.flatMap((s) => s.postcards.map((p) => ({ postcardId: p.id, spotId: s.id, at: 0, rare: false })));

function mean(fn, n = 200) {
  let total = 0;
  for (let i = 1; i <= n; i++) total += fn(i);
  return total / n;
}

/** A timestamp that falls squarely inside one of the four seasons. */
function seasonTimeFor(season) {
  return Math.round((35 + season * 6 * 15.218 + 8) * 86400000);
}

/** A timestamp inside `season` whose weather is `kind`（用于隔离天气与季节的渲染差异）。 */
function seasonTimeForWeather(season, kind) {
  const base = seasonTimeFor(season);
  for (let b = 0; b < 60; b++) {
    const t = base + b * WEATHER_BUCKET_MS;
    if (weatherAt(t) === kind) return t;
  }
  return base;
}

/** First 6-hour bucket (from epoch) whose weather is `kind`. */
function weatherTimeFor(kind, maxBuckets = 5000) {
  for (let b = 0; b < maxBuckets; b++) {
    const t = b * WEATHER_BUCKET_MS + 60_000; // a minute into the bucket
    if (weatherAt(t) === kind) return t;
  }
  throw new Error(`no ${kind} bucket found`);
}

function canThrow(fn) {
  try { fn(); return false; } catch { return true; }
}

function readSrc(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/** Strip comments so prose like "the rest of the window" cannot trip a code scan. */
function stripComments(src) {
  if (src == null) return null;
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function walk(dir, ext = '.js') {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, ext));
    else if (entry.name.endsWith(ext)) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------- checks

export const CHECKS = {
  // ---- econ ----
  'econ.clover.start-ready': () => mk().state.patches.every((p) => p.readyAt <= 0),

  'econ.clover.pick-gain': () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { state, rng } = mk({ seed });
      const before = state.clovers;
      const r = pickClover(state, rng, 'p0', 0);
      if (!r.ok || r.gained < 1 || r.gained > 5 || state.clovers !== before + r.gained) return false;
    }
    return true;
  },

  'econ.clover.blocks-early': () => {
    const { state, rng } = mk();
    const first = pickClover(state, rng, 'p0', 0);
    const before = state.clovers;
    const second = pickClover(state, rng, 'p0', 0);
    return first.ok && !second.ok && second.reason === 'not-ready' && state.clovers === before;
  },

  'econ.clover.regrow': () => {
    const { state, rng } = mk();
    pickClover(state, rng, 'p0', 0);
    const patch = state.patches.find((p) => p.id === 'p0');
    return patch.readyAt === FAST.cloverRegrowMs
      && !isReady(state, 'p0', FAST.cloverRegrowMs - 1)
      && isReady(state, 'p0', FAST.cloverRegrowMs);
  },

  'econ.clover.four-leaf': () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const { state, rng } = mk({ seed });
      const before = state.clovers;
      const r = pickClover(state, rng, 'p0', 0);
      if (r.fourLeaf) return r.gained === CFG.fourLeafValue && state.clovers === before + CFG.fourLeafValue && state.stats.fourLeaf === 1;
      if (r.gained < 1 || r.gained > 3) return false;
    }
    return false;
  },

  'econ.clover.offline-ready': () => {
    const { state, rng } = mk();
    pickAll(state, rng, 0);
    tick(state, rng, 10 * MIN);
    return state.patches.every((p) => p.readyAt <= state.now);
  },

  'econ.shop.prices': () => {
    for (const item of ALL_ITEMS) {
      const { state } = mk({ clovers: item.cost });
      const r = buy(state, item.id, 0);
      if (!r.ok || state.clovers !== 0 || state.inventory[item.id] !== 1) return false;
    }
    return true;
  },

  'econ.shop.poor': () => {
    const { state } = mk({ clovers: 0 });
    const r = buy(state, 'mantou', 0);
    return !r.ok && r.reason === 'poor' && state.clovers === 0 && !state.inventory.mantou;
  },

  'econ.shop.unknown': () => buy(mk().state, 'not_a_thing', 0).ok === false,

  'econ.pack.wrong-slot': () => {
    const { state } = mk({ inventory: { mantou: 1 } });
    const r = pack(state, 'tool', 'mantou');
    return !r.ok && state.luggage.tool === null && state.inventory.mantou === 1;
  },

  'econ.pack.not-owned': () => {
    const { state } = mk();
    const r = pack(state, 'snack', 'mantou');
    return !r.ok && r.reason === 'not-owned' && state.luggage.snack === null;
  },

  'econ.pack.swap-returns': () => {
    const { state } = mk({ inventory: { mantou: 1, bamboo_rice: 1 } });
    pack(state, 'snack', 'mantou');
    pack(state, 'snack', 'bamboo_rice');
    return state.luggage.snack === 'bamboo_rice'
      && state.inventory.mantou === 1
      && !state.inventory.bamboo_rice;
  },

  'econ.pack.clear': () => {
    const { state } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    pack(state, 'snack', null);
    return state.luggage.snack === null && state.inventory.mantou === 1;
  },

  // ---- trip ----
  'trip.needs-snack': () => {
    const { state, rng } = mk();
    const check = canDepart(state);
    const sent = depart(state, rng, 0);
    return !check.ok && check.reason === 'no-snack' && !sent.ok && state.maniu.status === 'home';
  },

  'trip.tier-window': () => {
    const a = mk(); equip(a.state, 'mantou');
    const b = mk(); equip(b.state, 'bamboo_rice');
    const c = mk(); equip(c.state, 'matsutake');
    return [a, b, c].every((x) => tierWindow(x.state).min === 1)
      && tierWindow(a.state).max === 1 && tierWindow(b.state).max === 2 && tierWindow(c.state).max === 4;
  },

  'trip.snack-affinity': () => {
    const meanTier = (snackId) => {
      const { state } = mk();
      state.album = FULL_ALBUM;
      equip(state, snackId);
      return mean((seed) => SPOTS_BY_ID[planTrip(state, createRng(seed * 5147), 0).trip.spotId].tier, 300);
    };
    const [t1, t2, t3, t4] = ['mantou', 'bamboo_rice', 'chestnut_cake', 'matsutake'].map(meanTier);
    return t1 < t2 && t2 < t3 && t3 < t4 && t4 - t1 > 1.5;
  },

  'trip.lantern-unlocks': () => {
    const { state } = mk();
    equip(state, 'bamboo_rice', 'paper_lantern');
    return tierWindow(state).max === 3;
  },

  'trip.unlock-chain': () => {
    const locked = mk();
    equip(locked.state, 'matsutake');
    const before = eligibleSpots(locked.state).map((s) => s.id);
    const after = mk();
    equip(after.state, 'matsutake');
    after.state.album = [
      { postcardId: 'stone_bridge_a', spotId: 'stone_bridge' },
      { postcardId: 'creek_town_a', spotId: 'creek_town' },
    ];
    const pool = eligibleSpots(after.state).map((s) => s.id);
    return before.includes('houshan') // near places stay reachable: no dead end
      && before.length === 3 // only the three tier-1 spots are unlocked at the start
      && pool.includes('old_pier')
      && !pool.includes('islands')
      && !pool.includes('aurora_field');
  },

  'trip.duration-scales': () => {
    const durationsFor = (snackId) => {
      const { state } = mk();
      state.album = FULL_ALBUM;
      equip(state, snackId);
      return mean((seed) => {
        const rng = createRng(seed * 7919);
        const plan = planTrip(state, rng, 0);
        return plan.ok ? plan.trip.returnAt : 0;
      }, 300);
    };
    const t1 = durationsFor('mantou');
    const t2 = durationsFor('bamboo_rice');
    const t3 = durationsFor('chestnut_cake');
    const t4 = durationsFor('matsutake');
    return t1 < t2 && t2 < t3 && t3 < t4;
  },

  'trip.duration-bounds': () => {
    const { state } = mk();
    state.album = FULL_ALBUM;
    equip(state, 'mantou');
    const base = ITEMS_BY_ID.mantou.hours * HOUR;
    return mean((seed) => {
      const rng = createRng(seed * 104729);
      const plan = planTrip(state, rng, 0);
      const d = plan.trip.returnAt;
      return d >= base * 0.84 && d <= base * 1.16 + 1 && d > 0 ? 0 : 1;
    }, 300) === 0;
  },

  'trip.consumes-snack': () => {
    const { state, rng } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    depart(state, rng, 0);
    finishTrip(state, rng, 1000);
    return state.luggage.snack === null && !state.inventory.mantou;
  },

  'trip.keeps-tool': () => {
    const { state, rng } = mk({ inventory: { mantou: 1, paper_lantern: 1 } });
    pack(state, 'snack', 'mantou');
    pack(state, 'tool', 'paper_lantern');
    depart(state, rng, 0);
    finishTrip(state, rng, 1000);
    return state.luggage.tool === 'paper_lantern' && !state.inventory.paper_lantern;
  },

  'trip.charm-spent': () => {
    const { state, rng } = mk({ inventory: { mantou: 1, coin_charm: 1 } });
    pack(state, 'snack', 'mantou');
    pack(state, 'charm', 'coin_charm');
    depart(state, rng, 0);
    finishTrip(state, rng, 1000);
    return state.luggage.charm === null && !state.inventory.coin_charm;
  },

  'trip.postcard-recorded': () => {
    const { state, rng } = mk({ inventory: { bamboo_rice: 1 } });
    pack(state, 'snack', 'bamboo_rice');
    const sent = depart(state, rng, 0);
    finishTrip(state, rng, 1000);
    return state.album.length === 1 && state.album[0].spotId === sent.trip.spotId && SPOTS_BY_ID[state.album[0].spotId] != null;
  },

  'trip.prefers-new-postcard': () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = mk({ seed, album: [{ postcardId: 'houshan_a', spotId: 'houshan', at: 0 }] });
      const rng = createRng(seed * 31337);
      const out = resolveTrip(state, rng, { spotId: 'houshan', snackId: 'mantou', toolId: null, charmId: null });
      if (out.postcard.id === 'houshan_a') return false;
    }
    return true;
  },

  'trip.rare-flag': () => {
    let sawRare = false;
    for (let seed = 1; seed <= 400; seed++) {
      const { state, rng } = mk({ seed, inventory: { mantou: 1 }, album: FULL_ALBUM });
      pack(state, 'snack', 'mantou');
      const sent = depart(state, rng, 0);
      if (!sent.ok) return false;
      const out = finishTrip(state, rng, 1000);
      const entry = state.album[state.album.length - 1];
      if (out.rare) {
        sawRare = true;
        if (entry.rare !== true) return false;
      }
    }
    return sawRare;
  },

  'trip.souvenirs-count': () => {
    const countWith = (toolId) => {
      const { state } = mk();
      state.album = FULL_ALBUM;
      state.luggage = { snack: 'mantou', tool: toolId, charm: null };
      return mean((seed) => {
        const rng = createRng(seed * 65537);
        const out = resolveTrip(state, rng, { spotId: 'houshan', snackId: 'mantou', toolId, charmId: null });
        return out.souvenirs.length;
      }, 400);
    };
    return countWith('satchel') > countWith(null);
  },

  'trip.bonus-clovers': () => {
    const cloversWith = (charmId) => {
      const { state } = mk();
      state.album = FULL_ALBUM;
      state.luggage = { snack: 'mantou', tool: null, charm: charmId };
      return mean((seed) => {
        const rng = createRng(seed * 99991);
        return resolveTrip(state, rng, { spotId: 'houshan', snackId: 'mantou', toolId: null, charmId }).bonusClovers;
      }, 400);
    };
    return cloversWith('coin_charm') > cloversWith(null) + 0.5;
  },

  'trip.determinism': () => {
    const run = () => {
      const e = createEngine({ seed: 4242, now: 0, cfg: FAST });
      e.state.clovers = 500;
      e.buy('matsutake');
      e.pack('snack', 'matsutake');
      e.pack('tool', 'paper_lantern');
      e.tick(3 * DAY);
      e.buy('chestnut_cake');
      e.pack('snack', 'chestnut_cake');
      e.tick(6 * DAY);
      const { now, ...rest } = e.state;
      return JSON.stringify(rest);
    };
    return run() === run();
  },

  'trip.free-destination': () => {
    const { state, rng } = mk({ inventory: { bamboo_rice: 1 } });
    pack(state, 'snack', 'bamboo_rice');
    const pool = eligibleSpots(state);
    const locked = SPOTS.find((s) => !pool.some((e) => e.id === s.id));
    if (!locked || !pool.length) return false;
    // 不可达的地方被拒绝
    if (departTo(state, rng, locked.id, 0).ok !== false) return false;
    // 去一个可达的地方，确实去了那，且计入自由行
    const target = pool[0];
    const r = departTo(state, rng, target.id, 0);
    if (!r.ok || r.trip.spotId !== target.id) return false;
    if (state.maniu.trip.spotId !== target.id) return false;
    return state.stats.freeTrips === 1;
  },

  'trip.free-shown': () => {
    const app = readSrc('src/ui/app.js');
    return Boolean(app && /data-act="go"/.test(app) && /engine\.sendTo/.test(app) && /去这里/.test(app));
  },

  // ---- tick / offline ----
  'tick.autodepart': () => {
    const { state, rng } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    tick(state, rng, 3 * MIN);
    return state.maniu.status === 'away' && state.maniu.trip != null;
  },

  'tick.depart-delay-bounded': () => {
    const cfg = { departDelayMs: [5 * MIN, 10 * MIN], minRestMs: 0, maxRestMs: 0 };
    const early = mk({ inventory: { mantou: 1 }, cfg });
    pack(early.state, 'snack', 'mantou');
    tick(early.state, early.rng, 4 * MIN);
    const late = mk({ inventory: { mantou: 1 }, cfg });
    pack(late.state, 'snack', 'mantou');
    tick(late.state, late.rng, 10 * MIN + 1);
    return early.state.maniu.status === 'home' && late.state.maniu.status === 'away';
  },

  'tick.return-home': () => {
    const { state, rng } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    tick(state, rng, 3 * MIN);
    const returnAt = state.maniu.trip.returnAt;
    tick(state, rng, returnAt + 1);
    return state.maniu.status === 'home' && state.maniu.trip === null && state.stats.trips === 1 && state.maniu.restUntil >= returnAt;
  },

  'tick.offline-catchup': () => {
    const { state, rng } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    tick(state, rng, 3 * DAY);
    return state.stats.trips === 1 && state.album.length === 1 && state.luggage.snack === null;
  },

  'tick.catchup-capped': () => {
    const { state, rng } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    tick(state, rng, 365 * DAY);
    return state.now <= CFG.maxCatchupMs && state.stats.trips <= 1;
  },

  'tick.monotonic': () => {
    const { state, rng } = mk();
    tick(state, rng, 5 * MIN);
    const at = state.now;
    tick(state, rng, 0);
    return state.now === at;
  },

  // ---- visitors ----
  'visitor.arrives': () => {
    const { state, rng } = mk();
    tick(state, rng, MIN);
    return state.visitors.current != null && currentVisitor(state) != null;
  },

  'visitor.leaves': () => {
    const { state, rng } = mk();
    tick(state, rng, MIN);
    tick(state, rng, MIN + FAST.visitorStayMs + 1);
    return state.visitors.current === null && state.visitors.nextAt > state.now;
  },

  'visitor.feed-favourite': () => {
    const { state, rng } = mk({ visitor: 'snail', inventory: { bamboo_rice: 1 } });
    const r = feedVisitor(state, rng, 'bamboo_rice', 0);
    return r.ok && r.favoured && r.friendship === 2 && state.visitors.friendship.snail === 2;
  },

  'visitor.feed-once': () => {
    const { state, rng } = mk({ visitor: 'snail', inventory: { bamboo_rice: 1, mantou: 1 } });
    feedVisitor(state, rng, 'bamboo_rice', 0);
    const second = feedVisitor(state, rng, 'mantou', 0);
    return !second.ok && second.reason === 'already-fed' && state.inventory.mantou === 1;
  },

  'visitor.gift-added': () => {
    const { state, rng } = mk({ visitor: 'snail', inventory: { mantou: 1 } });
    const r = feedVisitor(state, rng, 'mantou', 0);
    return r.ok && !r.favoured && r.gift.id === VISITORS_BY_ID.snail.gift.id
      && state.souvenirs[VISITORS_BY_ID.snail.gift.id] === 1 && state.stats.friendGifts === 1;
  },

  'visitor.rare-gift': () => {
    const { state, rng } = mk({ visitor: 'turtle', inventory: { mantou: 1 }, friendship: { turtle: 1 } });
    const r = feedVisitor(state, rng, 'mantou', 0);
    return r.ok && r.gift.id === VISITORS_BY_ID.turtle.rareGift.id && state.souvenirs[r.gift.id] === 1;
  },

  'visitor.interaction-data': () => {
    const withInteraction = VISITORS.filter((v) => (v.interactions || []).length > 0);
    if (withInteraction.length < 3) return false;
    for (const v of withInteraction) {
      for (const it of v.interactions) {
        if (!VISITORS_BY_ID[it.with]) return false; // 引用的访客必须真实
        if (it.with === v.id) return false; // 不能自言自语
        if (!(it.minFriendship >= 1)) return false;
        if (!it.line) return false;
      }
    }
    return true;
  },

  'visitor.interaction-triggers': () => {
    const v = VISITORS.find((x) => (x.interactions || []).length > 0);
    const it = v.interactions[0];
    // 交情不够 → 没有互动
    const cold = mk({ visitor: v.id });
    const r1 = arriveVisitor(cold.state, cold.rng, 0, v.id);
    if (r1.interaction != null || cold.state.visitors.current.interaction != null) return false;
    // 交情够了 → 触发互动，且记录了对应访客与那句话
    const warm = mk({ visitor: v.id, friendship: { [it.with]: it.minFriendship } });
    const r2 = arriveVisitor(warm.state, warm.rng, 0, v.id);
    return r2.interaction != null
      && r2.interaction.with === it.with
      && warm.state.visitors.current.interaction.with === it.with
      && warm.state.log.some((l) => l.text === it.line);
  },

  'visitor.interaction-shown': () => {
    const app = readSrc('src/ui/app.js');
    return Boolean(app && /interaction\.line/.test(app) && /interaction\.with/.test(app));
  },

  'visitor.companion-data': () => {
    const withCompanion = VISITORS.filter((v) => v.companion);
    if (withCompanion.length < 2) return false;
    for (const v of withCompanion) {
      const c = v.companion;
      if (!FOLK_GAMES_BY_ID[c.gameId]) return false;
      if (!(c.bonus > 0 && c.bonus < 1)) return false;
    }
    return true;
  },

  'visitor.companion-boosts': () => {
    const v = VISITORS.find((x) => x.companion);
    const c = v.companion;
    const game = FOLK_GAMES_BY_ID[c.gameId];
    // 交情不够 → 无加成
    const cold = mk({ visitor: v.id });
    if (companionBonus(cold.state, c.gameId) !== 0) return false;
    // 交情够了 → 有加成；别的游戏无加成
    const warm = mk({ visitor: v.id, friendship: { [v.id]: 2 } });
    if (companionBonus(warm.state, c.gameId) !== c.bonus) return false;
    const other = FOLK_GAMES.find((g) => g.id !== c.gameId);
    if (companionBonus(warm.state, other.id) !== 0) return false;
    // 加成真的作用在命中率上：陪玩平均命中 > 无陪玩
    const meanHits = (has) => {
      let total = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const st = mk({ seed, visitor: v.id, friendship: has ? { [v.id]: 2 } : {} }).state;
        const r = playFolkGame(st, createRng(seed * 7919), c.gameId, 0);
        total += r.hits;
      }
      return total / 400;
    };
    return meanHits(true) > meanHits(false) + 0.2;
  },

  // ---- titles ----
  'titles.first-trip': () => {
    const { state } = mk();
    state.stats.trips = 1;
    return newlyEarnedTitles(state).includes('first_trip');
  },

  'titles.four-leaf': () => {
    const { state } = mk();
    state.stats.fourLeaf = 1;
    return newlyEarnedTitles(state).includes('lucky');
  },

  'titles.album-full': () => {
    const { state } = mk({ album: FULL_ALBUM });
    const earned = newlyEarnedTitles(state);
    return earned.includes('album_full') && summarize(state).albumCount >= TOTAL_POSTCARDS;
  },

  'titles.no-duplicates': () => {
    const { state } = mk();
    state.stats.trips = 5;
    state.titles = ['first_trip'];
    return !newlyEarnedTitles(state).includes('first_trip');
  },

  // ---- save ----
  'save.roundtrip': () => {
    const storage = memoryStorage();
    const e1 = createEngine({ seed: 7, now: 0, cfg: FAST, storage });
    e1.buy('mantou');
    e1.state.clovers = 99;
    e1.pack('snack', 'mantou');
    e1.state.album.push({ postcardId: 'houshan_a', spotId: 'houshan', at: 1, rare: false });
    e1.save();
    const e2 = createEngine({ seed: 999, now: 0, cfg: FAST, storage });
    return e2.state.clovers === 99
      && e2.state.inventory.mantou === undefined
      && e2.state.luggage.snack === 'mantou'
      && e2.state.album.length === 1
      && e2.state.album[0].postcardId === 'houshan_a';
  },

  'save.rng-continuity': () => {
    const storage = memoryStorage();
    const e1 = createEngine({ seed: 11, now: 0, cfg: FAST, storage });
    e1.rng.next();
    e1.save();
    const b1 = e1.rng.next();
    const e2 = createEngine({ seed: 999, now: 0, cfg: FAST, storage });
    const b2 = e2.rng.next();
    return b1 === b2;
  },

  'save.rejects-version': () => {
    const r = deserialize(JSON.stringify({ version: 99, patches: [], maniu: {}, luggage: {} }));
    return r.ok === false && String(r.reason).startsWith('version-mismatch');
  },

  'save.bad-json': () => {
    const r = deserialize('{{{not json');
    return r.ok === false && r.reason === 'bad-json' && !canThrow(() => deserialize(''));
  },

  // ---- static / build-level ----
  'core.purity': () => {
    const files = walk('src/core');
    if (!files.length) return false;
    return files.every((f) => {
      const src = stripComments(readSrc(f));
      return src != null && !/\b(document|window|localStorage|navigator|alert)\b/.test(src);
    });
  },

  'core.no-network': () => {
    const files = walk('src');
    if (!files.length) return false;
    return files.every((f) => {
      const src = readSrc(f);
      return src != null && !/\bfetch\s*\(|XMLHttpRequest|WebSocket|importScripts/.test(stripComments(src));
    });
  },

  'ui.viewport': () => {
    const html = readSrc('index.html');
    return Boolean(html && /name=["']viewport["']/.test(html) && /width=device-width/.test(html));
  },

  'ui.watch-breakpoint': () => {
    const css = readSrc('src/ui/style.css') || readSrc('index.html') || '';
    return /@media[^{]*max-width\s*:\s*(2[0-9]\d|3[0-2]\d)px/.test(css);
  },

  'ui.hand-drawn': () => {
    const ink = readSrc('src/render/ink.js');
    return Boolean(ink && /export\s+function\s+(wobble|inkStroke|roughLine|jitter)/.test(ink));
  },

  'ux.offline-progress': () => {
    const files = ['index.html', ...walk('src/ui'), ...walk('src/render')];
    return files.some((f) => {
      const src = readSrc(f);
      return src != null && /visibilitychange|requestAnimationFrame/.test(src) && /tick/.test(src);
    });
  },

  'ux.no-external-assets': () => {
    const html = readSrc('index.html');
    if (!html) return false;
    const tags = html.match(/(?:src|href)\s*=\s*["'][^"']+["']/g) || [];
    return tags.every((t) => !/https?:\/\//.test(t));
  },

  'ui.capacitor-ready': () => {
    const cfg = readSrc('capacitor.config.json') || readSrc('capacitor.config.ts');
    const gradle = readSrc('android/app/build.gradle') || readSrc('android/app/build.gradle.kts');
    const manifest = readSrc('android/app/src/main/AndroidManifest.xml');
    const activity = readSrc('android/app/src/main/java/com/maniu/travel/MainActivity.java');
    if (!cfg || !gradle || !manifest || !activity) return false;
    const appId = (cfg.match(/"appId"\s*:\s*"([^"]+)"/) || [])[1];
    return Boolean(appId) && gradle.includes(appId) && manifest.includes('.MainActivity') !== false || manifest.includes('MainActivity');
  },

  'vendor.input-not-drifted': () => {
    // The vendored copy must equal the canonical workspace source, byte for byte.
    const stamp = readSrc('src/vendor/VENDOR.json');
    const vendored = readSrc('src/vendor/wearable-input.js');
    if (!stamp || !vendored) return false;
    const meta = JSON.parse(stamp);
    const lastMarker = vendored.lastIndexOf('// ──');
    if (lastMarker <= 0) return false;
    const nl = vendored.indexOf('\n', lastMarker);
    const body = vendored.slice(nl + 1).replace(/^\n+/, '');
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    if (sha !== meta.payloadSha256) return false; // someone edited inside the vendored file

    // If the canonical source is present in this checkout, verify against it.
    // (Offline/CI checkouts without the sibling project can only prove the
    // vendored file matches the fingerprint recorded at sync time.)
    const upstreamPath = path.resolve(ROOT, meta.source);
    if (!fs.existsSync(upstreamPath)) return true;
    const upstream = fs.readFileSync(upstreamPath, 'utf8');
    return crypto.createHash('sha256').update(upstream).digest('hex') === meta.payloadSha256;
  },

  'ui.wearable-wired': () => {
    const app = readSrc('src/ui/app.js');
    const mod = readSrc('src/ui/wearable.js');
    if (!app || !mod) return false;
    const gestures = ['tap', 'shake', 'swing', 'tilt'].every((g) => app.includes(`case '${g}'`));
    return gestures
      && /bindWearable\(/.test(app)
      && /createWearableInput/.test(mod)
      && /requestPermission/.test(mod)
      && /engine\.send\(/.test(app)
      && /el\.pick\.click\(\)/.test(app);
  },

  'decor.place-clear': () => {
    const { state } = mk({ souvenirs: { wild_chestnut: 1 } });
    if (placeDecor(state, 'shelf', 'wild_chestnut').ok !== true) return false;
    if (state.decor.shelf !== 'wild_chestnut') return false;
    if (placeDecor(state, 'shelf', 'never_seen').ok !== false) return false;
    placeDecor(state, 'shelf', null);
    return state.decor.shelf === null;
  },

  'decor.multi-slot': () => {
    const items = { shelf: 'wild_chestnut', sill: 'gray_feather', floor: 'pine_cone', wall: 'reed_stem' };
    const { state } = mk({ souvenirs: { wild_chestnut: 1, gray_feather: 1, pine_cone: 1, reed_stem: 1 } });
    // 四个槽位各自独立摆放
    for (const s of DECOR_SLOTS) {
      if (placeDecor(state, s, items[s]).ok !== true) return false;
      if (state.decor[s] !== items[s]) return false;
    }
    // 未知槽位被拒绝
    if (placeDecor(state, 'ceiling', 'wild_chestnut').ok !== false) return false;
    // 一件收藏只能占一个槽位：重新摆到别处会从旧槽位移走
    placeDecor(state, 'shelf', 'gray_feather');
    if (state.decor.shelf !== 'gray_feather' || state.decor.sill !== null) return false;
    // 清空一个槽位不影响其它
    placeDecor(state, 'floor', null);
    if (state.decor.floor !== null || state.decor.wall !== 'reed_stem') return false;
    return true;
  },

  'decor.slots-shown': () => {
    const base = mk({ souvenirs: { wild_chestnut: 1 } }).state;
    const c0 = stubCtx();
    drawRoom(c0, 390, 620, base, 1000);
    const hashes = new Set([c0.hash()]);
    for (const s of DECOR_SLOTS) {
      const st = mk({ souvenirs: { wild_chestnut: 1 } }).state;
      st.decor[s] = 'wild_chestnut';
      const ctx = stubCtx();
      drawRoom(ctx, 390, 620, st, 1000);
      if (ctx.count <= 40) return false;
      hashes.add(ctx.hash());
    }
    // 空房 + 四个槽位各有不同画法 = 5 个互不相同的画面
    return hashes.size === 5;
  },

  'decor.shown': () => {
    const a = mk({ souvenirs: { wild_chestnut: 1 } }).state;
    const ca = stubCtx();
    drawRoom(ca, 390, 620, a, 1000);
    const b = mk({ souvenirs: { wild_chestnut: 1 } }).state;
    b.decor.shelf = 'wild_chestnut';
    const cb = stubCtx();
    drawRoom(cb, 390, 620, b, 1000);
    return cb.count > ca.count && ca.hash() !== cb.hash();
  },

  'decor.persist': () => {
    const storage = memoryStorage();
    const e1 = createEngine({ seed: 3, now: 0, cfg: FAST, storage });
    e1.state.souvenirs.wild_chestnut = 1;
    e1.state.souvenirs.gray_feather = 1;
    placeDecor(e1.state, 'shelf', 'wild_chestnut');
    placeDecor(e1.state, 'wall', 'gray_feather');
    e1.save();
    const e2 = createEngine({ seed: 9, now: 0, cfg: FAST, storage });
    return e2.state.decor.shelf === 'wild_chestnut' && e2.state.decor.wall === 'gray_feather';
  },

  'ui.watch-stage-room': () => {
    const css = readSrc('src/ui/style.css');
    if (!css) return false;
    const block = css.slice(css.indexOf('@media (max-width: 320px)'));
    // the pick button must leave the document flow so the scene keeps its height
    return /#secondary\s*\{[^}]*position:\s*absolute/.test(block);
  },

  'ui.touch-targets': () => {
    const css = readSrc('src/ui/style.css');
    if (!css) return false;
    const hits = (css.match(/min-height:\s*44px/g) || []).length;
    return hits >= 4
      && /\.action\s*\{/.test(css)
      && /\.nav-btn\s*\{/.test(css)
      && /\.row button\s*\{/.test(css);
  },

  'ux.share-offline': () => {
    const app = readSrc('src/ui/app.js');
    if (!app) return false;
    // share renders locally and downloads via toDataURL — never a network URL
    return /toDataURL\(/.test(app)
      && /\.download\s*=/.test(app)
      && /openPostcardDetail/.test(app)
      && !/https?:\/\//.test(app);
  },

  'ux.reduced-motion': () => {
    const app = readSrc('src/ui/app.js');
    if (!app) return false;
    return /prefers-reduced-motion/.test(app)
      && /matchMedia/.test(app)
      && /reducedMotion/.test(app)
      && /paintScene\(motionT\)/.test(app);
  },

  'ui.wearable-affordance': () => {
    const html = readSrc('index.html');
    return Boolean(html && /id="wearable-enable"/.test(html) && /id="wearable-status"/.test(html));
  },

  'ui.shipped-assets-match': () => {
    // The bundle inside the APK must be byte-identical to what the tests ran on.
    const pairs = [
      ['index.html', 'www/index.html'],
      ['index.html', 'android/app/src/main/assets/public/index.html'],
      ['src/ui/app.js', 'www/src/ui/app.js'],
      ['src/core/engine.js', 'android/app/src/main/assets/public/src/core/engine.js'],
      ['src/ui/style.css', 'www/src/ui/style.css'],
    ];
    return pairs.every(([a, b]) => {
      const from = readSrc(a);
      const to = readSrc(b);
      return from != null && to != null && from === to;
    });
  },

  // ---- data index integrity ----
  'data.index-objects': () => {
    const maps = { POSTCARDS_BY_ID, SOUVENIRS_BY_ID, SPOTS_BY_ID, ITEMS_BY_ID, VISITORS_BY_ID };
    for (const [name, map] of Object.entries(maps)) {
      const entries = Object.entries(map);
      if (!entries.length) return false;
      for (const [key, value] of entries) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        if (value.id !== key) return false;
        if (!value.name && !value.title) return false;
      }
    }
    // every postcard / souvenir must resolve back to a real spot
    for (const p of Object.values(POSTCARDS_BY_ID)) if (!SPOTS_BY_ID[p.spotId]) return false;
    for (const v of Object.values(SOUVENIRS_BY_ID)) if (!SPOTS_BY_ID[v.spotId]) return false;
    return true;
  },

  'theme.chinese-activities': () => {
    const src = readSrc('src/core/state.js');
    if (!src) return false;
    return /磨墨/.test(src) && /理茶/.test(src) && !/擦帽子/.test(src) && !/削木头/.test(src);
  },

  'theme.chinese-elements': () => {
    const files = ['src/data/items.js', 'src/data/spots.js', 'src/data/visitors.js', 'src/core/titles.js', 'src/core/state.js', 'index.html', 'src/ui/app.js'];
    const src = files.map(readSrc).filter(Boolean).join('\n');
    if (src.length < 2000) return false;
    const banned = ['饭团', '三叶草', '四叶草', '寿司', '关东煮', '天妇罗', '鸟居', '神社', '便当', '榻榻米'];
    if (banned.some((t) => src.includes(t))) return false;
    return src.includes('铜钱草') && src.includes('馒头') && src.includes('东海灯塔') && src.includes('漠河极光');
  },

  'data.spot-regions': () => {
    if (!SPOTS.every((s) => s.region && REGIONS.includes(s.region))) return false;
    // every region is actually populated, and the render scene of each region differs
    const counts = REGIONS.map((r) => SPOTS.filter((s) => s.region === r).length);
    return counts.every((n) => n >= 2) && new Set(SPOTS.map((s) => s.region)).size === REGIONS.length;
  },

  'ui.album-grouped': () => {
    const app = readSrc('src/ui/app.js');
    if (!app) return false;
    return /REGIONS\.map/.test(app) && /spot\.region/.test(app) && /section-title/.test(app);
  },

  'data.unique-ids': () => {
    const ids = [
      ...SPOTS.map((s) => s.id),
      ...SPOTS.flatMap((s) => s.postcards.map((p) => p.id)),
      ...SPOTS.flatMap((s) => s.souvenirs.map((v) => v.id)),
      ...ALL_ITEMS.map((i) => i.id),
      ...VISITORS.map((v) => v.id),
    ];
    return ids.length === new Set(ids).size;
  },

  'data.visitor-favours-feedable': () => {
    for (const v of VISITORS) {
      if (!Array.isArray(v.favours) || v.favours.length === 0) return false;
      for (const f of v.favours) {
        // 偏好必须是真实干粮：喂得进去的东西（state.inventory 里才有）。
        if (!SNACKS.some((s) => s.id === f)) return false;
      }
    }
    return true;
  },

  // ---- render ----
  'render.matrix-draws': () => {
    const state = mk().state;
    state.album = FULL_ALBUM;
    state.visitors.current = { id: 'snail', arriveAt: 0, leaveAt: 60_000, fed: false };
    const surface = () => stubCtx();

    let ctx = surface();
    drawRoom(ctx, 390, 620, state, 1000);
    if (ctx.count < 40) return false;

    ctx = surface();
    drawGarden(ctx, 390, 620, state, 1000, { ...state.visitors.current, info: VISITORS_BY_ID.snail });
    if (ctx.count < 40) return false;

    ctx = surface();
    drawMap(ctx, 320, 190, state, 1000);
    if (ctx.count < 30) return false;

    for (const spot of SPOTS) {
      ctx = surface();
      drawPostcardScene(ctx, 0, 0, 132, 95, spot, 1000, { postcardId: spot.postcards[0].id });
      if (ctx.count < 10) return false;
    }
    for (const v of VISITORS) {
      ctx = surface();
      drawVisitor(ctx, 20, 20, 30, v.id, 1000);
      if (ctx.count < 4) return false;
    }
    const glyphIds = [
      ...Object.keys(SOUVENIRS_BY_ID),
      ...VISITORS.flatMap((v) => [v.gift.id, v.rareGift.id]),
    ];
    for (const id of glyphIds) {
      ctx = surface();
      drawSouvenirGlyph(ctx, 27, 27, 20, id, 1000);
      if (ctx.count < 3) return false;
    }
    return true;
  },

  'render.deterministic': () => {
    const state = mk().state;
    state.album = FULL_ALBUM;
    const a = stubCtx();
    drawRoom(a, 360, 560, state, 4242);
    const b = stubCtx();
    drawRoom(b, 360, 560, state, 4242);
    const c = stubCtx();
    drawRoom(c, 360, 560, state, 9999);
    return a.hash() === b.hash() && a.count > 40 && a.hash() !== c.hash();
  },

  'render.no-assets': () => {
    const files = walk('src/render');
    if (!files.length) return false;
    return files.every((f) => {
      const src = stripComments(readSrc(f));
      return src != null && !/new\s+Image|createImageBitmap|url\(|\.png|\.jpe?g|\.svg|fetch\s*\(/.test(src);
    });
  },

  // ---- ui wiring (static) ----
  'ui.sheets-wired': () => {
    const html = readSrc('index.html');
    const app = readSrc('src/ui/app.js');
    if (!html || !app) return false;
    const wanted = [...html.matchAll(/data-sheet="([a-z-]+)"/g)].map((m) => m[1]);
    if (!wanted.length) return false;
    const block = app.slice(app.indexOf('const SHEETS = {'), app.indexOf('\n};', app.indexOf('const SHEETS = {')));
    const implemented = new Set([...block.matchAll(/\n\s{2}([a-zA-Z]+)\(\)\s*\{/g)].map((m) => m[1]));
    return wanted.every((w) => implemented.has(w));
  },

  'ui.feed-affordance': () => {
    const html = readSrc('index.html');
    const app = readSrc('src/ui/app.js');
    return Boolean(html && app && /id="btn-feed"/.test(html) && /engine\.feed\(/.test(app) && /openSheet\('feed'\)/.test(app));
  },

  // ---- balance / playability ----
  'balance.bootstrap': () => {
    const cheapest = Math.min(...SNACKS.map((s) => s.cost));
    if (CFG.startClovers < cheapest) return false;
    const { state, rng } = mkReal();
    const picked = pickAll(state, rng, 0);
    return picked.gained >= 1 && state.clovers >= cheapest;
  },

  'balance.rhythm': () => {
    const perDay = (snackId) => {
      const { state } = mkReal();
      state.album = FULL_ALBUM;
      equip(state, snackId);
      const duration = mean((seed) => planTrip(state, createRng(seed * 8719), 0).trip.returnAt, 200);
      const rest = (CFG.minRestMs + CFG.maxRestMs) / 2;
      const delay = (CFG.departDelayMs[0] + CFG.departDelayMs[1]) / 2;
      return DAY / (duration + rest + delay);
    };
    const shortest = perDay('mantou');
    const longest = perDay('matsutake');
    return shortest >= 2 && longest >= 1;
  },

  'bot.playable': () => {
    const run = runBot(120, 20260718);
    return run.run.distinctPostcards >= 24 && run.run.souvenirKinds >= 20;
  },

  'bot.no-deadlock': () => {
    const run = runBot(120, 20260718);
    return run.diag.minClovers >= 0 && run.diag.maxIdleDays <= 5;
  },

  'sim.stability': () => {
    const { state } = runBot(365, 4242);
    const nums = [state.clovers, state.now, state.stats.trips, state.stats.picked, state.maniu.restUntil];
    if (nums.some((n) => !Number.isFinite(n))) return false;
    if (state.clovers < 0 || state.clovers > 1e6) return false;
    if (state.log.length > CFG.logLimit) return false;
    if (state.album.length > ALBUM_CAP) return false;
    const allKinds = Object.keys(SOUVENIRS_BY_ID).length + VISITORS.length * 2;
    return Object.keys(state.souvenirs).length <= allKinds;
  },

  'save.album-bounded': () => {
    const { state } = runBot(365, 4242);
    const collected = Object.keys(state.collection).length;
    return state.album.length <= ALBUM_CAP && collected >= 24;
  },

  'save.migrates-v1': () => {
    const v1 = {
      version: 1, seed: 1, rngState: 5, now: 0,
      patches: [{ id: 'p0', readyAt: 0 }],
      maniu: { name: '马牛', status: 'home', activity: '发呆', restUntil: 0, leaveAt: null, trip: null, tripsDone: 0 },
      luggage: { snack: null, tool: null, charm: null },
      clovers: 3, inventory: {}, souvenirs: {}, titles: [], log: [],
      album: [
        { postcardId: 'houshan_a', spotId: 'houshan', at: 1, rare: false },
        { postcardId: 'houshan_a', spotId: 'houshan', at: 2, rare: false },
        { postcardId: 'houshan_rare', spotId: 'houshan', at: 3, rare: true },
      ],
      visitors: { current: null, nextAt: 0, friendship: {} },
      stats: { trips: 3 },
    };
    const r = deserialize(JSON.stringify(v1));
    if (!r.ok || r.state.version !== 2) return false;
    const c = r.state.collection;
    return c.houshan_a.count === 2 && c.houshan_a.spotId === 'houshan'
      && c.houshan_rare.rare === true && r.state.clovers === 3
      && r.state.album.length === 3 && r.state.stats.trips === 3;
  },

  'weather.deterministic': () => {
    if (weatherAt(0) !== weatherAt(0) || weatherAt(123456789) !== weatherAt(123456789)) return false;
    // all three kinds must occur within a couple of months, and the same input
    // must always give the same answer (weather is not allowed to consume rng)
    const seen = new Set();
    for (let b = 0; b < 300; b++) seen.add(weatherAt(b * WEATHER_BUCKET_MS));
    return WEATHER_KINDS.every((k) => seen.has(k));
  },

  'weather.in-trip': () => {
    for (const kind of WEATHER_KINDS) {
      const now = weatherTimeFor(kind);
      const { state } = mk({ now });
      state.album = FULL_ALBUM;
      equip(state, 'bamboo_rice');
      const trip = planTrip(state, createRng(9), now).trip;
      if (trip.weather !== kind || weatherAt(trip.departAt) !== kind) return false;
    }
    return true;
  },

  'weather.rain-shortens': () => {
    const meanFor = (kind, toolId) => {
      const now = weatherTimeFor(kind);
      const { state } = mk({ now });
      state.album = FULL_ALBUM;
      equip(state, 'bamboo_rice', toolId);
      return mean((seed) => planTrip(state, createRng(seed * 3571), now).trip.returnAt - now, 200);
    };
    const clear = meanFor('clear', null);
    const rain = meanFor('rain', null);
    // wind is a bonus, not a penalty
    const wind = meanFor('wind', null);
    return rain < clear * 0.9 && wind > clear;
  },

  'weather.hat-cancels-rain': () => {
    const meanFor = (kind, toolId) => {
      const now = weatherTimeFor(kind);
      const { state } = mk({ now });
      state.album = FULL_ALBUM;
      equip(state, 'bamboo_rice', toolId);
      return mean((seed) => planTrip(state, createRng(seed * 3571), now).trip.returnAt - now, 200);
    };
    const clear = meanFor('clear', null);
    const rainBare = meanFor('rain', null);
    const rainWithHat = meanFor('rain', 'straw_hat');
    // both halves matter: the rain penalty must exist, and the hat must cancel it
    // (otherwise a no-op implementation would satisfy this clause vacuously)
    return rainBare < clear * 0.9 && Math.abs(rainWithHat - clear) / clear < 0.02;
  },

  'weather.hat-bonus': () => {
    const countFor = (kind, toolId) => {
      const now = weatherTimeFor(kind);
      const { state } = mk({ now });
      state.album = FULL_ALBUM;
      const trip = { spotId: 'houshan', snackId: 'bamboo_rice', toolId, charmId: null, weather: kind, rainProof: toolId === 'straw_hat' };
      return mean((seed) => resolveTrip(state, createRng(seed * 613), trip).souvenirs.length, 400);
    };
    return countFor('rain', 'straw_hat') > countFor('rain', null) + 0.5;
  },

  'season.deterministic': () => {
    if (solarTermIndex(123) !== solarTermIndex(123)) return false;
    const seen = new Set();
    for (let d = 0; d < 366; d++) seen.add(solarTermIndex(d * 86400000));
    return seen.size === 24;
  },

  'season.four-accents': () => {
    if (new Set(SEASON_ACCENT).size !== 4) return false;
    if (SEASON_PAPER.length !== 4) return false;
    return [0, 1, 2, 3].every((i) => seasonAccent(seasonTimeFor(i)) === SEASON_ACCENT[i]);
  },

  'season.shown': () => {
    const spot = SPOTS[0];
    const a = stubCtx();
    drawPostcardScene(a, 0, 0, 132, 95, spot, 0, { postcardId: spot.postcards[0].id, now: seasonTimeFor(0) });
    const b = stubCtx();
    drawPostcardScene(b, 0, 0, 132, 95, spot, 0, { postcardId: spot.postcards[0].id, now: seasonTimeFor(2) });
    return a.hash() !== b.hash(); // different season → different paper tint, visibly
  },

  'season.souvenir-gated': () => {
    // 1) every seasonal souvenir is registered, seasonal-flagged, and unique
    const seasonal = Object.values(SEASONAL_SOUVENIRS_BY_ID);
    if (!seasonal.length) return false;
    const baseIds = new Set(SPOTS.flatMap((s) => s.souvenirs.map((v) => v.id)));
    const seen = new Set();
    for (const [spotId, list] of Object.entries(SEASONAL)) {
      if (!SPOTS_BY_ID[spotId]) return false;
      for (const e of list) {
        const id = e.souvenir.id;
        if (baseIds.has(id) || seen.has(id)) return false; // no collisions
        seen.add(id);
        if (e.season < 0 || e.season > 3 || !(e.chance > 0 && e.chance <= 1)) return false;
        const reg = SOUVENIRS_BY_ID[id];
        if (!reg || reg.seasonal !== true || reg.spotId !== spotId || reg.season !== e.season) return false;
      }
    }
    // 2) obtainable in its own season, never in the opposite season
    for (const [spotId, list] of Object.entries(SEASONAL)) {
      for (const e of list) {
        const inAt = seasonTimeFor(e.season);
        const outAt = seasonTimeFor((e.season + 2) % 4);
        let dropped = false;
        for (let seed = 1; seed <= 300 && !dropped; seed++) {
          const { state } = mk({ now: inAt });
          const out = resolveTrip(state, createRng(seed * 7919), { spotId, snackId: 'mantou', toolId: null, charmId: null, departAt: inAt, returnAt: inAt });
          if (out.souvenirs.includes(e.souvenir.id)) dropped = true;
        }
        if (!dropped) return false;
        for (let seed = 1; seed <= 300; seed++) {
          const { state } = mk({ now: outAt });
          const out = resolveTrip(state, createRng(seed * 7919), { spotId, snackId: 'mantou', toolId: null, charmId: null, departAt: outAt, returnAt: outAt });
          if (out.souvenirs.includes(e.souvenir.id)) return false;
        }
      }
    }
    return true;
  },

  'weather.visitor-shelters': () => {
    const now = weatherTimeFor('rain');
    const { state, rng } = mk({ now });
    arriveVisitor(state, rng, now);
    const v = state.visitors.current;
    return v && v.sheltering === true && v.leaveAt > now + FAST.visitorStayMs;
  },

  'weather.visitor-clear-unchanged': () => {
    const now = weatherTimeFor('clear');
    const { state, rng } = mk({ now });
    arriveVisitor(state, rng, now);
    const v = state.visitors.current;
    return v && v.sheltering === false && v.leaveAt === now + FAST.visitorStayMs;
  },

  'weather.wet-card': () => {
    const tripOnce = (kind) => {
      const now = weatherTimeFor(kind);
      const { state, rng } = mk({ now, inventory: { bamboo_rice: 1 } });
      pack(state, 'snack', 'bamboo_rice');
      const sent = depart(state, rng, now);
      if (!sent.ok) throw new Error(sent.reason);
      finishTrip(state, rng, now + 1000);
      return state.album[state.album.length - 1];
    };
    return tripOnce('rain').wet === true && tripOnce('clear').wet === false;
  },

  'encounter.regions-covered': () => {
    for (const r of REGIONS) {
      const enc = NATURE_ENCOUNTERS[r];
      if (!enc) return false;
      if (!enc.id || !enc.name || !enc.log) return false;
      if (!(enc.chance > 0 && enc.chance <= 1)) return false;
      if (!['petals', 'souvenir', 'clovers', 'rare'].includes(enc.effect)) return false;
    }
    return true;
  },

  'encounter.deterministic': () => {
    const spot = SPOTS_BY_ID.reed_marsh; // 水
    const a = rollEncounter(spot, createRng(42));
    const b = rollEncounter(spot, createRng(42));
    if (a !== b) return false; // 同一随机种子 → 同一结果
    // 且确实能触发（不是永远 null 的空实现）
    for (let seed = 1; seed <= 200; seed++) {
      if (rollEncounter(spot, createRng(seed))) return true;
    }
    return false;
  },

  'encounter.effects-real': () => {
    const roll = (spotId, seed) => {
      const { state } = mk({ seed });
      const rng = createRng(seed * 7919);
      return resolveTrip(state, rng, { spotId, snackId: 'mantou', toolId: null, charmId: null, departAt: 0, returnAt: 1000 });
    };
    const seen = { petals: false, souvenir: false, clovers: false, rare: false };
    const spots = { water: 'reed_marsh', mountain: 'houshan', city: 'stone_bridge', wild: 'salt_lake' };
    for (let seed = 1; seed <= 600 && !(seen.petals && seen.souvenir && seen.clovers && seen.rare); seed++) {
      for (const [region, spotId] of Object.entries(spots)) {
        const out = roll(spotId, seed);
        if (!out.encounter) continue;
        const e = out.encounter.effect;
        if (e === 'petals' && (out.encounterPetals || 0) >= 1) seen.petals = true;
        if (e === 'souvenir' && out.souvenirs.length >= 2) seen.souvenir = true;
        if (e === 'clovers' && out.bonusClovers >= 3) seen.clovers = true;
        if (e === 'rare' && out.rare === true) seen.rare = true;
      }
    }
    return seen.petals && seen.souvenir && seen.clovers && seen.rare;
  },

  'encounter.shown': () => {
    const app = readSrc('src/ui/app.js');
    return Boolean(app && /ev\.encounter/.test(app) && /encounter\.name/.test(app) && /a\.encounter/.test(app));
  },

  // ---- 落花飞叶 ----
  'floral.seasonal': () => {
    const spring = seasonTimeFor(0);
    const summer = seasonTimeFor(1);
    const autumn = seasonTimeFor(2);
    const winter = seasonTimeFor(3);
    return floralKind(spring) === 'petal'
      && floralKind(autumn) === 'leaf'
      && floralKind(summer) === null
      && floralKind(winter) === null;
  },

  'floral.collect': () => {
    const spring = seasonTimeFor(0);
    const { state, rng } = mk({ now: spring });
    const before = state.florals.petal;
    const r = collectFloral(state, rng, spring);
    if (!r.ok || r.kind !== 'petal' || r.gained < 1 || state.florals.petal !== before + r.gained) return false;
    if (state.stats.petalsPicked !== r.gained) return false;
    if (collectFloral(state, rng, spring).ok !== false) return false; // 冷却内不能再采
    if (collectFloral(state, rng, spring + FLORAL[0].regrowMs).ok !== true) return false; // 冷却后能采
    const summer = seasonTimeFor(1);
    const s2 = mk({ now: summer });
    if (collectFloral(s2.state, s2.rng, summer).ok !== false) return false; // 夏无花叶
    return true;
  },

  'floral.wish': () => {
    const { state, rng } = mk();
    if (wishAtStream(state, rng, 0).ok !== false) return false; // 不够 → 拒绝
    state.florals = { petal: 2, leaf: 1 };
    const cloversBefore = state.clovers;
    const r = wishAtStream(state, rng, 0);
    if (!r.ok || r.gained < 2 || r.gained > 5) return false;
    if (state.florals.petal !== 0 || state.florals.leaf !== 0) return false; // 消耗 3 片
    if (state.clovers !== cloversBefore + r.gained) return false;
    return state.stats.wished === 1;
  },

  'floral.titles': () => {
    const { state } = mk();
    state.stats.petalsPicked = 20;
    if (!newlyEarnedTitles(state).includes('flower_hands')) return false;
    state.stats.leavesPicked = 20;
    if (!newlyEarnedTitles(state).includes('leaf_sweeper')) return false;
    state.stats.wished = 3;
    return newlyEarnedTitles(state).includes('falling_water');
  },

  'floral.shown': () => {
    const app = readSrc('src/ui/app.js');
    const html = readSrc('index.html');
    return Boolean(app && html
      && /id="floral-count"/.test(html)
      && /id="btn-floral"/.test(html)
      && /id="btn-wish"/.test(html)
      && /engine\.collectFloral/.test(app)
      && /engine\.wish/.test(app));
  },

  'floral.rendered': () => {
    const spring = mk({ now: seasonTimeForWeather(0, 'clear') }).state;
    const winter = mk({ now: seasonTimeForWeather(3, 'clear') }).state;
    const a = stubCtx();
    drawGarden(a, 390, 620, spring, 1000);
    const b = stubCtx();
    drawGarden(b, 390, 620, winter, 1000);
    return a.count > b.count && a.hash() !== b.hash(); // 春有落花、冬无，同天气下画面更满
  },

  // ---- 坊间游戏 ----
  'fgames.data': () => {
    if (FOLK_GAMES.length < 8) return false;
    const ids = new Set();
    const currencies = new Set();
    for (const g of FOLK_GAMES) {
      if (ids.has(g.id)) return false;
      ids.add(g.id);
      if (!g.id || !g.name || !g.desc) return false;
      if (!(g.attempts >= 1) || !(g.chance > 0 && g.chance <= 1)) return false;
      if (!g.reward || !['clovers', 'petal', 'leaf'].includes(g.reward.currency)) return false;
      if (!Array.isArray(g.reward.perHit) || g.reward.perHit.length !== 2 || g.reward.perHit[0] < 1) return false;
      if (!(g.cooldownMs > 0)) return false;
      currencies.add(g.reward.currency);
    }
    // 三种产出都得有（游戏接进花叶与许愿经济）
    return ['clovers', 'petal', 'leaf'].every((c) => currencies.has(c));
  },

  'fgames.play': () => {
    const g = FOLK_GAMES.find((x) => x.reward.currency === 'clovers');
    const { state, rng } = mk();
    if (playFolkGame(state, rng, 'nope', 0).ok !== false) return false; // 未知游戏
    const before = state.clovers;
    const r = playFolkGame(state, rng, g.id, 0);
    if (!r.ok || r.hits < 0 || r.hits > g.attempts) return false;
    if (r.hits === 0 && r.gained !== 0) return false;
    if (r.hits > 0 && r.gained < r.hits) return false;
    if (state.clovers !== before + r.gained) return false;
    if (state.stats.gamesPlayed !== 1) return false;
    if (state.fgames[g.id].played !== 1 || state.fgames[g.id].hits !== r.hits) return false;
    if (playFolkGame(state, rng, g.id, 0).ok !== false) return false; // 冷却内
    if (playFolkGame(state, rng, g.id, g.cooldownMs + 1).ok !== true) return false; // 冷却后
    return true;
  },

  'fgames.reward-outputs': () => {
    const petalGame = FOLK_GAMES.find((g) => g.reward.currency === 'petal');
    const leafGame = FOLK_GAMES.find((g) => g.reward.currency === 'leaf');
    if (!petalGame || !leafGame) return false;
    // 找一个能命中的种子，验证花瓣/落叶真的发到对应资源
    for (let seed = 1; seed <= 200; seed++) {
      const { state, rng } = mk({ seed });
      const r = playFolkGame(state, rng, petalGame.id, 0);
      if (r.hits > 0) {
        if (r.gained < r.hits || state.florals.petal !== r.gained || state.stats.petalsPicked !== r.gained) return false;
        break;
      }
    }
    for (let seed = 1; seed <= 200; seed++) {
      const { state, rng } = mk({ seed });
      const r = playFolkGame(state, rng, leafGame.id, 0);
      if (r.hits > 0) {
        if (r.gained < r.hits || state.florals.leaf !== r.gained || state.stats.leavesPicked !== r.gained) return false;
        return true;
      }
    }
    return false;
  },

  'fgames.titles': () => {
    const { state } = mk();
    state.fgames.pitchpot = { played: 1, hits: 5, best: 5, cooldownAt: 0 };
    if (!newlyEarnedTitles(state).includes('pot_master')) return false;
    const s2 = mk().state;
    for (const g of FOLK_GAMES) s2.fgames[g.id] = { played: 1, hits: 0, best: 0, cooldownAt: 0 };
    if (!newlyEarnedTitles(s2).includes('folk_regular')) return false;
    const s3 = mk().state;
    s3.stats.gamesPlayed = 15;
    return newlyEarnedTitles(s3).includes('old_hand');
  },

  'fgames.shown': () => {
    const html = readSrc('index.html');
    const app = readSrc('src/ui/app.js');
    return Boolean(html && app
      && /data-sheet="games"/.test(html)
      && /engine\.playGame/.test(app)
      && /data-act="play-game"/.test(app));
  },

  'fgames.rendered': () => {
    for (const g of FOLK_GAMES) {
      const ctx = stubCtx();
      drawGameGlyph(ctx, 27, 27, 18, g.id, 1000);
      if (ctx.count < 2) return false;
    }
    return true;
  },

  // ---- 诗句收集 ----
  'poems.data': () => {
    if (POEMS.length < 8) return false;
    const ids = new Set();
    for (const p of POEMS) {
      if (ids.has(p.id)) return false;
      ids.add(p.id);
      if (!p.id || !p.title || !p.author || !p.line) return false;
    }
    return true;
  },

  'poems.collect': () => {
    const poetryGame = FOLK_GAMES.find((g) => g.poem);
    if (!poetryGame) return false;
    for (let seed = 1; seed <= 100; seed++) {
      const { state, rng } = mk({ seed });
      const r = playFolkGame(state, rng, poetryGame.id, 0);
      if (r.hits === 0) continue;
      // 命中就收诗，且命中数 == 收诗数（诗集远大于命中数）
      if (r.poems.length !== r.hits) return false;
      if (state.poems.length !== r.poems.length) return false;
      if (state.stats.poemsCollected !== r.poems.length) return false;
      if (new Set(state.poems).size !== state.poems.length) return false;
      // 集满后不再新增
      const full = mk().state;
      full.poems = POEMS.map((p) => p.id);
      full.stats.poemsCollected = POEMS.length;
      const r3 = playFolkGame(full, mk().rng, poetryGame.id, 0);
      return full.poems.length === POEMS.length && r3.poems.length === 0;
    }
    return false;
  },

  'poems.titles': () => {
    const { state } = mk();
    state.stats.poemsCollected = 5;
    if (!newlyEarnedTitles(state).includes('poet')) return false;
    state.stats.poemsCollected = POEMS.length;
    return newlyEarnedTitles(state).includes('poetry_full');
  },

  'poems.shown': () => {
    const app = readSrc('src/ui/app.js');
    return Boolean(app && /诗笺/.test(app) && /poems\.length/.test(app));
  },

  // ---- 世界线 + 旅人 ----
  'worldline.data': () => {
    if (WORLDLINE_NODES.length < 4) return false;
    const ids = new Set();
    for (const n of WORLDLINE_NODES) {
      if (ids.has(n.id)) return false;
      ids.add(n.id);
      if (!n.id || !n.name || !n.desc || typeof n.trigger !== 'function') return false;
      if (typeof n.effect.rareChance !== 'number' && typeof n.effect.encounterChance !== 'number') return false;
    }
    return true;
  },

  'worldline.trigger': () => {
    const { state } = mk();
    state.stats.wished = 3;
    if (!newlyActivatedNodes(state).some((n) => n.id === 'wish_3')) return false;
    state.worldline = ['wish_3'];
    return !newlyActivatedNodes(state).some((n) => n.id === 'wish_3'); // 不重复
  },

  'worldline.effects': () => {
    // 激活「霞客路成」（rareChance +0.05）→ 平均稀有率显著更高
    const countRare = (worldline) => {
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const st = mk({ seed }).state;
        st.worldline = worldline;
        const out = resolveTrip(st, createRng(seed * 7919), { spotId: 'houshan', snackId: 'mantou', toolId: null, charmId: null, departAt: 0, returnAt: 1000 });
        if (out.rare) n += 1;
      }
      return n;
    };
    return countRare(['route_complete']) > countRare([]);
  },

  'traveler.meet': () => {
    for (let seed = 1; seed <= 200; seed++) {
      const st = mk({ seed }).state;
      const rr = rollTraveler(st, createRng(seed * 7919));
      if (rr) {
        if (st.travelers.length !== 1 || st.travelers[0] !== rr.id) return false;
        const full = mk().state;
        full.travelers = TRAVELERS.map((t) => t.id);
        return rollTraveler(full, createRng(7)) === null && full.travelers.length === TRAVELERS.length;
      }
    }
    return false;
  },

  'traveler.gift-data': () => {
    const kinds = new Set();
    for (const t of TRAVELERS) {
      const g = t.gift;
      if (!g || typeof g !== 'object') return false;
      if (!['clovers', 'petal', 'leaf'].includes(g.currency)) return false;
      if (!Array.isArray(g.amount) || g.amount.length !== 2) return false;
      const [min, max] = g.amount;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) return false;
      if (typeof g.line !== 'string' || !g.line.trim()) return false;
      kinds.add(g.currency);
    }
    return kinds.size === 3;
  },

  'traveler.gift': () => {
    // 没遇过旅人 → 无论掷多少次都绝无礼物
    for (let seed = 1; seed <= 200; seed++) {
      const st = mk({ seed }).state;
      st.travelers = [];
      const rng = createRng(seed * 7919);
      for (let k = 0; k < 60; k++) {
        if (rollTravelerGift(st, rng) !== null) return false;
      }
    }
    // 有旧识 → 能找到一次捎礼，且真实发放并计入统计、数量落在契约区间
    for (let seed = 1; seed <= 4000; seed++) {
      const st = mk({ seed }).state;
      st.travelers = TRAVELERS.map((t) => t.id);
      st.maniu.trip = { spotId: 'houshan', snackId: 'mantou', toolId: null, charmId: null, departAt: 0, returnAt: 1000 };
      const before = { clovers: st.clovers, petal: st.florals.petal, leaf: st.florals.leaf, gifts: st.stats.travelerGifts };
      const out = finishTrip(st, createRng(seed * 7919), 1000);
      if (!out.travelerGift) continue;
      const g = out.travelerGift;
      const from = TRAVELERS.find((t) => t.name === g.name);
      if (!from || !from.gift) return false;
      if (g.currency !== from.gift.currency) return false;
      if (g.amount < from.gift.amount[0] || g.amount > from.gift.amount[1]) return false;
      if (st.stats.travelerGifts !== before.gifts + 1) return false;
      // finishTrip 可能额外加奖励铜钱草/奇遇花瓣，故只要求「至少」入账捎礼数量
      if (g.currency === 'clovers' && st.clovers < before.clovers + g.amount) return false;
      if (g.currency === 'petal' && st.florals.petal < before.petal + g.amount) return false;
      if (g.currency === 'leaf' && st.florals.leaf < before.leaf + g.amount) return false;
      return true;
    }
    return false; // 找不到任何一次捎礼 = 概率被打破
  },

  'traveler.gift-title': () => {
    const { state } = mk();
    state.stats.travelerGifts = 2;
    if (newlyEarnedTitles(state).includes('gifted')) return false;
    state.stats.travelerGifts = 3;
    return newlyEarnedTitles(state).includes('gifted');
  },

  'traveler.gift-shown': () => {
    const app = readSrc('src/ui/app.js');
    return Boolean(app && /ev\.travelerGift/.test(app) && /捎礼/.test(app) && /travelerGifts/.test(app));
  },

  'worldline.shown': () => {
    const app = readSrc('src/ui/app.js');
    return Boolean(app && /世界线/.test(app) && /旅途偶遇/.test(app) && /ev\.traveler/.test(app));
  },

  'weather.wet-rendered': () => {
    const spot = SPOTS[0];
    const a = stubCtx();
    drawPostcardScene(a, 0, 0, 132, 95, spot, 1000, { postcardId: spot.postcards[0].id, wet: false });
    const b = stubCtx();
    drawPostcardScene(b, 0, 0, 132, 95, spot, 1000, { postcardId: spot.postcards[0].id, wet: true });
    return b.count > a.count;
  },

  'titles.rain-walker': () => {
    const { state } = mk();
    state.collection = {
      houshan_a: { count: 1, spotId: 'houshan', wet: true },
      reed_marsh_a: { count: 1, spotId: 'reed_marsh', wet: true },
      stone_bridge_a: { count: 1, spotId: 'stone_bridge', wet: true },
    };
    return newlyEarnedTitles(state).includes('rain_walker');
  },

  'weather.shown': () => {
    const scenes = readSrc('src/render/scenes.js');
    const app = readSrc('src/ui/app.js');
    const engine = readSrc('src/core/engine.js');
    return Boolean(scenes && app && engine
      && /weatherAt\(/.test(scenes) && /drawRainOrWind|drawThroughWindow/.test(scenes)
      && /weatherLabel/.test(app) && /weather: weatherAt\(state\.now\)/.test(engine));
  },

  'perf.tick': () => {
    const { state, rng } = mk({ inventory: { mantou: 1 } });
    pack(state, 'snack', 'mantou');
    const start = process.hrtime.bigint();
    for (let i = 1; i <= 20000; i++) tick(state, rng, i * 61_000);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return ms < 1500;
  },

  // ---- 徐霞客路线 ----
  'xuxiake.route-valid': () => {
    if (XU_XIAKE_ROUTE.length < 4) return false;
    if (!XU_XIAKE_MOTTO || !XU_XIAKE_MOTTO.includes('苍梧')) return false;
    const ids = XU_XIAKE_ROUTE.map((s) => s.spotId);
    // 无重复、地点真实、每段都有名字与注解
    if (new Set(ids).size !== ids.length) return false;
    for (const s of XU_XIAKE_ROUTE) {
      if (!SPOTS_BY_ID[s.spotId]) return false;
      if (!s.stage || !s.note) return false;
    }
    // 跨多个地区（一条真正跨越山河的路）
    const regions = new Set(ids.map((id) => SPOTS_BY_ID[id].region));
    return regions.size >= 3;
  },

  'xuxiake.progress': () => {
    const fresh = mk();
    const p0 = xuxiakeProgress(fresh.state);
    if (p0.done !== 0 || p0.complete !== false || p0.total !== XU_XIAKE_ROUTE.length) return false;
    // 到过路线外的地点，不推进路线
    const off = mk();
    off.state.collection = { houshan_a: { count: 1, spotId: 'houshan' } };
    if (xuxiakeProgress(off.state).done !== 0) return false;
    // 逐段推进：每到一个路线地点 done+1，走完才 complete
    const on = mk();
    on.state.collection = {};
    let expected = 0;
    for (const s of XU_XIAKE_ROUTE) {
      expected += 1;
      on.state.collection[`${s.spotId}_a`] = { count: 1, spotId: s.spotId };
      const p = xuxiakeProgress(on.state);
      if (p.done !== expected) return false;
      if (p.complete !== (expected === XU_XIAKE_ROUTE.length)) return false;
      if (!xuxiakeProgress(on.state).stages.every((st, i) => st.visited === (i < expected))) return false;
    }
    return xuxiakeComplete(on.state) === true;
  },

  'xuxiake.title': () => {
    const all = mk();
    all.state.collection = {};
    for (const s of XU_XIAKE_ROUTE) all.state.collection[`${s.spotId}_a`] = { count: 1, spotId: s.spotId };
    const earned = newlyEarnedTitles(all.state);
    if (!earned.includes('xuxiake')) return false;
    // 差最后一段就不解锁
    const almost = mk();
    almost.state.collection = {};
    for (const s of XU_XIAKE_ROUTE.slice(0, -1)) almost.state.collection[`${s.spotId}_a`] = { count: 1, spotId: s.spotId };
    return !newlyEarnedTitles(almost.state).includes('xuxiake');
  },

  'xuxiake.shown': () => {
    const app = readSrc('src/ui/app.js');
    if (!app) return false;
    return /XU_XIAKE_ROUTE/.test(app)
      && /xuxiakeProgress/.test(app)
      && /XU_XIAKE_MOTTO/.test(app)
      && /route\.done}/.test(app) && /route\.total}/.test(app)
      && /霞客传人/.test(readSrc('src/core/titles.js') || '');
  },
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

/** State under the real game config (balance probes must not use the FAST test clock). */
function mkReal(opts = {}) {
  const now = opts.now ?? 0;
  const state = createState({ seed: opts.seed ?? 1, now, cfg: opts.cfg });
  if (opts.clovers != null) state.clovers = opts.clovers;
  if (opts.inventory) state.inventory = { ...opts.inventory };
  return { state, rng: opts.rng || rngOf(state) };
}

/**
 * Headless 2D-context stub: records every drawing call so the render layer can be
 * exercised without a browser, and so identical inputs can be compared byte-for-byte.
 */
function stubCtx() {
  const ops = [];
  const r = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : String(v));
  const noop = () => {};
  const ctx = {
    get count() { return ops.length; },
    hash() {
      const text = ops.join('|');
      let h = 2166136261;
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(36);
    },
    save: noop, restore: noop, beginPath: () => ops.push('bp'), closePath: () => ops.push('cp'),
    clip: () => ops.push('clip'),
    moveTo: (x, y) => ops.push(`m${r(x)},${r(y)}`),
    lineTo: (x, y) => ops.push(`l${r(x)},${r(y)}`),
    quadraticCurveTo: (a, b, c, d) => ops.push(`q${r(a)},${r(b)},${r(c)},${r(d)}`),
    bezierCurveTo: (a, b, c, d, e, f) => ops.push(`c${r(a)},${r(b)},${r(c)},${r(d)},${r(e)},${r(f)}`),
    rect: (x, y, w, h) => ops.push(`rect${r(x)},${r(y)},${r(w)},${r(h)}`),
    arc: (x, y, rad) => ops.push(`a${r(x)},${r(y)},${r(rad)}`),
    stroke: () => ops.push(`s${ctx.strokeStyle}${r(ctx.lineWidth)}${r(ctx.globalAlpha)}`),
    fill: () => ops.push(`f${ctx.fillStyle}`),
    fillRect: (x, y, w, h) => ops.push(`fr${r(x)},${r(y)},${r(w)},${r(h)}`),
    fillText: (t, x, y) => ops.push(`t${t}${r(x)},${r(y)}`),
    translate: (x, y) => ops.push(`tr${r(x)},${r(y)}`),
    scale: (x, y) => ops.push(`sc${r(x)},${r(y)}`),
    rotate: (a) => ops.push(`ro${r(a)}`),
    setTransform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '',
  };
  return ctx;
}

/**
 * A greedy, unattended "player": checks in once a day, harvests, feeds whoever
 * shows up, and buys the best food it can afford. Used as a playability probe —
 * if this bot cannot make progress, a real player would be stuck too.
 */
function runBot(days, seed) {
  const state = createState({ seed, now: 0 });
  const rng = rngOf(state);
  let minClovers = state.clovers;
  let idle = 0;
  let maxIdleDays = 0;
  let lastTrips = state.stats.trips;

  for (let d = 1; d <= days; d++) {
    const now = d * DAY;
    pickAll(state, rng, now);

    if (state.visitors.current && !state.visitors.current.fed) {
      const v = VISITORS_BY_ID[state.visitors.current.id];
      const item = v.favours.find((f) => state.inventory[f]) || Object.keys(state.inventory)[0];
      if (item) feedVisitor(state, rng, item, now);
    }

    if (!state.luggage.snack) {
      const snack = [...SNACKS].filter((s) => state.clovers >= s.cost).sort((a, b) => b.tier - a.tier || a.cost - b.cost)[0];
      if (snack) { buy(state, snack.id, now); pack(state, 'snack', snack.id, now); }
    }
    if (!state.luggage.tool) {
      const tool = [...TOOLS].sort((a, b) => b.cost - a.cost).find((x) => state.clovers >= x.cost + 30);
      if (tool) { buy(state, tool.id, now); pack(state, 'tool', tool.id, now); }
    }
    if (!state.luggage.charm) {
      const charm = [...CHARMS].sort((a, b) => b.cost - a.cost).find((x) => state.clovers >= x.cost + 20);
      if (charm) { buy(state, charm.id, now); pack(state, 'charm', charm.id, now); }
    }

    tick(state, rng, now);
    minClovers = Math.min(minClovers, state.clovers);
    if (state.stats.trips === lastTrips) {
      idle += 1;
      maxIdleDays = Math.max(maxIdleDays, idle);
    } else {
      idle = 0;
      lastTrips = state.stats.trips;
    }
  }

  return {
    state,
    diag: { minClovers, maxIdleDays },
    run: {
      trips: state.stats.trips,
      distinctPostcards: new Set(state.album.map((a) => a.postcardId)).size,
      souvenirKinds: Object.keys(state.souvenirs).length,
    },
  };
}

// ---------------------------------------------------------------- runner

function main() {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec/mechanics.json'), 'utf8'));
  let score = 0;
  let maxScore = 0;
  let pass = 0;
  let fail = 0;
  let unimplemented = 0;
  const byGroup = {};
  const failures = [];

  for (const clause of spec.clauses) {
    maxScore += clause.weight;
    const g = (byGroup[clause.group] ||= { score: 0, max: 0, pass: 0, fail: 0 });
    g.max += clause.weight;
    const check = CHECKS[clause.id];
    let ok = false;
    let err = null;
    if (!check) {
      unimplemented++;
      err = 'no-check';
    } else {
      try {
        ok = check() === true;
      } catch (e) {
        err = e && e.message ? e.message : String(e);
      }
    }
    if (ok) {
      score += clause.weight;
      g.score += clause.weight;
      g.pass += 1;
      pass += 1;
    } else {
      fail += 1;
      g.fail += 1;
      failures.push({ id: clause.id, name: clause.name, weight: clause.weight, err });
    }
  }

  const total = spec.clauses.length;
  console.log(`METRIC conformance=${score}`);
  console.log(`METRIC conformance_max=${maxScore}`);
  console.log(`METRIC conformance_pct=${((score / maxScore) * 100).toFixed(1)}`);
  console.log(`METRIC clauses_pass=${pass}`);
  console.log(`METRIC clauses_fail=${fail}`);
  console.log(`METRIC clauses_total=${total}`);
  console.log(`METRIC clauses_unimplemented=${unimplemented}`);

  if (VERBOSE) {
    for (const [group, g] of Object.entries(byGroup)) {
      console.log(`  [${group}] ${g.score}/${g.max}  (${g.pass} pass / ${g.fail} fail)`);
    }
    for (const f of failures) {
      console.log(`  FAIL ${f.id} (w${f.weight}) — ${f.name}${f.err ? ` :: ${f.err}` : ''}`);
    }
    process.exit(0);
  }

  if (failures.length) {
    console.log(`\n# failing clauses (${failures.length}/${total}):`);
    for (const f of failures) {
      console.log(`#   ${f.id} (w${f.weight}) ${f.name}${f.err ? ` :: ${f.err}` : ''}`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
