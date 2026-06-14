# Sphere Predict

Sphere Predict is a lightweight prediction-market prototype built for the Sphere ecosystem. The goal is to make it easy for people to create markets, place bets, and share signed market packets that can be verified by other clients.

The current focus is the product experience on the frontend: fast market browsing, wallet-based actions, signed market activity, and a clean interface for testing the core prediction-market flow.

## What We Are Building

This project is aiming at a simple but useful loop:

1. Browse open markets and see the current pool state.
2. Connect a Sphere wallet to sign actions.
3. Create, share, bet on, and resolve markets with verifiable payloads.
4. Keep the experience lightweight enough to run as a public demo or a private test app.

## Current Status

- Frontend is active and can run locally.
- Wallet connection and signed market actions are part of the app flow.
- The backend is not live right now, so the app should be treated as frontend-first for the moment.

## Running Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Environment

If you need to point the app at a different wallet host, set `VITE_WALLET_URL` in your local environment.

If the frontend is deployed separately from the backend, set `VITE_MARKET_API_URL` to your Fly.io backend URL, for example `https://sphere-predict.fly.dev` or `https://sphere-predict.fly.dev/api`.

## Fly.io Backend

The backend is ready to run on Fly.io as a full-stack service that also serves the built frontend. Deploy it from the repo root with:

```bash
fly launch
fly deploy
```

**Important: Persistent storage for markets**

Market creates/resolves are persisted to disk (`markets.json`). By default Fly containers are ephemeral and machines can be stopped (see `auto_stop_machines` in `fly.toml`).

1. Create a volume (one time):
   ```bash
   fly volumes create sphere_predict_data --size 1 --region ams
   ```
   (Use your primary_region.)

2. The `fly.toml` already declares the mount and sets `DATA_DIR=/data` so the server writes to the volume.

3. Redeploy after volume creation:
   ```bash
   fly deploy
   ```

Without a volume, created markets will disappear on the next machine start/restart (this was the root cause of "new markets gone after refresh").

After the Fly app is live, either point a separate frontend at it with `VITE_MARKET_API_URL`, or use the same Fly app as the public URL for the full app.

## Tech Stack

- React
- Vite
- Sphere wallet SDK
- ESLint
