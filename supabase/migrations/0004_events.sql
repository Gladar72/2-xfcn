-- 0004_events.sql

create table events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references users(id) on delete cascade,

  category_id uuid not null references categories(id),
  training_type_id uuid references training_types(id), -- заполняется только когда category = 'training'

  title text not null,
  description text,

  city text not null,
  latitude double precision,
  longitude double precision,
  place_name text,
  address text,

  event_date date not null,
  event_time time not null,

  seats_total smallint not null check (seats_total >= 1),
  seats_taken smallint not null default 0 check (seats_taken >= 0),

  status text not null default 'published'
    check (status in ('draft', 'published', 'hidden', 'closed', 'completed', 'cancelled')),

  -- поднятие встречи (п.18 ТЗ)
  boosted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_seats_not_overbooked check (seats_taken <= seats_total),
  -- training_type обязателен только для категории "тренировка" — проверяется в приложении
  -- (constraint на уровне БД, зависящий от join с categories.slug, добавлять не будем ради простоты;
  --  проверка идёт в API перед вставкой).
  constraint events_time_when_today check (true) -- зарезервировано; логика "нельзя создать встречу в прошлом" — на уровне API
);

create index events_city_status_date_idx on events (city, status, event_date);
create index events_category_idx on events (category_id);
create index events_organizer_idx on events (organizer_id);
create index events_boosted_at_idx on events (boosted_at desc nulls last);

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();


create table event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('organizer', 'participant')),
  joined_at timestamptz not null default now(),

  unique (event_id, user_id)
);

create index event_members_event_idx on event_members (event_id);
create index event_members_user_idx on event_members (user_id);


create table applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, user_id) -- нельзя откликнуться на одну встречу дважды
);

create index applications_event_idx on applications (event_id);
create index applications_user_idx on applications (user_id);
create index applications_status_idx on applications (status);

create trigger applications_set_updated_at
  before update on applications
  for each row execute function set_updated_at();
