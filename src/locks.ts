import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { prisma } from "./db.js";

type LockHandle = {
  release: () => Promise<void>;
};

let redis: Redis | null = null;
/** Once Redis is configured and connected, prefer it for locks. */
let redisReady = false;

export function getRedis(): Redis | null {
  if (!config.redisUrl) return null;
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (err: Error) => {
      console.warn("[redis]", err.message);
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  if (!client) {
    console.log("[locks] Using Postgres mutex locks (REDIS_URL not set)");
    redisReady = false;
    return;
  }
  try {
    await client.connect();
    redisReady = true;
    console.log("[locks] Connected to Redis");
  } catch (err) {
    console.warn("[locks] Redis unavailable, using Postgres mutex locks:", err);
    redis = null;
    redisReady = false;
  }
}

async function acquireDb(key: string, waitMs: number, holdMs: number): Promise<LockHandle> {
  const token = randomUUID();
  const started = Date.now();

  while (Date.now() - started < waitMs) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + holdMs);

    await prisma.mutexLock.deleteMany({
      where: { key, expiresAt: { lt: now } },
    });

    try {
      await prisma.mutexLock.create({
        data: { key, token, expiresAt },
      });
      return {
        release: async () => {
          await prisma.mutexLock.deleteMany({ where: { key, token } });
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        await new Promise((r) => setTimeout(r, 40));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not acquire lock (busy). Try again.");
}

async function acquireRedis(key: string, waitMs: number, holdMs: number): Promise<LockHandle> {
  const client = getRedis();
  if (!client || !redisReady) {
    throw new Error("Redis not available");
  }

  const token = `${Date.now()}-${Math.random()}`;
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    const ok = await client.set(`lock:${key}`, token, "PX", holdMs, "NX");
    if (ok === "OK") {
      return {
        release: async () => {
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end`;
          await client.eval(script, 1, `lock:${key}`, token);
        },
      };
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("Could not acquire lock (busy). Try again.");
}

/** Serialize critical wallet operations per Discord user (Redis or Postgres — never memory-only). */
export async function withUserLock<T>(
  userId: string,
  fn: () => Promise<T>,
  waitMs = 8_000,
): Promise<T> {
  const key = `user:${userId}`;
  const holdMs = Math.max(waitMs * 3, 30_000);
  const handle = redisReady
    ? await acquireRedis(key, waitMs, holdMs)
    : await acquireDb(key, waitMs, holdMs);

  try {
    return await fn();
  } finally {
    await handle.release();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => undefined);
    redis = null;
  }
  redisReady = false;
}
