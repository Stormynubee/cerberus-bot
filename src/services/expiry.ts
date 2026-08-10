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

/** Refund pending PvP escrows + abandoned active RPS/blackjack. */
export async function sweepExpiredChallenges(): Promise<number> {
  const now = new Date();
  let refunded = 0;

  // Pending coinflip/rps challenges past expiresAt
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
      // Roll status back so another sweep can retry refund
      console.warn("[expiry] refund failed, reverting status", session.id, err);
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "expired" },
        data: { status: "pending" },
      });
    }
  }

  // Active RPS: both players escrowed; abandon after challenge TTL * 3 from updatedAt
  const rpsCutoff = new Date(now.getTime() - config.challengeTtlSeconds * 3 * 1000);
  const stuckRps = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "rps",
      updatedAt: { lt: rpsCutoff },
    },
  });

  for (const session of stuckRps) {
    const claimed = await claimSessionStatus(session.id, "active", "expired");
    if (!claimed) continue;
    try {
      await creditForced(session.playerOneId, session.wager, "rps_refund_abandoned", session.id);
      if (session.playerTwoId) {
        await creditForced(session.playerTwoId, session.wager, "rps_refund_abandoned", session.id);
      }
      refunded += 1;
    } catch (err) {
      console.warn("[expiry] rps refund failed", session.id, err);
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "expired" },
        data: { status: "active" },
      });
    }
  }

  // Active blackjack: refund wager after TTL * 5
  const bjCutoff = new Date(now.getTime() - config.challengeTtlSeconds * 5 * 1000);
  const stuckBj = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "blackjack",
      updatedAt: { lt: bjCutoff },
    },
  });

  for (const session of stuckBj) {
    const claimed = await claimSessionStatus(session.id, "active", "expired");
    if (!claimed) continue;
    try {
      await creditForced(session.playerOneId, session.wager, "bj_refund_abandoned", session.id);
      refunded += 1;
    } catch (err) {
      console.warn("[expiry] bj refund failed", session.id, err);
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "expired" },
        data: { status: "active" },
      });
    }
  }

  // Active crash rounds abandoned (process died or stuck)
  const stuckCrash = await prisma.gameSession.findMany({
    where: {
      status: "active",
      type: "crash",
      OR: [
        { expiresAt: { lt: now } },
        { updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } },
      ],
    },
  });

  for (const session of stuckCrash) {
    const claimed = await claimSessionStatus(session.id, "active", "expired");
    if (!claimed) continue;
    try {
      await creditForced(session.playerOneId, session.wager, "crash_refund_abandoned", session.id);
      refunded += 1;
    } catch (err) {
      console.warn("[expiry] crash refund failed", session.id, err);
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "expired" },
        data: { status: "active" },
      });
    }
  }

  return refunded;
}
