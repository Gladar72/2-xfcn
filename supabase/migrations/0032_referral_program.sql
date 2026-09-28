-- 0032_referral_program.sql
--
-- Партнёрская (реферальная) программа для блогеров.
--   * Блогер в боте жмёт «Партнёрская программа» → заявка (pending).
--   * Админ одобряет → блогер получает ссылку t.me/<bot>?start=ref_<code>.
--   * Кто перешёл по ссылке — навсегда закреплён за партнёром (первый переход).
--   * С КАЖДОЙ успешной оплаты подписки такого человека партнёру
--     начисляется 30% (без ограничения по сроку).
--   * Выплаты вручную: партнёр запрашивает → админ переводит и жмёт «Выплачено».
--
-- Все таблицы доступны только серверу (service_role): RLS включён,
-- политик для anon/authenticated нет.

create table referral_partners (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  telegram_username text,
  first_name text,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  payout_details text,
  awaiting_payout_details boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- Кто по чьей ссылке пришёл. Ключ — telegram_id: человек может перейти
-- по ссылке ещё до регистрации в приложении (строки в users ещё нет).
create table referral_attributions (
  referred_telegram_id bigint primary key,
  partner_id uuid not null references referral_partners(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index referral_attributions_partner_idx on referral_attributions(partner_id);

create table referral_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references referral_partners(id) on delete cascade,
  amount_rub numeric(12, 2) not null default 0,
  amount_stars numeric(12, 2) not null default 0,
  payout_details text,
  status text not null default 'requested' check (status in ('requested', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index referral_payouts_partner_idx on referral_payouts(partner_id);

create table referral_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references referral_partners(id) on delete cascade,
  -- unique: одна оплата = одно начисление (защита от повторных вебхуков)
  payment_id uuid not null unique references payments(id) on delete cascade,
  referred_telegram_id bigint not null,
  payment_amount numeric(12, 2) not null,
  amount numeric(12, 2) not null,
  currency text not null,
  rate numeric(4, 3) not null default 0.300,
  status text not null default 'accrued' check (status in ('accrued', 'requested', 'paid')),
  payout_id uuid references referral_payouts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index referral_commissions_partner_idx on referral_commissions(partner_id);
create index referral_commissions_payout_idx on referral_commissions(payout_id);

alter table referral_partners enable row level security;
alter table referral_attributions enable row level security;
alter table referral_payouts enable row level security;
alter table referral_commissions enable row level security;
