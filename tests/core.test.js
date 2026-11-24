// 单元测试：守核心逻辑的不变量。conformance.mjs 守规格覆盖面，这里守细节。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRng } from '../src/core/rng.js';
import { createState, rngOf, serialize, deserialize, syncRng } from '../src/core/state.js';
import { pickClover, pickAll, buy, pack, isReady } from '../src/core/economy.js';
import { planTrip, depart, finishTrip, resolveTrip, canDepart, tierWindow, eligibleSpots, visitedSpotIds } from '../src/core/trip.js';
import { tick, createEngine } from '../src/core/engine.js';
import { newlyEarnedTitles } from '../src/core/titles.js';
import { feedVisitor } from '../src/core/visitors.js';
import { MIN, DAY, CFG } from '../src/core/config.js';
import { SPOTS, SPOTS_BY_ID } from '../src/data/spots.js';
import { ALL_ITEMS, SNACKS } from '../src/data/items.js';
import { VISITORS } from '../src/data/visitors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FAST = {
  cloverRegrowMs: MIN,
  departDelayMs: [MIN, 2 * MIN],
  minRestMs: 0,
  maxRestMs: 0,
  visitorIntervalMs: [3 * MIN, 3 * MIN],
  visitorStayMs: 5 * MIN,
};

function fresh(opts = {}) {
  const state = createState({ seed: opts.seed ?? 1, now: 0, cfg: { ...FAST, ...(opts.cfg || {}) } });
  if (opts.clovers != null) state.clovers = opts.clovers;
  if (opts.inventory) state.inventory = { ...opts.inventory };
  return { state, rng: rngOf(state) };
}

// ------------------------------------------------------------------ rng

test('rng: same seed replays identically, state restores', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);

  const saved = a.state;
  const x = a.next();
  a.state = saved;
  assert.equal(a.next(), x, 'restoring rng state must replay the same value');

  assert.equal(createRng(1).int(1, 6) >= 1, true);
  assert.equal(createRng(1).int(1, 6) <= 6, true);
  assert.equal(createRng(9).weighted([['a', 0]]), 'a', 'zero-weight table must not crash');
});

// -------------------------------------------------------------- economy

test('economy: pick / regrow / four-leaf accounting', () => {
  const { state, rng } = fresh();
  const before = state.clovers;
  const r = pickClover(state, rng, 'p0', 0);
  assert.ok(r.ok);
  assert.equal(state.clovers, before + r.gained);
  assert.equal(state.stats.picked, 1);
  assert.equal(isReady(state, 'p0', FAST.cloverRegrowMs - 1), false);
  assert.equal(isReady(state, 'p0', FAST.cloverRegrowMs), true);

  // four-leaf must be worth the configured bonus
  let fourLeaf = null;
  for (let seed = 1; seed < 4000 && !fourLeaf; seed++) {
    const f = fresh({ seed });
    const res = pickClover(f.state, f.rng, 'p0', 0);
    if (res.fourLeaf) fourLeaf = { res, state: f.state };
  }
  assert.ok(fourLeaf, 'four-leaf clover never appeared in 4000 tries');
  assert.equal(fourLeaf.res.gained, CFG.fourLeafValue);
  assert.equal(fourLeaf.state.stats.fourLeaf, 1);
});

test('economy: buy rejects unknown / unaffordable without side effects', () => {
  const { state } = fresh({ clovers: 0 });
  assert.equal(buy(state, 'mantou').reason, 'poor');
  assert.equal(state.clovers, 0);
  assert.equal(state.inventory.mantou, undefined);
  assert.equal(buy(state, 'nope').reason, 'unknown-item');

  const rich = fresh({ clovers: 999 }).state;
  for (const item of ALL_ITEMS) assert.ok(buy(rich, item.id).ok, `${item.id} should be buyable`);
});

test('economy: packing conserves items (no dupes, no losses)', () => {
  const { state } = fresh({ inventory: { mantou: 1, bamboo_rice: 1, paper_lantern: 1 } });
  const total = (s) => Object.values(s.inventory).reduce((a, b) => a + b, 0) + Object.values(s.luggage).filter(Boolean).length;
  const start = total(state);

  assert.ok(pack(state, 'snack', 'mantou').ok);
  assert.equal(total(state), start);
  assert.ok(pack(state, 'snack', 'bamboo_rice').ok, 'swapping must work');
  assert.equal(total(state), start);
  assert.equal(state.luggage.snack, 'bamboo_rice');
  assert.equal(state.inventory.mantou, 1, 'the replaced snack goes back to the bag');

  assert.equal(pack(state, 'tool', 'mantou').ok, false, 'slot mismatch must be rejected');
  pack(state, 'snack', null);
  assert.equal(total(state), start);
});

// ----------------------------------------------------------------- trip

test('trip: destination tier window follows snack + lantern', () => {
  const s = fresh().state;
  assert.equal(tierWindow(s), null);
  s.luggage.snack = 'mantou';
  assert.deepEqual(tierWindow(s), { min: 1, max: 1 });
  s.luggage.snack = 'bamboo_rice';
  assert.equal(tierWindow(s).max, 2);
  s.luggage.tool = 'paper_lantern';
  assert.equal(tierWindow(s).max, 3);
});

