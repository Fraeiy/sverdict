-- Sphere Predict Platform Schema (Polymarket-style internal ledger)

-- Users (authenticated via Sphere wallet)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  nametag text,
  public_key text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Portfolio balances
create table if not exists balances (
  user_id uuid primary key references users(id) on delete cascade,
  available_balance numeric(18, 4) not null default 0 check (available_balance >= 0),
  updated_at timestamptz not null default now()
);

-- Markets
create table if not exists markets (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  description text,
  category text not null default 'GENERAL',
  status text not null default 'open' check (status in ('open', 'closed', 'resolved')),
  deadline timestamptz not null,
  yes_pool numeric(18, 4) not null default 0,
  no_pool numeric(18, 4) not null default 0,
  volume numeric(18, 4) not null default 0,
  trending_score numeric(18, 4) not null default 0,
  resolution text check (resolution in ('YES', 'NO')),
  resolved_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_markets_status on markets(status);
create index if not exists idx_markets_category on markets(category);
create index if not exists idx_markets_trending on markets(trending_score desc);

-- Open / settled positions
create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  side text not null check (side in ('YES', 'NO')),
  quantity numeric(18, 4) not null check (quantity > 0),
  avg_entry numeric(18, 6) not null,
  cost_basis numeric(18, 4) not null,
  status text not null default 'open' check (status in ('open', 'settled')),
  payout numeric(18, 4),
  pnl numeric(18, 4),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists idx_positions_user on positions(user_id, status);
create index if not exists idx_positions_market on positions(market_id, status);

-- Trade history
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  side text not null check (side in ('YES', 'NO')),
  quantity numeric(18, 4) not null,
  price numeric(18, 6) not null,
  total_cost numeric(18, 4) not null,
  signature text,
  signed_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_trades_user on trades(user_id, created_at desc);

-- Deposits (wallet -> treasury -> balance)
create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(18, 4) not null check (amount > 0),
  tx_reference text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- Withdrawals (balance -> treasury -> wallet)
create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(18, 4) not null check (amount > 0),
  status text not null default 'submitted' check (status in ('submitted', 'completed', 'failed')),
  tx_reference text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'market', 'trade')),
  title text not null,
  body text not null,
  read boolean not null default false,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

-- Settlement records (idempotent — one per market)
create table if not exists market_resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid unique not null references markets(id) on delete cascade,
  resolution text not null check (resolution in ('YES', 'NO')),
  total_payout numeric(18, 4) not null default 0,
  positions_settled integer not null default 0,
  settled_at timestamptz not null default now(),
  metadata jsonb default '{}'
);

-- Treasury config
create table if not exists treasury_config (
  id int primary key default 1 check (id = 1),
  treasury_address text,
  updated_at timestamptz not null default now()
);

-- Realtime enabled in 002_rls_seeds_realtime.sql