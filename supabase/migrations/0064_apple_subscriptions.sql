-- Подписки через App Store: связь подписки Apple (originalTransactionId) с аккаунтом «Места».
create table if not exists public.apple_subscriptions (
  original_transaction_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  product_id text not null,
  plan text not null check (plan in ('start', 'medium', 'premium')),
  status smallint,
  expires_at timestamptz,
  environment text,
  last_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists apple_subscriptions_user_idx on public.apple_subscriptions (user_id);
alter table public.apple_subscriptions enable row level security;
