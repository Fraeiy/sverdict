-- Treasury-seeded pool liquidity per market (ledger debit on create)

alter table markets add column if not exists seed_liquidity numeric(18, 4) not null default 0;