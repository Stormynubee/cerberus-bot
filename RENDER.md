# Render — GreekBot 24/7 hosting

Service: **greekbot**  
Dashboard: https://dashboard.render.com/web/srv-d9tdk0id0e5s738u4u40  
Health URL: https://greekbot.onrender.com/health  
Repo: https://github.com/Stormynubee/cerberus-bot  

## Current plan

Deployed on **Free** (auto-created). Free web services **spin down after ~15 minutes** of no HTTP traffic — **not true 24/7**.

### Upgrade to Starter (required for 24/7)

1. Open [Render Billing](https://dashboard.render.com/billing) and add a payment method.
2. Open the [greekbot service](https://dashboard.render.com/web/srv-d9tdk0id0e5s738u4u40) → **Settings** → **Instance Type**.
3. Change **Free** → **Starter** ($7/mo) — instance stays running 24/7.
4. Set **Health Check Path** to `/health` (Settings → Health Checks).

Or apply the committed `render.yaml` Blueprint (plan: starter) after billing is enabled.

## Environment variables

Set on Render (already configured via MCP):

| Variable | Purpose |
|----------|---------|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application ID |
| `DISCORD_GUILD_ID` | Guild for instant slash commands |
| `DATABASE_URL` | Neon direct URL |
| `DIRECT_URL` | Neon direct URL (migrations) |
| `NODE_ENV` | `production` |

## Deploy flow

Every push to `master` auto-deploys:

```bash
git push origin master
```

Manual production commands locally:

```bash
npm run start:prod   # migrate + start
npm run verify:db    # test Neon connection
```

## Important

- **Run only one bot instance** — do not run `npm start` locally while Render is live (same Discord token).
- Neon DB is external; Render filesystem is ephemeral (no SQLite).
- Region: **Ohio** (near Neon us-east-2).
