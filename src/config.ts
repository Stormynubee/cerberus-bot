import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  token: () => required("DISCORD_TOKEN"),
  clientId: () => required("DISCORD_CLIENT_ID"),
  guildId: process.env.DISCORD_GUILD_ID || undefined,
  redisUrl: process.env.REDIS_URL || undefined,
  startingBalance: intEnv("STARTING_BALANCE", 1000),
  dailyReward: intEnv("DAILY_REWARD", 250),
  minBet: intEnv("MIN_BET", 10),
  maxBet: intEnv("MAX_BET", 25_000),
  challengeTtlSeconds: intEnv("CHALLENGE_TTL_SECONDS", 60),
  /** Soft house rake on PvE wins (percent) — feeds progressive jackpot */
  houseRakePercent: 2,
  /** Inferno Games (Hunger Games) pacing */
  hgEventDelayMs: intEnv("HG_EVENT_DELAY_MS", 7500),
  hgMinPlayers: intEnv("HG_MIN_PLAYERS", 4),
  hgMaxPlayers: intEnv("HG_MAX_PLAYERS", 24),
  bigWinThreshold: intEnv("BIG_WIN_THRESHOLD", 500),
};
