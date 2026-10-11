-- Вход в мобильное приложение по почте (код на email) — бесплатная замена SMS.
alter table users add column if not exists email text;
create unique index if not exists users_email_key on users (email) where email is not null; -- храним в нижнем регистре

create table if not exists email_otps (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);
alter table email_otps enable row level security; -- доступ только у сервера (service role)
