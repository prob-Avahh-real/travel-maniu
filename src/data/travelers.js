// 旅人：在路上可能遇见的同路人（其他「玩家」）。相遇留下一条留言，转进世界线。
// 重逢（路上再见）时可能托马牛捎回一份小礼：gift = { currency: clovers|petal|leaf, amount: [min,max], line }。
// 新增一位旅人 = 在这里加一条，主循环不动。

export const TRAVELERS = [
  { id: 'caravan', name: '赶集的商队', note: '「东边的盐，西边的茶，都在这条路上。」', gift: { currency: 'clovers', amount: [2, 5], line: '「这点脚力钱，拿去路上买茶喝。」' } },
  { id: 'monk', name: '游方僧', note: '「山门外的钟声，替我问候你。」', gift: { currency: 'clovers', amount: [1, 3], line: '「化缘的余钱，赠予有缘人。」' } },
  { id: 'flower_girl', name: '卖花女', note: '「春来花开，带一枝上路吧。」', gift: { currency: 'petal', amount: [1, 3], line: '「一枝春花，送你上路。」' } },
  { id: 'guard', name: '走镖的镖师', note: '「此路尚安，放心前行。」', gift: { currency: 'clovers', amount: [2, 4], line: '「路上拾得的，留着无用。」' } },
  { id: 'tea_girl', name: '采茶女', note: '「新茶刚焙好，趁热喝一口。」', gift: { currency: 'clovers', amount: [2, 4], line: '「新茶换的钱，分你一半。」' } },
  { id: 'scholar', name: '赶考的书生', note: '「他日若得功名，回来请你喝茶。」', gift: { currency: 'clovers', amount: [1, 3], line: '「盘缠尚足，这一点你收下。」' } },
  { id: 'washer_girl', name: '浣纱女', note: '「溪水凉，慢些走。」', gift: { currency: 'petal', amount: [1, 2], line: '「溪边的花，顺手摘的。」' } },
  { id: 'herbalist', name: '采药人', note: '「崖上的草还嫩，别踩着了。」', gift: { currency: 'leaf', amount: [1, 3], line: '「几片药叶，泡水解乏。」' } },
  { id: 'peddler_woman', name: '走街的货娘', note: '「针头线脑、胭脂水粉，样样都有。」', gift: { currency: 'clovers', amount: [1, 4], line: '「小买卖人的一点心意。」' } },
  { id: 'postman', name: '送信的邮差', note: '「你的信，我顺路捎一段。」', gift: { currency: 'clovers', amount: [1, 3], line: '「顺路捎来的，不必言谢。」' } },
  { id: 'embroidery_woman', name: '绣娘', note: '「这一方帕子，绣的是你家乡的花。」', gift: { currency: 'petal', amount: [1, 2], line: '「帕子上剩的花样，送你。」' } },
  { id: 'storyteller_woman', name: '弹词女先生', note: '「且听我唱一段，解解路上乏。」', gift: { currency: 'leaf', amount: [1, 2], line: '「一片红叶，权当书柬。」' } },
];

export const TRAVELERS_BY_ID = Object.fromEntries(TRAVELERS.map((t) => [t.id, t]));
