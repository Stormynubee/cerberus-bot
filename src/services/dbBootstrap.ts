import { prisma } from "../db.js";

/** Ensure singleton rows and indexes exist after deploy. Safe to run every boot. */
export async function bootstrapDatabase(): Promise<void> {
  await prisma.jackpot.upsert({
    where: { id: 1 },
    create: { id: 1, balance: 0 },
    update: {},
  });
}

export async function verifyDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
