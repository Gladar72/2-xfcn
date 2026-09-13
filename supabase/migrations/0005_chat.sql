-- 0005_chat.sql
-- Чат открывается только после подтверждения участия (п.15 ТЗ).
-- Реализуется через Supabase Realtime поверх обычных таблиц.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now()
);

create table conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  unread_count integer not null default 0,
  last_read_at timestamptz,
  is_hidden boolean not null default false, -- "удаление/скрытие чата для пользователя" (п.15)
  is_blocked boolean not null default false, -- локальная блокировка именно этого диалога

  created_at timestamptz not null default now(),

  unique (conversation_id, user_id)
);

create index conversation_members_user_idx on conversation_members (user_id);
create index conversation_members_conversation_idx on conversation_members (conversation_id);


create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null check (char_length(content) > 0),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on messages (conversation_id, created_at);
