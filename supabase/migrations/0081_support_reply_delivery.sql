-- Track actual Telegram acknowledgments; a saved reply is not proof of delivery.
alter table public.support_tickets
  add column if not exists admin_telegram_message_id bigint,
  add column if not exists admin_telegram_delivered_at timestamptz;

notify pgrst, 'reload schema';
