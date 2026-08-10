# GreekBot branding

| Asset | Path | Use |
|-------|------|-----|
| Bot avatar / logo | `assets/greekbot-avatar.png` | Cool HellCat / triple-cat Cerberus mascot — Discord Bot icon + `/hell` thumbnail |

## Discord setup (one-time)

1. Open https://discord.com/developers/applications → your app → **Bot**
2. Upload `greekbot-avatar.png` as the bot icon
3. Set username to **GreekBot**
4. (Optional) On next bot start, set `SYNC_BOT_AVATAR=1` in `.env` once to push the same file via API, then remove it (Discord rate-limits avatar changes)

## In-chat

`/help` (or `/hell`) attaches the logo + a looping guide GIF per tab (Start / Wallet / PvP / Casino / Inferno / Admin).

GIFs live in `assets/gifs/` — regenerate with `npm run gifs:help` (needs ffmpeg on PATH).
