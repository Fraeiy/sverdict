-- Treasury agent: lock withdrawals while on-chain send is in flight.

alter table withdrawals drop constraint if exists withdrawals_status_check;
alter table withdrawals add constraint withdrawals_status_check
  check (status in ('submitted', 'processing', 'completed', 'failed'));

alter table withdrawals add column if not exists processing_at timestamptz;
alter table withdrawals add column if not exists failure_reason text;