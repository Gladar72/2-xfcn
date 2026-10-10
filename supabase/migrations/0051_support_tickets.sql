-- Обращения в поддержку из чата с ботом. Сохраняем каждое сообщение, чтобы
-- дежурный (Claude, плановая задача) мог разобрать его, даже когда компьютер
-- владельца выключен. Доступ только через service role (RLS без политик).
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  username text,
  first_name text,
  message text not null,
  bot_reply text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_status_created_idx on support_tickets (status, created_at);
create index if not exists support_tickets_telegram_idx on support_tickets (telegram_id, created_at desc);

alter table support_tickets enable row level security;
