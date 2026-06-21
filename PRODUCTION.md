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

## What NOT to use in production

- `api/` folder (legacy, deleted from Vercel deploy)
- Fly.io / `VITE_MARKET_API_URL` (local dev fallback only)
- `npm run backend` (local dev only)