-- @sphere-predict treasury user + seed float for market creation (100 UCT per market)

insert into users (wallet_address, nametag, is_admin)
values ('@sphere-predict', 'sphere-predict', true)
on conflict (wallet_address) do update
  set nametag = excluded.nametag,
      is_admin = true;

insert into balances (user_id, available_balance, updated_at)
select u.id, 1000, now()
from users u
where lower(replace(coalesce(u.nametag, ''), '@', '')) = 'sphere-predict'
on conflict (user_id) do update
  set available_balance = greatest(balances.available_balance, 1000),
      updated_at = now();