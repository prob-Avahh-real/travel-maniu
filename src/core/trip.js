import { SPOTS, SPOTS_BY_ID, POSTCARDS_BY_ID, SEASONAL, rarePostcardFor } from '../data/spots.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { cfgOf, randRange, ALBUM_CAP } from './state.js';
import { pushLog, applyCurrency, CURRENCY_LABEL } from './economy.js';
import { HOUR } from './config.js';
import { weatherAt, weatherFactor } from './weather.js';
import { seasonIndex } from './season.js';
import { rollEncounter } from './encounters.js';
import { worldlineEffects } from './worldline.js';
import { rollTraveler, rollTravelerGift } from './travelers.js';

/** Every distinct postcard the player owns (migrates cleanly with or without collection). */
export function ownedPostcards(state) {
  return new Set([
    ...Object.keys(state.collection || {}),
    ...state.album.map((a) => a.postcardId),
  ]);
}

export function visitedSpotIds(state) {
  return new Set([
    ...Object.values(state.collection || {}).map((c) => c.spotId),
    ...state.album.map((a) => a.spotId),
  ]);
}

/**
 * Which tiers are reachable given the packed snack (+ lantern bonus).
 * The lower bound is always 1 on purpose: good food opens up the far places but
 * must never lock you out of the near ones (that would be a dead end).
 */
export function tierWindow(state) {
  const snack = state.luggage.snack ? ITEMS_BY_ID[state.luggage.snack] : null;
  if (!snack) return null;
  const tool = state.luggage.tool ? ITEMS_BY_ID[state.luggage.tool] : null;
  const bonus = (tool && tool.effect && tool.effect.tierBonus) || 0;
  const max = Math.min(4, snack.tier + bonus);
  return { min: 1, max };
}

/** Better food biases the roll towards the far places, without forbidding near ones. */
export function tierAffinity(targetTier, tier) {
  const d = Math.abs(tier - targetTier);
  return d === 0 ? 3 : d === 1 ? 2 : 1;
}

export function eligibleSpots(state) {
  const win = tierWindow(state);
  if (!win) return [];
  const visited = visitedSpotIds(state);
  return SPOTS.filter((s) => {
    if (s.tier < win.min || s.tier > win.max) return false;
    return (s.unlockAfter || []).every((id) => visited.has(id));
  });
}

export function canDepart(state) {
  if (state.maniu.status !== 'home') return { ok: false, reason: 'away' };
  if (!state.luggage.snack) return { ok: false, reason: 'no-snack' };
  if (!state.luggage.tool && !state.luggage.charm && eligibleSpots(state).length === 0) {
    return { ok: false, reason: 'no-destination' };
  }
  if (eligibleSpots(state).length === 0) return { ok: false, reason: 'no-destination' };
  return { ok: true };
}

/**
 * Build a trip plan. Pure w.r.t. state except for reading luggage (not consumed here).
 * Duration scales with the snack: more food = further and longer.
 * spotId 给定 = 开放世界：玩家指定目的地（必须在当前可达池内）；否则按偏好加权随机。
 */
export function planTrip(state, rng, now, spotId = null) {
  const win = tierWindow(state);
  if (!win) return { ok: false, reason: 'no-snack' };
  const pool = eligibleSpots(state);
  if (!pool.length) return { ok: false, reason: 'no-destination' };

  const snack = ITEMS_BY_ID[state.luggage.snack];
  let spot;
  if (spotId) {
    spot = pool.find((s) => s.id === spotId);
    if (!spot) return { ok: false, reason: 'unreachable' };
  } else {
    // Prefer places never visited, and places matching the food's "reach".
    const visited = visitedSpotIds(state);
    spot = rng.weightedBy(
      pool,
      (s) => s.weight * (visited.has(s.id) ? 0.5 : 1) * tierAffinity(snack.tier, s.tier),
    );
  }
  const tool = state.luggage.tool ? ITEMS_BY_ID[state.luggage.tool] : null;

  const rainProof = Boolean(tool && tool.effect && tool.effect.rainProof);
  const weather = weatherAt(now);
  // Bad weather cuts a trip short; a hat (rainProof) keeps it on schedule.
  const hours = (snack.hours * rng.float(0.85, 1.15) + (spot.tier >= 4 ? 0.5 : 0)) * weatherFactor(now, rainProof);
  const returnAt = now + Math.round(hours * HOUR);
  return {
    ok: true,
    trip: {
      spotId: spot.id,
      snackId: snack.id,
      toolId: state.luggage.tool,
      charmId: state.luggage.charm,
      departAt: now,
      returnAt,
      tier: spot.tier,
      weather,
      rainProof,
    },
  };
}

