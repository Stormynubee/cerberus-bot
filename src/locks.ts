import { Redis } from "ioredis";
import { config } from "./config.js";

type LockHandle = {
  release: () => Promise<void>;
};

/** In-memory mutex: waiters queue; lock is ONLY released by holder (no TTL steal). */
const memoryOwners = new Map<string, { release: () => void; waiters: Array<() => void> }>();

let redis: Redis | null = null;
/** Once Redis is configured and connected, never fall back to memory on busy. */
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
    console.log("[locks] Using in-memory locks (REDIS_URL not set)");
    redisReady = false;
    return;
  }
  try {
    await client.connect();
    redisReady = true;
    console.log("[locks] Connected to Redis");
  } catch (err) {
    console.warn("[locks] Redis unavailable, using in-memory locks:", err);
    redis = null;
    redisReady = false;
  }
}

async function acquireMemory(key: string, waitMs: number): Promise<LockHandle> {
  const started = Date.now();

  while (memoryOwners.has(key)) {
    if (Date.now() - started > waitMs) {
      throw new Error("Could not acquire lock (busy). Try again.");
    }
    const owner = memoryOwners.get(key)!;
    await new Promise<void>((resolve) => {
      owner.waiters.push(resolve);
      // Also wake on timeout slice
      setTimeout(resolve, Math.min(100, waitMs));
    });
  }

  const waiters: Array<() => void> = [];
  const entry = {
    waiters,
    release: () => {
      memoryOwners.delete(key);
      const next = waiters.shift();
      if (next) next();
      // Drain remaining waiters so they re-contend
      while (waiters.length) waiters.shift()?.();
    },
  };
  memoryOwners.set(key, entry);

  return {
    release: async () => {
      const current = memoryOwners.get(key);
      if (current === entry) {
        entry.release();
      }
    },
  };
}

async function acquireRedis(key: string, waitMs: number, holdMs: number): Promise<LockHandle> {
  const client = getRedis();
  if (!client || !redisReady) {
    throw new Error("Redis not available");
  }

  const token = `${Date.now()}-${Math.random()}`;
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    // Hold TTL is a safety net for crashed holders only; we refresh while working isn't needed
    // for short wallet ops. Use a longer hold than wait to avoid mid-op expiry under load.
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

/** Serialize critical wallet operations per Discord user. */
export async function withUserLock<T>(
  userId: string,
  fn: () => Promise<T>,
  waitMs = 8_000,
): Promise<T> {
  const key = `user:${userId}`;
  let handle: LockHandle;

  if (redisReady) {
    // Redis configured: never fall back to memory on contention (would break multi-instance).
    handle = await acquireRedis(key, waitMs, Math.max(waitMs * 3, 30_000));
  } else {
    handle = await acquireMemory(key, waitMs);
  }

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
