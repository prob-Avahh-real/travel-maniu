// 目的地（风景点）。每个点带明信片与特产；tier 决定需要多好的干粮才走得到。
// unlockAfter: 只有去过某个点之后，这个点才进入候选池 —— 天然的探索链。

export const SPOTS = [
  {
    id: 'houshan', region: '山', name: '后山', tier: 1, weight: 5, dwellHours: 1,
    unlockAfter: [],
    flavour: '翻过一道矮墙就是。',
    postcards: [
      { id: 'houshan_a', title: '矮墙', note: '墙头坐着一只打盹的猫。' },
      { id: 'houshan_b', title: '野栗', note: '口袋里塞满了，掉了一路。' },
    ],
    souvenirs: [{ id: 'wild_chestnut', name: '野栗子' }, { id: 'gray_feather', name: '灰羽毛' }, { id: 'pine_cone', name: '松果' }],
  },
  {
    id: 'reed_marsh', region: '水', name: '芦苇荡', tier: 1, weight: 4, dwellHours: 1,
    unlockAfter: [],
    flavour: '风一过，整片都在响。',
    postcards: [
      { id: 'reed_marsh_a', title: '芦花', note: '像下了雪，其实是下午三点。' },
      { id: 'reed_marsh_b', title: '白鹭', note: '站了很久，一动不动。' },
    ],
    souvenirs: [{ id: 'reed_stem', name: '芦苇杆' }, { id: 'white_shell', name: '白螺壳' }, { id: 'crayfish', name: '小虾壳' }],
  },
  {
    id: 'stone_bridge', region: '城', name: '石桥村', tier: 1, weight: 3, dwellHours: 2,
    unlockAfter: [],
    flavour: '桥是明代的，卖豆腐的是今天的。',
    postcards: [
      { id: 'stone_bridge_a', title: '拱桥', note: '倒影被人挑水的木桶打散了。' },
      { id: 'stone_bridge_b', title: '豆腐摊', note: '老板娘多给了一块。' },
    ],
    souvenirs: [{ id: 'stone_chip', name: '桥石碎' }, { id: 'tofu_card', name: '豆腐模子印' }, { id: 'brick_teacup', name: '粗瓷茶碗' }],
  },
  {
    id: 'creek_town', region: '水', name: '溪口镇', tier: 2, weight: 4, dwellHours: 3,
    unlockAfter: ['stone_bridge'],
    flavour: '水声从早到晚没停过。',
    postcards: [
      { id: 'creek_town_a', title: '溪边洗衣', note: '木槌声一下一下。' },
      { id: 'creek_town_b', title: '灯笼铺', note: '老板在给灯笼描红。' },
    ],
    souvenirs: [{ id: 'dyed_cloth', name: '蓝印花布' }, { id: 'bamboo_whistle', name: '竹哨' }],
  },
  {
    id: 'old_tea_hill', region: '山', name: '老茶山', tier: 2, weight: 4, dwellHours: 3,
    unlockAfter: ['houshan'],
    flavour: '整个山坳都是青草被掐断的味道。',
    postcards: [
      { id: 'old_tea_hill_a', title: '采茶', note: '指腹上全是绿的。' },
      { id: 'old_tea_hill_b', title: '炒锅', note: '隔着三步就烫脸。' },
    ],
    souvenirs: [{ id: 'tea_brick', name: '茶砖' }, { id: 'bamboo_basket', name: '小茶篓' }],
  },
  {
    id: 'terraces', region: '山', name: '云中梯田', tier: 2, weight: 3, dwellHours: 4,
    unlockAfter: ['old_tea_hill'],
    flavour: '云在脚底下，田在云上头。',
    postcards: [
      { id: 'terraces_a', title: '晨雾', note: '一层一层像是没画完。' },
      { id: 'terraces_b', title: '耕牛', note: '它回头看了我一眼。' },
    ],
    souvenirs: [{ id: 'rice_ear', name: '稻穗' }, { id: 'mud_figure', name: '泥捏小牛' }],
  },
  {
    id: 'old_pier', region: '水', name: '古镇码头', tier: 3, weight: 4, dwellHours: 5,
    unlockAfter: ['creek_town'],
    flavour: '船票上还印着上个月的日期。',
    postcards: [
      { id: 'old_pier_a', title: '夜航船', note: '船头挂着一盏灯。' },
      { id: 'old_pier_b', title: '鱼市', note: '秤杆翘得老高。' },
    ],
    souvenirs: [{ id: 'brass_coin', name: '旧铜钱' }, { id: 'fish_fossil', name: '鱼骨化石' }],
  },
  {
    id: 'bamboo_temple', region: '城', name: '竹林寺', tier: 3, weight: 3, dwellHours: 5,
    unlockAfter: ['creek_town'],
    flavour: '钟声一响，竹子也跟着抖。',
    postcards: [
      { id: 'bamboo_temple_a', title: '山门', note: '石阶被踩出了一道凹。' },
      { id: 'bamboo_temple_b', title: '抄经', note: '墨滴在袖口上。' },
    ],
    souvenirs: [{ id: 'incense_ash', name: '香灰袋' }, { id: 'wooden_fish', name: '小木鱼' }],
  },
  {
    id: 'lighthouse', region: '水', name: '东海灯塔', tier: 3, weight: 3, dwellHours: 6,
    unlockAfter: ['old_pier'],
    flavour: '浪打在礁石上，声音像有人在敲。',
    postcards: [
      { id: 'lighthouse_a', title: '塔身', note: '白漆掉了一角。' },
      { id: 'lighthouse_b', title: '守塔人', note: '他煮了两碗面。' },
    ],
    souvenirs: [{ id: 'lamp_oil', name: '灯油' }, { id: 'drift_glass', name: '海玻璃' }],
  },
  {
    id: 'salt_lake', region: '荒', name: '茶卡盐湖', tier: 3, weight: 2, dwellHours: 6,
    unlockAfter: ['terraces'],
    flavour: '白得晃眼，影子长得不像自己。',
    postcards: [
      { id: 'salt_lake_a', title: '盐堆', note: '像一堆没人吃的雪。' },
      { id: 'salt_lake_b', title: '倒影', note: '天和地在那边接上了。' },
    ],
    souvenirs: [{ id: 'salt_crystal', name: '盐晶' }, { id: 'hard_crust', name: '湖盐饼' }],
  },
  {
    id: 'desert_post', region: '荒', name: '大漠驿站', tier: 4, weight: 3, dwellHours: 8,
    unlockAfter: ['salt_lake'],
    flavour: '驿站的门帘上写着「歇脚」。',
    postcards: [
      { id: 'desert_post_a', title: '骆驼队', note: '铃铛一路响到很远。' },
      { id: 'desert_post_b', title: '落日', note: '整个地平线都是橙的。' },
    ],
    souvenirs: [{ id: 'camel_bell', name: '驼铃' }, { id: 'desert_rose', name: '沙漠玫瑰石' }],
  },
  {
    id: 'snow_pass', region: '山', name: '雪山垭口', tier: 4, weight: 2, dwellHours: 9,
    unlockAfter: ['terraces'],
    flavour: '风把经幡吹得笔直。',
    postcards: [
      { id: 'snow_pass_a', title: '垭口', note: '呼吸化成一小团白。' },
      { id: 'snow_pass_b', title: '经幡', note: '红的蓝的，全都在抖。' },
    ],
    souvenirs: [{ id: 'butter_tea', name: '酥油茶砖' }, { id: 'prayer_stone', name: '玛尼石' }],
  },
  {
    id: 'aurora_field', region: '荒', name: '漠河极光', tier: 4, weight: 1, dwellHours: 11,
    unlockAfter: ['snow_pass'],
    flavour: '冷到手抖，还是想多站一会儿。',
    postcards: [
      { id: 'aurora_field_a', title: '极光', note: '像有人在北边甩了一块绸。' },
      { id: 'aurora_field_b', title: '白桦林', note: '树影冻在地上，白得发亮。' },
    ],
    souvenirs: [{ id: 'ice_shard', name: '冰棱' }, { id: 'star_sand', name: '白桦皮' }],
  },
  {
    id: 'islands', region: '水', name: '舟山群岛', tier: 4, weight: 2, dwellHours: 9,
    unlockAfter: ['lighthouse'],
    flavour: '渔汛一到，码头挤满了船。',
    postcards: [
      { id: 'islands_a', title: '渔港', note: '船挨着船，桅杆像一片林子。' },
      { id: 'islands_b', title: '晒网', note: '渔网摊在岸边，晒得发白。' },
    ],
    souvenirs: [{ id: 'coral_bit', name: '海螺' }, { id: 'sail_patch', name: '渔网线' }],
  },
  {
    id: 'ginkgo', region: '城', name: '千岁银杏', tier: 3, weight: 2, dwellHours: 6,
    unlockAfter: ['bamboo_temple'],
    flavour: '叶子黄的那几天，树下站满了人。',
    postcards: [
      { id: 'ginkgo_a', title: '落叶', note: '铺了一尺厚。' },
      { id: 'ginkgo_b', title: '树皮', note: '刻满了名字，最早的是清朝。' },
    ],
    souvenirs: [{ id: 'ginkgo_leaf', name: '银杏叶' }, { id: 'wish_ribbon', name: '许愿红布条' }],
  },
  {
    id: 'star_camp', region: '荒', name: '星河营地', tier: 4, weight: 1, dwellHours: 12,
    unlockAfter: ['desert_post', 'aurora_field'],
    flavour: '银河像被谁从山口倒了下来。',
    postcards: [
      { id: 'star_camp_a', title: '帐篷', note: '灯是暖黄的。' },
      { id: 'star_camp_b', title: '银河', note: '曝光久一点，星星就多了。' },
    ],
    souvenirs: [{ id: 'star_chart', name: '手绘星图' }, { id: 'camp_ash', name: '营火灰' }],
  },
];

