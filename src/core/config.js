// Tunable defaults for the whole game. Every value here is meant to be
// overridable — tests and front-ends pass partial overrides into createState/engine.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const CFG = {
  // Economy
  startClovers: 12,
  patchCount: 8,
  cloverRegrowMs: 2 * HOUR,
  cloverPerPick: [1, 3],
  fourLeafChance: 0.06,
  fourLeafValue: 5,

  // Rhythm
  departDelayMs: [10 * MIN, 40 * MIN], // 马牛 decides to leave on its own
  minRestMs: 20 * MIN, // after a trip it rests before packing again
  maxRestMs: 60 * MIN,
  visitorIntervalMs: [3 * HOUR, 9 * HOUR],
  visitorStayMs: 45 * MIN,

  // Limits
  logLimit: 60,
  maxCatchupMs: 7 * DAY,
  maxAlbumNote: 200,
};

export function withConfig(overrides) {
  return { ...CFG, ...(overrides || {}) };
}
