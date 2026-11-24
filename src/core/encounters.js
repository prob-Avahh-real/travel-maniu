// 自然奇遇的纯逻辑：按地区掷骰，决定这趟旅程是否碰上一件自然际遇。

import { NATURE_ENCOUNTERS } from '../data/encounters.js';

/** 掷一次自然奇遇：spot.region 决定用哪条际遇；bonus 是世界线给的额外奇遇率。返回际遇对象或 null（确定性，只耗 rng）。 */
export function rollEncounter(spot, rng, bonus = 0) {
  const enc = NATURE_ENCOUNTERS[spot.region];
  return enc && rng.chance(Math.min(0.6, enc.chance + bonus)) ? enc : null;
}
