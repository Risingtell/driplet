-- Viewer credit ledger: how much of their prepaid balance each viewer has
-- actually watched down, per stream. A viewer prepays a lump (Face ID / email /
-- own wallet) into the stream treasury, then watches it down a second at a time.
-- Without this, the unwatched remainder lived only in the browser tab and was
-- stranded on close, so returning viewers paid a fresh lump every visit.
--
-- `prepaid` is derived live from payment_events (the /passkey|/email|/own rows),
-- so it isn't stored here — only how much has been consumed. remaining = prepaid
-- - consumed, clamped at 0.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.viewer_credit (
  payer text not null,
  slug text not null,
  consumed_usdc numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (payer, slug)
);

-- Only ever read/written by the server via the service-role key, which bypasses
-- RLS. Enable RLS with no public policy so anon/auth clients can't touch it.
alter table public.viewer_credit enable row level security;

-- Seed: treat every prepay made BEFORE this ledger existed as already fully
-- consumed. Those sessions were watched down in the browser and are over, so
-- their prepaid should not suddenly look resumable. Only watching from here on
-- builds resumable credit. Safe to re-run — never clobbers live consumption.
insert into public.viewer_credit (payer, slug, consumed_usdc)
select lower(payer), split_part(endpoint, '/', 3), sum(amount_usdc::numeric)
from public.payment_events
where endpoint like '/passkey/%' or endpoint like '/email/%' or endpoint like '/own/%'
group by lower(payer), split_part(endpoint, '/', 3)
on conflict (payer, slug) do nothing;
