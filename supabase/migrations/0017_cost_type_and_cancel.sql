-- 0017_cost_type_and_cancel.sql
--
-- 1. cost_type — как делятся расходы на встрече. Показывается в фильтре
--    поиска и на шаге мастера создания встречи.
-- 2. decrement_subscription_usage_field — симметричная пара к
--    increment_subscription_usage_field (0012): при отмене СВОЕЙ встречи
--    организатором лимит "создано встреч за период" возвращается назад,
--    чтобы отмена не считалась использованием тарифа (см. запрос
--    пользователя: "при отмене встреча не списывается с баланса").
--    GREATEST(...,0) — защита от ухода в минус при повторном/гоночном вызове.

alter table events
  add column cost_type text not null default 'each_pays'
    check (cost_type in ('each_pays', 'organizer_treats', 'free', 'negotiable'));

create or replace function decrement_subscription_usage_field(
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_field text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_field = 'events_created_count' then
    update subscription_usage
    set events_created_count = greatest(events_created_count - 1, 0)
    where subscription_id = p_subscription_id and period_start = p_period_start;
  elsif p_field = 'boosts_used_count' then
    update subscription_usage
    set boosts_used_count = greatest(boosts_used_count - 1, 0)
    where subscription_id = p_subscription_id and period_start = p_period_start;
  else
    raise exception 'Unknown field: %', p_field;
  end if;
end;
$$;
