import { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { withUserLock } from "../locks.js";

export class EconomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EconomyError";
  }
}

export function assertBetAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError("Wager must be a whole number greater than zero.");
  }
  if (amount < config.minBet) {
    throw new EconomyError(`Minimum wager is ${config.minBet} HCC.`);
  }
  if (amount > config.maxBet) {
    throw new EconomyError(`Maximum wager is ${config.maxBet.toLocaleString()} HCC.`);
  }
}

export async function ensureUser(discordId: string, username?: string | null) {
  return prisma.user.upsert({
    where: { id: discordId },
    create: {
      id: discordId,
      username: username ?? undefined,
      balance: config.startingBalance,
    },
    update: {
      username: username ?? undefined,
    },
  });
}

async function writeLedger(
  tx: Prisma.TransactionClient,
  userId: string,
  delta: number,
  balance: number,
  reason: string,
  gameId?: string,
) {
  await tx.ledgerEntry.create({
    data: { userId, delta, balance, reason, gameId },
  });
}

export async function getBalance(userId: string, username?: string | null) {
  const user = await ensureUser(userId, username);
  return user;
}

/** Atomic debit — fails if insufficient funds or frozen. */
export async function debit(
  userId: string,
  amount: number,
  reason: string,
  gameId?: string,
) {
  return withUserLock(userId, () => debitUnlocked(userId, amount, reason, gameId));
}

/** Caller MUST already hold withUserLock(userId). */
export async function debitUnlocked(
  userId: string,
  amount: number,
  reason: string,
  gameId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new EconomyError("Wallet not found. Run /balance first.");
    if (user.frozen) throw new EconomyError("Your wallet is frozen by Cerberus.");
    if (user.balance < amount) {
      throw new EconomyError(
        `Not enough HellCatCoins. You have ${user.balance.toLocaleString()} HCC.`,
      );
    }
    const updated = await tx.user.updateMany({
      where: { id: userId, balance: { gte: amount }, frozen: false },
      data: { balance: { decrement: amount } },
    });
    if (updated.count !== 1) {
      throw new EconomyError("Not enough HellCatCoins (concurrent update).");
    }
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await writeLedger(tx, userId, -amount, fresh.balance, reason, gameId);
    return fresh;
  });
}

/**
 * Credit that ignores frozen wallets (escrow refunds / prize payouts).
 */
export async function creditForced(
  userId: string,
  amount: number,
  reason: string,
  gameId?: string,
) {
  return withUserLock(userId, () => creditForcedUnlocked(userId, amount, reason, gameId));
}

export async function creditForcedUnlocked(
  userId: string,
  amount: number,
  reason: string,
  gameId?: string,
) {
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await tx.user.create({
        data: { id: userId, balance: config.startingBalance },
      });
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });
    await writeLedger(tx, userId, amount, updated.balance, reason, gameId);
    return updated;
  });
}

export async function credit(
  userId: string,
  amount: number,
  reason: string,
  gameId?: string,
) {
  return withUserLock(userId, async () => {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new EconomyError("Wallet not found.");
      if (user.frozen) throw new EconomyError("Your wallet is frozen by Cerberus.");
      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } },
      });
      await writeLedger(tx, userId, amount, updated.balance, reason, gameId);
      return updated;
    });
  });
}

/** Transfer between two users with dual locks (ordered by id to avoid deadlock). */
export async function transfer(
  fromId: string,
  toId: string,
  amount: number,
  reason = "tip",
) {
  if (fromId === toId) throw new EconomyError("You cannot tip yourself.");
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError("Tip must be a whole number greater than zero.");
  }
  if (amount > config.maxBet) {
    throw new EconomyError(`Maximum tip is ${config.maxBet.toLocaleString()} HCC.`);
  }

  const [first, second] = [fromId, toId].sort();
  return withUserLock(first, async () =>
    withUserLock(second, async () => {
      return prisma.$transaction(async (tx) => {
        const from = await tx.user.findUnique({ where: { id: fromId } });
        const to = await tx.user.findUnique({ where: { id: toId } });
        if (!from || !to) throw new EconomyError("Both wallets must exist.");
        if (from.frozen || to.frozen) {
          throw new EconomyError("One of the wallets is frozen.");
        }
        const updatedFrom = await tx.user.updateMany({
          where: { id: fromId, balance: { gte: amount }, frozen: false },
          data: { balance: { decrement: amount } },
        });
        if (updatedFrom.count !== 1) {
          throw new EconomyError("Not enough HellCatCoins for that tip.");
        }
        const freshFrom = await tx.user.findUniqueOrThrow({ where: { id: fromId } });
        const updatedTo = await tx.user.update({
          where: { id: toId },
          data: { balance: { increment: amount } },
        });
        await writeLedger(tx, fromId, -amount, freshFrom.balance, reason);
        await writeLedger(tx, toId, amount, updatedTo.balance, reason);
        return { from: freshFrom, to: updatedTo };
      });
    }),
  );
}

