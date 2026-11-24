// 坊间游戏：古代的民间玩艺儿，马牛在家能玩一局，练手气换点产出。
// 每种游戏 = 一条配置；核心循环（玩一局 = 投 attempts 次、每次 chance 命中、按命中给产出）不变。
// reward.currency：clovers（铜钱草）/ petal（花瓣）/ leaf（落叶）——接进落花飞叶与许愿经济。
// 新增一种游戏 = 在这里加一条 + drawGameGlyph 加一个 case，主循环不动。

export const FOLK_GAMES = [
  // —— 原有五样 ——
  { id: 'pitchpot', name: '投壶', desc: '把箭投进壶里，投进几支得几株铜钱草。', attempts: 5, chance: 0.5, reward: { currency: 'clovers', perHit: [1, 2] }, cooldownMs: 2 * 3600_000 },
  { id: 'cuju', name: '蹴鞠', desc: '踢球入门，进了就得分。', attempts: 3, chance: 0.4, reward: { currency: 'clovers', perHit: [2, 3] }, cooldownMs: 3 * 3600_000 },
  { id: 'knucklebones', name: '抓子儿', desc: '抛起石子再接住，手稳就有得。', attempts: 4, chance: 0.7, reward: { currency: 'clovers', perHit: [1, 1] }, cooldownMs: 2 * 3600_000 },
  { id: 'guess_coin', name: '猜枚', desc: '猜铜钱是正是反，猜中就有彩头。', attempts: 1, chance: 0.5, reward: { currency: 'clovers', perHit: [3, 3] }, cooldownMs: 4 * 3600_000 },
  { id: 'chuiwan', name: '捶丸', desc: '一杆把丸打进窝，讲究个准头。', attempts: 3, chance: 0.3, reward: { currency: 'clovers', perHit: [2, 4] }, cooldownMs: 3 * 3600_000 },
  // —— 新增十一项 ——
  { id: 'doucao', name: '斗草', desc: '扯两片草茎对拉，谁的断谁输，赢家得落叶。', attempts: 3, chance: 0.5, reward: { currency: 'leaf', perHit: [1, 2] }, cooldownMs: 2 * 3600_000 },
  { id: 'shefu', name: '射覆', desc: '猜覆碗里藏的是什么，猜中有彩。', attempts: 1, chance: 0.4, reward: { currency: 'clovers', perHit: [2, 4] }, cooldownMs: 3 * 3600_000 },
  { id: 'jianzi', name: '踢毽子', desc: '毽子不落地，踢得越多越好。', attempts: 5, chance: 0.6, reward: { currency: 'clovers', perHit: [1, 1] }, cooldownMs: 2 * 3600_000 },
  { id: 'top', name: '抽陀螺', desc: '鞭子抽得转，转得久就有得。', attempts: 4, chance: 0.6, reward: { currency: 'clovers', perHit: [1, 1] }, cooldownMs: 2 * 3600_000 },
  { id: 'kite', name: '放风筝', desc: '风筝飞得高不高，全看风给不给面子。', attempts: 2, chance: 0.5, reward: { currency: 'clovers', perHit: [2, 3] }, cooldownMs: 3 * 3600_000 },
  { id: 'feihua', name: '飞花令', desc: '行酒令接飞花，接上就得好彩。', attempts: 3, chance: 0.5, reward: { currency: 'petal', perHit: [1, 2] }, cooldownMs: 2 * 3600_000, poem: true },
  { id: 'poetry', name: '诗社', desc: '和诗友对句，对上了有彩头。', attempts: 3, chance: 0.4, reward: { currency: 'clovers', perHit: [2, 3] }, cooldownMs: 3 * 3600_000, poem: true },
  { id: 'archery', name: '骑射', desc: '马上张弓，射中靶心就有得。', attempts: 3, chance: 0.35, reward: { currency: 'clovers', perHit: [2, 4] }, cooldownMs: 3 * 3600_000 },
  { id: 'curling', name: '冰壶', desc: '把壶滑进营垒，力道和准头都要。', attempts: 3, chance: 0.4, reward: { currency: 'clovers', perHit: [2, 3] }, cooldownMs: 3 * 3600_000 },
  { id: 'wrestling', name: '摔角', desc: '一对一较力，赢了有赏。', attempts: 1, chance: 0.45, reward: { currency: 'clovers', perHit: [3, 4] }, cooldownMs: 4 * 3600_000 },
  { id: 'flower_view', name: '赏花', desc: '春日看花，看得仔细能拾几片花瓣。', attempts: 3, chance: 0.6, reward: { currency: 'petal', perHit: [1, 1] }, cooldownMs: 2 * 3600_000 },
];

export const FOLK_GAMES_BY_ID = Object.fromEntries(FOLK_GAMES.map((g) => [g.id, g]));
