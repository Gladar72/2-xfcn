-- Вход в мобильное приложение через бота: приложение берёт одноразовый токен,
-- открывает t.me/<bot>?start=login_<token>, бот подтверждает Telegram-аккаунт,
-- приложение забирает результат опросом. Токен живёт 10 минут и используется один раз.
create table if not exists mobile_tg_logins (
  token text primary key,
  telegram_id bigint,
  first_name text,
  username text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  used_at timestamptz
);
create index if not exists mobile_tg_logins_created_idx on mobile_tg_logins (created_at);
