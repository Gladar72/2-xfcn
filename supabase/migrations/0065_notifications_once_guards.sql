-- Один раз на событие / на срок подписки: защита от повторной рассылки на уровне БД.
-- (Старые дубли не трогаем — индекс только для строк с этого момента.)
create unique index if not exists notifications_share_nudge_once2
  on public.notifications ((payload->>'eventId'))
  where type = 'share_nudge' and created_at >= timestamptz '2026-10-17 23:00:00+00';
create unique index if not exists notifications_sub_expiring_once2
  on public.notifications ((payload->>'subscriptionId'), (payload->>'periodEnd'))
  where type = 'subscription_expiring' and created_at >= timestamptz '2026-10-17 23:00:00+00';