test('trip: locked spots stay out of the pool, but good food never strands you', () => {
  const { state } = fresh();
  state.album = SPOTS.map((s) => ({ postcardId: s.postcards[0].id, spotId: s.id }));
  state.luggage.snack = 'matsutake';
  assert.ok(eligibleSpots(state).some((s) => s.id === 'islands'));

  const locked = fresh().state;
  locked.luggage.snack = 'matsutake';
  const pool = eligibleSpots(locked).map((s) => s.id);
  assert.equal(pool.includes('islands'), false, 'locked spots must not appear');
  assert.ok(pool.includes('houshan'), 'expensive food must still allow the near places');
  assert.ok(canDepart(locked).ok, 'a player with only a tier-4 snack must not be stuck');
});

test('trip: longer trips for better food, and the plan is deterministic', () => {
  const meanFor = (snackId) => {
    const { state } = fresh();
    state.album = SPOTS.map((s) => ({ postcardId: s.postcards[0].id, spotId: s.id }));
    state.luggage.snack = snackId;
    let sum = 0;
    for (let seed = 1; seed <= 200; seed++) sum += planTrip(state, createRng(seed), 0).trip.returnAt;
    return sum / 200;
  };
  const t1 = meanFor('mantou');
  const t2 = meanFor('chestnut_cake');
  const t4 = meanFor('matsutake');
  assert.ok(t1 < t2 && t2 < t4, `durations must be monotone: ${t1} < ${t2} < ${t4}`);

  const { state } = fresh();
  state.luggage.snack = 'mantou';
  const a = planTrip(state, createRng(77), 0).trip;
  const b = planTrip(state, createRng(77), 0).trip;
  assert.deepEqual(a, b);
});

test('trip: resolver never repeats a postcard while a fresh one exists', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const { state } = fresh({ seed });
    state.album = [{ postcardId: 'houshan_a', spotId: 'houshan' }];
    const out = resolveTrip(state, createRng(seed * 31), { spotId: 'houshan', snackId: 'mantou', toolId: null, charmId: null });
    assert.notEqual(out.postcard.id, 'houshan_a');
  }
});

test('trip: luggage consumption rules (snack eaten, tool kept, charm spent)', () => {
  const { state, rng } = fresh({ inventory: { mantou: 1, paper_lantern: 1, coin_charm: 1 } });
  pack(state, 'snack', 'mantou');
  pack(state, 'tool', 'paper_lantern');
  pack(state, 'charm', 'coin_charm');
  assert.ok(depart(state, rng, 0).ok);
  const out = finishTrip(state, rng, 1000);
  assert.ok(out.ok);
  assert.equal(state.luggage.snack, null);
  assert.equal(state.luggage.tool, 'paper_lantern');
  assert.equal(state.luggage.charm, null);
  assert.equal(state.inventory.mantou, undefined);
  assert.equal(state.inventory.coin_charm, undefined);
  assert.equal(state.album.length, 1);
  assert.equal(state.stats.trips, 1);
});

// ------------------------------------------------------ clock / offline

test('clock: departs on its own, comes home, then rests', () => {
  const { state, rng } = fresh({ inventory: { mantou: 1 } });
  pack(state, 'snack', 'mantou');
  tick(state, rng, 3 * MIN);
  assert.equal(state.maniu.status, 'away');
  const returnAt = state.maniu.trip.returnAt;
  tick(state, rng, returnAt + 1);
  assert.equal(state.maniu.status, 'home');
  assert.equal(state.stats.trips, 1);
  assert.ok(state.maniu.restUntil >= returnAt);
});

test('clock: three offline days settle exactly one trip', () => {
  const { state, rng } = fresh({ inventory: { mantou: 1 } });
  pack(state, 'snack', 'mantou');
  tick(state, rng, 3 * DAY);
  assert.equal(state.stats.trips, 1);
  assert.equal(state.album.length, 1);
  assert.equal(state.luggage.snack, null, 'the snack was eaten on the road');
});

test('clock: times and clovers survive a huge offline gap without thrashing', () => {
  const { state, rng } = fresh({ inventory: { mantou: 1 } });
  pack(state, 'snack', 'mantou');
  tick(state, rng, 400 * DAY);
  assert.ok(state.now <= CFG.maxCatchupMs, 'catch-up must be capped');
  assert.ok(state.stats.trips <= 1);
  assert.ok(state.log.length <= CFG.logLimit, 'the log stays bounded');
});

test('clock: time never moves backwards', () => {
  const { state, rng } = fresh();
  tick(state, rng, 5 * MIN);
  const at = state.now;
  tick(state, rng, 1);
  assert.equal(state.now, at);
});

// ------------------------------------------------------------- visitors

