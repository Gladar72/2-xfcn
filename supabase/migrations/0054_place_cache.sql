-- Кеш подсказок мест («Мося рекомендует») из OpenStreetMap: обновляется
-- ночным cron /api/cron/places, чтобы в приложении места показывались
-- мгновенно, без ожидания внешнего сервера. Доступ только с сервера.
create table if not exists public.place_cache (
  city text not null,
  key text not null,          -- категория или "training:<вид>"
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (city, key)
);
alter table public.place_cache enable row level security;
