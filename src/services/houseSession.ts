import { prisma } from "../db.js";
import { claimSessionStatus } from "./expiry.js";
import { creditForced, debit } from "./wallet.js";

export type HouseSpinType = "slots" | "roulette" | "coinflip_house";

/** Short TTL: long enough for animations, short enough to refund after a hard crash. */
const HOUSE_SPIN_TTL_MS = 2 * 60 * 1000;

export async function openHouseSpin(opts: {
  type: HouseSpinType;
  userId: string;
  amount: number;
  channelId: string;
  debitReason: string;
}) {
  await debit(opts.userId, opts.amount, opts.debitReason);
  try {
    return await prisma.gameSession.create({
      data: {
        type: opts.type,
        status: "active",
        wager: opts.amount,
        playerOneId: opts.userId,
        payload: "{}",
        channelId: opts.channelId,
        expiresAt: new Date(Date.now() + HOUSE_SPIN_TTL_MS),
      },
    });
  } catch (err) {
    await creditForced(opts.userId, opts.amount, `${opts.type}_refund_create_fail`);
    throw err;
  }
}

export async function settleHouseSpin(sessionId: string): Promise<boolean> {
  return claimSessionStatus(sessionId, "active", "settled");
}

/** Refund stake if the session is still active (CAS-safe vs expiry sweep). */
export async function abortHouseSpin(
  sessionId: string,
  userId: string,
  amount: number,
  reason: string,
): Promise<boolean> {
  const claimed = await claimSessionStatus(sessionId, "active", "cancelled");
  if (!claimed) return false;
  try {
    await creditForced(userId, amount, reason, sessionId);
    return true;
  } catch (err) {
    await prisma.gameSession.updateMany({
      where: { id: sessionId, status: "cancelled" },
      data: { status: "active" },
    });
    throw err;
  }
}

export async function revertHouseSpinSettle(sessionId: string): Promise<void> {
  await prisma.gameSession.updateMany({
    where: { id: sessionId, status: "settled" },
    data: { status: "active" },
  });
}
