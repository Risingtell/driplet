-- Driplet — database setup (paste this whole file into the Supabase SQL Editor and click RUN)
-- Creates the two tables the app needs + enables realtime so the dashboard updates live.

-- payment_events: append-only log of settled per-second nanopayments
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null,
  payer text not null,
  amount_usdc text not null,
  network text not null,
  gateway_tx text,
  raw jsonb
);

alter table public.payment_events enable row level security;

drop policy if exists "Allow public read access" on public.payment_events;
create policy "Allow public read access"
  on public.payment_events for select using (true);

drop policy if exists "Allow service inserts" on public.payment_events;
create policy "Allow service inserts"
  on public.payment_events for insert to service_role with check (true);

-- withdrawals: audit trail for Gateway withdrawals (creator cashing out)
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  amount_usdc text not null,
  destination_chain text not null,
  destination_address text not null,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'failed')),
  tx_hash text
);

alter table public.withdrawals enable row level security;

drop policy if exists "Allow public read access" on public.withdrawals;
create policy "Allow public read access"
  on public.withdrawals for select using (true);

drop policy if exists "Allow service inserts" on public.withdrawals;
create policy "Allow service inserts"
  on public.withdrawals for insert to service_role with check (true);

drop policy if exists "Allow service updates" on public.withdrawals;
create policy "Allow service updates"
  on public.withdrawals for update to service_role using (true);

-- Enable realtime so the dashboard streams updates without refreshing
alter publication supabase_realtime add table public.payment_events;
alter publication supabase_realtime add table public.withdrawals;
