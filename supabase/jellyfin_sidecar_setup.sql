-- Jellyfin per-minute VOD sidecar: tracked viewer playback positions.
-- A row is created/updated on PlaybackStart/Progress/Stop; the sidecar settles
-- forward movement of position_ticks (not wall-clock time) so pausing or
-- seeking backward is never billed as watched. total_seconds caps one
-- session's cumulative billable time (mirrors the Owncast sidecar's
-- MAX_SESSION_SECONDS), since Jellyfin bills incrementally per event rather
-- than once at close.
-- Safe to run again if you already ran an earlier version of this file — the
-- ADD COLUMN IF NOT EXISTS lines below backfill total_seconds on an existing
-- table without touching your data.

create table if not exists jellyfin_sessions (
  id             uuid primary key default gen_random_uuid(),
  stream_slug    text        not null,
  viewer_id      text        not null,
  position_ticks bigint      not null default 0,
  total_seconds  double precision not null default 0,
  updated_at     timestamptz not null default now(),
  unique (stream_slug, viewer_id)
);

alter table jellyfin_sessions add column if not exists total_seconds double precision not null default 0;

create index if not exists jellyfin_sessions_lookup
  on jellyfin_sessions (stream_slug, viewer_id);
