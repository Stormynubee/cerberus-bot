/** Inferno / Greek theme tokens for GreekBot */
export const theme = {
  name: "GreekBot",
  currency: "HellCatCoins",
  currencyShort: "HCC",
  colors: {
    inferno: 0xb91c1c,
    gold: 0xf59e0b,
    success: 0x16a34a,
    danger: 0xdc2626,
    muted: 0x44403c,
    night: 0x1c1917,
  },
  emojis: {
    coin: "🪙",
    fire: "🔥",
    skull: "💀",
    trophy: "🏆",
    swords: "⚔️",
    cards: "🃏",
    spin: "🌀",
  },
} as const;

export function formatCoins(amount: number): string {
  return `${amount.toLocaleString("en-US")} ${theme.currencyShort}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
