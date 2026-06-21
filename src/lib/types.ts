export type MarketStatus = 'open' | 'closed' | 'resolved'
export type Side = 'YES' | 'NO'
export type NotificationType = 'deposit' | 'withdrawal' | 'market' | 'trade'

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
  description?: string | null
  category: string
  status: MarketStatus
  deadline: string
  yes_pool: number
  no_pool: number
  volume: number
  trending_score: number
  resolution?: Side | null
  resolved_at?: string | null
  yes_price?: number
  no_price?: number
  created_at: string
}

export interface Position {
  id: string
  user_id: string
  market_id: string
  side: Side
  quantity: number
  avg_entry: number
  cost_basis: number
  status: 'open' | 'settled'
  payout?: number | null
  pnl?: number | null
  current_value?: number
  unrealized_pnl?: number
  market?: Market
  created_at: string
  settled_at?: string | null
}

export interface Portfolio {
  available_balance: number
  total_portfolio_value: number
  unrealized_pnl: number
  realized_pnl: number
  total_pnl: number
  open_positions: Position[]
  resolved_positions: Position[]
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