test('visitors: favoured food grows friendship faster and yields a gift', () => {
  const { state, rng } = fresh({ inventory: { bamboo_rice: 1, mantou: 1 } });
  state.visitors.current = { id: 'snail', arriveAt: 0, leaveAt: 5 * MIN, fed: false };
  const r = feedVisitor(state, rng, 'bamboo_rice', 0);
  assert.ok(r.ok && r.favoured);
  assert.equal(state.visitors.friendship.snail, 2);
  assert.equal(r.gift.id, VISITORS.find((v) => v.id === 'snail').rareGift.id);
  assert.equal(feedVisitor(state, rng, 'mantou', 0).reason, 'already-fed');
});

// ------------------------------------------------------------ save/load

test('save: round-trips the whole state and keeps the rng stream', () => {
  const state = fresh({ clovers: 42 }).state;
  state.inventory.bamboo_rice = 3;
  state.luggage.tool = 'compass';
  state.album.push({ postcardId: 'houshan_a', spotId: 'houshan', at: 7 });
  const rng = rngOf(state);
  rng.next();
  syncRng(state, rng);

  const restored = deserialize(serialize(state));
  assert.ok(restored.ok);
  const s2 = restored.state;
  assert.equal(s2.clovers, 42);
  assert.equal(s2.inventory.bamboo_rice, 3);
  assert.equal(s2.luggage.tool, 'compass');
  assert.equal(s2.album.length, 1);

  const back = rngOf(s2);
  assert.equal(back.next(), rng.next(), 'rng must continue, not replay');
});

test('save: rejects corrupt or future saves instead of polluting state', () => {
  assert.equal(deserialize('not json').reason, 'bad-json');
  assert.equal(deserialize('null').reason, 'not-object');
  assert.equal(deserialize(JSON.stringify({ version: 999 })).reason, 'version-mismatch:999');
});

// -------------------------------------------------------------- titles

test('titles: are earned once and reflect the summary', () => {
  const state = fresh().state;
  state.stats.trips = 1;
  state.stats.fourLeaf = 1;
  const earned = newlyEarnedTitles(state);
  assert.ok(earned.includes('first_trip') && earned.includes('lucky'));

  state.titles = earned;
  assert.deepEqual(newlyEarnedTitles(state), []);
});

// ---------------------------------------------------------------- data

test('data: ids are unique and every cross-reference resolves', () => {
  const ids = new Set();
  for (const spot of SPOTS) {
    assert.ok(!ids.has(spot.id), `duplicate spot id ${spot.id}`);
    ids.add(spot.id);
    for (const p of spot.postcards) assert.ok(!ids.has(p.id), `duplicate postcard id ${p.id}`), ids.add(p.id);
    for (const v of spot.souvenirs) assert.ok(!ids.has(v.id), `duplicate souvenir id ${v.id}`), ids.add(v.id);
  }
  for (const spot of SPOTS) {
    for (const req of spot.unlockAfter || []) {
      assert.ok(SPOTS_BY_ID[req], `${spot.id} unlocks after unknown spot ${req}`);
      assert.notEqual(req, spot.id, `${spot.id} must not unlock itself`);
      assert.ok(SPOTS_BY_ID[req].tier <= spot.tier, `${spot.id} should not require a higher tier than itself`);
    }
  }
  for (const item of ALL_ITEMS) assert.ok(item.cost >= 0 && item.name, `${item.id} needs a name and non-negative cost`);
  for (const v of VISITORS) {
    assert.ok(Array.isArray(v.favours) && v.favours.length > 0, `${v.id} needs at least one favour`);
    for (const id of v.favours) assert.ok(SNACKS.some((s) => s.id === id), `${v.id} favours must be a real snack (feedable): ${id}`);
  }
});

test('data: every spot is reachable from the tier-4 snack + lantern', () => {
  const state = fresh().state;
  state.album = SPOTS.map((s) => ({ postcardId: s.postcards[0].id, spotId: s.id }));
  state.luggage.snack = 'matsutake';
  const reachable = new Set(eligibleSpots(state).map((s) => s.id));
  for (const spot of SPOTS.filter((s) => s.tier >= 3)) {
    assert.ok(reachable.has(spot.id), `${spot.id} (tier ${spot.tier}) is unreachable`);
  }
  assert.equal(visitedSpotIds(state).size, SPOTS.length);
});

// ----------------------------------------------------------- pure core

test('core: no randomness or wall-clock leaking into src/core', () => {
  const dir = path.join(ROOT, 'src/core');
  for (const file of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/Math\.random\(/.test(src), `${file} must use the injected rng`);
    assert.ok(!/Date\.now\(/.test(src), `${file} must use the injected clock`);
    assert.ok(!/\b(document|window|localStorage)\b/.test(src), `${file} must stay DOM-free`);
  }
});

test('core: a fresh engine starts inside Capacitor-friendly limits', () => {
  const e = createEngine({ seed: 5, now: 0, cfg: FAST });
  const snap = e.snapshot();
  assert.equal(snap.patchCount, CFG.patchCount);
  assert.equal(snap.readyPatches, CFG.patchCount);
  assert.equal(snap.maniu.status, 'home');
  assert.ok(snap.clovers > 0, 'you need some starting clovers to bootstrap');
});
