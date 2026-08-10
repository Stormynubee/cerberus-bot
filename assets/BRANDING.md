# GreekBot branding

| Asset | Path | Use |
|-------|------|-----|
| Bot avatar / logo | `assets/greekbot-avatar.png` | Fun Discord-style 8-bit HellCats + **GreekBot** wordmark (primary) |
| Alt avatar | `assets/greekbot-avatar-alt.png` | Goofy triple-cat pixel badge variant |

## Discord Developer Portal copy

### Username
`GreekBot`

### Short description (Bot profile / About Me — max ~190 chars recommended)
```
HellCatCoins chaos for GreekGodBerry 🐱 Casino, duels, crash & Inferno Games. Virtual coins only. 18+. Type /help
```

### Longer description (Application Description / store-style)
```
GreekBot is the fun HellCat games bot for the GreekGodBerry community. Stack virtual HellCatCoins, tip friends, spin slots, ride crash, duel with coinflip & RPS, hit blackjack, and jump into Inferno Games — a silly-deadly Hunger Games–style arena. Buttons, live embeds, /help guides. Entertainment only — no real money. 18+.
```

### Tags (Application → Information → Tags — pick what Discord allows)
Primary suggestions:
- `gambling`
- `games`
- `fun`
- `economy`
- `social`

Extras if available:
- `entertainment`
- `minigames`
- `community`

### Invite summary line (optional)
```
Casino · PvP · Inferno Games · HellCatCoins — /help to start
```

## Discord setup

1. https://discord.com/developers/applications → your app → **Bot**
2. Upload `assets/greekbot-avatar.png` as the icon
3. Username: **GreekBot**
4. Paste the short description into the bot About Me / description field
5. Add tags on the application Information page
6. Optional once: `SYNC_BOT_AVATAR=1` in `.env`, start bot, then remove it

## In-chat

`/help` (or `/hell`) attaches the logo + a looping guide GIF per tab.

GIFs: `assets/gifs/` — regenerate with `npm run gifs:help` (needs ffmpeg).
