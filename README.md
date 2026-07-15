# Sverdict

**Live:** [sverdict.vercel.app](https://sverdict.vercel.app) · **Treasury:** `@sphere-predict` · **Repo:** [github.com/Fraeiy/sverdict](https://github.com/Fraeiy/sverdict)

Prediction markets on [Unicity Sphere](https://sphere.unicity.network) testnet. Connect a Sphere wallet, deposit UCT into portfolio margin, trade YES/NO instantly, withdraw on-chain — no per-trade wallet popups.

### Epoch Four — Unicity Quest

| | |
|---|---|
| **Track** | Payments & markets *(+ Autonomous agents: treasury worker)* |
| **Demo** | Browse markets → connect wallet → deposit → trade → share position → withdraw |
| **SDK** | Sphere Connect, payments (`send` / `receive`), communications (`sendDM`), payment memos |
| **Agents** | Autonomous `@sphere-predict` treasury — withdrawals, market seeding, UCT consolidation, Sphere DMs |
| **Stack** | Vercel + Supabase + GitHub Actions + cron-job.org (no local PC required) |

## How it works

```
Connect wallet → Deposit UCT (Sphere payment to treasury)
  → Trade from portfolio balance (no per-trade popup)
  → Market resolves → Winnings credited to portfolio
  → Withdraw → Treasury agent sends UCT on-chain
```

Trades settle in a **portfolio ledger** (Supabase Postgres). Deposits and withdrawals move real UCT on Sphere testnet. New markets are seeded with 100 UCT on-chain (50/50 YES/NO pools).

## Architecture

```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────┐
│   Vercel    │────▶│  Supabase                │────▶│   Sphere    │
│  React app  │     │  Postgres + edge fn      │     │   wallet    │
└─────────────┘     │  "platform"              │     └─────────────┘
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  GitHub Actions workers  │
                    │  treasury + DM agents    │
                    └──────────────────────────┘
```

| Layer | Role |
|-------|------|
| **Frontend** | React + Vite on Vercel — markets, portfolio, admin, settings, guest browse, share links |
| **API** | Supabase edge function `platform` — auth, trades, deposits, withdrawals |
| **Database** | Postgres — users, markets, positions, ledger (RLS on all tables) |
| **Wallet** | Sphere Connect — deposits (user signs), identity |
| **Agents** | `treasury-worker` fulfills withdrawals; `dm-worker` sends Sphere DMs on win/withdrawal |
| **Cron** | cron-job.org → `/api/treasury-tick` → GitHub Actions every 5 min |

## Features

- Guest browsing + Polymarket-style share links with dynamic OG previews
- Portfolio margin — deposit, trade, withdraw (~5–15 min via autonomous agent)
- Admin — create/close/resolve markets, AI-assisted proposals (7–14 day window)
- Payment memos — `SP:v1:deposit|withdraw|stake|settle|seed:...` on-chain attribution
- Treasury agent — multi-pass GitHub Actions, pre-withdraw UCT consolidation
- Sphere DMs — optional notifications on wins and completed withdrawals

## Quick start (local)

```bash
npm install
cp .env.example .env
npm run dev
```

### Environment (local)

```env
VITE_WALLET_URL=https://sphere.unicity.network
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_TREASURY_ADDRESS=@sphere-predict
```

## Production deploy

See **[PRODUCTION.md](./PRODUCTION.md)** for Supabase, Vercel, GitHub Actions, and cron-job.org setup.

```bash
npm run prod:check
npm run build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run supabase:push` | Apply database migrations |
| `npm run supabase:deploy` | Deploy `platform` edge function |
| `npm run treasury:worker` | One treasury agent pass (local) |

## Security

- **RLS** — All public tables use Row Level Security; internal tables blocked from browser clients
- **Secrets** — Service role, mnemonic, and API keys only in Vercel / Supabase / GitHub secrets
- **Migrations** — `001`–`016` including `016_enable_rls_internal_tables.sql`

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Supabase · `@unicitylabs/sphere-sdk` · Vercel