/**
 * Full economy / leaderboard reset for GreekBot (Neon Postgres).
 * Keeps GuildSettings (big-win channel, arena master role).
 * Deletes smoke/test ghost accounts so they don't clog /leaderboard.
 *
 * Run: npx tsx scripts/reset-economy.ts
 */
import "dotenv/config";
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";

const TEST_USERNAMES = ["ClaimTest", "SmokeA", "SmokeB"];

function isTestUser(u: { id: string; username: string | null }): boolean {
  if (u.username && TEST_USERNAMES.includes(u.username)) return true;
  if (/^(smoke_|claim_)/i.test(u.id)) return true;
  return false;
}

async function main() {
  const start = config.startingBalance;

  const allUsers = await prisma.user.findMany({ select: { id: true, username: true } });
  const testIds = allUsers.filter(isTestUser).map((u) => u.id);

  const before = {
    users: allUsers.length,
    testUsers: testIds.length,
    ledger: await prisma.ledgerEntry.count(),
    sessions: await prisma.gameSession.count(),
    arenas: await prisma.arenaGame.count(),
    tributes: await prisma.arenaTribute.count(),
    jackpot: (await prisma.jackpot.findUnique({ where: { id: 1 } }))?.balance ?? 0,
  };

  console.log("Before reset:", before);

  await prisma.$transaction(async (tx) => {
    await tx.arenaTribute.deleteMany({});
    await tx.arenaGame.deleteMany({});
    await tx.gameSession.deleteMany({});
    await tx.ledgerEntry.deleteMany({});

    // Remove smoke-test ghosts (cascade cleans their ledger via schema)
    if (testIds.length) {
      await tx.user.deleteMany({ where: { id: { in: testIds } } });
    }

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
    leaderboardPreview: await prisma.user.findMany({
      orderBy: [{ balance: "desc" }, { username: "asc" }],
      take: 10,
      select: { username: true, balance: true, wins: true },
    }),
  };

  console.log("After reset:", JSON.stringify(after, null, 2));
  console.log(
    `\nDeleted ${testIds.length} test account(s). Remaining wallets = ${start} HCC. Jackpot = 0.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
