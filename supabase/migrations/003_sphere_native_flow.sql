-- Sphere-native prediction market flow
-- Direct stake payments (no internal deposit ledger for trading)
-- Explicit claim records for resolved market payouts

alter table markets
  add column if not exists resolution_criteria text;

comment on column markets.resolution_criteria is 'How this market will be resolved';

alter table positions
  add column if not exists shares numeric(18, 4),
  add column if not exists stake_amount numeric(18, 4),
  add column if not exists tx_reference text;

update positions
set
  shares = coalesce(shares, quantity),
  stake_amount = coalesce(stake_amount, cost_basis)
where shares is null or stake_amount is null;

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  position_id uuid references positions(id) on delete set null,
  amount numeric(18, 4) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  tx_reference text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists idx_claims_user on claims(user_id, status);
create index if not exists idx_claims_market on claims(market_id);

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('deposit', 'withdrawal', 'market', 'trade', 'stake', 'claim'));