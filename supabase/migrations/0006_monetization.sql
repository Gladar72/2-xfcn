-- 0006_monetization.sql

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  plan text not null check (plan in ('start', 'medium', 'premium')),
  status text not null default 'active'
    check (status in ('active', 'expired', 'cancelled', 'payment_failed')),

  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- у пользователя может быть много подписок в истории, но активна максимум одна
create unique index subscriptions_one_active_per_user
  on subscriptions (user_id)
  where status = 'active';

create index subscriptions_user_idx on subscriptions (user_id);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();


-- Счётчики использования лимитов ЗА ТЕКУЩИЙ расчётный период (п.26 ТЗ).
-- Пересоздаётся/обнуляется при каждом новом периоде подписки.
create table subscription_usage (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,

  period_start timestamptz not null,
  period_end timestamptz not null,

  events_created_count integer not null default 0,
  boosts_used_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (subscription_id, period_start)
);

create trigger subscription_usage_set_updated_at
  before update on subscription_usage
  for each row execute function set_updated_at();


create table boosts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index boosts_event_idx on boosts (event_id);
create index boosts_user_idx on boosts (user_id);


create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,

  plan text not null check (plan in ('start', 'medium', 'premium')),
  amount integer not null, -- в минимальных единицах Telegram Stars
  currency text not null default 'XTR', -- Telegram Stars currency code

  -- источник истины — событие/апдейт от Telegram, а не клиент (п.25 ТЗ)
  telegram_payment_charge_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),

  created_at timestamptz not null default now()
);

create index payments_user_idx on payments (user_id);
create index payments_status_idx on payments (status);
