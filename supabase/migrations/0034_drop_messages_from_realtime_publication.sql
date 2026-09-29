-- 0034_drop_messages_from_realtime_publication.sql
--
-- Чат теперь работает через Realtime Broadcast (см. 0033), postgres_changes
-- на messages больше никто не слушает. Убираем таблицу из публикации, чтобы
-- Realtime не разбирал WAL на каждую вставку сообщения впустую.
-- Вернуть при необходимости: alter publication supabase_realtime add table messages;

alter publication supabase_realtime drop table messages;
