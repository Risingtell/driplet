-- Live stream chat. Messages are read/written through a server API route using
-- the service role, so no client-side RLS/Realtime auth is needed. Run once.

create table if not exists chat_messages (
  id         bigserial primary key,
  slug       text        not null,
  name       text        not null,
  text       text        not null,
  host       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_slug_time
  on chat_messages (slug, created_at);
