# Make GreekBot usable for everyone (not just admins)

If members say they “can’t use” commands, Discord server permissions are usually blocking them — not the bot code.

## 1. Integrations (most common fix)

1. Open the server → **Server Settings** → **Integrations** → **GreekBot**
2. Under **Commands**, click **Roles & Members**
3. Ensure **@everyone** (or your member role) can use commands
4. Turn **off** any lock that only allows Administrator / Manage Server for the whole bot
5. `/admin` should stay limited to people with **Manage Server** — that’s intentional

If commands were customized before, click **Clear overrides** / reset command permissions so defaults apply again.

## 2. Channel permissions

In every channel where people play (`#commands`, casino, etc.):

Allow **@everyone** (or Members):

- **View Channel**
- **Send Messages**
- **Embed Links**
- **Attach Files** (for `/help` GIFs)
- **Use Application Commands** ← critical
- **Add Reactions** (optional)
- **Read Message History**

Allow the **GreekBot** role:

- View Channel, Send Messages, Embed Links, Attach Files, Use External Emojis, Mention Everyone (optional for PvP pings), Read Message History

## 3. Bot role height

Drag the **GreekBot** role **above** the roles of people it needs to ping (not above your Owner role). It does not need Administrator.

## 4. After a deploy

Slash commands re-register on bot boot. Members may need to:

- Restart Discord (`Ctrl+R`) or wait ~1 minute
- Type `/` again to refresh the list

## What normal members can use

| Allowed for everyone | Owner / Manage Server only |
|----------------------|----------------------------|
| `/help` `/hell` | `/admin grant` |
| `/daily` `/balance` `/tip` | `/admin revoke` |
| `/leaderboard` `/jackpot` `/profile` | `/admin freeze` |
| `/slots` `/roulette` `/crash` `/highlow` | `/admin audit` |
| `/coinflip` `/blackjack` `/rps` | `/admin bigwin` |
| `/hungergames new` `/hungergames status` | `/admin arenamaster` |
| Join / Leave Inferno Games buttons | Start / Cancel Inferno (host, mods, or Arena Master role) |

## Quick test

1. Log in as a normal member (no admin)
2. Run `/daily` then `/slots amount:10`
3. If that fails with “You don’t have permission”, fix steps 1–2 above
