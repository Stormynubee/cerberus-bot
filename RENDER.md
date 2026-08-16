# Render notes (GreekBot)

## Critical for paid / client servers

GreekBot is currently on Render **Free**. Free web services **spin down after ~15 minutes of no HTTP traffic**. While asleep, Discord slash commands get **"The application did not respond"** because the bot process (and Discord gateway) are dead — Discord only waits **3 seconds**.

**Fix (required for reliable paid work):**

1. Open https://dashboard.render.com/web/srv-d9tdk0id0e5s738u4u40  
2. Upgrade the **greekbot** service from **Free → Starter** (~$7/mo)  
3. Add a payment method if prompted: https://dashboard.render.com/billing  
4. Set **Health Check Path** to `/health` if empty  

Starter stays online 24/7. Free cannot guarantee that for a client Discord.

## Optional free-tier band-aid (not enough alone)

Create a free cron at https://cron-job.org that GETs every **5 minutes**:

`https://greekbot.onrender.com/health`

That reduces spin-downs but **first command after sleep can still fail** during cold start (30–60s).

## Never run the bot locally with the production token (at the same time as Render)

Discord allows **one** gateway session per token. Logging in locally kicks Render offline → everyone gets "application did not respond".

### Hybrid Free setup (Render + laptop)

See [HYBRID_HOSTING.md](./HYBRID_HOSTING.md). Current mode is **laptop primary** (Render `HOSTING_ROLE=paused-laptop-primary`). Do not run the production token locally while Render is logged into Discord.

- **Laptop keep-alive:** `npm run laptop:keepalive` — only pings Render so it stays awake (does not log into Discord).
- **Backup:** `npm run laptop:failover` — starts the bot on your laptop only when Render is down.

## Env vars

| Key | Notes |
|-----|--------|
| `DISCORD_TOKEN` | Production only on Render |
| `DISCORD_CLIENT_ID` | Application id |
| `DISCORD_GUILD_ID` | Instant guild slash sync |
| `DATABASE_URL` / `DIRECT_URL` | Neon |
| `KEEP_ALIVE_URL` | `https://greekbot.onrender.com` |

## Health

`GET https://greekbot.onrender.com/health` → `{ ok, uptime, discordReady }`
