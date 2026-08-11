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
  /** HMAC secret for crash point commitments (defaults to bot token). */
  crashCommitSecret:
    process.env.CRASH_COMMIT_SECRET?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    "greekbot-crash-commit-dev",
  /** Inferno Games (Hunger Games) pacing */
  hgEventDelayMs: intEnv("HG_EVENT_DELAY_MS", 7500),
  hgMinPlayers: intEnv("HG_MIN_PLAYERS", 4),
  hgMaxPlayers: intEnv("HG_MAX_PLAYERS", 24),
  /** House-funded Inferno Games winner prize (seeded into the pool). */
  hgDefaultWinPrize: intEnv("HG_DEFAULT_WIN_PRIZE", 250),
  /** Paid revive cost during a live Inferno Games round. */
  hgDefaultReviveCost: intEnv("HG_DEFAULT_REVIVE_COST", 50),
  /** Max paid revives per tribute per round. */
  hgDefaultMaxRevives: intEnv("HG_DEFAULT_MAX_REVIVES", 2),
  /** Seconds dead tributes have to buy a revive after each casualty report. */
  hgReviveWindowMs: intEnv("HG_REVIVE_WINDOW_MS", 20_000),
  bigWinThreshold: intEnv("BIG_WIN_THRESHOLD", 500),
  /**
   * Verified members role — can host Inferno Games / use arena tools.
   * Also treated as the default Arena Master role for the configured guild.
   */
  verifiedRoleId:
    process.env.VERIFIED_ROLE_ID?.trim() || "1500433834456645725",
  /**
   * When true, any guild member can open/start/setup Inferno Games (not just mods).
   * Public casino commands already use default_member_permissions=null.
   */
  publicArenaHost: (process.env.PUBLIC_ARENA_HOST ?? "true").toLowerCase() !== "false",
};
