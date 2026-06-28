export type MarketStatus = 'open' | 'closed' | 'resolved'
export type Outcome = 'YES' | 'NO'
export type Side = Outcome
export type PositionStatus = 'open' | 'settled' | 'claimable'
export type ClaimStatus = 'pending' | 'claimed'
export type NotificationType = 'stake' | 'claim' | 'market' | 'trade' | 'deposit' | 'withdrawal'

export interface User {
  id: string
  wallet_address: string
  nametag: string | null
  public_key: string | null
  is_admin: boolean
  created_at: string
}

export interface Market {
  id: string
  /** Display title */
  question: string
  title?: string
  description?: string | null
  resolution_criteria?: string | null
  category: string
  status: MarketStatus
  deadline: string
  resolution_date?: string
  yes_pool: number
  no_pool: number
  volume: number
  trending_score: number
  resolution?: Outcome | null
  resolved_outcome?: Outcome | null
  resolved_at?: string | null
  yes_probability?: number
  no_probability?: number
  yes_price?: number
  no_price?: number
  created_at: string
}

export interface Position {
  id: string
  user_id: string
  market_id: string
  side: Outcome
  outcome?: Outcome
  quantity: number
  shares?: number
  stake_amount?: number
  avg_entry: number
  cost_basis: number
  status: PositionStatus | 'settled'
  payout?: number | null
  pnl?: number | null
  current_value?: number
  unrealized_pnl?: number
  potential_payout?: number
  market?: Market
  created_at: string
  settled_at?: string | null
}

export interface Claim {
  id: string
  user_id: string
  market_id: string
  position_id?: string | null
  amount: number
  status: ClaimStatus
  tx_reference?: string | null
  created_at: string
  claimed_at?: string | null
  market?: Market
}

export interface Portfolio {
  open_positions: Position[]
  resolved_positions: Position[]
  pending_claims: Claim[]
  total_staked: number
  total_claimable: number
  estimated_value: number
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

export interface WalletIdentity {
  nametag?: string
  directAddress?: string
  publicKey?: string
}

export type { WalletIdentity as Identity }