/**
 * Full economy / leaderboard reset for GreekBot (Neon Postgres).
 * Keeps GuildSettings (big-win channel, arena master role).
 *
 * Run: npx tsx scripts/reset-economy.ts
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";

async function main() {
  const start = config.startingBalance;

  const before = {
    users: await prisma.user.count(),
    ledger: await prisma.ledgerEntry.count(),
    sessions: await prisma.gameSession.count(),
    arenas: await prisma.arenaGame.count(),
    tributes: await prisma.arenaTribute.count(),
    jackpot: (await prisma.jackpot.findUnique({ where: { id: 1 } }))?.balance ?? 0,
  };

  console.log("Before reset:", before);

  await prisma.$transaction(async (tx) => {
    // Child tables first (tributes cascade from ArenaGame, but be explicit)
    await tx.arenaTribute.deleteMany({});
    await tx.arenaGame.deleteMany({});
    await tx.gameSession.deleteMany({});
    await tx.ledgerEntry.deleteMany({});

    await tx.user.updateMany({
      data: {
        balance: start,
        frozen: false,
        dailyStreak: 0,
        lastDailyAt: null,
        wins: 0,
        losses: 0,
        ties: 0,
        biggestWin: 0,
        currentStreak: 0,
        bestStreak: 0,
      },
    });

    await tx.jackpot.upsert({
      where: { id: 1 },
      create: { id: 1, balance: 0 },
      update: { balance: 0 },
    });
  });

  const after = {
    users: await prisma.user.count(),
    balances: await prisma.user.groupBy({
      by: ["balance"],
      _count: true,
    }),
    ledger: await prisma.ledgerEntry.count(),
    sessions: await prisma.gameSession.count(),
    arenas: await prisma.arenaGame.count(),
    tributes: await prisma.arenaTribute.count(),
    jackpot: (await prisma.jackpot.findUnique({ where: { id: 1 } }))?.balance ?? 0,
    sampleStats: await prisma.user.findMany({
      take: 5,
      select: {
        username: true,
        balance: true,
        wins: true,
        losses: true,
        biggestWin: true,
        dailyStreak: true,
      },
    }),
  };

  console.log("After reset:", JSON.stringify(after, null, 2));
  console.log(`\nAll wallets set to ${start} HCC. Leaderboard / stats / games wiped.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
