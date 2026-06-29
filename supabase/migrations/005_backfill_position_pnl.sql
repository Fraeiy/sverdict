-- Backfill net PnL on settled positions where pnl was never stored.
update positions
set pnl = coalesce(payout, 0) - cost_basis
where status = 'settled'
  and pnl is null;