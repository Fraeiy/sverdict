-- Client-callable history for wallets when edge function /history is not deployed yet.
-- SECURITY DEFINER: resolves user by wallet/nametag/direct only; returns that user's activity.

create or replace function public.normalize_wallet_addr(addr text)
returns text
language sql
immutable
as $$
  select case
    when addr is null or btrim(addr) = '' then ''
    when left(btrim(addr), 1) = '@' then lower(substring(btrim(addr) from 2))
    else upper(btrim(addr))
  end;
$$;

create or replace function public.get_wallet_history(
  p_wallet_address text default null,
  p_nametag text default null,
  p_direct_address text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  with keys as (
    select public.normalize_wallet_addr(x) as k
    from unnest(array[p_wallet_address, p_nametag, p_direct_address]) as x
    where x is not null and btrim(x) <> ''
  )
  select u.id into v_user_id
  from users u
  where exists (
    select 1 from keys k
    where k.k <> ''
      and (
        public.normalize_wallet_addr(u.wallet_address) = k.k
        or (u.nametag is not null and public.normalize_wallet_addr(u.nametag) = k.k)
      )
  )
  limit 1;

  if v_user_id is null then
    return '[]'::json;
  end if;

  return coalesce((
    select json_agg(entry order by (entry->>'created_at') desc)
    from (
      select json_build_object(
        'id', 'deposit-' || d.id,
        'type', 'deposit',
        'amount', d.amount::float,
        'direction', 'in',
        'label', 'Deposit',
        'detail', d.tx_reference,
        'created_at', d.created_at
      ) as entry
      from deposits d
      where d.user_id = v_user_id

      union all

      select json_build_object(
        'id', 'withdrawal-' || w.id,
        'type', 'withdrawal',
        'amount', w.amount::float,
        'direction', 'out',
        'label', case when w.status = 'completed' then 'Withdrawal sent' else 'Withdrawal queued' end,
        'detail', case when w.status = 'submitted' then 'Pending treasury send from @sphere-predict' else 'Completed' end,
        'created_at', w.created_at
      )
      from withdrawals w
      where w.user_id = v_user_id

      union all

      select json_build_object(
        'id', 'trade-' || t.id,
        'type', 'trade',
        'amount', t.total_cost::float,
        'direction', 'out',
        'label', 'Trade ' || t.side,
        'detail', coalesce(m.question, t.market_id::text),
        'market_id', t.market_id,
        'created_at', t.created_at
      )
      from trades t
      left join markets m on m.id = t.market_id
      where t.user_id = v_user_id

      union all

      select json_build_object(
        'id', 'settlement-' || p.id,
        'type', 'settlement',
        'amount', p.payout::float,
        'direction', 'in',
        'label', 'Market payout',
        'detail', coalesce(m.question, p.market_id::text),
        'market_id', p.market_id,
        'created_at', coalesce(p.settled_at, p.created_at)
      )
      from positions p
      left join markets m on m.id = p.market_id
      where p.user_id = v_user_id
        and p.status = 'settled'
        and coalesce(p.payout, 0) > 0
    ) rows
  ), '[]'::json);
end;
$$;

revoke all on function public.get_wallet_history(text, text, text) from public;
grant execute on function public.get_wallet_history(text, text, text) to anon, authenticated, service_role;