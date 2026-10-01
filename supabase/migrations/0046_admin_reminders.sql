-- 0046_admin_reminders.sql
-- Разовые напоминания владельцу в бот. Отправляет утренний cron
-- /api/cron/outreach (~10:00 по Тюмени), когда send_at наступил.
-- Миграция 0045 (events.threads_posted_at) применена напрямую в БД.

alter table events add column if not exists threads_posted_at timestamptz;

create table if not exists admin_reminders (
  id bigserial primary key,
  send_at timestamptz not null,
  text text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table admin_reminders enable row level security;
