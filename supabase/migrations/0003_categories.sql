-- 0003_categories.sql
-- Категории верхнего уровня и подкатегории тренировок.
-- Хранятся в БД, а не захардкожены — их можно добавлять без деплоя (п.6 ТЗ:
-- "список должен быть расширяемым через базу или конфигурацию").

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- 'training' | 'cinema' | 'coffee' | 'breakfast' | 'dinner' | 'walk' | 'custom'
  name text not null,
  emoji text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table training_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- 'running' | 'padel' | 'gym' | 'hyrox' | 'football' | 'cycling' | 'yoga' | 'custom'
  name text not null,
  emoji text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
