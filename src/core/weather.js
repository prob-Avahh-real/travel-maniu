// 天气：时间的纯函数（可预测、可重放），不消耗 rng、不写状态。
// 目的：让「竹编斗笠」这类道具真正有用 —— 雨天没带斗笠会提前折返。

import { HOUR } from './config.js';

export const WEATHER_KINDS = ['clear', 'wind', 'rain'];
export const WEATHER_LABEL = { clear: '晴', wind: '风', rain: '雨' };
export const WEATHER_BUCKET_MS = 6 * HOUR;

/** Deterministic hash → weather for the 6-hour bucket containing `now`. */
export function weatherAt(now) {
  const bucket = Math.floor(now / WEATHER_BUCKET_MS);
  let h = (bucket ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const r = h / 4294967296;
  if (r < 0.25) return 'rain';
  if (r < 0.45) return 'wind';
  return 'clear';
}

export function weatherLabel(now) {
  return WEATHER_LABEL[weatherAt(now)];
}

/**
 * The end of the current run of consecutive rainy buckets. If it is not raining
 * right now, returns `now` (there is nothing to shelter from).
 */
export function rainUntil(now) {
  if (weatherAt(now) !== 'rain') return now;
  let t = Math.floor(now / WEATHER_BUCKET_MS) * WEATHER_BUCKET_MS;
  while (weatherAt(t) === 'rain') t += WEATHER_BUCKET_MS;
  return t;
}

/** How far a trip gets cut short by bad weather (1 = no effect). */
export const RAIN_PENALTY = 0.72;
export const WIND_BONUS = 1.08;

export function weatherFactor(now, rainProof = false) {
  const w = weatherAt(now);
  if (w === 'rain') return rainProof ? 1 : RAIN_PENALTY;
  if (w === 'wind') return WIND_BONUS;
  return 1;
}
