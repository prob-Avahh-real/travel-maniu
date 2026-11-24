// 食物 / 道具 / 护身符。数据即配置：新增一种东西不用改引擎。
// effect 字段是引擎读取的契约；未知字段会被安全忽略。

export const SNACKS = [
  {
    id: 'mantou', name: '馒头', cost: 4, tier: 1, hours: 2,
    desc: '朴素但管饱，走不远也饿不着。',
  },
  {
    id: 'bamboo_rice', name: '竹筒饭', cost: 9, tier: 2, hours: 4,
    desc: '带着竹叶的清苦香，能走到山那边。',
  },
  {
    id: 'chestnut_cake', name: '栗子糕', cost: 16, tier: 3, hours: 7,
    desc: '甜得扎实，适合长途。',
  },
  {
    id: 'matsutake', name: '松茸饭', cost: 28, tier: 4, hours: 11,
    desc: '一年只吃得上几次，吃完就想去看很远的地方。',
  },
];

export const TOOLS = [
  { id: 'straw_hat', name: '竹编斗笠', cost: 10, reusable: true, effect: { rainProof: true }, desc: '下雨也能慢慢走。' },
  { id: 'paper_lantern', name: '纸灯笼', cost: 14, reusable: true, effect: { tierBonus: 1 }, desc: '夜里也敢往远处去。' },
  { id: 'compass', name: '旧罗盘', cost: 20, reusable: true, effect: { rareChance: 0.08 }, desc: '指针有点歪，但总能碰见怪东西。' },
  { id: 'satchel', name: '旧挎包', cost: 24, reusable: true, effect: { extraSouvenir: 1 }, desc: '能多塞一件特产回来。' },
];

export const CHARMS = [
  { id: 'coin_charm', name: '铜钱草护符', cost: 8, reusable: false, effect: { luck: 1 }, desc: '夹着一片铜钱草，写着「平安」。' },
  { id: 'bronze_bell', name: '铜铃', cost: 12, reusable: false, effect: { friendChance: 0.25 }, desc: '走起来叮当响，容易招来同伴。' },
  { id: 'peace_talisman', name: '平安符', cost: 18, reusable: false, effect: { rareChance: 0.06, luck: 1 }, desc: '红纸金字，折角处已经磨白。' },
];

export const ALL_ITEMS = [...SNACKS, ...TOOLS, ...CHARMS];
export const ITEMS_BY_ID = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

export const KIND = { SNACK: 'snack', TOOL: 'tool', CHARM: 'charm' };

/** Which luggage slot an item belongs to, or null if it is not equippable. */
export function slotOf(itemId) {
  if (SNACKS.some((s) => s.id === itemId)) return KIND.SNACK;
  if (TOOLS.some((t) => t.id === itemId)) return KIND.TOOL;
  if (CHARMS.some((c) => c.id === itemId)) return KIND.CHARM;
  return null;
}

export const SHOP = [
  { kind: KIND.SNACK, items: SNACKS },
  { kind: KIND.TOOL, items: TOOLS },
  { kind: KIND.CHARM, items: CHARMS },
];

export function snacksOfTier(tier) { return SNACKS.filter((s) => s.tier === tier); }
