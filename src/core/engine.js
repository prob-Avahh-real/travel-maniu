import { cfgOf, createState, randRange, rngOf, syncRng, SAVE_KEY, saveTo, loadFrom } from './state.js';
import { pickClover, pickAll, buy, pack, unpackAll, pushLog, readyPatches } from './economy.js';
import { depart, departTo, finishTrip, canDepart, eligibleSpots, tierWindow } from './trip.js';
import { arriveVisitor, leaveVisitor, feedVisitor, currentVisitor } from './visitors.js';
import { newlyEarnedTitles, summarize, TITLES_BY_ID } from './titles.js';
import { placeDecor } from './decor.js';
import { collectFloral, wishAtStream, floralKind } from './floral.js';
import { playFolkGame } from './fgames.js';
import { newlyActivatedNodes } from './worldline.js';
import { SPOTS_BY_ID } from '../data/spots.js';
import { weatherAt, WEATHER_LABEL } from './weather.js';

const MAX_TRIP_EVENTS = 6;
const MAX_VISITOR_CYCLES = 6;

/**
 * Engine = orchestration only. Pure logic; the host injects time and storage
 * (that is why there is no Date.now() in here).
 */
export function createEngine({ seed = 1, now = 0, cfg, storage, key = SAVE_KEY } = {}) {
  let state;
  if (storage) {
    const loaded = loadFrom(storage, key, cfg);
    if (loaded.ok) state = loaded.state;
  }
  if (!state) state = createState({ seed, now, cfg });
  const rng = rngOf(state);
  const engine = {
    get state() { return state; },
    rng,
    now: () => state.now,
    storage,
    key,
    tick: (t) => tick(state, rng, t),
    pick: (patchId, t = state.now) => finish(state, rng, pickClover(state, rng, patchId, t)),
    pickAll: (t = state.now) => finish(state, rng, pickAll(state, rng, t)),
    buy: (itemId, t = state.now) => buy(state, itemId, t),
    pack: (slot, itemId, t = state.now) => pack(state, slot, itemId, t),
    unpackAll: () => unpackAll(state),
    send: (t = state.now) => finish(state, rng, depart(state, rng, t)),
    sendTo: (spotId, t = state.now) => finish(state, rng, departTo(state, rng, spotId, t)),
    feed: (itemId, t = state.now) => finish(state, rng, feedVisitor(state, rng, itemId, t)),
    decorate: (slot, souvenirId, t = state.now) => placeDecor(state, slot, souvenirId, t),
    collectFloral: (t = state.now) => finish(state, rng, collectFloral(state, rng, t)),
    wish: (t = state.now) => finish(state, rng, wishAtStream(state, rng, t)),
    playGame: (gameId, t = state.now) => finish(state, rng, playFolkGame(state, rng, gameId, t)),
    canDepart: () => canDepart(state),
    eligibleSpots: () => eligibleSpots(state),
    tierWindow: () => tierWindow(state),
    summary: () => summarize(state),
    visitor: () => currentVisitor(state),
    save: () => { if (!storage) return false; syncRng(state, rng); return saveTo(storage, key, state); },
    reset: (t = state.now) => {
      state = createState({ seed: rng.int(1, 1e9), now: t, cfg });
      rng.state = state.rngState;
      return state;
    },
    snapshot: () => snapshot(state),
  };
  return engine;
}

/** Run a bounded cascade of time-based events up to `now`. */
export function tick(state, rng, now) {
  const cfg = cfgOf(state);
  const events = [];
  const capped = Math.min(Math.max(now, state.now), state.now + cfg.maxCatchupMs);
  let cursor = state.now;

  // 1) 马牛's own timeline: at most a couple of chained depart/return events.
  for (let i = 0; i < MAX_TRIP_EVENTS; i++) {
    const next = maniuEvent(state, rng, cfg, cursor, capped);
    if (!next) break;
    cursor = next.at;
    events.push(applyManiu(state, rng, next.at, cfg));
  }

  // 2) Visitors: bounded cycles, then the rest of the window is collapsed.
  //    (Nobody is home to feed them, so nothing mechanical is lost.)
  const visited = advanceVisitors(state, rng, cursor, capped, cfg, MAX_VISITOR_CYCLES);
  events.push(...visited.events);

  // Title awards last so they see the fully-updated state.
  const earned = newlyEarnedTitles(state);
  for (const id of earned) {
    state.titles.push(id);
    pushLog(state, capped, `获得称号「${TITLES_BY_ID[id].name}」`, 'title');
    events.push({ type: 'title', id });
  }
  // 世界线转动：里程碑达成 → 激活分支节点。
  for (const node of newlyActivatedNodes(state)) {
    state.worldline.push(node.id);
    pushLog(state, capped, `世界线转动：${node.name}`, 'worldline');
    events.push({ type: 'worldline', id: node.id });
  }

  state.now = capped;
  syncRng(state, rng);
  return { events, state };
}