export async function claimDaily(userId: string, username?: string | null) {
  return withUserLock(userId, async () => {
    await ensureUser(userId, username);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.frozen) throw new EconomyError("Your wallet is frozen.");

      const now = new Date();
      if (user.lastDailyAt) {
        const elapsed = now.getTime() - user.lastDailyAt.getTime();
        const dayMs = 24 * 60 * 60 * 1000;
        if (elapsed < dayMs) {
          const remaining = dayMs - elapsed;
          const hours = Math.ceil(remaining / (60 * 60 * 1000));
          throw new EconomyError(
            `Daily already claimed. Cerberus returns in ~${hours}h.`,
          );
        }
      }

      const sinceLast = user.lastDailyAt
        ? now.getTime() - user.lastDailyAt.getTime()
        : Infinity;
      const streakContinues = sinceLast <= 48 * 60 * 60 * 1000;
      const streak = streakContinues ? user.dailyStreak + 1 : 1;
      const streakBonus = Math.min(streak - 1, 14) * 25;
      const payout = config.dailyReward + streakBonus;

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { increment: payout },
          lastDailyAt: now,
          dailyStreak: streak,
        },
      });
      await writeLedger(tx, userId, payout, updated.balance, "daily_claim");
      return { user: updated, payout, streak, streakBonus };
    });
  });
}

export async function recordMatchResult(opts: {
  winnerId: string | null;
  loserId: string | null;
  amountWon: number;
  tieIds?: string[];
}) {
  const { winnerId, loserId, amountWon, tieIds } = opts;

  if (tieIds?.length) {
    await prisma.user.updateMany({
      where: { id: { in: tieIds } },
      data: { ties: { increment: 1 }, currentStreak: 0 },
    });
    return;
  }

  if (winnerId) {
    await ensureUser(winnerId);
    const winner = await prisma.user.findUnique({ where: { id: winnerId } });
    if (winner) {
      const profit = Math.max(0, amountWon);
      const nextStreak = winner.currentStreak + 1;
      await prisma.user.update({
        where: { id: winnerId },
        data: {
          wins: { increment: 1 },
          currentStreak: nextStreak,
          bestStreak: Math.max(winner.bestStreak, nextStreak),
          biggestWin: Math.max(winner.biggestWin, profit),
        },
      });
    }
  }

  if (loserId) {
    await ensureUser(loserId);
    await prisma.user.update({
      where: { id: loserId },
      data: { losses: { increment: 1 }, currentStreak: 0 },
    });
  }
}

export async function addToJackpot(amount: number) {
  if (amount <= 0) return;
  await prisma.jackpot.upsert({
    where: { id: 1 },
    create: { id: 1, balance: amount },
    update: { balance: { increment: amount } },
  });
}

export async function getJackpot(): Promise<number> {
  const pot = await prisma.jackpot.findUnique({ where: { id: 1 } });
  return pot?.balance ?? 0;
}

export async function topBalances(limit = 10) {
  return prisma.user.findMany({
    where: {
      // Hide local smoke-test ghosts from the public board
      NOT: [
        { username: { in: ["ClaimTest", "SmokeA", "SmokeB"] } },
        { id: { startsWith: "smoke_" } },
        { id: { startsWith: "claim_" } },
      ],
    },
    orderBy: [{ balance: "desc" }, { username: "asc" }],
    take: limit,
  });
}

/** Apply house rake on a gross PvE payout; remainder credited, rake → jackpot. */
export function applyRake(grossPayout: number): { net: number; rake: number } {
  const rake = Math.floor((grossPayout * config.houseRakePercent) / 100);
  return { net: grossPayout - rake, rake };
}
