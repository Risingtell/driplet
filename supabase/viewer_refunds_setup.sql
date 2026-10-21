-- Viewer refunds: unwatched prepay sent back to the wallet that paid it.
--
-- A viewer prepays a lump into the stream treasury and watches it down. When
-- they leave the stream, whatever they did not watch goes back on-chain to
-- their own wallet, so they can spend it on another creator. Each row is one
-- refund attempt. Credit and stream income both subtract every row that is
-- 'pending' or 'sent'; 'failed' rows never moved money and are ignored.
--
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.viewer_refunds (
  id uuid primary key default gen_random_uuid(),
  payer text not null,
  slug text not null,
  amount_usdc numeric not null default 0,
  -- The refund's own network fee, which came out of it (Driplet pays no gas).
  fee_usdc numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists viewer_refunds_payer_slug on public.viewer_refunds (payer, slug);
create index if not exists viewer_refunds_slug on public.viewer_refunds (slug);

-- At most one refund in flight per viewer per stream, so two simultaneous
-- requests can never both send the same leftover.
create unique index if not exists viewer_refunds_one_pending
  on public.viewer_refunds (payer, slug) where status = 'pending';

-- Only ever read/written by the server via the service-role key, which bypasses
-- RLS. Enable RLS with no public policy so anon/auth clients can't touch it.
alter table public.viewer_refunds enable row level security;

-- Explicit grants: Supabase stopped auto-granting Data API access to new public
-- tables on 2026-10-30. Service role only, matching the RLS setup above.
grant select, insert, update, delete on public.viewer_refunds to service_role;