export const REGIONS = ['山', '水', '城', '荒'];
export const SPOTS_BY_ID = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
export function spotsOfRegion(region) {
  return SPOTS.filter((s) => s.region === region);
}

/**
 * 节气特产：某个地点只有在对应季节里才会带回来的特产。
 * season: 0春 / 1夏 / 2秋 / 3冬（与 src/core/season.js 的 seasonIndex 对齐）。
 * 新增一种季节特产 = 在这里加一条，引擎与图鉴自动跟着变。
 */
export const SEASONAL = {
  old_tea_hill: [{ season: 0, chance: 0.5, souvenir: { id: 'mingqian_tea', name: '明前茶' } }],
  creek_town: [{ season: 0, chance: 0.4, souvenir: { id: 'qingtuan', name: '青团' } }],
  houshan: [{ season: 2, chance: 0.5, souvenir: { id: 'wild_persimmon', name: '野柿子' } }],
  terraces: [{ season: 2, chance: 0.4, souvenir: { id: 'new_rice', name: '新米' } }],
  islands: [{ season: 2, chance: 0.4, souvenir: { id: 'swimming_crab', name: '梭子蟹' } }],
};
export const SEASONAL_SOUVENIRS_BY_ID = Object.fromEntries(
  Object.entries(SEASONAL).flatMap(([spotId, entries]) =>
    entries.map((e) => [e.souvenir.id, { ...e.souvenir, spotId, season: e.season, seasonal: true }]),
  ),
);

export const POSTCARDS_BY_ID = Object.fromEntries(
  SPOTS.flatMap((s) => s.postcards.map((p) => ({ ...p, spotId: s.id }))).map((p) => [p.id, p]),
);
export const SOUVENIRS_BY_ID = Object.fromEntries([
  ...SPOTS.flatMap((s) => s.souvenirs.map((v) => ({ ...v, spotId: s.id }))).map((v) => [v.id, v]),
  ...Object.entries(SEASONAL_SOUVENIRS_BY_ID),
]);
export const TOTAL_POSTCARDS = SPOTS.reduce((a, s) => a + s.postcards.length, 0);
export const TOTAL_SOUVENIRS = SPOTS.reduce((a, s) => a + s.souvenirs.length, 0) + Object.keys(SEASONAL_SOUVENIRS_BY_ID).length;

/** Postcards can be "rare" — same spot, a different moment. */
export function rarePostcardFor(spot) {
  return { id: `${spot.id}_rare`, title: `${spot.name}·奇遇`, note: '这一张不知道怎么拍到的。', rare: true, spotId: spot.id };
}
export const RARE_POSTCARD_IDS = SPOTS.map((s) => `${s.id}_rare`);
