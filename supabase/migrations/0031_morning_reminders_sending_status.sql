-- 0031_morning_reminders_sending_status.sql
--
-- НАСТОЯЩАЯ причина, почему утренние напоминания никогда не
-- отправлялись: код атомарно "захватывает" строку перед отправкой,
-- временно проставляя status='sending' (чтобы не отправить дважды при
-- параллельном/повторном запуске cron) — но 'sending' отсутствовал в
-- CHECK-ограничении статуса, и база отвергала это обновление с ошибкой
-- 400. Код не проверял ошибку и просто трактовал это как "строку уже
-- забрал другой процесс", пропуская КАЖДОЕ напоминание без исключения.

alter table morning_reminders drop constraint morning_reminders_status_check;

alter table morning_reminders add constraint morning_reminders_status_check
  check (status in ('pending', 'sending', 'sent', 'skipped_active', 'skipped_disabled', 'failed', 'cancelled'));
