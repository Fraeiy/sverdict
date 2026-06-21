-- Run once in Supabase Dashboard → SQL Editor
update treasury_config
set treasury_address = '@sphere-predict', updated_at = now()
where id = 1;

-- If treasury_config row missing:
insert into treasury_config (id, treasury_address)
values (1, '@sphere-predict')
on conflict (id) do update set treasury_address = '@sphere-predict', updated_at = now();