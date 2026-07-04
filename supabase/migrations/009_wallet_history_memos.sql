-- History RPC: prefer standardized payment_memo in detail field

create or replace function public.get_wallet_history(
  p_wallet_address text,
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
    select public.normalize_wallet_addr(p_wallet_address) as k
    union select public.normalize_wallet_addr(coalesce(p_nametag, '')) where coalesce(p_nametag, '') <> ''
    union select public.normalize_wallet_addr(coalesce(p_direct_address, '')) where coalesce(p_direct_address, '') <> ''
  )
  select u.id into v_user_id
  from users u
  cross join keys k
  where k.k is not null and k.k <> ''
    and (
      public.normalize_wallet_addr(u.wallet_address) = k.k
      or (u.nametag is not null and public.normalize_wallet_addr(u.nametag) = k.k)
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
        'detail', coalesce(d.payment_memo, d.tx_reference),
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
        'label', case
          when w.status = 'completed' then 'Withdrawal sent'
          when w.status = 'processing' then 'Withdrawal processing'
          when w.status = 'failed' then 'Withdrawal failed'
          else 'Withdrawal queued'
        end,
        'detail', coalesce(
          w.payment_memo,
          case
            when w.status = 'submitted' then 'Queued for treasury agent'
            when w.status = 'processing' then 'Treasury agent sending on-chain'
            when w.status = 'failed' then coalesce(w.failure_reason, 'Failed — balance restored')
            else coalesce(w.tx_reference, 'Completed')
          end
        ),
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
        'detail', coalesce(t.payment_memo, m.question, t.market_id::text),
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
        'detail', 'SP:v1:settle:uid=' || p.user_id::text || ':mid=' || p.market_id::text || ':pid=' || p.id::text,
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