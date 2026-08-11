import { randomInt as cryptoRandomInt } from "node:crypto";

/** Uniform float in [0, 1). Uses crypto for gambling fairness. */
export function randomFloat(): number {
  // 2^32 buckets — sufficient for casino-style games.
  return cryptoRandomInt(0, 2 ** 32) / 2 ** 32;
}

/** Integer in [0, max) */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`randomInt max must be positive integer, got ${max}`);
  }
  return cryptoRandomInt(0, max);
}

/** Integer in [min, max] inclusive */
export function randomIntInclusive(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error(`randomIntInclusive invalid range ${min}..${max}`);
  }
  return cryptoRandomInt(min, max + 1);
}

export function randomBool(probability = 0.5): boolean {
  return randomFloat() < probability;
}

export function randomChoice<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error("randomChoice: empty array");
  return items[randomInt(items.length)]!;
}

/** Fisher–Yates shuffle (mutates copy). */
export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function pickWeighted<T extends { weight?: number }>(items: readonly T[]): T {
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  if (total <= 0) return items[items.length - 1]!;
  let roll = randomFloat() * total;
  for (const item of items) {
    roll -= item.weight ?? 1;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

/** Fair coin: heads or tails with equal probability. */
export function flipCoin(): "heads" | "tails" {
  return randomBool(0.5) ? "heads" : "tails";
}
