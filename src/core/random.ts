/** Small deterministic PRNG (mulberry32) so scenarios are reproducible from a seed. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((s, i) => s + weight(i), 0);
    let r = this.next() * total;
    for (const i of items) {
      r -= weight(i);
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Exponentially distributed value with the given mean (for Poisson arrivals). */
  exponential(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }
}
