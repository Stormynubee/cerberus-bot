# GreekBot branding

| Asset | Path | Use |
|-------|------|-----|
| Bot avatar / logo | `assets/greekbot-avatar.png` | Discord Developer Portal → Bot → Icon; also shown in `/hell` |

## Discord setup (one-time)

1. Open https://discord.com/developers/applications → your app → **Bot**
2. Upload `greekbot-avatar.png` as the bot icon
3. Set username to **GreekBot**
4. (Optional) On next bot start, set `SYNC_BOT_AVATAR=1` in `.env` once to push the same file via API, then remove it (Discord rate-limits avatar changes)

## In-chat

`/hell` attaches this logo and uses interactive category buttons (Wallet, PvP, Casino, Inferno, Admin).
