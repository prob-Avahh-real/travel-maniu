// 诗社 / 飞花令里能对出的古诗句（《诗笺》收集）。
// 新增一句 = 在这里加一条，主循环不动。

export const POEMS = [
  { id: 'jingyesi', title: '静夜思', author: '李白', line: '床前明月光，疑是地上霜。' },
  { id: 'lushan', title: '望庐山瀑布', author: '李白', line: '飞流直下三千尺，疑是银河落九天。' },
  { id: 'chunwang', title: '春望', author: '杜甫', line: '感时花溅泪，恨别鸟惊心。' },
  { id: 'shanjv', title: '山居秋暝', author: '王维', line: '空山新雨后，天气晚来秋。' },
  { id: 'xiangsi', title: '相思', author: '王维', line: '红豆生南国，春来发几枝。' },
  { id: 'chunxiao', title: '春晓', author: '孟浩然', line: '春眠不觉晓，处处闻啼鸟。' },
  { id: 'guyuancaosong', title: '赋得古原草送别', author: '白居易', line: '野火烧不尽，春风吹又生。' },
  { id: 'shuidiaogetou', title: '水调歌头', author: '苏轼', line: '但愿人长久，千里共婵娟。' },
  { id: 'tixilinsi', title: '题西林壁', author: '苏轼', line: '不识庐山真面目，只缘身在此山中。' },
  { id: 'guanquelou', title: '登鹳雀楼', author: '王之涣', line: '白日依山尽，黄河入海流。' },
  { id: 'rumengling', title: '如梦令', author: '李清照', line: '知否，知否？应是绿肥红瘦。' },
  { id: 'shanxing', title: '山行', author: '杜牧', line: '停车坐爱枫林晚，霜叶红于二月花。' },
  { id: 'meihua', title: '梅花', author: '王安石', line: '遥知不是雪，为有暗香来。' },
  { id: 'youshanxixun', title: '游山西村', author: '陆游', line: '山重水复疑无路，柳暗花明又一村。' },
  { id: 'chunri', title: '春日', author: '朱熹', line: '等闲识得东风面，万紫千红总是春。' },
];

export const POEMS_BY_ID = Object.fromEntries(POEMS.map((p) => [p.id, p]));
