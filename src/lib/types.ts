export type MarketStatus = 'open' | 'closed' | 'resolved'
export type Outcome = 'YES' | 'NO'
export type Side = Outcome
export type PositionStatus = 'open' | 'settled'
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
  status: PositionStatus
  payout?: number | null
  pnl?: number | null
  current_value?: number
  unrealized_pnl?: number
  potential_payout?: number
  market?: Market
  created_at: string
  settled_at?: string | null
}

export type HistoryType = 'deposit' | 'withdrawal' | 'trade' | 'settlement'

export interface HistoryEntry {
  id: string
  type: HistoryType
  amount: number
  direction: 'in' | 'out'
  label: string
  detail?: string | null
  market_id?: string | null
  created_at: string
}

export interface Portfolio {
  /** Cash available to trade or withdraw (perp-dex margin balance) */
  available_balance: number
  total_portfolio_value: number
  total_staked: number
  estimated_value: number
  unrealized_pnl: number
  realized_pnl: number
  total_pnl: number
  open_positions: Position[]
  resolved_positions: Position[]
}

export interface WalletIdentity {
  nametag?: string
  directAddress?: string
  publicKey?: string
}

export type { WalletIdentity as Identity }