/**
 * Decide what the trip brought home. Deterministic given (state, rng, trip).
 * Prefers postcards the player does not have yet; duplicates are flagged.
 */
export function resolveTrip(state, rng, trip) {
  const spot = SPOTS_BY_ID[trip.spotId];
  const tool = trip.toolId ? ITEMS_BY_ID[trip.toolId] : null;
  const charm = trip.charmId ? ITEMS_BY_ID[trip.charmId] : null;
  const eff = {
    rareChance: ((tool && tool.effect.rareChance) || 0) + ((charm && charm.effect.rareChance) || 0),
    // A hat in the rain means more time on the road, and more to bring back.
    extraSouvenir: ((tool && tool.effect.extraSouvenir) || 0) + (trip.weather === 'rain' && trip.rainProof ? 1 : 0),
    luck: (charm && charm.effect.luck) || 0,
    friendChance: (charm && charm.effect.friendChance) || 0,
  };

  const wl = worldlineEffects(state);
  const encounter = rollEncounter(spot, rng, wl.encounterChance);
  const rare = rng.chance(0.05 + eff.rareChance + wl.rareChance) || (encounter && encounter.effect === 'rare');
  const owned = ownedPostcards(state);
  const fresh = spot.postcards.filter((p) => !owned.has(p.id));
  let postcard;
  let duplicate = false;
  if (fresh.length) {
    postcard = rng.pick(fresh);
  } else if (rare) {
    postcard = rarePostcardFor(spot);
    duplicate = owned.has(postcard.id);
  } else {
    postcard = rng.pick(spot.postcards);
    duplicate = true;
  }
  if (rare && !duplicate && postcard.id !== `${spot.id}_rare`) {
    // Rare trips may still surface the "奇遇" frame on top of a fresh card.
    postcard = { ...postcard, rare: true };
  }

  const count = Math.min(spot.souvenirs.length, 1 + eff.extraSouvenir + (rare ? 1 : 0));
  const souvenirs = rng.shuffle(spot.souvenirs).slice(0, count).map((v) => v.id);

  // 节气特产：只在对应的季节里，才有机会带回来。
  const tripSeason = seasonIndex(trip.returnAt ?? trip.departAt ?? 0);
  for (const entry of SEASONAL[trip.spotId] || []) {
    if (entry.season === tripSeason && rng.chance(entry.chance)) souvenirs.push(entry.souvenir.id);
  }

  let bonusClovers = rng.int(0, 2) + eff.luck;
  // 自然奇遇的额外效果（落花流水/捡石/听戏/观星）
  let encounterPetals = 0;
  if (encounter) {
    if (encounter.effect === 'petals') encounterPetals = encounter.amount || 0;
    if (encounter.effect === 'souvenir') {
      const extra = rng.shuffle(spot.souvenirs).find((v) => !souvenirs.includes(v.id));
      if (extra) souvenirs.push(extra.id);
    }
    if (encounter.effect === 'clovers') bonusClovers += encounter.amount || 0;
  }
  const metFriend = rng.chance(eff.friendChance);

  return { ok: true, postcard, duplicate, rare, souvenirs, bonusClovers, metFriend, spot, encounterPetals, encounter };
}

/** Consume the luggage that went along: snack eaten, charm spent, tool kept. */
export function consumeLuggage(state, trip) {
  const consumed = [];
  if (trip.snackId) { state.luggage.snack = null; consumed.push(trip.snackId); }
  if (trip.charmId) {
    const charm = ITEMS_BY_ID[trip.charmId];
    if (charm && charm.reusable) state.inventory[trip.charmId] = (state.inventory[trip.charmId] || 0) + 1;
    state.luggage.charm = null;
    consumed.push(trip.charmId);
  }
  // Tools are reusable: stay in the luggage for next time.
  return consumed;
}

/** Send 马牛 out immediately (player pressed 送行; auto-depart uses this too). */
export function depart(state, rng, now) {
  return departTo(state, rng, null, now);
}

