-- То же, что 0065, но с отсечкой позже: на сервере Yandex Cloud после переезда уже успели
-- набежать дубли «поделись событием» до 00:00 UTC 18.10 (старый код), и индекс с отсечкой
-- 23:00 там не создаётся. Индексы идемпотентны (if not exists) — безопасно выполнять повторно.
create unique index if not exists notifications_share_nudge_once3
  on public.notifications ((payload->>'eventId'))
  where type = 'share_nudge' and created_at >= timestamptz '2026-10-18 00:00:00+00';
create unique index if not exists notifications_sub_expiring_once3
  on public.notifications ((payload->>'subscriptionId'), (payload->>'periodEnd'))
  where type = 'subscription_expiring' and created_at >= timestamptz '2026-10-18 00:00:00+00';
