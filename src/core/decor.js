// 房间装饰：把收藏的特产摆到房间的不同槽位（桌台/窗台/地板/墙上）。
// 纯粹是展示选择 —— 不消耗收藏数。`state.decor` 以槽位为键。
// 新增槽位 = 在 DECOR_SLOTS 加一个键 + 在 drawRoom 里画它（装饰逻辑不用再动）。

import { pushLog } from './economy.js';

export const DECOR_SLOTS = ['shelf', 'sill', 'floor', 'wall'];
export const DECOR_SLOT_LABELS = { shelf: '桌台', sill: '窗台', floor: '地板', wall: '墙上' };

/** slot: 槽位键；souvenirId: 已收集的特产 id，null 表示收起该槽位。 */
export function placeDecor(state, slot, souvenirId, now = state.now) {
  const decor = state.decor || (state.decor = {});
  if (!DECOR_SLOTS.includes(slot)) return { ok: false, reason: 'bad-slot' };
  if (souvenirId === null) {
    const prev = decor[slot] || null;
    decor[slot] = null;
    if (prev) pushLog(state, now, `把${DECOR_SLOT_LABELS[slot]}上的收藏收了起来。`, 'decor');
    return { ok: true, cleared: prev };
  }
  if (!state.souvenirs[souvenirId]) return { ok: false, reason: 'not-collected' };
  // 同一件收藏只摆在一个槽位：先把它从别的槽位取下，避免一件多占。
  for (const s of DECOR_SLOTS) {
    if (s !== slot && decor[s] === souvenirId) decor[s] = null;
  }
  decor[slot] = souvenirId;
  pushLog(state, now, `把一件收藏摆上了${DECOR_SLOT_LABELS[slot]}。`, 'decor');
  return { ok: true, placed: souvenirId, slot };
}

/** 某槽位当前摆的特产 id，或 null。 */
export function currentDecor(state, slot = 'shelf') {
  return (state.decor && state.decor[slot]) || null;
}

/** 所有槽位当前摆了什么（渲染与 UI 读取用）。 */
export function allDecor(state) {
  const decor = state.decor || {};
  return Object.fromEntries(DECOR_SLOTS.map((s) => [s, decor[s] || null]));
}
