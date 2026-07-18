-- Jellyfin per-minute VOD sidecar: tracked viewer playback positions.
-- A row is created/updated on PlaybackStart/Progress/Stop; the sidecar settles
-- forward movement of position_ticks (not wall-clock time) so pausing or
-- seeking backward is never billed as watched.
-- Run once in the Supabase SQL editor.

create table if not exists jellyfin_sessions (
  id             uuid primary key default gen_random_uuid(),
  stream_slug    text        not null,
  viewer_id      text        not null,
  position_ticks bigint      not null default 0,
  updated_at     timestamptz not null default now(),
  unique (stream_slug, viewer_id)
);

create index if not exists jellyfin_sessions_lookup
  on jellyfin_sessions (stream_slug, viewer_id);
