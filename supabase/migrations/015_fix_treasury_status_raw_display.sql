-- Fix treasury_status rows where raw smallest-units were stored as human UCT (8 decimals).

update treasury_status
set
  on_chain_balance = round((on_chain_balance / 100000000)::numeric, 4),
  largest_coin_human = round((largest_coin_human / 100000000)::numeric, 4),
  spendable_after_reserves = round(greatest(
    (on_chain_balance / 100000000) - pending_withdrawals_total - pending_seeds_total,
    0
  )::numeric, 4),
  updated_at = now()
where on_chain_balance > 1000000;