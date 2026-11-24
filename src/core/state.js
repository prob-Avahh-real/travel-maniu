import { createRng } from './rng.js';
import { CFG, withConfig, HOUR } from './config.js';

export const SAVE_VERSION = 2;
/** The album is a *timeline*, not the collection: it is capped so long games stay small. */
export const ALBUM_CAP = 200;
export const HOME_ACTIVITIES = ['发呆', '看书', '磨墨', '写信', '理茶', '数铜钱草', '打盹'];

/**
 * Create a fresh game state. `cfg` overrides CFG (tests shorten timers).
 * The state object is a plain JSON-serializable tree — no functions, no DOM.
 */
export function createState({ seed = 1, now = 0, cfg } = {}) {
  const c = withConfig(cfg);
  const rng = createRng(seed);
  const state = {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    now,
    cfgOverrides: cfg || null,
    clovers: c.startClovers,
    patches: Array.from({ length: c.patchCount }, (_, i) => ({
      id: `p${i}`,
      readyAt: now,
    })),
    inventory: {},
    luggage: { snack: null, tool: null, charm: null },
    maniu: {
      name: '马牛',
      status: 'home', // home | away
      activity: rng.pick(HOME_ACTIVITIES),
      restUntil: now,
      leaveAt: null,
      trip: null,
      tripsDone: 0,
    },
    album: [], // recent trip timeline (capped) — [{ postcardId, spotId, at, rare, duplicate }]
    collection: {}, // postcardId -> { count, spotId, rare, firstAt } — bounded by the card count
    souvenirs: {}, // souvenirId -> count
    florals: { petal: 0, leaf: 0 }, // 落花飞叶：花瓣 / 落叶
    floralAt: now, // 下一次可拾花叶的时间
    fgames: {}, // 坊间游戏记录：gameId -> { played, hits, best, cooldownAt }
    poems: [], // 诗笺：已收集的诗句 id（按收集顺序）
    worldline: [], // 已激活的世界线节点 id
    travelers: [], // 遇见过的旅人 id（留言）
    decor: { shelf: null, sill: null, floor: null, wall: null }, // 每个槽位摆的特产 id
    visitors: {
      current: null, // { id, arriveAt, leaveAt, fed }
      nextAt: now + randRange(rng, c.visitorIntervalMs),
      friendship: {}, // visitorId -> int
    },
    titles: [],
    stats: {
      trips: 0,
      picked: 0,
      fourLeaf: 0,
      spotsVisited: 0,
      souvenirs: 0,
      friendGifts: 0,
      petalsPicked: 0,
      leavesPicked: 0,
      wished: 0,
      gamesPlayed: 0,
      poemsCollected: 0,
      freeTrips: 0,
      travelerGifts: 0,
      cloversEarned: 0,
      cloversSpent: 0,
    },
    log: [],
  };
  return state;
}

export function randRange(rng, [min, max]) {
  return typeof min === 'number' ? rng.int(min, max) : 0;
}

/** Derive the config actually used by a state (state carries its own overrides). */
export function cfgOf(state) {
  return withConfig({ ...(state.cfgOverrides || {}) });
}

export function serialize(state) {
  return JSON.stringify({ ...state, version: SAVE_VERSION });
}

/**
 * Parse a save. Returns { ok, state, reason }. Never throws.
 * Older versions are migrated forward; newer versions are rejected rather than
 * silently half-understood.
 */
export function deserialize(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'bad-json' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-object' };
  if (typeof raw.version !== 'number') return { ok: false, reason: 'no-version' };
  if (raw.version > SAVE_VERSION) return { ok: false, reason: `version-mismatch:${raw.version}` };
  raw = migrate(raw);
  if (!Array.isArray(raw.patches) || !raw.maniu || !raw.luggage) return { ok: false, reason: 'missing-fields' };
  const base = createState({ seed: raw.seed ?? 1, now: raw.now ?? 0, cfg: raw.cfgOverrides });
  const state = { ...base, ...raw };
  state.luggage = { snack: null, tool: null, charm: null, ...raw.luggage };
  state.maniu = { ...base.maniu, ...raw.maniu };
  state.visitors = { ...base.visitors, ...raw.visitors };
  state.stats = { ...base.stats, ...raw.stats };
  state.collection = { ...(raw.collection || {}) };
  state.decor = { ...(base.decor), ...(raw.decor || {}) };
  state.florals = { petal: 0, leaf: 0, ...(raw.florals || {}) };
  if (raw.floralAt == null) state.floralAt = state.now;
  state.fgames = { ...(raw.fgames || {}) };
  state.poems = [...(raw.poems || [])];
  state.worldline = [...(raw.worldline || [])];
  state.travelers = [...(raw.travelers || [])];
  return { ok: true, state };
}

/**
 * Migrations are applied in order until the payload reaches SAVE_VERSION.
 * v1 stored only the trip timeline, so the collection is rebuilt from it.
 */
const MIGRATIONS = {
  1: (s) => {
    const collection = {};
    for (const a of s.album || []) {
      const entry = collection[a.postcardId];
      if (entry) entry.count += 1;
      else collection[a.postcardId] = { count: 1, spotId: a.spotId, rare: Boolean(a.rare), firstAt: a.at ?? 0 };
    }
    return { ...s, version: 2, collection, album: (s.album || []).slice(-ALBUM_CAP) };
  },
};

function migrate(raw) {
  let out = raw;
  while (MIGRATIONS[out.version]) out = MIGRATIONS[out.version](out);
  return out;
}

/** rng is restored from state so replays stay deterministic across saves. */
export function rngOf(state) {
  const rng = createRng(state.seed);
  rng.state = state.rngState;
  return rng;
}

export function syncRng(state, rng) {
  state.rngState = rng.state;
}

/** Persist a state via an injectable storage adapter (getItem/setItem shaped). */
export function saveTo(storage, key, state) {
  storage.setItem(key, serialize(state));
  return true;
}

export function loadFrom(storage, key, cfg) {
  const text = storage.getItem(key);
  if (!text) return { ok: false, reason: 'empty' };
  return deserialize(text);
}

export const SAVE_KEY = 'travel-maniu/save/v1';
export const HOURS = HOUR;
