# Production Setup

```
Vercel  →  frontend (static React app)
Supabase →  Postgres + edge function "platform"
Sphere   →  wallet connect, deposits, withdrawals
GitHub   →  treasury + DM workers (cron)
```

Local dev (`npm run dev:full`) uses the Node REST API in `backend/server.mjs`. **Production uses Supabase only.**

---

## Step 1 — Supabase

1. Link your project (if not already):
   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

2. Push migrations and deploy the edge function:
   ```bash
   npm run supabase:push
   npm run supabase:deploy
   ```

3. Confirm treasury address in `treasury_config` (default `@sphere-predict`).

Redeploy after backend changes:
```bash
npm run supabase:push      # schema only, when migrations change
npm run supabase:deploy    # edge function only
```

---

## Step 2 — Vercel (frontend)

1. Import the GitHub repo at [vercel.com](https://vercel.com) — framework: **Vite**
2. Set production environment variables:

| Variable | Description |
|----------|-------------|
| `VITE_WALLET_URL` | `https://sphere.unicity.network` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `VITE_TREASURY_ADDRESS` | `@sphere-predict` |

3. Deploy. Do **not** set `VITE_MARKET_API_URL` in production.

Validate before deploy:
```bash
npm run prod:check
npm run build
```

Copy `.env.production.example` → `.env.production.local` for local production builds.

---

## Step 3 — Verify

1. Open the Vercel URL — app loads without "Production setup incomplete"
2. Connect a Sphere wallet
3. Deposit UCT → Portfolio balance updates
4. Buy YES or NO on an open market
5. Settings → About shows backend **supabase**
6. Optional: withdraw a small amount and confirm treasury agent completes it

---

## Step 4 — Background workers

Withdrawals are queued in Postgres. The **treasury agent** sends UCT on Sphere testnet2. The **DM worker** delivers queued Sphere messages (win + withdrawal notifications).

Both run from `.github/workflows/treasury-agent.yml` on a schedule (treasury loop first, then DMs).

**GitHub schedule is not real-time.** Native schedule can gap **60–120+ minutes**. Mitigations in-repo:

1. **treasury-dispatch-cron.yml** — every **5 min**, uses `GITHUB_TOKEN` (no PAT required) to `repository_dispatch` the main agent.
2. **Multi-pass runs** — each agent job runs **18 passes** (~45s apart) before exiting.
3. **External cron (optional)** — `npm run treasury:trigger` every **5 min** from cron-job.org or `npm run treasury:schedule-install` on Windows.

**If Actions shows red X at ~20m:** the job hit its timeout. Current workflow uses a single pass with a 20m timeout.

Check last worker activity: Supabase `treasury_status.updated_at` or Admin → on-chain treasury timestamp.

### GitHub Actions secrets

| Secret | Required | Notes |
|--------|----------|-------|
| `TREASURY_MNEMONIC` | Yes (live sends) | Mnemonic for `@sphere-predict` |
| `SUPABASE_URL` | Yes | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase Dashboard → Settings → API |
| `SPHERE_ORACLE_API_KEY` | No | Testnet2 gateway key if needed |
| `TREASURY_TRIGGER_PAT` | No | Optional PAT override for dispatch cron (default: built-in `GITHUB_TOKEN`) |

Enable Actions on the repo, then run **Treasury Agent → Run workflow** once to test.

### Local worker commands

Add to `.env` (see `.env.example`):

```bash
npm run treasury:worker:status    # queue counts (no mnemonic)
npm run treasury:worker:dry-run   # preview sends, no writes
npm run treasury:worker           # one live pass
npm run treasury:worker:loop      # poll every 60s
npm run dm:worker                 # process DM queue
npm run dm:worker:dry-run
```

### Faster triggers for mainnet (recommended)

Observed schedule gaps on this repo: **~67–125 minutes** between GitHub “Scheduled” runs (each run ~10 min). That is normal GitHub behavior, not a misconfigured cron.

Use one of:

1. **Manual** — GitHub → Actions → Treasury Agent → **Run workflow**
2. **External cron (recommended)** — reliable 5–10 min triggers:
   - Create a GitHub classic PAT with `repo` scope
   - On [cron-job.org](https://cron-job.org): every **10 minutes**, POST to  
     `https://api.github.com/repos/Fraeiy/sphere-predict/dispatches`  
     Headers: `Authorization: Bearer <PAT>`, `Accept: application/vnd.github+json`  
     Body: `{"event_type":"treasury-tick"}`
   - Or locally / VPS: `GITHUB_PAT=ghp_... npm run treasury:trigger`
   - **Windows:** add `GITHUB_PAT` to `.env`, then `npm run treasury:schedule-install` (Task Scheduler every 10 min)
   - **GitHub backup:** add `TREASURY_TRIGGER_PAT` secret — `.github/workflows/treasury-dispatch-cron.yml` pings every 10 min
3. **Always-on loop** — small VPS: `npm run treasury:worker:loop` (polls every 60s)

Admin UI shows **Treasury worker → last on-chain publish** from `treasury_status.updated_at`.

### Test before going live

1. `npm run treasury:worker:status` — expect `submitted: 0` until someone withdraws
2. Submit a small withdrawal in the app
3. `npm run treasury:worker:dry-run` — should list the pending row; no on-chain send
4. Add `TREASURY_MNEMONIC`, run `npm run treasury:worker`
5. Check `withdrawals` table → `status=completed` + `tx_reference`; wallet received UCT

### Treasury liquidity

User deposits send UCT to `@sphere-predict` from the browser wallet. The treasury agent uses the same mnemonic and must have spendable UCT to fulfill **withdrawals** and **market seeds** (ingest via Sphere SDK `receive()` / sync as needed). Keep the treasury wallet funded on testnet/mainnet.

`TREASURY_MNEMONIC` must match `@sphere-predict`.

### Market seeding (on-chain)

Creating a market no longer debits a fake Postgres ledger. Instead:

1. Admin creates market → `seed_status=pending`, `status=pending_seed` (hidden from public listings).
2. Treasury worker sends **100 UCT on-chain** (self-attest to `@sphere-predict` with `SP:v1:seed:mid=…` memo).
3. Worker sets pools 50/50 and `status=open` when the send settles.
4. `treasury_status` table reports on-chain balance, coin count, and spendable-after-reserves for Admin UI.

Run migration `014_on_chain_market_seeds.sql` in Supabase SQL Editor if `supabase:push` hangs.

Before mainnet: fund `@sphere-predict` with enough UCT for seeds + withdrawals + buffer. The worker consolidates small UCT coins before each withdrawal (default: when treasury holds 2+ coins) to reduce multi-line payouts.

### Withdrawal delivery (multiple Sphere inbox lines)

Sphere stores UCT as separate on-chain **tokens** (like coins/UTXOs). Each user deposit creates another token in `@sphere-predict`. When the treasury agent pays a withdrawal, the SDK may spend several source tokens — **each one shows up as a separate “Received” line** in the Sphere wallet, often with ugly float noise (`4.99999999899999795`).

This is normal Sphere v2 behavior, not multiple withdrawals. The lines share the same memo (`SP:v1:withdraw:wid=…`) and should **sum to the queued amount** (e.g. 15.00 UCT). You get **one clean transfer** only when treasury holds a **single coin ≥ the withdrawal amount** (one large deposit, or manual consolidation in the Sphere wallet).

The treasury worker logs `used N source token(s)` when this happens. If the total received is **less** than the queued amount, check GitHub Actions logs and the `withdrawals` row amount — the agent now fails closed when on-chain spendable balance is too low instead of marking `completed`.

---

## What not to use in production

| Item | Why |
|------|-----|
| `VITE_MARKET_API_URL` | Local REST fallback only |
| `npm run backend` / `backend/server.mjs` | Local dev only |
| `backend/lib/marketState.mjs` | Old packet protocol (`dev:full` only) |
| Fly.io | Removed; not part of current stack |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Production setup incomplete" on Vercel | Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| Settings/notifications 404 | `npm run supabase:deploy` |
| Wallet history empty / RPC error | `npm run supabase:push` (migration 004+) |
| Withdrawals stuck in `submitted` | Check GitHub Actions secrets + treasury balance; verify `treasury_status.updated_at` is recent |
| Treasury agent runs ~50+ min apart | Normal GitHub schedule delay — use Run workflow, external cron, or `treasury:worker:loop` on a VPS |
| DMs not arriving | Confirm user prefs (`dmOnWin` / `dmOnWithdrawal`); run `dm:worker` |