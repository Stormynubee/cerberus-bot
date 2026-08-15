# Why new accounts can’t see GreekBot slash commands

This is **not** a channel “Use Application Commands” issue (those are already on for `@everyone` and `verified`).

## Root cause (confirmed via Discord API)

GreekBot has an **Integrations allow-list** on your server that only permits the **verified** role:

- Guild: `1500433834456645723`
- Allowed role only: `1500433834456645725` (verified)
- `@everyone` is **not** on that allow-list

So a brand-new account (no verified role) can see Wordle / built-in commands, but **GreekBot never appears** in the `/` menu.

Bots **cannot** clear this with a bot token. A server owner/admin must change it in Discord.

## Fix (30 seconds — do this as owner)

1. Open your server → **Server Settings**
2. **Integrations** → click **GreekBot**
3. Find **Commands** / **Roles & Members** (or “Who can use this bot”)
4. Do **one** of these:
   - **Clear overrides** / **Reset** command permissions, **or**
   - Add **@everyone** with **Allow**, and keep **verified** if you want
5. Save
6. On the test account: press `Ctrl+R` (reload Discord) and type `/` again  
   You should see **GreekBot** with `/daily`, `/slots`, `/hungergames`, etc.

### What it should look like

- Commands usable by: **Everyone** (or `@everyone` + `verified`)
- Not: only `verified` / only admins

## After that

Verified members and brand-new members can both use public slash commands.  
`/admin` still requires **Manage Server** (intentional).

## Prefix commands (`!`)

If slash commands are hidden, the same commands work as text:

- `!daily` · `!slots 10` · `!balance` · `!hungergames new`
- `@GreekBot daily` also works (does not need Message Content Intent)

Turn on **Message Content Intent** in the Developer Portal so `!` messages are readable.
