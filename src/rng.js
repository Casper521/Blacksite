export function createRng(seed) {
  let state = seed >>> 0 || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export const range = (rng, min, max) => min + rng() * (max - min);
export const intRange = (rng, min, max) => Math.floor(range(rng, min, max + 1));
