-- Подборка мест для «Мося рекомендует» на шаге «Где?» при создании встречи:
-- по городам и категориям, с рейтингом и короткой заметкой. Заполняется сидом
-- (deploy/yandex/place-picks.sql) и админкой; для городов без подборки — OpenStreetMap.
-- Идемпотентно: запускается при каждом деплое.
create table if not exists public.place_picks (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  category text not null,            -- slug категории: coffee, cinema, training…
  training_type text,                -- для training: running, gym, yoga…
  name text not null,
  address text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  rating numeric(2,1),
  reviews integer,
  note text,
  source text,
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists place_picks_uniq on public.place_picks (city, category, coalesce(training_type, ''), lower(name));
create index if not exists place_picks_lookup on public.place_picks (city, category, training_type) where is_active;
alter table public.place_picks enable row level security;
grant select, insert, update, delete on public.place_picks to service_role;
notify pgrst, 'reload schema';