/** The single next 马牛 event in (cursor, capped], or null. */
function maniuEvent(state, rng, cfg, cursor, capped) {
  if (state.maniu.status === 'away' && state.maniu.trip) {
    const at = state.maniu.trip.returnAt;
    return at > cursor && at <= capped ? { at, type: 'return' } : null;
  }
  const ready = Boolean(state.luggage.snack) && canDepart(state).ok;
  if (!ready) {
    state.maniu.leaveAt = null;
    return null;
  }
  // Roll the "decides to leave" delay exactly once, then remember it.
  if (state.maniu.leaveAt == null || state.maniu.leaveAt <= cursor) {
    state.maniu.leaveAt = Math.max(cursor, state.maniu.restUntil) + randRange(rng, cfg.departDelayMs);
  }
  return state.maniu.leaveAt > cursor && state.maniu.leaveAt <= capped
    ? { at: state.maniu.leaveAt, type: 'depart' }
    : null;
}

/**
 * Walk the visitor timeline. Long offline gaps are collapsed: visitors come and
 * go, and we only keep the state that matters at `capped`.
 */
function advanceVisitors(state, rng, cursor, capped, cfg, maxCycles) {
  const events = [];
  let at = cursor;
  let cycles = 0;
  while (cycles < maxCycles) {
    const v = state.visitors.current;
    if (v && v.leaveAt <= capped) {
      at = Math.max(at, v.leaveAt);
      leaveVisitor(state, rng, at);
      events.push({ type: 'visitor-leave', at });
      cycles++;
    } else if (!v && state.visitors.nextAt <= capped) {
      at = Math.max(at, state.visitors.nextAt);
      const forced = state.maniu.pendingFriend || null;
      state.maniu.pendingFriend = null;
      arriveVisitor(state, rng, at, forced);
      events.push({ type: 'visitor-arrive', at });
      cycles++;
    } else {
      break;
    }
  }
  if (cycles >= maxCycles) {
    const v = state.visitors.current;
    if (v) {
      v.arriveAt = capped;
      v.leaveAt = capped + cfg.visitorStayMs;
    } else {
      state.visitors.nextAt = capped + cfg.visitorIntervalMs[0];
    }
    pushLog(state, capped, '你不在的时候，篱笆外总有人路过。', 'visitor');
    events.push({ type: 'visitor-collapse', at: capped });
  }
  return { events, cursor: at };
}

function applyManiu(state, rng, at, cfg) {
  if (state.maniu.status === 'away' && state.maniu.trip && state.maniu.trip.returnAt <= at) {
    const r = finishTrip(state, rng, at);
    if (!r.ok) return { type: 'return', at, failed: true };
    return {
      type: 'return', at,
      postcardId: r.postcard.id,
      souvenirs: r.souvenirs,
      rare: r.rare,
      spotId: r.trip.spotId,
      spotName: r.spot.name,
      encounter: r.encounter ? { name: r.encounter.name, log: r.encounter.log } : null,
      traveler: r.traveler ? { name: r.traveler.name, note: r.traveler.note } : null,
      travelerGift: r.travelerGift || null,
    };
  }
  const r = depart(state, rng, at);
  if (!r.ok) {
    state.maniu.leaveAt = null;
    return { type: 'depart', at, failed: true, reason: r.reason };
  }
  return { type: 'depart', at, spotId: r.trip.spotId, spotName: r.spot.name };
}

/** Re-check titles + worldline after a player action so awards are immediate. */
function finish(state, rng, result) {
  for (const id of newlyEarnedTitles(state)) {
    state.titles.push(id);
    pushLog(state, state.now, `获得称号「${TITLES_BY_ID[id].name}」`, 'title');
  }
  for (const node of newlyActivatedNodes(state)) {
    state.worldline.push(node.id);
    pushLog(state, state.now, `世界线转动：${node.name}`, 'worldline');
  }
  syncRng(state, rng);
  return result;
}

/** Flat, render-friendly view of everything a screen needs. */
export function snapshot(state) {
  const s = summarize(state);
  return {
    now: state.now,
    weather: weatherAt(state.now),
    weatherLabel: WEATHER_LABEL[weatherAt(state.now)],
    clovers: state.clovers,
    readyPatches: readyPatches(state, state.now).length,
    patchCount: state.patches.length,
    patches: state.patches.map((p) => ({ ...p, ready: p.readyAt <= state.now })),
    inventory: { ...state.inventory },
    luggage: { ...state.luggage },
    maniu: { ...state.maniu, trip: state.maniu.trip ? { ...state.maniu.trip, spot: SPOTS_BY_ID[state.maniu.trip.spotId] } : null },
    album: state.album.slice(),
    collection: { ...(state.collection || {}) },
    souvenirs: { ...state.souvenirs },
    florals: { ...state.florals },
    floralAt: state.floralAt,
    floralKind: floralKind(state.now),
    fgames: { ...state.fgames },
    gamesPlayed: state.stats.gamesPlayed,
    poems: state.poems.slice(),
    poemsCollected: state.stats.poemsCollected,
    worldline: state.worldline.slice(),
    travelers: state.travelers.slice(),
    travelerGifts: state.stats.travelerGifts || 0,
    decor: { ...(state.decor || { shelf: null, sill: null, floor: null, wall: null }) },
    visitor: state.visitors.current ? { ...state.visitors.current, info: currentVisitor(state) } : null,
    titles: state.titles.slice(),
    summary: s,
    log: state.log.slice(-30).reverse(),
  };
}
