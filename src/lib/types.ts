export type MarketStatus = 'pending_seed' | 'open' | 'closed' | 'resolved'
export type MarketSeedStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
export type Outcome = 'YES' | 'NO'
export type Side = Outcome
export type PositionStatus = 'open' | 'settled'
export type NotificationType = 'stake' | 'claim' | 'market' | 'trade' | 'deposit' | 'withdrawal'

export interface UserPreferences {
  defaultStake: number
  confirmBeforeTrade: boolean
  dmOnWin: boolean
  dmOnWithdrawal: boolean
}

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType | string
  title: string
  body: string
  read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}

export interface User {
  id: string
  wallet_address: string
  nametag: string | null
  public_key: string | null
  is_admin: boolean
  preferences?: UserPreferences | Record<string, unknown>
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
  seed_liquidity?: number
  seed_status?: MarketSeedStatus
  seed_payment_memo?: string | null
  seed_tx_reference?: string | null
  seed_failure_reason?: string | null
  seed_completed_at?: string | null
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
export type WithdrawalStatus = 'submitted' | 'processing' | 'completed' | 'failed'

export interface HistoryEntry {
  id: string
  type: HistoryType
  amount: number
  direction: 'in' | 'out'
  label: string
  detail?: string | null
  status?: WithdrawalStatus | string
  tx_reference?: string | null
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