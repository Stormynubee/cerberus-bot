-- Durable cross-instance mutex (used when REDIS_URL is unset).
CREATE TABLE IF NOT EXISTS "MutexLock" (
    "key" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MutexLock_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "MutexLock_expiresAt_idx" ON "MutexLock"("expiresAt");
