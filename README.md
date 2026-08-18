# GreekBot — HellCat Games

Discord bot (**GreekBot**) for the **GreekGodBerry** community. Virtual **HellCatCoins**, casino games, and **Inferno Games** (Hunger Games battle royale).

HellCatCoins are **entertainment only** and have no real-world value. 18+.

## Branding

| File | Purpose |
|------|---------|
| [`assets/greekbot-avatar.png`](assets/greekbot-avatar.png) | Official logo — upload in Discord Developer Portal; also shown in `/hell` |
| [`assets/BRANDING.md`](assets/BRANDING.md) | How to set username, icon, optional API sync |

Set the bot username to **GreekBot**. Optional: `SYNC_BOT_AVATAR=1` once to push the logo via API.

## Commands

Every slash command also works with prefix **`!`** (example: `!daily`, `!slots 10`, `!hungergames new`).
You can also mention the bot: `@GreekBot daily`.

Enable **Message Content Intent** in the Discord Developer Portal (Bot → Privileged Gateway Intents) so `!` commands are visible to the bot.

### Wallet
| Command | What it does |
|--------|----------------|
| `/help` | Guided help with steps + demo GIFs (also `/hell`) |
| `/balance` | Wallet |
| `/daily` | 10 HCC once per day (20 if VIP or Discord server booster) |
| `/tip` | Send HCC to the server owner, an admin, or a mod only |
| `/leaderboard` | Top wallets + jackpot |
| `/profile` | Combat stats |
| `/jackpot` | Progressive jackpot |

### PvP & table
| `/coinflip` | HellCat spin (house or PvP) |
| `/rps` | 1v1 Rock–Paper–Scissors |
| `/blackjack` | Hit/Stand vs house |

### Casino
| `/slots` | 3-reel Inferno slots |
| `/roulette` | Red / black / green |
| `/crash` | Rocket cash-out |
| `/highlow` | Card climb |

### Inferno Games
| `/hungergames pricing` | Set server defaults (win prize, revive cost, entry fee, max players). `/hungergames setup` is the same command |
| `/hungergames new` | Open signup (optional per-round overrides; host pays the base prize) |
| `/hungergames status` | Alive / dead / infected / prize pool |

Flow: **Join** → **Start** → Bloodbath → Day/Night cycles → Feast → Finale.

### Read-only website bridge

When `PUBLIC_STATE_API_KEY` is configured, the bot exposes
`GET /public/live-state` on the existing `0.0.0.0:$PORT` HTTP server. It returns
only active Inferno Games, public display names, participant status, and
timestamps. It never returns wallet balances, tokens, Discord credentials, or
database connection details. The Greek backend calls this endpoint with the
`x-cerberus-api-key` header and caches it briefly for the public page.

### Admin (Manage Server)
| `/admin grant|revoke|freeze|audit` | Economy tools |
| `/admin bigwin` | Big-win feed channel + threshold |
| `/admin arenamaster` | Role that can start/cancel Inferno Games |

## Quick start

1. Create a Discord application + bot at https://discord.com/developers/applications  
2. Copy env: `cp .env.example .env` — set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and Neon `DATABASE_URL` / `DIRECT_URL` (see [`NEON.md`](NEON.md))  
3. Install & run:

```bash
npm install
npm run db:migrate:deploy
npm run dev
```

Set `DISCORD_GUILD_ID` for instant slash-command sync while developing.

Production: see [`DEPLOY.md`](DEPLOY.md).

### Laptop hosting without Neon

If Neon is unavailable or its compute quota is exhausted, the bot can run with a
fresh local Postgres database. This does not copy or delete the old Neon data.

1. Install and start Docker Desktop.
2. In `.env`, use these local values:

```env
DATABASE_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
DIRECT_URL="postgresql://cerberus:cerberus@localhost:5432/cerberus?schema=public"
PORT=8787
PUBLIC_STATE_API_KEY=use-the-same-value-as-the-Greek-Railway-service
```

Leave `HOSTING_ROLE` and `KEEP_ALIVE_URL` unset. Start the local stack and bot
with:

```powershell
.\scripts\start-laptop.ps1
```

The bot's authenticated website bridge is then available at
`http://localhost:8787/public/live-state`. To let Railway reach it without a
Cloudflare account, run the installed `cloudflared` executable:

```powershell
.\scripts\start-laptop-tunnel.ps1
```

Set Railway's `CERBERUS_LIVE_STATE_URL` to the generated URL plus
`/public/live-state`. The Quick Tunnel URL changes whenever the tunnel restarts,
so update Railway again after each restart. Keep the laptop, Docker Desktop,
bot, and tunnel running.

### Invite URL

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147485696&scope=bot%20applications.commands
```

## Tunables

| Env | Default | Meaning |
|-----|---------|---------|
| `DAILY_REWARD` | 10 | Regular `/daily` payout (HCC) |
| `DAILY_REWARD_VIP` | 20 | `/daily` payout for VIP role or server booster |
| `VIP_ROLE_ID` | unset | Optional VIP role; boosters still get 20 without this |
| `MIN_BET` | 10 | Minimum casino / PvP wager (one `/daily` covers one play) |
| `HG_EVENT_DELAY_MS` | 7500 | Delay between arena events |
| `HG_MIN_PLAYERS` | 4 | Minimum tributes |
| `HG_MAX_PLAYERS` | 24 | Maximum tributes |
| `BIG_WIN_THRESHOLD` | 500 | Profit that triggers big-win posts |
| `SYNC_BOT_AVATAR` | unset | `1` = push logo to Discord once |

## Stack

- Node 20+ / TypeScript / discord.js v14  
- Prisma + **Neon Postgres** (all wallets, games, Inferno Games)  
- Optional Redis for multi-instance locks  
- Docker Compose optional for local Postgres + Redis

## Verify

```bash
npm run test:smoke
npm run build
```

## License

MIT
