-- One-time cleanup: merge ghost user rows into the account with the most activity.
-- Run in Supabase SQL Editor if duplicate rows were created for the same nametag.
-- Review the preview CTE before uncommenting the merge block.

with ranked as (
  select
    u.id,
    u.wallet_address,
    u.nametag,
    coalesce(b.available_balance, 0) as balance,
    (select count(*) from positions p where p.user_id = u.id) as position_count,
    (select count(*) from trades t where t.user_id = u.id) as trade_count,
    row_number() over (
      partition by lower(replace(coalesce(u.nametag, ''), '@', ''))
      order by
        (select count(*) from positions p where p.user_id = u.id) desc,
        (select count(*) from trades t where t.user_id = u.id) desc,
        coalesce(b.available_balance, 0) desc,
        u.created_at asc
    ) as rn
  from users u
  left join balances b on b.user_id = u.id
  where u.nametag is not null
    and lower(replace(u.nametag, '@', '')) not in ('sphere-predict')
),
preview as (
  select
    canonical.id as keep_id,
    canonical.wallet_address as keep_wallet,
    canonical.nametag,
    ghost.id as drop_id,
    ghost.wallet_address as drop_wallet,
    ghost.balance as ghost_balance,
    ghost.position_count as ghost_positions
  from ranked canonical
  join ranked ghost
    on lower(replace(coalesce(canonical.nametag, ''), '@', ''))
     = lower(replace(coalesce(ghost.nametag, ''), '@', ''))
   and canonical.rn = 1
   and ghost.rn > 1
)
select * from preview order by nametag, drop_id;

-- Uncomment after preview looks correct:
/*
begin;
update positions p set user_id = preview.keep_id
from preview where p.user_id = preview.drop_id;
update trades t set user_id = preview.keep_id
from preview where t.user_id = preview.drop_id;
update deposits d set user_id = preview.keep_id
from preview where d.user_id = preview.drop_id;
update withdrawals w set user_id = preview.keep_id
from preview where w.user_id = preview.drop_id;
update notifications n set user_id = preview.keep_id
from preview where n.user_id = preview.drop_id;
update balances cb set available_balance = cb.available_balance + coalesce(gb.available_balance, 0)
from preview
join balances gb on gb.user_id = preview.drop_id
join balances cb on cb.user_id = preview.keep_id;
delete from balances b using preview where b.user_id = preview.drop_id;
delete from users u using preview where u.id = preview.drop_id;
commit;
*/