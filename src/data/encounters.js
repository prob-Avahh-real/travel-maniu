// 自然奇遇：马牛到了某个地区的景点，可能碰上一件小小的自然际遇。
// 键与 spot.region 对齐（山/水/城/荒）；新增一种际遇 = 在这里加一条，主循环不动。
// effect 契约（resolveTrip 读取）：
//   petals   拾得落花（花瓣，融入落花飞叶系统）
//   souvenir 多带一件该地的特产回来
//   clovers  多得铜钱草（amount 株）
//   rare     这一张是奇遇明信片

export const NATURE_ENCOUNTERS = {
  '水': { id: 'falling_flowers', name: '落花流水', chance: 0.12, effect: 'petals',  amount: 2, log: '溪边落花漂在流水上，顺手捞起几片。' },
  '山': { id: 'find_odd_stone',  name: '捡到奇石', chance: 0.12, effect: 'souvenir', log: '山道上捡到一块带纹路的石头。' },
  '城': { id: 'watch_opera',     name: '听了一段戏', chance: 0.12, effect: 'clovers',  amount: 3, log: '在戏台边听了半出，得了赏钱。' },
  '荒': { id: 'stargaze',        name: '夜观星象', chance: 0.12, effect: 'rare',    log: '夜里抬头，满天都是星。' },
};
