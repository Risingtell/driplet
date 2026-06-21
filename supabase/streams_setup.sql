-- Driplet — creator streams (Phase A). Paste into the Supabase SQL Editor and RUN.
-- Lets any creator "go live": they own a row here with their payout split, and
-- viewers pay per second against /watch/<slug>. Existing demo streams (e.g.
-- ada-live) keep working from the in-code catalog as a fallback.

create table if not exists public.streams (
  slug text primary key,
  title text not null,
  creator text not null,
  location text not null default '',
  rate_per_second numeric not null default 0.0003,
  video_url text not null,
  -- Payout split: array of { name, role, share (0..1), address }.
  -- Shares should sum to 1; each address is where that payee is paid on Arc.
  split jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.streams enable row level security;

drop policy if exists "public read streams" on public.streams;
create policy "public read streams"
  on public.streams for select using (true);

drop policy if exists "service insert streams" on public.streams;
create policy "service insert streams"
  on public.streams for insert to service_role with check (true);
