-- Поддержка и партнёрская программа в мобильном приложении (аккаунт вместо Telegram).
-- (Применено в проде через Supabase MCP; файл — для истории схемы.)

alter table public.support_tickets alter column telegram_id drop not null;
alter table public.support_tickets add column if not exists user_id uuid references public.users(id) on delete set null;
alter table public.support_tickets add column if not exists source text not null default 'bot';
alter table public.support_tickets add column if not exists admin_reply text;
alter table public.support_tickets add column if not exists admin_replied_at timestamptz;
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);

alter table public.referral_partners alter column telegram_id drop not null;
alter table public.referral_partners add column if not exists user_id uuid unique references public.users(id) on delete set null;
update public.referral_partners p set user_id = u.id from public.users u where p.user_id is null and u.telegram_id = p.telegram_id;

create table if not exists public.referral_user_attributions (
  referred_user_id uuid primary key references public.users(id) on delete cascade,
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists referral_user_attributions_partner_idx on public.referral_user_attributions(partner_id);
alter table public.referral_user_attributions enable row level security;

alter table public.referral_commissions alter column referred_telegram_id drop not null;
alter table public.referral_commissions add column if not exists referred_user_id uuid references public.users(id) on delete set null;

update public.referral_commissions c set referred_user_id = u.id
  from public.users u where c.referred_user_id is null and c.referred_telegram_id is not null and u.telegram_id = c.referred_telegram_id;
update public.support_tickets t set user_id = u.id
  from public.users u where t.user_id is null and t.telegram_id is not null and u.telegram_id = t.telegram_id;

-- Запрос выплаты атомарно: два параллельных запроса не создадут две выплаты.
create or replace function public.request_partner_payout(p_partner_id uuid, p_details text)
returns table (payout_id uuid, amount_rub numeric, amount_stars numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_payout uuid;
  v_rub numeric := 0;
  v_stars numeric := 0;
begin
  insert into public.referral_payouts (partner_id, amount_rub, amount_stars, payout_details)
  values (p_partner_id, 0, 0, p_details)
  returning id into v_payout;

  with taken as (
    update public.referral_commissions
       set status = 'requested', payout_id = v_payout
     where partner_id = p_partner_id and status = 'accrued'
    returning amount, currency
  )
  select coalesce(sum(amount) filter (where currency <> 'XTR'), 0),
         coalesce(sum(amount) filter (where currency = 'XTR'), 0)
    into v_rub, v_stars
    from taken;

  if v_rub = 0 and v_stars = 0 then
    delete from public.referral_payouts where id = v_payout;
    return;
  end if;
  update public.referral_payouts set amount_rub = v_rub, amount_stars = v_stars where id = v_payout;
  return query select v_payout, v_rub, v_stars;
end $$;
revoke all on function public.request_partner_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.request_partner_payout(uuid, text) to service_role;
