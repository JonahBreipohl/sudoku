// Seeded PRNG. Engine code must never call Math.random: puzzles and the watch
// puzzle have to be reproducible from a seed.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). n must be a positive safe integer below 2^32. */
  int(n: number): number;
  /** Returns a shuffled copy (Fisher-Yates); the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * Seed hash: xmur3 (a murmur3-style string mixer) over String(seed). Numbers are
 * hashed through their decimal string, so 42 and "42" give the same sequence.
 * Each call to the returned function yields the next well-mixed 32-bit word;
 * we draw four of them to fill the sfc32 state.
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function createRng(seed: number | string): Rng {
  const word = xmur3(String(seed));
  let a = word();
  let b = word();
  let c = word();
  let d = word();

  // sfc32: small, fast, passes PractRand; 128-bit state.
  const nextU32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  // Warm up so similar seeds diverge immediately.
  for (let i = 0; i < 12; i++) nextU32();

  const next = (): number => nextU32() / 4294967296;

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n < 1 || n > 4294967296) {
      throw new RangeError(`int(n) needs an integer in [1, 2^32], got ${n}`);
    }
    // Rejection sampling avoids modulo bias.
    const limit = 4294967296 - (4294967296 % n);
    let x = nextU32();
    while (x >= limit) x = nextU32();
    return x % n;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  };

  return { next, int, shuffle };
}
