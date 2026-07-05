-- History RPC: expose withdrawal status + tx_reference for portfolio UI

drop function if exists public.get_wallet_history(text, text, text);

create function public.get_wallet_history(
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
        or public.normalize_wallet_addr(coalesce(u.nametag, '')) = k.k
      )
  )
  limit 1;

  if v_user_id is null then
    return '[]'::json;
  end if;

  return (
    select coalesce(json_agg(entry order by (entry->>'created_at') desc), '[]'::json)
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
        'status', w.status,
        'tx_reference', w.tx_reference,
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
      where p.user_id = v_user_id
        and p.status = 'settled'
        and p.payout > 0
    ) sub
  );
end;
$$;