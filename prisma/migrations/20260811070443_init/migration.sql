-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 1000,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyAt" TIMESTAMP(3),
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "biggestWin" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "gameId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "wager" INTEGER NOT NULL,
    "playerOneId" TEXT NOT NULL,
    "playerTwoId" TEXT,
    "winnerId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "channelId" TEXT,
    "messageId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jackpot" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "balance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Jackpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL,
    "bigWinChannelId" TEXT,
    "bigWinThreshold" INTEGER NOT NULL DEFAULT 500,
    "arenaMasterRole" TEXT,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ArenaGame" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "hostId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'signup',
    "dayNumber" INTEGER NOT NULL DEFAULT 0,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "prizePool" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 24,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArenaGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArenaTribute" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "infected" BOOLEAN NOT NULL DEFAULT false,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "weapon" TEXT NOT NULL DEFAULT 'none',
    "diedDay" INTEGER,
    "diedPhase" TEXT,
    "deathText" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaTribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_balance_idx" ON "User"("balance");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_gameId_idx" ON "LedgerEntry"("gameId");

-- CreateIndex
CREATE INDEX "LedgerEntry_reason_idx" ON "LedgerEntry"("reason");

-- CreateIndex
CREATE INDEX "GameSession_status_type_idx" ON "GameSession"("status", "type");

-- CreateIndex
CREATE INDEX "GameSession_status_expiresAt_idx" ON "GameSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GameSession_playerOneId_status_idx" ON "GameSession"("playerOneId", "status");

-- CreateIndex
CREATE INDEX "GameSession_playerTwoId_status_idx" ON "GameSession"("playerTwoId", "status");

-- CreateIndex
CREATE INDEX "GameSession_type_updatedAt_idx" ON "GameSession"("type", "updatedAt");

-- CreateIndex
CREATE INDEX "ArenaGame_guildId_status_idx" ON "ArenaGame"("guildId", "status");

-- CreateIndex
CREATE INDEX "ArenaGame_channelId_status_idx" ON "ArenaGame"("channelId", "status");

-- CreateIndex
CREATE INDEX "ArenaGame_status_updatedAt_idx" ON "ArenaGame"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ArenaTribute_gameId_alive_idx" ON "ArenaTribute"("gameId", "alive");

-- CreateIndex
CREATE INDEX "ArenaTribute_userId_idx" ON "ArenaTribute"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArenaTribute_gameId_userId_key" ON "ArenaTribute"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_playerOneId_fkey" FOREIGN KEY ("playerOneId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_playerTwoId_fkey" FOREIGN KEY ("playerTwoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArenaTribute" ADD CONSTRAINT "ArenaTribute_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "ArenaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
