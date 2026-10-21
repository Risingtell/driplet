-- Driplet pays no one's gas (owner rule, 21 Oct 2026). Every on-chain action's
-- network fee comes out of the money of the person it serves. These are the
-- two places that needs recording.
--
-- Run once in the Supabase SQL editor (driplet-mainnet). Safe to re-run.

-- 1. Refunds: how much of each refund was its own network fee. amount_usdc
--    stays what left the treasury (refund + fee); amount_usdc - fee_usdc is what
--    reached the viewer.
alter table public.viewer_refunds add column if not exists fee_usdc numeric not null default 0;

-- 2. Creator withdrawals from Gateway. A creator wallet has no USDC on-chain to
--    pay a mint with, so earnings are minted to the treasury and forwarded
--    minus the exact gas spent. Logged before money moves, so a forward that
--    fails after the mint is completed on the creator's next attempt.
--    status: started -> minted (out of Gateway, held by the treasury for the
--    creator) -> sent. A failed attempt is 'failed', or 'owed' if the one-time
--    setup gas was already spent; the next successful withdrawal repays it and
--    flips it to 'repaid'.
create table if not exists public.creator_withdrawals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  creator_address text not null,
  destination text not null,
  gross_usdc numeric not null,
  gateway_fee_usdc numeric not null default 0,
  network_fee_usdc numeric not null default 0,
  net_usdc numeric,
  mint_tx text,
  forward_tx text,
  status text not null default 'started' check (status in ('started', 'minted', 'sent', 'failed', 'owed', 'repaid'))
);

create index if not exists creator_withdrawals_creator on public.creator_withdrawals (creator_address, status);

-- Only ever read/written by the server via the service-role key, which bypasses
-- RLS. Enable RLS with no public policy so anon/auth clients can't touch it.
alter table public.creator_withdrawals enable row level security;

-- Explicit grants: Supabase stopped auto-granting Data API access to new public
-- tables on 2026-10-30. Service role only, matching the RLS setup above.
grant select, insert, update, delete on public.creator_withdrawals to service_role;
