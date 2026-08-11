import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

/** HMAC commit so crashAt is not readable from DB mid-round. */
export function makeCrashCommit(sessionId: string, crashAt: number): string {
  return createHmac("sha256", config.crashCommitSecret)
    .update(`${sessionId}:${crashAt.toFixed(2)}`)
    .digest("hex");
}

export function verifyCrashCommit(
  sessionId: string,
  crashAt: number,
  commit: string,
): boolean {
  const expected = makeCrashCommit(sessionId, crashAt);
  if (expected.length !== commit.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(commit));
  } catch {
    return false;
  }
}

export function crashActivePayload(sessionId: string, crashAt: number): string {
  return JSON.stringify({ commit: makeCrashCommit(sessionId, crashAt) });
}

export function crashRevealedPayload(
  sessionId: string,
  crashAt: number,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    commit: makeCrashCommit(sessionId, crashAt),
    crashAt,
    revealed: true,
    ...extra,
  });
}