/** 开放世界：玩家指定目的地，送马牛去那个地方。spotId 为 null 则按偏好随机。 */
export function departTo(state, rng, spotId, now) {
  const check = canDepart(state);
  if (!check.ok) return check;
  const plan = planTrip(state, rng, now, spotId);
  if (!plan.ok) return plan;
  state.maniu.status = 'away';
  state.maniu.trip = plan.trip;
  state.maniu.activity = '在路上';
  const spot = SPOTS_BY_ID[plan.trip.spotId];
  pushLog(state, now, `${state.maniu.name}背着包往${spot.name}去了。`, 'depart');
  if (spotId) state.stats.freeTrips += 1;
  return { ok: true, trip: plan.trip, spot };
}

/** Called by tick when returnAt is reached. */
export function finishTrip(state, rng, now) {
  const trip = state.maniu.trip;
  if (!trip) return { ok: false, reason: 'no-trip' };
  const cfg = cfgOf(state);
  const outcome = resolveTrip(state, rng, trip);
  consumeLuggage(state, trip);

  // Two views of the same event: a capped timeline for display, and a bounded
  // collection (one record per card) that survives arbitrarily long games.
  const at = Math.min(now, trip.returnAt + 60 * 1000);
  const rare = Boolean(outcome.rare || outcome.postcard.rare);
  const wet = trip.weather === 'rain'; // 雨天拍的明信片
  state.album.push({
    postcardId: outcome.postcard.id,
    spotId: trip.spotId,
    at,
    rare,
    wet,
    duplicate: outcome.duplicate,
    encounter: outcome.encounter ? outcome.encounter.name : null,
  });
  if (state.album.length > ALBUM_CAP) state.album.splice(0, state.album.length - ALBUM_CAP);
  const card = state.collection[outcome.postcard.id];
  if (card) {
    card.count += 1;
    card.wet = card.wet || wet;
  } else {
    state.collection[outcome.postcard.id] = { count: 1, spotId: trip.spotId, rare, wet, firstAt: at };
  }
  for (const id of outcome.souvenirs) {
    state.souvenirs[id] = (state.souvenirs[id] || 0) + 1;
    state.stats.souvenirs += 1;
  }
  if (outcome.encounterPetals) {
    state.florals.petal = (state.florals.petal || 0) + outcome.encounterPetals;
    state.stats.petalsPicked += outcome.encounterPetals;
  }
  state.clovers += outcome.bonusClovers;
  state.stats.cloversEarned += outcome.bonusClovers;
  state.stats.trips += 1;
  state.maniu.tripsDone += 1;
  state.maniu.status = 'home';
  state.maniu.trip = null;
  state.maniu.restUntil = now + randRange(rng, [cfg.minRestMs, cfg.maxRestMs]);
  state.maniu.activity = '刚回来，在歇脚';
  state.maniu.pendingFriend = outcome.metFriend ? trip.spotId : null;

  if (outcome.encounter) pushLog(state, now, outcome.encounter.log, 'encounter');
  const traveler = rollTraveler(state, rng);
  let travelerGift = null;
  if (traveler) {
    pushLog(state, now, `路上遇见了${traveler.name}：「${traveler.note}」`, 'traveler');
  } else {
    // 没遇见新旅人时，旧识可能托马牛捎回一份小礼（重逢）。
    const from = rollTravelerGift(state, rng);
    if (from && from.gift) {
      const amount = rng.int(from.gift.amount[0], from.gift.amount[1]);
      applyCurrency(state, from.gift.currency, amount);
      state.stats.travelerGifts += 1;
      pushLog(state, now, `又遇见${from.name}，${from.gift.line}捎来${amount}${CURRENCY_LABEL[from.gift.currency]}。`, 'traveler');
      travelerGift = { name: from.name, currency: from.gift.currency, amount, line: from.gift.line };
    }
  }
  const meta = POSTCARDS_BY_ID[outcome.postcard.id] || outcome.postcard;
  pushLog(
    state,
    now,
    outcome.duplicate
      ? `${state.maniu.name}回来了，带回一张重复的「${meta.title}」。`
      : `${state.maniu.name}回来了，带回明信片「${meta.title}」。`,
    'return',
  );
  return { ok: true, ...outcome, trip, traveler, travelerGift };
}
