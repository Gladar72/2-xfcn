-- «Что ещё в городе»: события из открытых источников (сайты афиш, Timepad,
-- ВКонтакте). Живут отдельно от событий заведений и попадают в ленту
-- только после одобрения админом (status = approved).
create table if not exists public.city_events (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  title text not null,
  event_date date not null,
  event_time time,
  end_date date,
  place_name text,
  address text,
  latitude double precision,
  longitude double precision,
  price_text text,
  category text not null default 'custom',
  kind text,
  description text,
  source text not null,
  source_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notified_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_url, event_date)
);
create index if not exists city_events_feed_idx on public.city_events (city, status, event_date);
alter table public.city_events enable row level security;
-- Доступ только через сервер (service role); публичных политик нет.
