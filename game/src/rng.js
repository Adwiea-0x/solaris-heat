// rng.js — one seeded random generator for the whole game.
//
// Solaris Bay is generated, populated and staged from a single seed, so a
// screenshot scene (?seed=N) always builds the same city and the same cast.
// mulberry32 is tiny, fast and good enough for placement and behaviour jitter.

/** Create a generator from a 32-bit seed. Returns a function giving [0, 1). */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small toolbox over one generator: ranges, integers, picks, signs. */
export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** One element of the array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** -1 or 1. */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

/** Clamp value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angle from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}
