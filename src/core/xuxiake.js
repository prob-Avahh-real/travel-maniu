// 霞客路进度：纯逻辑 —— 只看状态里到过哪些地方，判断走到徐霞客路线的哪一段。
// 不写状态、不读时钟、不消耗随机数。

import { XU_XIAKE_ROUTE } from '../data/xuxiake.js';
import { visitedSpotIds } from './trip.js';

/**
 * 返回 { stages, done, total, complete }。
 * stages[i] = { ...路线条目, visited }；visited = 该地点是否到过（有过明信片）。
 */
export function xuxiakeProgress(state) {
  const visited = visitedSpotIds(state);
  const stages = XU_XIAKE_ROUTE.map((s) => ({ ...s, visited: visited.has(s.spotId) }));
  const done = stages.filter((s) => s.visited).length;
  return { stages, done, total: XU_XIAKE_ROUTE.length, complete: done === XU_XIAKE_ROUTE.length };
}

/** 是否已经走完霞客路。 */
export function xuxiakeComplete(state) {
  return xuxiakeProgress(state).complete;
}
