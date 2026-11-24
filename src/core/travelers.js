// 旅人相遇：旅程结束时有机会在路上遇见一位同路人，收到一条留言。纯逻辑、确定性、不重复。
// 重逢捎礼：已经见过的旅人，之后旅程结束时有机会托马牛捎回一份小礼（gift 契约见 data）。

import { TRAVELERS, TRAVELERS_BY_ID } from '../data/travelers.js';

export const TRAVELER_GIFT_CHANCE = 0.12;

/** 掷一次相遇：15% 概率遇见一位还没遇过的旅人；集齐返回 null。 */
export function rollTraveler(state, rng) {
  if (!rng.chance(0.15)) return null;
  const have = new Set(state.travelers || []);
  const fresh = TRAVELERS.filter((t) => !have.has(t.id));
  if (!fresh.length) return null;
  const traveler = rng.pick(fresh);
  (state.travelers || (state.travelers = [])).push(traveler.id);
  return traveler;
}

/** 掷一次重逢：没遇见新旅人的旅程里，12% 概率有一位已遇过的旅人托马牛捎礼；没有旧识返回 null。 */
export function rollTravelerGift(state, rng) {
  const met = state.travelers || [];
  if (!met.length) return null;
  if (!rng.chance(TRAVELER_GIFT_CHANCE)) return null;
  return TRAVELERS_BY_ID[rng.pick(met)] || null;
}
