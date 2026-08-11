# Hybrid hosting: Render + laptop

Discord allows **only one** live connection per bot token.  
You cannot run GreekBot on Render **and** `npm start` on your laptop at the same time — they kick each other offline.

## Recommended (Free Render): laptop keep-alive

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
