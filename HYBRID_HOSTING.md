# Hybrid hosting: Render + laptop

Discord allows **only one** live connection per bot token.  
You cannot run GreekBot on Render **and** `npm start` on your laptop at the same time — they kick each other offline.

## Current: laptop primary (Render paused)

Neon compute is quota-locked, so the bot runs on this Windows laptop with **native Postgres** (not Docker, not Redis).

Render `greekbot` stays deployed but **must not** hold the Discord gateway. Set Render `HOSTING_ROLE=paused-laptop-primary` (and a placeholder `DISCORD_TOKEN`) so the web service idles without logging in. Restore the real token from local `.env` before making Render primary again.

### Start on the laptop

```powershell
cd C:\Users\storm\Projects\cerberus-bot
npm run db:migrate:deploy
npm run build
node dist/index.js
```

Leave that terminal open. Do **not** also run `npm run laptop:keepalive` or `npm run laptop:failover`.

Local `.env` (gitignored):

- `DATABASE_URL` / `DIRECT_URL` → `postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public`
- No `REDIS_URL`, `PORT`, or `KEEP_ALIVE_URL`

### Windows so idle does not kill the bot

Sleep is shutdown for Discord. While hosting:

- Stay **plugged in**
- Sleep on AC = **Never**
- Lid close = **Do nothing** (or leave the lid open)
- Keep Wi-Fi connected

Shutdown or Sleep = bot offline until you start `node dist/index.js` again.

### Going back to Render

1. Stop the local Node process (Ctrl+C)
2. Restore Render `DISCORD_TOKEN` from local `.env`
3. Remove `HOSTING_ROLE=paused-laptop-primary` (or set it back to empty)
4. Do **not** start the local bot again until Render is paused

Old HCC stays on Neon project `mute-band-14976984` until that compute can start. Do not delete that project.

## Alternate: laptop keep-alive (Render primary)

Render hosts the bot. Your laptop only pings it so Free does not sleep.

```powershell
cd C:\Users\storm\Projects\cerberus-bot
npm run laptop:keepalive
```

Leave that terminal open (or run it at login).  
**Do not** run `npm start` with the production token while this is working.

## Backup mode: laptop failover

If Render dies, the laptop starts the bot. When Render is healthy again, the laptop stops.

```powershell
cd C:\Users\storm\Projects\cerberus-bot
npm run build
npm run laptop:failover
```

Needs a working `.env` (same `DISCORD_TOKEN`, DB URLs as Render).

## What to use when

| Goal | Command |
|------|---------|
| Keep Free Render awake | `npm run laptop:keepalive` |
| Auto backup if Render dies | `npm run laptop:failover` |
| True 24/7 without laptop | Upgrade Render to **Starter** |

## Windows: start keep-alive at login (optional)

1. Create a shortcut to:
   `powershell -NoProfile -ExecutionPolicy Bypass -Command "cd C:\Users\storm\Projects\cerberus-bot; npm run laptop:keepalive"`
2. Put the shortcut in:
   `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`
