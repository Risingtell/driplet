-- Driplet — add real live-stream support to the streams table.
-- Paste into the Supabase SQL Editor and RUN.
--
-- is_live = true means the creator broadcasts their camera (LiveKit room = slug)
-- instead of playing a recorded video_url. Recorded streams keep working as before.

alter table public.streams
  add column if not exists is_live boolean not null default false;

-- Live streams have no recorded clip, so allow video_url to be empty/null.
alter table public.streams
  alter column video_url drop not null;
