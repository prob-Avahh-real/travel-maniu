// 落花飞叶：四季拾花叶 + 投进流水许愿。纯逻辑 —— 不写 DOM、不读时钟、只耗 rng。

import { FLORAL, WISH_COST, WISH_CLOVERS } from '../data/floral.js';
import { seasonIndex } from './season.js';
import { pushLog } from './economy.js';

/** 当前季节对应的花叶种类（春=花瓣，秋=落叶，夏冬=无）。 */
export function floralKind(now) {
  const cfg = FLORAL[seasonIndex(now)];
  return cfg ? cfg.id : null;
}

/** 拾一片花叶：只在对应季节才有，带冷却，确定性掷骰。 */
export function collectFloral(state, rng, now = state.now) {
  const season = seasonIndex(now);
  const cfg = FLORAL[season];
  if (!cfg) return { ok: false, reason: 'wrong-season' };
  if ((state.floralAt || 0) > now) return { ok: false, reason: 'not-ready' };
  const n = rng.int(cfg.perPick[0], cfg.perPick[1]);
  state.florals[cfg.id] = (state.florals[cfg.id] || 0) + n;
  if (cfg.id === 'petal') state.stats.petalsPicked += n;
  else state.stats.leavesPicked += n;
  state.floralAt = now + cfg.regrowMs;
  pushLog(state, now, `拾了${n}片${cfg.name}。`, 'floral');
  return { ok: true, kind: cfg.id, gained: n };
}

/** 把花叶投进流水许愿：消耗 WISH_COST 片，换铜钱草。 */
export function wishAtStream(state, rng, now = state.now) {
  const total = (state.florals.petal || 0) + (state.florals.leaf || 0);
  if (total < WISH_COST) return { ok: false, reason: 'not-enough' };
  let remaining = WISH_COST;
  for (const id of ['petal', 'leaf']) {
    const take = Math.min(state.florals[id] || 0, remaining);
    state.florals[id] -= take;
    remaining -= take;
  }
  const gained = rng.int(WISH_CLOVERS[0], WISH_CLOVERS[1]);
  state.clovers += gained;
  state.stats.cloversEarned += gained;
  state.stats.wished += 1;
  pushLog(state, now, `把花叶投进流水许愿，漂来${gained}株铜钱草。`, 'wish');
  return { ok: true, gained, wished: state.stats.wished };
}
