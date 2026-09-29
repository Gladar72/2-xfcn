-- 0033_chat_broadcast.sql
--
-- Чат переводится с postgres_changes на Supabase Realtime Broadcast.
-- postgres_changes проверяет RLS для КАЖДОГО подписчика на КАЖДУЮ вставку
-- в messages — при тысячах онлайн это главный потолок Realtime. Broadcast
-- просто рассылает готовое сообщение по каналу, а права проверяются один
-- раз — при подключении к каналу (политика ниже).
--
-- Канал: приватный топик "conversation:<uuid>". Слушать его может только
-- участник этого диалога. Отправляет в канал только сервер (service_role,
-- через REST API Realtime) — политики на insert для пользователей нет.

create or replace function public.is_conversation_member_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_topic, ':', 1) = 'conversation'
    and exists (
      select 1
      from conversation_members cm
      where cm.conversation_id::text = split_part(p_topic, ':', 2)
        and cm.user_id = auth.uid()
    );
$$;

revoke all on function public.is_conversation_member_topic(text) from public;
grant execute on function public.is_conversation_member_topic(text) to authenticated;

create policy chat_members_receive_broadcast
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.is_conversation_member_topic(realtime.topic())
  );
