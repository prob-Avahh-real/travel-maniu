import { VISITORS, VISITORS_BY_ID } from '../data/visitors.js';
import { cfgOf, randRange } from './state.js';
import { consume, pushLog } from './economy.js';
import { ITEMS_BY_ID } from '../data/items.js';
import { weatherAt, rainUntil } from './weather.js';
import { MIN } from './config.js';

export function currentVisitor(state) {
  return state.visitors.current ? VISITORS_BY_ID[state.visitors.current.id] : null;
}

export function friendshipOf(state, visitorId) {
  return state.visitors.friendship[visitorId] || 0;
}

/** Spawn a visitor (skips the one already standing there).
 *  In the rain a visitor takes shelter and only leaves once the sky clears. */
export function arriveVisitor(state, rng, now, forcedId = null) {
  const cfg = cfgOf(state);
  const pool = VISITORS.filter((v) => v.id !== (state.visitors.current && state.visitors.current.id));
  const visitor = forcedId ? VISITORS_BY_ID[forcedId] : rng.pick(pool);
  if (!visitor) return { ok: false, reason: 'no-visitor' };
  const sheltering = weatherAt(now) === 'rain';
  const leaveAt = sheltering
    ? Math.max(now + cfg.visitorStayMs, rainUntil(now) + 2 * MIN)
    : now + cfg.visitorStayMs;
  // 访客间互动：交情到了，来访时会带一句别的访客的话。
  const interaction = interactionFor(state, visitor) || null;
  state.visitors.current = {
    id: visitor.id,
    arriveAt: now,
    leaveAt,
    fed: false,
    sheltering,
    interaction: interaction ? { with: interaction.with, line: interaction.line } : null,
  };
  pushLog(
    state,
    now,
    interaction ? interaction.line : (sheltering ? `${visitor.name}来躲雨，等在屋檐下。` : `${visitor.name}来了，在篱笆外面站着。`),
    'visitor',
  );
  return { ok: true, visitor, sheltering, interaction };
}

/**
 * 访客间互动：某访客来访时，若与另一位访客的交情够了，就说一句相关的话。
 * 纯判断，不写状态不耗 rng。
 */
export function interactionFor(state, visitor) {
  const friendship = state.visitors.friendship || {};
  for (const it of visitor.interactions || []) {
    if ((friendship[it.with] || 0) >= it.minFriendship) return it;
  }
  return null;
}

/**
 * 访客陪你玩：当前在场的访客，若交情够了（>=2）且它擅长你正在玩的游戏，
 * 就给你加命中率。纯判断，不写状态不耗 rng。
 */
export function companionBonus(state, gameId) {
  const v = state.visitors.current;
  if (!v) return 0;
  const visitor = VISITORS_BY_ID[v.id];
  const friendship = state.visitors.friendship[v.id] || 0;
  if (friendship < 2) return 0;
  const c = visitor.companion;
  return c && c.gameId === gameId ? c.bonus : 0;
}

export function leaveVisitor(state, rng, now) {
  const v = currentVisitor(state);
  if (!v) return { ok: false, reason: 'nobody-home' };
  const cfg = cfgOf(state);
  state.visitors.current = null;
  state.visitors.nextAt = now + randRange(rng, cfg.visitorIntervalMs);
  pushLog(state, now, `${v.name}走了。`, 'visitor');
  return { ok: true, visitor: v };
}

/**
 * Offer something to the visitor. Favourite food counts double.
 * At friendship >= 2 the visitor starts bringing the rare gift.
 */
export function feedVisitor(state, rng, itemId, now) {
  const v = currentVisitor(state);
  if (!v) return { ok: false, reason: 'no-visitor' };
  if (state.visitors.current.fed) return { ok: false, reason: 'already-fed' };
  if (!state.inventory[itemId]) return { ok: false, reason: 'not-owned' };

  consume(state, itemId);
  const favoured = v.favours.includes(itemId);
  const gain = favoured ? 2 : 1;
  const before = friendshipOf(state, v.id);
  state.visitors.friendship[v.id] = before + gain;
  state.visitors.current.fed = true;

  const after = state.visitors.friendship[v.id];
  const gift = after >= 2 ? v.rareGift : v.gift;
  state.souvenirs[gift.id] = (state.souvenirs[gift.id] || 0) + 1;
  state.stats.souvenirs += 1;
  state.stats.friendGifts += 1;

  const giftName = gift.name;
  pushLog(
    state,
    now,
    favoured
      ? `${v.name}很喜欢${ITEMS_BY_ID[itemId] ? ITEMS_BY_ID[itemId].name : '这个'}，留下${giftName}。`
      : `${v.name}收下了，留下${giftName}。`,
    'visitor',
  );
  return { ok: true, favoured, gift, friendship: after, line: rng.pick(v.lines) };
}
