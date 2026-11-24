// 节气 / 季节：时间的纯函数（同天气，不消耗 rng、不写状态）。
// 用于渲染的四季配色；也可以作为以后加季节机制（如节气特产）的钩子。

export const TERM_NAMES = [
  '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑',
  '立秋', '处暑', '白露', '秋分', '寒露', '霜降',
  '立冬', '小雪', '大雪', '冬至', '小寒', '大寒',
];

// 立春大约在一年第 35 天，之后每 15.218 天换一个节气（近似，够渲染用）。
const LICHUN_DAY = 35;
const TERM_LENGTH = 365.2422 / 24;

export function dayOfYear(now) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

export function solarTermIndex(now) {
  const doy = dayOfYear(now);
  const idx = Math.floor((doy - LICHUN_DAY) / TERM_LENGTH);
  return ((idx % 24) + 24) % 24;
}

export function solarTermName(now) {
  return TERM_NAMES[solarTermIndex(now)];
}

/** 春 / 夏 / 秋 / 冬 四个季节的主色，用于明信片与房间的底色。 */
export const SEASON_ACCENT = ['#7c9a52', '#3c7a5c', '#c9a34e', '#5b7f96'];
export const SEASON_PAPER = ['#f6f2df', '#f2f5e9', '#f7f0dd', '#eef2f4'];

export function seasonIndex(now) {
  return Math.floor(solarTermIndex(now) / 6); // 0..3
}

export function seasonAccent(now) {
  return SEASON_ACCENT[seasonIndex(now)];
}

export function seasonPaper(now) {
  return SEASON_PAPER[seasonIndex(now)];
}

export function seasonName(now) {
  return ['春', '夏', '秋', '冬'][seasonIndex(now)];
}
