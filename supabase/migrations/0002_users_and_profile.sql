-- 0002_users_and_profile.sql

create table users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  telegram_username text, -- НЕ показывается публично автоматически (см. п.21 ТЗ), только для служебных нужд
  name text not null,
  birth_date date not null,
  city text not null,
  bio text,
  avatar_url text,

  -- безопасность / модерация (п.22)
  is_profile_hidden boolean not null default false,
  moderation_status text not null default 'active'
    check (moderation_status in ('active', 'under_review', 'banned')),
  banned_at timestamptz,

  -- рейтинг, пересчитывается после отзывов (п.20)
  rating_avg numeric(3,2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  rating_count integer not null default 0,
  completed_meetings_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint users_18_plus check (birth_date <= (current_date - interval '18 years'))
);

create index users_city_idx on users (city);
create index users_moderation_status_idx on users (moderation_status);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();


create table user_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  url text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index user_photos_user_id_idx on user_photos (user_id);


create table interests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text,
  created_at timestamptz not null default now()
);


create table user_interests (
  user_id uuid not null references users(id) on delete cascade,
  interest_id uuid not null references interests(id) on delete cascade,
  primary key (user_id, interest_id)
);
