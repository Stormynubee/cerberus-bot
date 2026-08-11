import { prisma } from "../db.js";
import { creditForced } from "./wallet.js";
import { config } from "../config.js";

/**
 * Atomically claim a session status transition.
 * Returns true only if this caller won the race.
 */
export async function claimSessionStatus(
  sessionId: string,
  from: string | string[],
  to: string,
): Promise<boolean> {
  const fromList = Array.isArray(from) ? from : [from];
  const result = await prisma.gameSession.updateMany({
    where: { id: sessionId, status: { in: fromList } },
    data: { status: to },
  });
  return result.count === 1;
}

async function refundActiveEscrow(
  session: {
    id: string;
    playerOneId: string;
    playerTwoId: string | null;
    wager: number;
    type: string;
  },
  reason: string,
  bothPlayers: boolean,
): Promise<boolean> {
  const claimed = await claimSessionStatus(session.id, "active", "expired");
  if (!claimed) return false;
  try {
    await creditForced(session.playerOneId, session.wager, reason, session.id);
    if (bothPlayers && session.playerTwoId) {
      await creditForced(session.playerTwoId, session.wager, reason, session.id);
    }
    return true;
  } catch (err) {
    console.warn(`[expiry] ${session.type} refund failed`, session.id, err);
    await prisma.gameSession.updateMany({
      where: { id: session.id, status: "expired" },
      data: { status: "active" },
    });
    return false;
  }
}

/** Refund pending PvP escrows + abandoned active games. */
export async function sweepExpiredChallenges(): Promise<number> {
  const now = new Date();
  let refunded = 0;

  const pending = await prisma.gameSession.findMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
      type: { in: ["coinflip", "rps"] },
    },
  });

  for (const session of pending) {
    const claimed = await claimSessionStatus(session.id, "pending", "expired");
    if (!claimed) continue;
    try {
      await creditForced(
        session.playerOneId,
        session.wager,
        `${session.type}_refund_expired_sweep`,
        session.id,
      );
      refunded += 1;
    } catch (err) {
      console.warn("[expiry] refund failed, reverting status", session.id, err);
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "expired" },
        data: { status: "pending" },
      });
    }
  }

  const duelCutoff = new Date(now.getTime() - config.challengeTtlSeconds * 3 * 1000);

  // Active PvP coinflip: both escrowed; abandon if stale
  const stuckCf = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "coinflip",
      updatedAt: { lt: duelCutoff },
    },
  });
  for (const session of stuckCf) {
    if (await refundActiveEscrow(session, "coinflip_refund_abandoned", true)) refunded += 1;
  }

  const stuckRps = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "rps",
      updatedAt: { lt: duelCutoff },
    },
  });
  for (const session of stuckRps) {
    if (await refundActiveEscrow(session, "rps_refund_abandoned", true)) refunded += 1;
  }

  const bjCutoff = new Date(now.getTime() - config.challengeTtlSeconds * 5 * 1000);
  const stuckBj = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "blackjack",
      updatedAt: { lt: bjCutoff },
    },
  });
  for (const session of stuckBj) {
    if (await refundActiveEscrow(session, "bj_refund_abandoned", false)) refunded += 1;
  }

  // Crash: only expiresAt — updatedAt is not touched during the climb loop.
  const stuckCrash = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "crash",
      expiresAt: { lt: now },
    },
  });
  for (const session of stuckCrash) {
    if (await refundActiveEscrow(session, "crash_refund_abandoned", false)) refunded += 1;
  }

  // High-Low runs abandoned (process died or player left)
  const stuckHl = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "highlow",
      OR: [
        { expiresAt: { lt: now } },
        { updatedAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) } },
      ],
    },
  });
  for (const session of stuckHl) {
    if (await refundActiveEscrow(session, "highlow_refund_abandoned", false)) refunded += 1;
  }

  // House PvE spins (slots / roulette / coinflip vs house) — refund if process died mid-spin
  const stuckHouse = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: { in: ["slots", "roulette", "coinflip_house"] },
      expiresAt: { lt: now },
    },
  });
  for (const session of stuckHouse) {
    if (await refundActiveEscrow(session, `${session.type}_refund_abandoned`, false)) {
      refunded += 1;
    }
  }

  return refunded;
}
