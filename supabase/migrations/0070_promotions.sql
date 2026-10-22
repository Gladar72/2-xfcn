-- «В популярное сегодня» вместо «Поднять встречу» (согласовано 22.10, вариант В).
-- Каждое продвижение получает свой гарантированный час на первом месте в городе:
-- top_from — когда встреча встаёт первой (сразу или после чужого часа),
-- top_until = top_from + 1 час. После своего часа встреча остаётся в
-- «Популярном» до начала (ends_at). Идемпотентно.

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  city text not null,
  source text not null check (source in ('plan', 'paid', 'admin')),
  payment_id uuid,
  top_from timestamptz not null,
  top_until timestamptz not null,
  ends_at timestamptz not null,
  views integer not null default 0,
  opens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists promotions_city_active on public.promotions (city, ends_at);
create index if not exists promotions_event on public.promotions (event_id);
create unique index if not exists promotions_payment_uniq on public.promotions (payment_id) where payment_id is not null;
alter table public.promotions enable row level security;
grant select, insert, update, delete on public.promotions to service_role;

-- Разовые платежи: payments.plan теперь может быть пустым, назначение — в purpose.
alter table public.payments add column if not exists purpose text not null default 'subscription';
alter table public.payments add column if not exists event_id uuid references public.events(id) on delete set null;
alter table public.payments alter column plan drop not null;
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.payments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.payments add constraint payments_plan_check
  check (plan is null or plan in ('start', 'medium', 'premium'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_purpose_check') then
    alter table public.payments add constraint payments_purpose_check
      check (purpose in ('subscription', 'promotion') and (purpose <> 'subscription' or plan is not null));
  end if;
end $$;

-- Счётчики: +1 показ / открытие для активного продвижения встречи.
create or replace function public.promotion_bump(p_event_ids uuid[], p_field text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'views' then
    update promotions set views = views + 1 where event_id = any(p_event_ids) and ends_at > now() and top_from <= now();
  elsif p_field = 'opens' then
    update promotions set opens = opens + 1 where event_id = any(p_event_ids) and ends_at > now() and top_from <= now();
  end if;
end $$;
grant execute on function public.promotion_bump(uuid[], text) to service_role;

notify pgrst, 'reload schema';
