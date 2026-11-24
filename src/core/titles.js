import { TOTAL_POSTCARDS, TOTAL_SOUVENIRS } from '../data/spots.js';
import { VISITORS } from '../data/visitors.js';
import { FOLK_GAMES } from '../data/fgames.js';
import { POEMS } from '../data/poems.js';
import { ownedPostcards, visitedSpotIds } from './trip.js';
import { xuxiakeProgress } from './xuxiake.js';

/** Derived, read-only view used by title checks and the UI header. */
export function summarize(state) {
  const albumIds = ownedPostcards(state);
  const visited = visitedSpotIds(state);
  return {
    stats: state.stats,
    album: state.album,
    collection: state.collection || {},
    albumIds,
    albumCount: albumIds.size,
    albumTotal: TOTAL_POSTCARDS,
    souvenirKinds: Object.keys(state.souvenirs).length,
    souvenirTotal: TOTAL_SOUVENIRS,
    wetCount: Object.values(state.collection || {}).filter((c) => c.wet).length,
    friends: Object.entries(state.visitors.friendship || {}).filter(([, n]) => n >= 2).length,
    friendTotal: VISITORS.length,
    spotsVisited: visited.size,
    xuxiakeRoute: xuxiakeProgress(state).done,
    xuxiakeTotal: xuxiakeProgress(state).total,
    petals: state.stats.petalsPicked || 0,
    leaves: state.stats.leavesPicked || 0,
    wished: state.stats.wished || 0,
    gamesPlayed: state.stats.gamesPlayed || 0,
    gamesCovered: Object.values(state.fgames || {}).filter((r) => r.played >= 1).length,
    pitchpotBest: (state.fgames && state.fgames.pitchpot && state.fgames.pitchpot.best) || 0,
    poemsCollected: state.stats.poemsCollected || 0,
    poemTotal: POEMS.length,
    freeTrips: state.stats.freeTrips || 0,
    travelerGifts: state.stats.travelerGifts || 0,
    clovers: state.clovers,
  };
}

/**
 * Titles are pure predicates over the summary — adding one is a data edit.
 * check: (s) => boolean
 */
export const TITLES = [
  { id: 'first_trip', name: '初次远行', desc: '出门一次', check: (s) => s.stats.trips >= 1 },
  { id: 'regular', name: '常客', desc: '出行 10 次', check: (s) => s.stats.trips >= 10 },
  { id: 'pilgrim', name: '老旅人', desc: '出行 40 次', check: (s) => s.stats.trips >= 40 },
  { id: 'clover_hands', name: '铜钱草之手', desc: '采满 60 株', check: (s) => s.stats.picked >= 60 },
  { id: 'lucky', name: '幸运儿', desc: '采到金铜钱草', check: (s) => s.stats.fourLeaf >= 1 },
  { id: 'album_starter', name: '贴上第一张', desc: '明信片 1 张', check: (s) => s.albumCount >= 1 },
  { id: 'album_half', name: '半本相册', desc: `明信片 ${Math.ceil(TOTAL_POSTCARDS / 2)} 张`, check: (s) => s.albumCount >= Math.ceil(TOTAL_POSTCARDS / 2) },
  { id: 'album_full', name: '整本相册', desc: '集齐所有明信片', check: (s) => s.albumCount >= TOTAL_POSTCARDS },
  { id: 'collector', name: '拾遗人', desc: `特产 ${Math.ceil(TOTAL_SOUVENIRS / 2)} 种`, check: (s) => s.souvenirKinds >= Math.ceil(TOTAL_SOUVENIRS / 2) },
  { id: 'hoarder', name: '满仓', desc: '集齐所有特产', check: (s) => s.souvenirKinds >= TOTAL_SOUVENIRS },
  { id: 'neighbourly', name: '好邻居', desc: '与 2 位访客交好', check: (s) => s.friends >= 2 },
  { id: 'beloved', name: '门庭若市', desc: `与 ${VISITORS.length} 位访客交好`, check: (s) => s.friends >= VISITORS.length },
  { id: 'rain_walker', name: '冒雨赶路', desc: '带回 3 张淋湿的明信片', check: (s) => s.wetCount >= 3 },
  { id: 'wanderer', name: '走遍', desc: '到过 8 个地方', check: (s) => s.spotsVisited >= 8 },
  { id: 'xuxiake', name: '霞客传人', desc: '走完徐霞客的路线', check: (s) => s.xuxiakeTotal > 0 && s.xuxiakeRoute >= s.xuxiakeTotal },
  { id: 'flower_hands', name: '拾花人', desc: '拾 20 片花瓣', check: (s) => s.petals >= 20 },
  { id: 'leaf_sweeper', name: '扫叶人', desc: '拾 20 片落叶', check: (s) => s.leaves >= 20 },
  { id: 'falling_water', name: '落花流水', desc: '向流水许愿 3 次', check: (s) => s.wished >= 3 },
  { id: 'pot_master', name: '神投手', desc: '投壶全中（5/5）', check: (s) => s.pitchpotBest >= 5 },
  { id: 'folk_regular', name: '坊间常客', desc: '每种坊间游戏都玩过', check: (s) => s.gamesCovered >= FOLK_GAMES.length },
  { id: 'old_hand', name: '老玩家', desc: '玩 15 局坊间游戏', check: (s) => s.gamesPlayed >= 15 },
  { id: 'poet', name: '小诗人', desc: '收集 5 句诗', check: (s) => s.poemsCollected >= 5 },
  { id: 'poetry_full', name: '诗满袖', desc: '集齐整本《诗笺》', check: (s) => s.poemsCollected >= s.poemTotal },
  { id: 'free_roamer', name: '自由行', desc: '自己决定去哪 5 次', check: (s) => s.freeTrips >= 5 },
  { id: 'gifted', name: '礼尚往来', desc: '收到旅人捎来的 3 份礼', check: (s) => s.travelerGifts >= 3 },
];

export const TITLES_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

/** Returns the list of title ids newly earned (does not mutate). */
export function newlyEarnedTitles(state) {
  const s = summarize(state);
  const have = new Set(state.titles);
  return TITLES.filter((t) => !have.has(t.id) && t.check(s)).map((t) => t.id);
}
