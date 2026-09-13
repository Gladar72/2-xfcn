-- 0012_subscription_usage_increment.sql
--
-- Атомарный инкремент счётчика в subscription_usage. Вызывается только из
-- backend (service_role) после успешной проверки лимита — см.
-- lib/subscriptions/server.ts. UPDATE ... SET x = x + 1 в одном запросе
-- исключает гонку между параллельными запросами на создание встречи/буст.

create or replace function increment_subscription_usage_field(
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
    set events_created_count = events_created_count + 1
    where subscription_id = p_subscription_id and period_start = p_period_start;
  elsif p_field = 'boosts_used_count' then
    update subscription_usage
    set boosts_used_count = boosts_used_count + 1
    where subscription_id = p_subscription_id and period_start = p_period_start;
  else
    raise exception 'Unknown field: %', p_field;
  end if;
end;
$$;
