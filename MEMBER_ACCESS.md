# Make GreekBot usable for everyone (not just admins)

Public commands are registered with **no permission lock** (`default_member_permissions = null`).
`/admin` stays **Manage Server** only.

This server’s **Verified** role id: `1500433834456645725`  
(set as Arena Master on boot so verified members can host Inferno Games)

Inferno Games hosting is also open to **@everyone** in bot code (`PUBLIC_ARENA_HOST=true`).

## 1. Integrations (required if Discord still says “no permission”)

Discord stores role overrides separately from bot code. Clear them:

1. Server Settings → **Integrations** → **GreekBot**
2. Under **Commands** → **Roles & Members**
3. Enable **@everyone**
4. Enable role **Verified** (`1500433834456645725`) if listed
5. Turn **off** any “Administrators only” / Manage Server lock on the whole bot
6. If stuck: **Clear overrides** / reset command permissions, then wait ~1 minute

Bots cannot rewrite those Integrations toggles with a normal bot token — an admin must open them once in the Discord UI.

## 2. Channel permissions

In every play channel:

**@everyone** (and/or Verified):

- View Channel, Send Messages, Embed Links, Attach Files
- **Use Application Commands** ← critical
- Read Message History

**GreekBot** role: View, Send, Embed Links, Attach Files, Use External Emojis, Read History

## 3. What members can use

| Everyone / Verified | Manage Server only |
|---------------------|--------------------|
| `/help` `/hell` `/daily` `/balance` `/tip` | `/admin …` |
| `/leaderboard` `/jackpot` `/profile` | |
| `/slots` `/roulette` `/crash` `/highlow` | |
| `/coinflip` `/blackjack` `/rps` | |
| `/hungergames new` `/setup` `/status` | |
| Join / Leave / Revive / Start / Cancel Inferno | |

## 4. After deploy

1. Wait for Render redeploy
2. Restart Discord (`Ctrl+R`) or wait ~1 minute
3. Type `/` — pick commands from the menu (don’t type them as plain chat)

## Quick test (as a Verified member, not admin)

1. `/daily`
2. `/hungergames setup` (should show defaults)
3. `/slots amount:10`
