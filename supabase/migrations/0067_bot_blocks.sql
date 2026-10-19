-- Кто и после какого сообщения заблокировал бота.
-- bot_last_messages — последнее, что бот прислал человеку (одна строка на чат).
-- bot_blocks — журнал: заблокировал / разблокировал, и какое сообщение было последним перед этим.
create table if not exists public.bot_last_messages (
  telegram_id bigint primary key,
  method text not null,
  preview text,
  sent_at timestamptz not null default now()
);
create table if not exists public.bot_blocks (
  id bigserial primary key,
  telegram_id bigint not null,
  user_id uuid references public.users(id) on delete set null,
  status text not null,               -- 'blocked' | 'unblocked'
  at timestamptz not null default now(),
  last_method text,
  last_preview text,
  last_sent_at timestamptz,
  user_created_at timestamptz
);
create index if not exists bot_blocks_at_idx on public.bot_blocks (at desc);
alter table public.bot_last_messages enable row level security;
alter table public.bot_blocks enable row level security;
