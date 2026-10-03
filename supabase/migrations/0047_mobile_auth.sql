-- Мобильное приложение: вход по номеру телефона (SMS-код) и через Telegram Login.
-- Пользователь из приложения может не иметь Telegram — telegram_id становится необязательным.
alter table users alter column telegram_id drop not null;
alter table users add column if not exists phone text;
create unique index if not exists users_phone_key on users (phone) where phone is not null;

-- Одноразовые коды подтверждения телефона. Храним только хэш кода.
create table if not exists phone_otps (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);
alter table phone_otps enable row level security; -- доступ только у сервера (service role)

-- Токены Expo Push для уведомлений в мобильном приложении.
create table if not exists push_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on push_tokens (user_id);
alter table push_tokens enable row level security;
