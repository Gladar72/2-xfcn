-- 0040_channel_gifts.sql
--
-- Подарок подписчикам Telegram-канала: месяц подписки «Старт».
--
-- Бот не может сам написать человеку, который его ни разу не запускал, и не
-- видит список подписчиков канала. Поэтому схема такая: бот (админ канала)
-- публикует пост с кнопкой «🎁 Забрать подписку» → человек нажимает → бот
-- проверяет, что он подписан на канал, включает подписку и присылает
-- приветствие. Один подарок на человека в одной кампании.
--
-- Если человек ещё не зарегистрирован в приложении, подарок ждёт его
-- (applied_at is null) и включается сразу после регистрации.

create table if not exists gift_campaigns (
  code text primary key,                 -- часть ссылки: t.me/<bot>?start=gift_<code>
  title text not null,                   -- «Двор» — от чьего имени подарок
  channel_id bigint,                     -- канал, подписчикам которого дарим (бот — админ)
  channel_title text,
  channel_username text,
  plan text not null default 'start' check (plan in ('start', 'medium', 'premium')),
  days int not null default 30 check (days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists gift_claims (
  campaign_code text not null references gift_campaigns(code) on delete cascade,
  telegram_id bigint not null,
  user_id uuid references users(id) on delete set null,
  claimed_at timestamptz not null default now(),
  applied_at timestamptz,
  primary key (campaign_code, telegram_id)
);

create index if not exists gift_claims_pending_idx on gift_claims (telegram_id) where applied_at is null;

-- Только сервер (service_role).
alter table gift_campaigns enable row level security;
alter table gift_claims enable row level security;

insert into gift_campaigns (code, title, plan, days)
values ('dvor', 'Двор', 'start', 30)
on conflict (code) do nothing;

-- Приветственный «кружок» (video note) от автора: админ присылает его боту,
-- бот публикует его в канал перед постом-подарком и шлёт в личку при
-- получении подарка.
alter table gift_campaigns add column if not exists video_note_file_id text;
