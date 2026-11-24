// Deterministic, serializable RNG (mulberry32).
// Pure logic — no DOM, no globals. State is a single uint32 so saves stay tiny.

export function createRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const rng = {
    get state() { return s >>> 0; },
    set state(v) { s = (v >>> 0) || 1; },
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    float(min, max) { return min + rng.next() * (max - min); },
    int(min, max) { return min + Math.floor(rng.next() * (max - min + 1)); },
    chance(p) { return rng.next() < p; },
    pick(arr) { return arr.length ? arr[Math.floor(rng.next() * arr.length)] : undefined; },
    /** entries: [[value, weight], ...] */
    weighted(entries) {
      if (!entries.length) return undefined;
      const total = entries.reduce((a, e) => a + e[1], 0);
      if (!(total > 0)) return entries[0][0];
      let r = rng.next() * total;
      for (const [value, weight] of entries) {
        r -= weight;
        if (r < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    /** Weighted pick over objects using a key accessor. */
    weightedBy(arr, weightOf) {
      const entries = arr.map((v) => [v, Math.max(0, weightOf(v))]);
      return rng.weighted(entries);
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}
