-- RLS policies + seed markets + treasury config

-- Markets: public read
alter table markets enable row level security;
create policy "markets_public_read" on markets for select using (true);

-- Treasury config: public read (treasury address only)
alter table treasury_config enable row level security;
create policy "treasury_public_read" on treasury_config for select using (true);

-- All other tables: no direct client access (edge function uses service role)
alter table users enable row level security;
alter table balances enable row level security;
alter table positions enable row level security;
alter table trades enable row level security;
alter table deposits enable row level security;
alter table withdrawals enable row level security;
alter table notifications enable row level security;
alter table market_resolutions enable row level security;

-- Seed treasury row (@sphere-predict nametag)
insert into treasury_config (id, treasury_address) values (1, '@sphere-predict')
on conflict (id) do update set treasury_address = '@sphere-predict', updated_at = now();

-- Seed markets (only if empty)
insert into markets (question, category, status, deadline, yes_pool, no_pool, volume, trending_score)
select * from (values
  ('Will ETH surpass BTC in market cap by Q4 2026?', 'CRYPTO', 'open', now() + interval '90 days', 3200, 800, 4000, 95),
  ('Will the US Federal Reserve cut rates in June 2026?', 'FINANCE', 'open', now() + interval '28 days', 1500, 2100, 3600, 88),
  ('Will a Layer 2 blockchain exceed 10M daily transactions by July 2026?', 'CRYPTO', 'open', now() + interval '45 days', 900, 600, 1500, 72),
  ('Will Sphere SDK reach 1,000 GitHub stars by September 2026?', 'TECH', 'open', now() + interval '120 days', 400, 1100, 1500, 65),
  ('Will there be a G7 emergency summit on AI regulation in 2026?', 'POLITICS', 'open', now() + interval '60 days', 700, 2300, 3000, 58),
  ('Will any team score 200+ points in an NBA game by 2027?', 'SPORTS', 'open', now() + interval '200 days', 250, 1750, 2000, 41)
) as v(question, category, status, deadline, yes_pool, no_pool, volume, trending_score)
where not exists (select 1 from markets limit 1);

-- Realtime: markets + notifications (notifications consumed via edge function + realtime subscription by user_id filter requires service role or custom auth — markets is the main win)
do $$
begin
  alter publication supabase_realtime add table markets;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;