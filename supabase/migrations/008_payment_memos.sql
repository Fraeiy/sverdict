-- Standardized payment memos (SP:v1:...) for deposits, withdrawals, trades, settlements

alter table deposits add column if not exists payment_memo text;
alter table withdrawals add column if not exists payment_memo text;
alter table trades add column if not exists payment_memo text;

create index if not exists idx_deposits_payment_memo on deposits (payment_memo) where payment_memo is not null;
create index if not exists idx_withdrawals_payment_memo on withdrawals (payment_memo) where payment_memo is not null;