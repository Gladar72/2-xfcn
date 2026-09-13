-- 0001_extensions_and_helpers.sql
-- Базовые расширения и общая функция для автообновления updated_at.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Общий триггер: подставляет now() в updated_at при любом UPDATE.
-- Используется всеми таблицами, где нужен updated_at.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
