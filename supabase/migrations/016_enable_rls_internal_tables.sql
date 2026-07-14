-- Internal tables: no direct PostgREST access for anon/authenticated clients.
-- Edge function platform + GitHub workers use service_role (bypasses RLS).

alter table claims enable row level security;
alter table outbound_dms enable row level security;
alter table treasury_status enable row level security;

revoke all on table public.claims from anon, authenticated;
revoke all on table public.outbound_dms from anon, authenticated;
revoke all on table public.treasury_status from anon, authenticated;