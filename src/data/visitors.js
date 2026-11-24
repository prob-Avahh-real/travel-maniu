// 访客：马牛不在家时上门的朋友。喂它喜欢的东西，交情就涨。
// favours 必须是商店里真买得到的干粮（SNACKS）——这样「喂」才真的喂得进去。

export const VISITORS = [
  {
    id: 'snail', name: '蜗牛', favours: ['bamboo_rice'],
    gift: { id: 'snail_shell', name: '蜗牛壳' }, rareGift: { id: 'silver_trail', name: '银线' },
    lines: ['……（它已经待了很久）', '它把触角缩了回去。'],
    interactions: [{ with: 'turtle', minFriendship: 2, line: '蜗牛朝乌龟来过的方向，慢慢探出触角。' }],
    companion: { gameId: 'knucklebones', bonus: 0.15 },
  },
  {
    id: 'bee', name: '蜜蜂', favours: ['chestnut_cake'],
    gift: { id: 'wax_bit', name: '蜂蜡' }, rareGift: { id: 'honey_jar', name: '小罐蜜' },
    lines: ['嗡嗡地绕了两圈。', '它在你手心停了一下。'],
    interactions: [{ with: 'snail', minFriendship: 2, line: '蜜蜂在蜗牛留下的银线上嗡嗡绕了一圈。' }],
    companion: { gameId: 'guess_coin', bonus: 0.2 },
  },
  {
    id: 'turtle', name: '乌龟', favours: ['mantou'],
    gift: { id: 'river_stone', name: '河卵石' }, rareGift: { id: 'old_coin', name: '古钱' },
    lines: ['它慢慢地挪到你脚边。', '它把头伸出来又缩回去。'],
    interactions: [{ with: 'crane', minFriendship: 2, line: '乌龟绕着白鹤站过的地方，不紧不慢地走。' }],
    companion: { gameId: 'chuiwan', bonus: 0.2 },
  },
  {
    id: 'crane', name: '白鹤', favours: ['matsutake'],
    gift: { id: 'crane_feather', name: '鹤羽' }, rareGift: { id: 'jade_bead', name: '玉珠' },
    lines: ['它立在篱笆外，不动。', '它低头理了理翅膀。'],
    interactions: [{ with: 'snail', minFriendship: 2, line: '白鹤低头看蜗牛留下的银线，轻轻颔首。' }],
    companion: { gameId: 'archery', bonus: 0.2 },
  },
];

export const VISITORS_BY_ID = Object.fromEntries(VISITORS.map((v) => [v.id, v]));
