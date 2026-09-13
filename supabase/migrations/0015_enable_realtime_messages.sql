-- 0015_enable_realtime_messages.sql
-- Без добавления таблицы в публикацию supabase_realtime подписки
-- postgres_changes на неё просто не будут получать события.

alter publication supabase_realtime add table messages;
