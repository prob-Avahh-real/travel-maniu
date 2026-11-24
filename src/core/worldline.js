// 世界线：玩家的里程碑与相遇会「转动」世界线，激活分支节点，
// 反过来影响未来的奇遇与稀有明信片走向。纯逻辑 —— 不写 DOM、不耗 rng。

import { xuxiakeComplete } from './xuxiake.js';
import { POEMS } from '../data/poems.js';
import { VISITORS } from '../data/visitors.js';

/**
 * 世界线分支节点。trigger 是纯谓词；effect 是激活后叠加的全局效果。
 * 新增一个分支 = 在这里加一条，主循环不动。
 */
export const WORLDLINE_NODES = [
  { id: 'route_complete', name: '霞客路成', desc: '走完徐霞客的路线，山河之间多了你的脚印。', effect: { rareChance: 0.05 }, trigger: (state) => xuxiakeComplete(state) },
  { id: 'poetry_full', name: '诗满山河', desc: '集齐整本《诗笺》，处处都有诗意。', effect: { encounterChance: 0.03 }, trigger: (state) => (state.stats.poemsCollected || 0) >= POEMS.length },
  { id: 'wish_3', name: '流水有情', desc: '向流水许愿三次，溪水记得你的心愿。', effect: { encounterChance: 0.02 }, trigger: (state) => (state.stats.wished || 0) >= 3 },
  { id: 'friend_all', name: '门庭若市', desc: '与所有访客交好，篱笆外总是热闹。', effect: { rareChance: 0.03 }, trigger: (state) => VISITORS.every((v) => (state.visitors.friendship[v.id] || 0) >= 2) },
  { id: 'traveler_3', name: '他乡故知', desc: '在路上遇见三位旅人，结伴同行。', effect: { encounterChance: 0.03 }, trigger: (state) => (state.travelers || []).length >= 3 },
];

export const WORLDLINE_BY_ID = Object.fromEntries(WORLDLINE_NODES.map((n) => [n.id, n]));

/** 聚合当前世界线激活的全局效果。 */
export function worldlineEffects(state) {
  const have = new Set(state.worldline || []);
  const eff = { rareChance: 0, encounterChance: 0 };
  for (const node of WORLDLINE_NODES) {
    if (have.has(node.id)) {
      eff.rareChance += node.effect.rareChance || 0;
      eff.encounterChance += node.effect.encounterChance || 0;
    }
  }
  return eff;
}

/** 尚未激活、但条件已满足的世界线节点。 */
export function newlyActivatedNodes(state) {
  const have = new Set(state.worldline || []);
  return WORLDLINE_NODES.filter((n) => !have.has(n.id) && n.trigger(state));
}
