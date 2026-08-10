# GreekBot — production deploy

## Checklist

1. Discord app created; token + client ID in secrets
2. Bot username **GreekBot**; icon = `assets/greekbot-avatar.png` (see `assets/BRANDING.md`)
3. Invite with `bot` + `applications.commands` (see README invite URL)
4. For multi-instance: Postgres + Redis (not SQLite alone)
5. `npm run build && npm start` or Docker image
6. Smoke: `npm run test:smoke`

## Local / single host (SQLite)

```bash
cp .env.example .env   # fill DISCORD_TOKEN, DISCORD_CLIENT_ID
npm ci
npm run db:push
npm run build
npm start
```

Dev with hot reload: `npm run dev`  
Optional guild sync: set `DISCORD_GUILD_ID` so slash commands appear instantly.

## Docker (Postgres + Redis)

1. In `prisma/schema.prisma`, set `provider = "postgresql"`
2. In `.env`:

```env
DATABASE_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
REDIS_URL="redis://localhost:6379"
```

3. Start deps + bot:

```bash
docker compose up -d postgres redis
docker compose up -d --build bot   # if using the bot service below
```

Or run the Node process on the host against compose Postgres/Redis.

## Env extras

| Var | Purpose |
|-----|---------|
| `SYNC_BOT_AVATAR=1` | One-shot push of `assets/greekbot-avatar.png` to Discord |
| `REDIS_URL` | Required for safe multi-process locks |
| `NODE_ENV=production` | Set in Docker / host |

## Health signals

- Logs: `[greekbot] Online as …`
- Presence rotates every ~45s
- Expiry sweep every 30s refunds abandoned wagers
- Boot recovers stuck Inferno arenas
