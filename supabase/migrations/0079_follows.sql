-- Подписка на организатора (человека или заведение): новые открытые события
-- организатора приходят подписчикам сами — в бот и push. Идемпотентно.
create table if not exists public.follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  organizer_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, organizer_id),
  constraint follows_not_self check (follower_id <> organizer_id)
);
create index if not exists follows_organizer_idx on public.follows (organizer_id);
-- Доступ только с сервера (service role), как у остальных служебных таблиц.
alter table public.follows enable row level security;
