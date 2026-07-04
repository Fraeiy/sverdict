-- Sphere DM delivery queue (@sphere-predict sends via treasury/dm worker)

create table if not exists outbound_dms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  recipient text not null,
  content text not null,
  kind text not null check (kind in ('market_win', 'withdrawal_sent', 'market_lost')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  metadata jsonb not null default '{}',
  failure_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outbound_dms_pending
  on outbound_dms (created_at)
  where status = 'pending';