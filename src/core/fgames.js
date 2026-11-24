// 坊间游戏的纯逻辑：玩一局 = 投 attempts 次、按命中给产出。确定性、带冷却、不写 DOM。
// 产出接进三套资源：铜钱草 / 花瓣 / 落叶（花瓣落叶再流向许愿）。

import { FOLK_GAMES_BY_ID } from '../data/fgames.js';
import { pushLog, applyCurrency, CURRENCY_LABEL } from './economy.js';
import { companionBonus } from './visitors.js';
import { collectPoem } from './poems.js';

/**
 * 玩一局坊间游戏。返回 { ok, game, hits, attempts, gained, best, currency, label }。
 * 命中与产出都由注入的 rng 决定（确定性）；冷却由 state.fgames[id].cooldownAt 记录。
 */
export function playFolkGame(state, rng, gameId, now = state.now) {
  const game = FOLK_GAMES_BY_ID[gameId];
  if (!game) return { ok: false, reason: 'unknown-game' };
  const rec = state.fgames[gameId] || (state.fgames[gameId] = { played: 0, hits: 0, best: 0, cooldownAt: 0 });
  if (rec.cooldownAt > now) return { ok: false, reason: 'cooldown' };

  const chance = Math.min(0.95, game.chance + companionBonus(state, gameId));
  let hits = 0;
  for (let i = 0; i < game.attempts; i++) if (rng.chance(chance)) hits += 1;

  let gained = 0;
  for (let i = 0; i < hits; i++) gained += rng.int(game.reward.perHit[0], game.reward.perHit[1]);

  const currency = game.reward.currency;
  const label = CURRENCY_LABEL[currency];
  // 诗社/飞花令：命中就收一句诗，集进《诗笺》。
  let poems = [];
  if (game.poem) {
    for (let i = 0; i < hits; i++) {
      const poem = collectPoem(state, rng);
      if (poem) poems.push(poem);
    }
  }
  applyCurrency(state, currency, gained);
  rec.played += 1;
  rec.hits += hits;
  rec.best = Math.max(rec.best, hits);
  rec.cooldownAt = now + game.cooldownMs;
  state.stats.gamesPlayed += 1;
  pushLog(state, now, `玩了一局${game.name}，投进 ${hits}/${game.attempts}${gained ? `，得${gained}${label}` : ''}。`, 'game');
  return { ok: true, game, hits, attempts: game.attempts, gained, best: rec.best, currency, label, poems };
}
