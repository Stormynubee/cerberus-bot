import { prisma } from "../db.js";
import { config } from "../config.js";

/** Ensure singleton rows and indexes exist after deploy. Safe to run every boot. */
export async function bootstrapDatabase(): Promise<void> {
  await prisma.jackpot.upsert({
    where: { id: 1 },
    create: { id: 1, balance: 0 },
    update: {},
  });
}

/**
 * Open Inferno Games hosting for verified members (@everyone can use public slash cmds).
 * Sets Arena Master to the verified role so Start/Cancel/Setup work without Manage Server.
 */
export async function bootstrapGuildAccess(): Promise<void> {
  const guildId = config.guildId;
  const verifiedRoleId = config.verifiedRoleId;
  if (!guildId || !verifiedRoleId) {
    console.log("[greekbot] Guild access bootstrap skipped (no DISCORD_GUILD_ID / verified role)");
    return;
  }

  await prisma.guildSettings.upsert({
    where: { guildId },
    create: {
      guildId,
      arenaMasterRole: verifiedRoleId,
      hgDefaultWinPrize: config.hgDefaultWinPrize,
      hgDefaultReviveCost: config.hgDefaultReviveCost,
      hgDefaultMaxRevives: config.hgDefaultMaxRevives,
      hgDefaultEntryFee: 0,
      hgDefaultMaxPlayers: config.hgMaxPlayers,
    },
    update: {
      // Do not reset Inferno Games prices here — `/hungergames pricing` owns those fields.
      arenaMasterRole: verifiedRoleId,
    },
  });

  console.log(
    `[greekbot] Arena access → verified role ${verifiedRoleId}` +
      (config.publicArenaHost ? " · public host ON (@everyone can run Inferno Games)" : ""),
  );
}

export async function verifyDatabaseConnection(): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[greekbot] DB ping failed (attempt ${attempt}/4)`, err);
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
  throw lastErr;
}
