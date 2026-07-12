-- On-chain market seeding: treasury worker sends UCT before pools go live.
-- Replaces internal @sphere-predict ledger debit (migration 013 bootstrap).

-- Allow markets to sit in pending_seed until treasury worker completes on-chain attestation.
alter table markets drop constraint if exists markets_status_check;
alter table markets add constraint markets_status_check
  check (status in ('pending_seed', 'open', 'closed', 'resolved'));

alter table markets add column if not exists seed_status text not null default 'completed'
  check (seed_status in ('pending', 'processing', 'completed', 'failed', 'skipped'));
alter table markets add column if not exists seed_payment_memo text;
alter table markets add column if not exists seed_tx_reference text;
alter table markets add column if not exists seed_processing_at timestamptz;
alter table markets add column if not exists seed_completed_at timestamptz;
alter table markets add column if not exists seed_failure_reason text;

-- Existing seeded markets (ledger-only era) stay tradeable.
update markets
set seed_status = 'completed',
    seed_completed_at = coalesce(seed_completed_at, created_at)
where seed_liquidity > 0
  and seed_status = 'completed'
  and status in ('open', 'closed', 'resolved');

-- Markets with zero seed liquidity never needed on-chain send.
update markets
set seed_status = 'skipped'
where coalesce(seed_liquidity, 0) = 0
  and seed_status = 'completed';

create index if not exists idx_markets_seed_status on markets(seed_status, created_at);

-- Treasury worker publishes on-chain inventory for Admin UI (singleton row id=1).
create table if not exists treasury_status (
  id smallint primary key default 1 check (id = 1),
  on_chain_balance numeric(18, 4) not null default 0,
  on_chain_raw text not null default '0',
  uct_token_count integer not null default 0,
  largest_coin_human numeric(18, 4) not null default 0,
  pending_withdrawals_total numeric(18, 4) not null default 0,
  pending_seeds_total numeric(18, 4) not null default 0,
  spendable_after_reserves numeric(18, 4) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'treasury-worker'
);

insert into treasury_status (id) values (1) on conflict (id) do nothing;

-- @sphere-predict internal ledger was only used for virtual seeds; zero it for mainnet.
update balances
set available_balance = 0,
    updated_at = now()
from users u
where balances.user_id = u.id
  and lower(replace(coalesce(u.nametag, ''), '@', '')) = 'sphere-predict';