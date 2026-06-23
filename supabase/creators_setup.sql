-- Driplet — creator accounts. Each signed-in creator gets one Circle
-- developer-controlled wallet on Arc; this table links the auth user to it.
-- Paste into the Supabase SQL Editor and RUN.

create table if not exists public.creators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  circle_wallet_id text not null,
  address text not null,
  created_at timestamptz not null default now()
);

alter table public.creators enable row level security;

-- A signed-in creator can read their own row; wallet creation/inserts happen
-- server-side with the service role (which bypasses RLS).
drop policy if exists "own creator row" on public.creators;
create policy "own creator row"
  on public.creators for select using (auth.uid() = user_id);
