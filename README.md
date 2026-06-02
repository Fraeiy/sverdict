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

## Tech Stack

- React
- Vite
- Sphere wallet SDK
- ESLint
