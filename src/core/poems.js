// 《诗笺》：诗社 / 飞花令里对出的古诗句，收集成册。纯逻辑 —— 不写 DOM、只耗 rng。

import { POEMS } from '../data/poems.js';

export function collectedPoemIds(state) {
  return new Set(state.poems || []);
}

/** 收一句还没收过的诗；集满返回 null。 */
export function collectPoem(state, rng) {
  const have = collectedPoemIds(state);
  const fresh = POEMS.filter((p) => !have.has(p.id));
  if (!fresh.length) return null;
  const poem = rng.pick(fresh);
  (state.poems || (state.poems = [])).push(poem.id);
  state.stats.poemsCollected += 1;
  return poem;
}
