import { ITEMS_BY_ID, slotOf, KIND } from '../data/items.js';
import { cfgOf } from './state.js';

/** Append an event to the in-state log (capped, newest last). */
export function pushLog(state, at, text, type = 'info') {
  const cfg = cfgOf(state);
  state.log.push({ at, text, type });
  if (state.log.length > cfg.logLimit) state.log.splice(0, state.log.length - cfg.logLimit);
  return state.log[state.log.length - 1];
}

export const CURRENCY_KINDS = ['clovers', 'petal', 'leaf'];
export const CURRENCY_LABEL = { clovers: '株铜钱草', petal: '片花瓣', leaf: '片落叶' };

/** 把一份产出发到对应的资源与统计上（坊间游戏与旅人捎礼共用）。 */
export function applyCurrency(state, currency, n) {
  if (currency === 'clovers') {
    state.clovers += n;
    state.stats.cloversEarned += n;
  } else if (currency === 'petal') {
    state.florals.petal = (state.florals.petal || 0) + n;
    state.stats.petalsPicked += n;
  } else if (currency === 'leaf') {
    state.florals.leaf = (state.florals.leaf || 0) + n;
    state.stats.leavesPicked += n;
  } else {
    return { ok: false, reason: 'unknown-currency' };
  }
  return { ok: true };
}

export function readyPatches(state, now) {
  return state.patches.filter((p) => p.readyAt <= now);
}

export function isReady(state, patchId, now) {
  const p = state.patches.find((x) => x.id === patchId);
  return Boolean(p && p.readyAt <= now);
}

/**
 * Pick one clover patch. Roll happens here (not at regrow) so the RNG stream
 * only advances on player action — keeps offline catch-up deterministic.
 */
export function pickClover(state, rng, patchId, now) {
  const cfg = cfgOf(state);
  const patch = state.patches.find((p) => p.id === patchId);
  if (!patch) return { ok: false, reason: 'no-patch' };
  if (patch.readyAt > now) return { ok: false, reason: 'not-ready' };

  const fourLeaf = rng.chance(cfg.fourLeafChance);
  const n = fourLeaf ? cfg.fourLeafValue : rng.int(cfg.cloverPerPick[0], cfg.cloverPerPick[1]);
  patch.readyAt = now + cfg.cloverRegrowMs;
  state.clovers += n;
  state.stats.picked += 1;
  state.stats.cloversEarned += n;
  if (fourLeaf) state.stats.fourLeaf += 1;
  pushLog(state, now, fourLeaf ? `摘到一株金铜钱草，+${n}` : `摘了铜钱草，+${n}`, 'clover');
  return { ok: true, gained: n, fourLeaf };
}

/** Picking everything that is ready — convenience for the garden button. */
export function pickAll(state, rng, now) {
  const ids = readyPatches(state, now).map((p) => p.id);
  let gained = 0;
  let fourLeaf = false;
  for (const id of ids) {
    const r = pickClover(state, rng, id, now);
    if (r.ok) {
      gained += r.gained;
      fourLeaf = fourLeaf || r.fourLeaf;
    }
  }
  return { ok: ids.length > 0, picked: ids.length, gained, fourLeaf };
}

export function canAfford(state, itemId) {
  const item = ITEMS_BY_ID[itemId];
  return Boolean(item && state.clovers >= item.cost);
}

/** Buy from the shop. No RNG — buying is deterministic. */
export function buy(state, itemId, now = state.now) {
  const item = ITEMS_BY_ID[itemId];
  if (!item) return { ok: false, reason: 'unknown-item' };
  if (state.clovers < item.cost) return { ok: false, reason: 'poor' };
  state.clovers -= item.cost;
  state.stats.cloversSpent += item.cost;
  state.inventory[itemId] = (state.inventory[itemId] || 0) + 1;
  pushLog(state, now, `买了${item.name}，-${item.cost}`, 'shop');
  return { ok: true, item, cost: item.cost };
}

/**
 * Put an item in a luggage slot. slot: snack | tool | charm.
 * Passing slot:null or itemId:null clears the slot and returns the item.
 */
export function pack(state, slot, itemId, now = state.now) {
  if (!(slot in state.luggage)) return { ok: false, reason: 'bad-slot' };
  if (itemId === null) {
    const prev = state.luggage[slot];
    if (prev) state.inventory[prev] = (state.inventory[prev] || 0) + 1;
    state.luggage[slot] = null;
    return { ok: true, cleared: prev };
  }
  if (slotOf(itemId) !== slot) return { ok: false, reason: 'wrong-slot' };
  if (!state.inventory[itemId]) return { ok: false, reason: 'not-owned' };
  // Return whatever was there first.
  const prev = state.luggage[slot];
  if (prev) state.inventory[prev] = (state.inventory[prev] || 0) + 1;
  state.inventory[itemId] -= 1;
  if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
  state.luggage[slot] = itemId;
  pushLog(state, now, `${slotLabel(slot)}备好了：${ITEMS_BY_ID[itemId].name}`, 'luggage');
  return { ok: true, replaced: prev };
}

export function unpackAll(state) {
  for (const slot of Object.keys(state.luggage)) pack(state, slot, null);
  return state.luggage;
}

export function slotLabel(slot) {
  return { snack: '干粮', tool: '道具', charm: '护身符' }[slot] || slot;
}

export const SLOTS = [KIND.SNACK, KIND.TOOL, KIND.CHARM];

/** Consume one unit of an item; returns true if it existed. */
export function consume(state, itemId, n = 1) {
  if (!state.inventory[itemId] || state.inventory[itemId] < n) return false;
  state.inventory[itemId] -= n;
  if (state.inventory[itemId] <= 0) delete state.inventory[itemId];
  return true;
}
