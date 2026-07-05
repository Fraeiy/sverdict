-- User settings (trading defaults, notification / DM preferences)

alter table users add column if not exists preferences jsonb not null default '{}'::jsonb;