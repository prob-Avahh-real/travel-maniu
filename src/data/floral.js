// 落花飞叶：四季里可拾的花与叶，以及把花叶投进流水的许愿。
// season 键与 src/core/season.js 的 seasonIndex 对齐：0 春 / 2 秋（夏冬无花叶）。
// 新增一种花叶 = 在这里加一条（换季节键 + 配置），主循环不动。

export const FLORAL = {
  0: { id: 'petal', name: '花瓣', perPick: [1, 2], regrowMs: 6 * 3600_000 },
  2: { id: 'leaf', name: '落叶', perPick: [1, 2], regrowMs: 6 * 3600_000 },
};

export const WISH_COST = 3;          // 许愿要投 3 片花叶
export const WISH_CLOVERS = [2, 5];  // 许愿换 2-5 株铜钱草
