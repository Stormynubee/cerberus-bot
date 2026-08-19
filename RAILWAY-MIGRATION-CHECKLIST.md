# Cerberus → Railway Migration — ONE-SHOT CHECKLIST

**Goal:** Run Cerberus (GreekBot) always-on on Railway, no laptop, no Docker, no local shells.
**When:** After you buy Railway (starter ~$5/mo covers bot + Postgres + Redis).

---

## ✅ VERIFIED BEFORE MIGRATION (already confirmed)

- Local bot: `discordReady:true` (laptop, 6.3h uptime) — runs until we switch
- Local DB is TINY: **1 user, 8.3 MB** → no data migration needed; fresh Railway Postgres is fine
- Bot needs: Node 20+, Postgres (Prisma), Redis (ioredis), Discord token
- Bot start: `prisma migrate deploy` then `node dist/index.js` (the Dockerfile + `start:prod` both do this)
- Bot is a **long-lived websocket process** → Railway (persistent) is correct; serverless would NOT work

---

## 🛠 STEP 0 — Buy Railway + create resources (5 min)

1. Buy Railway **Hobby/Starter** plan (~$5/mo)
2. Railway dashboard → **New Project** → name `cerberus`
3. **New → Database → PostgreSQL** (name `cerberus-db`)
4. **New → Database → Redis** (name `cerberus-redis`)
5. **New → Service → Deploy from GitHub repo** → `Stormynubee/cerberus-bot` → branch `main`

---

## ⚙️ STEP 1 — Service settings (copy exactly)

In the **cerberus-bot** service → Settings:
- **Root Directory**: `/` (repo root — package.json is at root)
- **Build Command**: `npm ci && npx prisma generate && npm run build`
- **Start Command**: `node dist/index.js`
- **Health Check Path**: `/health`
- **Auto Deploy**: on

(The `render.railway.yaml` in the repo has the same values — you can also import it via Railway's "Import from file".)

---

## 🔐 STEP 2 — Environment variables (CRITICAL — set these)

Service → **Variables** → set ALL:

| Key | Value (get from…) |
|---|---|
| `NODE_ENV` | `production` |
| `DISCORD_TOKEN` | Discord Developer Portal → your bot → **Bot → Reset Token → Copy**. ⚠️ This kills the laptop bot — do it LAST |
| `DISCORD_CLIENT_ID` | Discord Portal → OAuth2 → Client ID |
| `DISCORD_GUILD_ID` | Your Discord server ID (right-click server → Copy ID) |
| `DATABASE_URL` | Railway Postgres `cerberus-db` → **Connect** → Internal URL |
| `DIRECT_URL` | Same Internal URL as `DATABASE_URL` (needed for Prisma interactive transactions) |
| `REDIS_URL` | Railway Redis `cerberus-redis` → **Connect** → Internal URL |
| `PUBLIC_STATE_API_KEY` | Any strong random string (used by the website bridge) |
| `HOSTING_ROLE` | **LEAVE EMPTY/UNSET** (empty = bot connects to Discord; do NOT set paused-laptop-primary) |
| `PORT` | `3000` (Railway injects its own, but set for safety) |
| `KEEP_ALIVE_URL` | empty/unset (not needed on Railway) |

**Optional economy vars** (set if you want non-defaults): `STARTING_BALANCE`, `DAILY_REWARD`, `MIN_BET`, `MAX_BET`. If unset, code defaults apply.

---

## 🚀 STEP 3 — Deploy & verify (5 min)

1. Service → **Deploy** (first build takes ~2-3 min)
2. Watch logs — you should see:
   - `prisma migrate deploy` applies migrations (or none pending)
   - `[greekbot] Health server on 0.0.0.0:3000`
   - `[greekbot] Online as <bot>`
   - NO `[greekbot] token` error
3. Verify the health endpoint: open `https://<your-service>.up.railway.app/health` → should show `"discordReady": true`

---

## 🔁 STEP 4 — Switch over (do this ONLY after Railway shows discordReady:true)

1. **Now** reset `DISCORD_TOKEN` (if you did it in step 2, skip) — copy the new token to Railway, redeploy
2. **Stop the laptop bot**: kill the local `node dist/index.js` + `cloudflared` tunnel + Docker (postgres/redis containers)
3. **Verify**: Railway `/health` shows `discordReady:true`; the site bridge still works (it proxies to the new URL)

---

## 🌐 STEP 5 — Update the site bridge (CRITICAL for the website)

The main site (`greek-web` on Railway) proxies Cerberus live-state. Update **greek-web backend env**:
- `CERBERUS_LIVE_STATE_URL` → `https://<your-railway-bot>.up.railway.app/public/live-state`
- `CERBERUS_API_KEY` → the same `PUBLIC_STATE_API_KEY` you set on the bot
- Redeploy greek-web backend

Verify: `https://api-production-aeb1.up.railway.app/api/cerberus/live-state` → `available:true`

---

## 🗄 (Optional) Data — not needed, but if you want the 1 user

Local DB had only 1 user / 8.3MB. Fresh DB is fine. To restore, run the bot once locally to dump, or just re-grant coins manually via the bot.

---

## ❌ WHAT TO STOP AFTER SWITCH

On the laptop (no longer needed):
- `node dist/index.js` (bot)
- `cloudflared tunnel`
- Docker Desktop + `cerberus-bot-postgres-1` / `cerberus-bot-redis-1`
- Any shell running `npm run start:prod` or `laptop:keepalive`

**After this, the laptop can be off and everything keeps running.**

---

## ⚠️ MISTAKE-PROOF NOTES

1. **Never run two gateways with the same token** — Discord disconnects both. Only reset the token when you're ready to switch.
2. **`HOSTING_ROLE` must be EMPTY** on Railway — the value `paused-laptop-primary` is what kept Render idle.
3. **Health check** = `/health` (the bot serves this).
4. If the bot logs `token invalid` → token wrong in Railway → reset again.
5. If DB connect fails → `DIRECT_URL` must be the SAME Postgres internal URL (Neon/Proxied URL fails interactive tx).
6. Redis failing → check `REDIS_URL` — the bot uses Redis for locks/cooldowns but continues without it (degraded).

---

## ✅ DONE = this is all true
- [ ] Railway bot `/health` → `discordReady:true`
- [ ] Laptop bot stopped, laptop can be off
- [ ] Site bridge `/api/cerberus/live-state` → `available:true`
- [ ] No local shells/Docker needed
