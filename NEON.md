# Neon database — GreekBot

This project uses **Neon Postgres** for all economy and game state.

## Claim your project

If this database was auto-provisioned, **claim it within 72 hours** so it stays on your Neon account:

**Claim URL:** https://neon.new/claim/019fefa0-fda8-777d-8405-a870320d5d22

Neon project id: `mute-band-14976984`

After claiming, connection strings remain the same (password can be rotated in Neon console).

## Connection strings

Store in `.env` (never commit):

- `DATABASE_URL` — direct endpoint (no `-pooler` in hostname)
- `DIRECT_URL` — same direct endpoint (used by `prisma migrate`)

GreekBot uses Prisma **interactive transactions** for wallet and arena payouts. Do **not** use the pooled `-pooler` URL for `DATABASE_URL` unless you refactor those code paths.

## Migrations

Initial migration: `prisma/migrations/20260811070443_init/`

```bash
npm run db:migrate        # dev: create/apply migrations
npm run db:migrate:deploy # prod: apply pending migrations only
```

## Verify

```bash
npm run build
npm run test:smoke
npx prisma studio       # browse tables
```
