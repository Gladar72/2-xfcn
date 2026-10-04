-- Итоги бизнес-события организатору приходят ОДИН раз (а не после каждой
-- оценки). Отметка, что сводка уже отправлена.
alter table events add column if not exists results_sent_at timestamptz;

-- Уже завершённым событиям сводку не шлём задним числом.
update events set results_sent_at = now() where status = 'completed' and results_sent_at is null;
