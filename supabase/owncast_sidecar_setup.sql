-- Owncast per-second webhook sidecar: open viewer sessions.
-- A row is created on USER_JOINED and removed on USER_PARTED, at which point the
-- sidecar settles (now - joined_at) seconds * rate to the streamer's payees.
-- Run once in the Supabase SQL editor.

create table if not exists owncast_sessions (
  id          uuid primary key default gen_random_uuid(),
  stream_slug text        not null,
  viewer_id   text        not null,
  joined_at   timestamptz not null default now(),
  unique (stream_slug, viewer_id)
);

create index if not exists owncast_sessions_lookup
  on owncast_sessions (stream_slug, viewer_id);
