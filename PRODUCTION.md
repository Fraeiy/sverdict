# Production Setup (Simple)

One architecture. No confusion.

```
Vercel  →  frontend (static React app)
Supabase →  database + API (edge function "platform")
Sphere   →  wallet auth, deposits, withdrawals
```

Local dev (`npm run dev:full`) uses a local Node API. **Production does not** — it uses Supabase only.

---

## Step 1 — Supabase (backend) ✅ DONE

Project: `fzoqorshivzkjeoewgjr`
- Database schema pushed
- Edge function `platform` deployed
- Treasury: `@sphere-predict`

To redeploy after changes:
```bash
npm run supabase:push
npm run supabase:deploy
```

---

## Step 2 — Vercel (frontend)

1. Push repo to GitHub
2. Import at https://vercel.com → Framework: **Vite**
3. Add environment variables (Production):

| Variable | Value |
|----------|-------|
| `VITE_WALLET_URL` | `https://sphere.unicity.network` |
| `VITE_SUPABASE_URL` | `https://fzoqorshivzkjeoewgjr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_HsMeeP1bbKKBYfR6WAtE4A_615bzhbQ` |
| `VITE_TREASURY_ADDRESS` | `@sphere-predict` |

4. Deploy

Run `npm run prod:check` before deploying to verify env vars.

---

## Step 3 — Verify

1. Open your Vercel URL
2. Header should show **Supabase** (not REST API)
3. Connect Sphere wallet
4. Deposit → trade → check Portfolio

---

## Step 4 — Treasury agent (autonomous withdrawals)

Withdrawals are queued in Supabase; the **treasury agent** sends UCT on testnet2 without manual admin clicks.

1. Apply migration `006_withdrawal_processing.sql` in Supabase SQL Editor
2. Set GitHub repo secrets (for `.github/workflows/treasury-agent.yml`):
   - `TREASURY_MNEMONIC` — **secret**, wallet for `@sphere-predict`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SPHERE_ORACLE_API_KEY` — optional; defaults to public testnet2 key if unset
3. Enable GitHub Actions on the repo — runs every 5 minutes

Local / long-running:
```bash
# .env with TREASURY_MNEMONIC + SUPABASE_* then:
npm run treasury:worker              # one pass (live sends)
npm run treasury:worker:loop         # poll every 60s
npm run treasury:worker:status       # queue counts (no mnemonic needed)
npm run treasury:worker:dry-run      # preview sends (no mnemonic, no writes)
```

### Test the agent (before going live)

1. **Migration 006** — run `006_withdrawal_processing.sql` in Supabase SQL Editor
2. **Queue status** (needs only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`):
   ```bash
   npm run treasury:worker:status
   ```
   Expect `submitted: 0` until someone withdraws.
3. **Dry-run** — submit a small withdrawal in the app, then:
   ```bash
   npm run treasury:worker:dry-run
   ```
   Should list the pending row with recipient + amount; **no** on-chain send.
4. **Live pass** — add `TREASURY_MNEMONIC` (+ optional `SPHERE_ORACLE_API_KEY`), then:
   ```bash
   npm run treasury:worker
   ```
   Check Supabase `withdrawals` → `status=completed` + `tx_reference`, and wallet received UCT.
5. **GitHub Actions** — add secrets under **Settings → Secrets and variables → Actions**, then **Actions → Treasury Agent → Run workflow**.

**Treasury liquidity (testnet2).** User deposits send UCT to `@sphere-predict` in the **browser** wallet; the GitHub agent uses the same mnemonic but must **ingest** tokens via Nostr `receive()` + IPFS `sync()`. On testnet, if spendable UCT is still 0, the worker **auto-mints** 100 UCT by default (`TREASURY_AUTO_MINT=false` to disable, `TREASURY_MINT_TOPUP_UCT` to change amount). `TREASURY_MNEMONIC` must be the mnemonic for `@sphere-predict`.

**Agentic for campaign submission:** autonomous agent fulfills withdrawal queue (payments on network).

---

## What NOT to use in production

- `api/` folder (legacy, deleted from Vercel deploy)
- Fly.io / `VITE_MARKET_API_URL` (local dev fallback only)
- `npm run backend` (local dev only)