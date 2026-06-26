-- Live viewer presence. Each watching browser sends a heartbeat every few
-- seconds; the watch count = distinct viewers seen in the last ~20s. Read and
-- written through a server API route using the service role, so no client-side
-- RLS/Realtime auth is needed. Works for both live and recorded streams. Run once.

create table if not exists stream_presence (
  slug      text        not null,
  viewer_id text        not null,
  last_seen timestamptz not null default now(),
  primary key (slug, viewer_id)
);

create index if not exists stream_presence_slug_seen
  on stream_presence (slug, last_seen);
