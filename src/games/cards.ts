import { shuffle } from "../utils/random.js";

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type Card = { rank: Rank; suit: Suit };

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return shuffle(deck);
}

export function draw(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) throw new Error("Deck exhausted");
  return card;
}

export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces += 1;
      total += 11;
    } else if (["K", "Q", "J"].includes(c.rank)) {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function formatCard(card: Card): string {
  return `\`${card.rank}${card.suit}\``;
}

export function formatHand(cards: Card[], hideFirst = false): string {
  if (hideFirst && cards.length) {
    const rest = cards.slice(1).map(formatCard).join(" ");
    return `\`??\` ${rest}`.trim();
  }
  return cards.map(formatCard).join(" ");
}

export function cardRankValue(card: Card): number {
  const map: Record<Rank, number> = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    "10": 10,
    "9": 9,
    "8": 8,
    "7": 7,
    "6": 6,
    "5": 5,
    "4": 4,
    "3": 3,
    "2": 2,
  };
  return map[card.rank];
}

/** High-Low uses Ace low (1) through King (13) — standard climb rules. */
export function hiLoRankValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (card.rank === "K") return 13;
  if (card.rank === "Q") return 12;
  if (card.rank === "J") return 11;
  return Number(card.rank);
}

export function countHiLoFavor(
  deck: readonly Card[],
  current: Card,
  pick: "high" | "low",
): number {
  const cur = hiLoRankValue(current);
  let n = 0;
  for (const c of deck) {
    const v = hiLoRankValue(c);
    if (pick === "high" ? v > cur : v < cur) n += 1;
  }
  return n;
}

/**
 * Pot multiplier for a correct High-Low guess.
 * True odds from the remaining deck, times 0.97 house edge — counting cannot create +EV.
 */
export function hiLoWinMultiplier(
  deckBeforeDraw: readonly Card[],
  current: Card,
  pick: "high" | "low",
): number {
  const favor = countHiLoFavor(deckBeforeDraw, current, pick);
  if (favor <= 0) return 1;
  const raw = (deckBeforeDraw.length / favor) * 0.97;
  return Math.min(13, Math.max(1.01, Math.floor(raw * 100) / 100));
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}
