import { randomChoice } from "../utils/random.js";

export const SLOT_SYMBOLS = ["🏛️", "⚔️", "🐺", "🔥", "🪙", "💀", "🧿"] as const;

export const SLOT_PAY: Record<string, number> = {
  "🏛️": 20,
  "⚔️": 14,
  "🐺": 10,
  "🔥": 8,
  "🪙": 6,
  "💀": 4,
  "🧿": 3,
};

export function slotsSpin(): [string, string, string] {
  return [
    randomChoice(SLOT_SYMBOLS),
    randomChoice(SLOT_SYMBOLS),
    randomChoice(SLOT_SYMBOLS),
  ];
}

export function slotsPayout(reels: [string, string, string], bet: number): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return bet * (SLOT_PAY[a] ?? 2);
  if (a === b || b === c || a === c) return bet * 2;
  return 0;
}

/** Exact gross RTP for independent 7-symbol reels (before win rake). */
export function slotsGrossRtp(): number {
  const n = SLOT_SYMBOLS.length;
  const total = n ** 3;
  let triplePay = 0;
  for (const s of SLOT_SYMBOLS) triplePay += SLOT_PAY[s] ?? 2;
  // Exactly one pair (incl. non-adjacent), not three of a kind: 126 of 343
  const exactPairs = n * 3 * (n - 1);
  return (triplePay + exactPairs * 2) / total;
}
