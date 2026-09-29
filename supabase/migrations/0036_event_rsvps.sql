-- 0036_event_rsvps.sql
--
-- Напоминание за 2 часа до встречи с подтверждением «Иду / Не смогу».
--
--   * За 2 часа до начала бот пишет каждому участнику и организатору.
--     Участнику — с кнопками «✅ Иду» / «❌ Не смогу», организатору — просто
--     напоминание.
--   * Не ответил — за час до начала бот напоминает ещё раз (один раз).
--   * «Не смогу» — участник убирается из встречи и чата, место снова
--     свободно, организатору приходит сообщение.
--
-- Одна строка = одно напоминание одному человеку об одной встрече.
-- unique (event_id, user_id) — защита от повторной отправки при
-- параллельных запусках cron: вставляется (и отправляется) только новая.

create table event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('organizer', 'participant')),
  status text not null default 'sent' check (status in ('sent', 'going', 'not_going')),
  reminder_count int not null default 1,
  first_sent_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (event_id, user_id)
);

create index event_rsvps_pending_idx on event_rsvps (status, reminder_count) where status = 'sent';

-- Только сервер (service_role): RLS включён, политик для пользователей нет.
alter table event_rsvps enable row level security;
