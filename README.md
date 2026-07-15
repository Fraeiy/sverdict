# Sverdict

**Live:** [sverdict.vercel.app](https://sverdict.vercel.app)

Prediction markets on [Unicity Sphere](https://sphere.unicity.network) testnet. Users connect a Sphere wallet, deposit UCT into a portfolio margin account, trade YES/NO positions instantly, and withdraw back to their wallet.

Treasury: `@sphere-predict`

## How it works

```
Connect wallet → Deposit UCT (Sphere payment to treasury)
  → Trade from portfolio balance (no per-trade popup)
  → Market resolves → Winnings credited to portfolio
  → Withdraw → Treasury agent sends UCT on-chain
```

Trades settle in a **portfolio ledger** (Supabase Postgres). Deposits and withdrawals move real UCT on Sphere testnet. New markets are seeded with 100 UCT from the treasury ledger (50/50 YES/NO pools).

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
| **Frontend** | React + Vite on Vercel — markets, portfolio, admin, settings |
| **API** | Supabase edge function `platform` — auth, trades, deposits, withdrawals |
| **Database** | Postgres — users, markets, positions, ledger, notifications (RLS on all tables; public read only on `markets` + `treasury_config`) |
| **Wallet** | Sphere Connect — deposits (user signs), identity |
| **Agents** | `treasury-worker` fulfills withdrawals; `dm-worker` sends Sphere DMs on win/withdrawal |

## Features

- Browse and filter open markets (AMM-style YES/NO pools)
- Portfolio margin — deposit, trade, withdraw
- Admin panel — create/close/resolve markets, fulfill withdrawals
- Settings — default stake, confirm-before-trade, DM preferences
- Payment memos — `SP:v1:deposit|withdraw|stake|settle|seed:...` on ledger entries
- Autonomous treasury agent — processes withdrawal queue every 5 minutes
- Sphere DMs — optional notifications on market wins and completed withdrawals

## Quick start (local)

```bash
npm install
cp .env.example .env   # if present; otherwise create .env (see below)
npm run dev
```

Open the Vite dev server (default `http://localhost:5173`), connect a Sphere wallet, and trade.

### Environment (local)

Create `.env` in the project root:

```env
VITE_WALLET_URL=https://sphere.unicity.network
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_TREASURY_ADDRESS=@sphere-predict
```

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, the app uses Supabase (production path). Without them, it falls back to the local REST API.

### Local REST API (optional)

For offline backend development without Supabase:

```bash
# .env — omit VITE_SUPABASE_* or use placeholders; add:
VITE_MARKET_API_URL=http://127.0.0.1:8787

npm run dev:full   # starts backend on :8787 + Vite frontend
```

The legacy Node server in `backend/server.mjs` is for local dev only — not used in production.

## Production deploy

See **[PRODUCTION.md](./PRODUCTION.md)** for the full setup:

1. Supabase — push migrations, deploy edge function
2. Vercel — set env vars, deploy frontend
3. GitHub Actions — treasury + DM workers (secrets: `TREASURY_MNEMONIC`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

Before deploying to Vercel:

```bash
npm run prod:check
npm run build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (Supabase or REST backend) |
| `npm run dev:full` | Local REST API + Vite |
| `npm run build` | Production build |
| `npm run prod:check` | Validate env vars before Vercel deploy |
| `npm run supabase:push` | Apply database migrations |
| `npm run supabase:deploy` | Deploy `platform` edge function |
| `npm run treasury:worker` | Process one withdrawal pass |
| `npm run treasury:worker:status` | Show withdrawal queue counts |
| `npm run treasury:worker:dry-run` | Preview sends without executing |
| `npm run dm:worker` | Process outbound Sphere DM queue |

## Project structure

```
src/                    React frontend (pages, hooks, components)
supabase/
  functions/platform/   Edge API (trades, deposits, admin, settings)
  migrations/           Postgres schema (001–016)
backend/
  treasury-worker.mjs   Autonomous withdrawal agent
  dm-worker.mjs         Sphere DM delivery agent
  server.mjs            Local dev REST API only
  lib/marketState.mjs   Old packet protocol (dev:full only)
.github/workflows/      Treasury agent (multi-pass) + 10 min dispatch cron
```

## Security

- **RLS** — All public tables use Row Level Security. Only `markets` and `treasury_config` allow anonymous `SELECT`. Internal tables (`users`, `balances`, `claims`, `outbound_dms`, `treasury_status`, etc.) are blocked from the browser; the `platform` edge function uses the **service role** server-side.
- **Secrets** — Never commit `.env`. Use Vercel / Supabase / GitHub secrets for `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, and `TREASURY_MNEMONIC`. The anon key in the frontend is expected to be public; service role must not ship to the client.
- **Apply migrations** — After pulling, run `npm run supabase:push` so RLS changes (e.g. `016_enable_rls_internal_tables.sql`) are applied.

## Tech stack

- React 19, TypeScript, Vite, Tailwind CSS 4
- Supabase (Postgres, edge functions, realtime)
- `@unicitylabs/sphere-sdk` — wallet connect, payments
- Vercel — frontend hosting

## Repo

https://github.com/Fraeiy/sphere-predict