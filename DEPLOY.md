# GreekBot — production deploy

## Checklist

1. Discord app created; token + client ID in secrets
1b. Bot → Privileged Gateway Intents → **Message Content Intent** ON (required for `!` prefix commands)
2. Bot username **GreekBot**; icon = `assets/greekbot-avatar.png` (see `assets/BRANDING.md`)
3. Invite with `bot` + `applications.commands` (see README invite URL)
4. **Neon Postgres** with `DATABASE_URL` + `DIRECT_URL` in `.env`
5. **Redis** if you run more than one bot process (`REDIS_URL`)
6. `npm run start:prod` (runs migrations, then bot) or Docker
7. Smoke: `npm run test:smoke`

## Neon Postgres (recommended)

1. Create a project at [neon.tech](https://neon.tech) or claim the provisioned project (see `NEON.md` if present).
2. In Neon → **Connect**, copy the **direct** connection string (hostname **without** `-pooler`).
3. Set both env vars to the direct string (this bot uses Prisma interactive transactions):

```env
DATABASE_URL="postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
```

4. Apply schema and start:

```bash
cp .env.example .env   # fill Discord + Neon URLs
npm ci
npm run start:prod     # db:migrate:deploy && node dist/index.js
```

Dev with hot reload: `npm run dev`  
Migrations locally: `npm run db:migrate`  
Optional guild sync: set `DISCORD_GUILD_ID` so slash commands appear instantly.

### What lives in Postgres

| Table | Purpose |
|-------|---------|
| `User` | Balances, stats, daily streak |
| `LedgerEntry` | Every coin debit/credit audit trail |
| `GameSession` | Coinflip, RPS, blackjack, crash, high-low state |
| `Jackpot` | Global jackpot pool |
| `GuildSettings` | Big-win channel, arena role per guild |
| `ArenaGame` / `ArenaTribute` | Inferno Games (Hunger Games) |

Boot sequence runs `verifyDatabaseConnection()` then `bootstrapDatabase()` (jackpot row).

## Docker (Postgres + Redis on same host)

For self-hosted Postgres instead of Neon:

```env
DATABASE_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
DIRECT_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
REDIS_URL="redis://localhost:6379"
```

```bash
docker compose up -d postgres redis
npm run start:prod
```

## Env extras

| Var | Purpose |
|-----|---------|
| `SYNC_BOT_AVATAR=1` | One-shot push of `assets/greekbot-avatar.png` to Discord |
| `REDIS_URL` | Required for safe multi-process locks |
| `NODE_ENV=production` | Set in Docker / host |

## Health signals

- Logs: `[greekbot] Database connected` then `[greekbot] Online as …`
- Presence rotates every ~45s
- Expiry sweep every 30s refunds abandoned wagers
- Boot recovers stuck Inferno arenas

## Laptop hosting with a Cloudflare Quick Tunnel

Use this path when Neon cannot be upgraded and the bot must use a local
database. It starts a fresh local database; it does not recover or modify the
old Neon data.

1. Install Docker Desktop and ensure it is running.
2. In `.env`, set:

```env
DATABASE_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
DIRECT_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
PORT=8787
PUBLIC_STATE_API_KEY=the-same-value-used-by-the-Greek-Railway-service
```

Do not set `HOSTING_ROLE=paused-laptop-primary`; that mode intentionally skips
the Discord gateway. Also leave `KEEP_ALIVE_URL` unset.

Start the local database and bot:

```powershell
.\scripts\start-laptop.ps1
```

In a second terminal, expose only the local HTTP bridge:

```powershell
.\scripts\start-laptop-tunnel.ps1
```

Use the generated URL plus `/public/live-state` for Railway's
`CERBERUS_LIVE_STATE_URL`. Quick Tunnel URLs are temporary and change after a
restart. The laptop, Docker Desktop, bot, and tunnel must remain running.
