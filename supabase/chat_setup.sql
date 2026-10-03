-- Live stream chat. Messages are read/written through a server API route using
-- the service role, so no client-side Realtime auth is needed. Run once.

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

-- Only ever read/written by the server via the service-role key, which bypasses
-- RLS. Enable RLS with no public policy so anon/auth clients can't touch it.
alter table chat_messages enable row level security;
