/** Default treasury seed on new markets: 100 UCT split 50/50 YES/NO. */
export const MARKET_SEED_LIQUIDITY_UCT = 100

export function marketSeedPerSide(total = MARKET_SEED_LIQUIDITY_UCT) {
  return total / 2
}