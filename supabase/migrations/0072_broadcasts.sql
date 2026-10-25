-- Разовые рассылки от бота всем пользователям: кому уже ушло (повторный запуск не дублирует). Идемпотентно.
create table if not exists public.broadcast_sends (
  key text not null,
  telegram_id bigint not null,
  ok boolean not null default true,
  error text,
  sent_at timestamptz not null default now(),
  primary key (key, telegram_id)
);
alter table public.broadcast_sends enable row level security;
grant select, insert, update, delete on public.broadcast_sends to service_role;
notify pgrst, 'reload schema';
