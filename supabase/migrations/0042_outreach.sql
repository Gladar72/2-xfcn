-- 0042_outreach.sql
--
-- Помощник по охвату: список пабликов и блогеров, которым пишем от имени
-- владельца. Сообщения отправляет сам владелец (с личного аккаунта), а
-- помощник каждое утро присылает ему в бот пачку карточек: кому писать,
-- готовый текст и кнопку, открывающую чат. Статусы меняются кнопками
-- «✅ Отправил», «💬 Ответили» и т. д.

create table if not exists outreach_contacts (
  id text primary key,
  name text not null,
  platform text not null check (platform in ('tg', 'ig', 'vk')),
  kind text not null default 'public' check (kind in ('public', 'blogger')),
  prio text not null default 'B' check (prio in ('A', 'B', 'C')),
  reach int,
  topic text,
  handle text,                -- username канала / профиля (без @)
  contact text,               -- кому писать: username админа (без @) или ссылка
  greeting text,              -- своё приветствие («Динара, здравствуйте!»)
  acts text,                  -- свой список примеров («спектакль, концерт…»)
  org_line text,              -- свой абзац для организаторов
  status text not null default 'new'
    check (status in ('new', 'queued', 'sent', 'replied', 'deal', 'live', 'no', 'skip', 'no_contact')),
  queued_at timestamptz,
  sent_at timestamptz,
  reminder_shown_at timestamptz,
  reminded_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

create index if not exists outreach_contacts_status_idx on outreach_contacts (status, platform);

-- Только сервер (service_role).
alter table outreach_contacts enable row level security;
