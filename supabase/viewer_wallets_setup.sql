-- Driplet — viewer accounts. Each viewer who signs in with email gets one
-- Circle developer-controlled wallet on Arc, so they can pay without a
-- browser wallet or passkey. Mirrors creators_setup.sql exactly, kept as a
-- separate table since a viewer and a creator are different roles even
-- though the schema shape is identical. Paste into the Supabase SQL Editor
-- and RUN.

create table if not exists public.viewer_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  circle_wallet_id text not null,
  address text not null,
  created_at timestamptz not null default now()
);

alter table public.viewer_wallets enable row level security;

-- A signed-in viewer can read their own row; wallet creation/inserts happen
-- server-side with the service role (which bypasses RLS).
drop policy if exists "own viewer wallet row" on public.viewer_wallets;
create policy "own viewer wallet row"
  on public.viewer_wallets for select using (auth.uid() = user_id);
