import "dotenv/config";
import { prisma } from "../src/db.js";
import { bootstrapDatabase, verifyDatabaseConnection } from "../src/services/dbBootstrap.js";

function host(url: string): string {
  try {
    return new URL(url.replace("postgresql://", "http://")).hostname;
  } catch {
    return "invalid";
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const directUrl = process.env.DIRECT_URL ?? "";

  console.log("=== Connection config ===");
  console.log("DATABASE_URL host:", host(dbUrl));
  console.log("DIRECT_URL host:", host(directUrl));
  console.log(
    "Pooler in DATABASE_URL:",
    dbUrl.includes("-pooler") ? "YES (wrong for GreekBot)" : "NO (correct)",
  );
  console.log("Both URLs use direct endpoint:", dbUrl === directUrl ? "yes" : "no — check .env");

  await verifyDatabaseConnection();
  console.log("Ping: OK");

  await bootstrapDatabase();
  console.log("Bootstrap jackpot: OK");

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log("Tables:", tables.map((t) => t.tablename).join(", "));

  const counts = {
    User: await prisma.user.count(),
    LedgerEntry: await prisma.ledgerEntry.count(),
    GameSession: await prisma.gameSession.count(),
    Jackpot: await prisma.jackpot.count(),
    GuildSettings: await prisma.guildSettings.count(),
    ArenaGame: await prisma.arenaGame.count(),
    ArenaTribute: await prisma.arenaTribute.count(),
  };
  console.log("Row counts:", JSON.stringify(counts));

  const jackpot = await prisma.jackpot.findUnique({ where: { id: 1 } });
  console.log("Jackpot id=1 balance:", jackpot?.balance ?? "MISSING");

  await prisma.$disconnect();
  console.log("=== All database checks passed ===");
}

main().catch((err) => {
  console.error("Database verification FAILED:", err);
  process.exit(1);
});
