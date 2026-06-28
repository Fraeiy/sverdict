# Sphere-Native Flow Migration

This refactor replaces the deposit-first internal ledger UX with a **direct Sphere payment** staking model.

## User flow (new)

```
Home → Market List → Market Detail → Buy YES/NO
  → Sphere wallet approval → Position created → Portfolio
  → Market resolution → Claim rewards
```

## Removed

| Component / feature | Why |
|-------------------|-----|
| `App.jsx` | Replaced by routed `App.tsx` |
| `main.jsx` | Unused duplicate entry |
| `useMarkets.js` | Replaced by `hooks/useMarkets.ts` |
| Deposit modal & `handleDeposit` | No manual treasury deposits in UI |
| Withdraw modal & `handleWithdraw` | No internal balance withdrawals |
| Portfolio balance / available_balance UI | Stakes are paid per trade via Sphere |
| `TradeModal` in monolithic App | Replaced by `MarketDetailPage` |
| Notifications page | Out of scope for fintech-first MVP |
| `api.deposit` / `api.withdraw` exports | Obsolete API surface |
| `placeTrade` with signature checkbox | Replaced by `placeStake` after Sphere payment |
| Admin treasury address display | No address copy UX |

## Added

| Component / file | Purpose |
|------------------|---------|
| `hooks/useSphereConnect.ts` | Sphere wallet connection (wraps `useWalletConnect`) |
| `hooks/useSpherePayment.ts` | One-tap stake payments to `@sphere-predict` |
| `hooks/useMarkets.ts` | Market list + detail loading |
| `hooks/usePositions.ts` | Open/resolved positions + `placeStake` |
| `hooks/useClaims.ts` | Pending claims + `claimReward` |
| `pages/HomePage.tsx` | Market list |
| `pages/MarketDetailPage.tsx` | Market detail + Buy YES/NO |
| `pages/PortfolioPage.tsx` | Positions + claims |
| `pages/AdminPage.tsx` | Create/resolve markets |
| `components/layout/AppShell.tsx` | App chrome + nav |
| `components/layout/ConnectScreen.tsx` | Fintech-style onboarding |
| `components/markets/MarketCard.tsx` | Market list cards |
| `components/portfolio/PositionCard.tsx` | Open position row |
| `components/portfolio/ClaimCard.tsx` | Claim CTA |
| `lib/format.ts` | Shared formatting helpers |
| `supabase/migrations/003_sphere_native_flow.sql` | `claims` table + position fields |
| `react-router-dom` | `/`, `/markets/:id`, `/portfolio`, `/admin` |

## Database

### New: `claims`

| Column | Description |
|--------|-------------|
| `user_id` | Winner |
| `market_id` | Resolved market |
| `position_id` | Source position |
| `amount` | Payout in UCT |
| `status` | `pending` → `claimed` |

### Updated: `positions`

- `stake_amount`, `shares`, `tx_reference` added

### Updated: `markets`

- `resolution_criteria` added

### Behaviour change

- **Stakes**: No balance debit. User pays via Sphere; backend records position.
- **Resolution**: Winners get `claims` rows (not automatic balance credit).
- **Claim**: User taps Claim → API marks claimed → payout recorded (treasury send in production).

## API routes

| Route | Change |
|-------|--------|
| `POST /stakes` | New primary stake endpoint (alias `/trades`) |
| `GET /claims` | List pending claims |
| `POST /claims/:id/claim` | Claim reward |
| `/deposits`, `/withdrawals` | Removed from edge function |

## Deploy steps

```bash
npm run supabase:push      # Apply 003_sphere_native_flow.sql
npm run supabase:deploy    # Deploy updated platform function
npm run build:prod         # Build frontend
```

Then redeploy Vercel (auto on git push).

## Sphere payment memo format

```
market:{marketId}:outcome:YES
market:{marketId}:outcome:NO
```

Recipient: `@sphere-predict` (from `VITE_TREASURY_ADDRESS`)