-- 0055_advisor_fixes.sql
--
-- Исправления по замечаниям советника Supabase (security + performance).
-- Поведение приложения не меняется: сервер работает через service_role,
-- политики RLS — защита от прямых запросов к REST API с токеном пользователя.

-- 1. Функция проверки участника чата для Realtime: переносим из public
--    в непубличную схему private, чтобы её нельзя было вызвать через
--    /rest/v1/rpc. Политика Realtime продолжает её использовать.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_conversation_member_topic(p_topic text)
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
        and cm.user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_conversation_member_topic(text) from public, anon;
grant execute on function private.is_conversation_member_topic(text) to authenticated, service_role;

alter policy chat_members_receive_broadcast on realtime.messages
  using (
    realtime.messages.extension = 'broadcast'
    and private.is_conversation_member_topic(realtime.topic())
  );

-- Старую функцию в public пока не удаляем (это сделает 0056), а только
-- отзываем право вызова.
revoke execute on function public.is_conversation_member_topic(text) from public, anon, authenticated;

-- 2. RLS: auth.uid() -> (select auth.uid()), чтобы значение считалось один
--    раз на запрос, а не для каждой строки.
--    Заодно исправлены условия, где подзапрос сравнивал столбец сам с собой
--    (em.event_id = em.event_id и т.п.) и поэтому не проверял нужную запись:
--    reviews_insert_participant_only, messages_insert_members_only,
--    conversations_select_members_only. Это только сужает доступ.

alter policy applications_insert_own on public.applications
  with check (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = applications.event_id) AND (NOT is_blocked_pair((select auth.uid()), e.organizer_id)))))));

alter policy applications_select on public.applications
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = applications.event_id) AND (e.organizer_id = (select auth.uid())))))));

alter policy applications_update on public.applications
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = applications.event_id) AND (e.organizer_id = (select auth.uid())))))))
  with check (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = applications.event_id) AND (e.organizer_id = (select auth.uid())))))));

alter policy blocks_delete_own on public.blocks
  using ((blocker_id = (select auth.uid())));

alter policy blocks_insert_own on public.blocks
  with check ((blocker_id = (select auth.uid())));

alter policy blocks_select_own on public.blocks
  using ((blocker_id = (select auth.uid())));

alter policy boosts_select on public.boosts
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = boosts.event_id) AND (e.organizer_id = (select auth.uid())))))));

-- Логика оставлена как была (политика ссылается на свою же таблицу и для
-- пользовательских запросов фактически закрыта ошибкой рекурсии; приложение
-- читает чаты только через сервер).
alter policy conversation_members_select_self_scope on public.conversation_members
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM conversation_members cm2
  WHERE ((cm2.conversation_id = cm2.conversation_id) AND (cm2.user_id = (select auth.uid())))))));

alter policy conversation_members_update_self on public.conversation_members
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy conversations_select_members_only on public.conversations
  using ((EXISTS ( SELECT 1
   FROM conversation_members cm
  WHERE ((cm.conversation_id = conversations.id) AND (cm.user_id = (select auth.uid()))))));

alter policy event_members_select on public.event_members
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_members.event_id) AND (e.organizer_id = (select auth.uid())))))));

alter policy events_insert_own on public.events
  with check ((organizer_id = (select auth.uid())));

alter policy events_select on public.events
  using ((((status = 'published'::text) AND (NOT is_blocked_pair((select auth.uid()), organizer_id))) OR (organizer_id = (select auth.uid()))));

alter policy events_update_own on public.events
  using ((organizer_id = (select auth.uid())))
  with check ((organizer_id = (select auth.uid())));

alter policy messages_insert_members_only on public.messages
  with check (((sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM conversation_members cm
  WHERE ((cm.conversation_id = messages.conversation_id) AND (cm.user_id = (select auth.uid())) AND (cm.is_blocked = false))))));

alter policy messages_select_members_only on public.messages
  using ((EXISTS ( SELECT 1
   FROM conversation_members cm
  WHERE ((cm.conversation_id = messages.conversation_id) AND (cm.user_id = (select auth.uid()))))));

alter policy notifications_select_own on public.notifications
  using ((user_id = (select auth.uid())));

alter policy notifications_update_own on public.notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy payments_select_own on public.payments
  using ((user_id = (select auth.uid())));

alter policy reports_insert_own on public.reports
  with check ((reporter_id = (select auth.uid())));

alter policy reports_select_own on public.reports
  using ((reporter_id = (select auth.uid())));

alter policy reviews_insert_participant_only on public.reviews
  with check (((reviewer_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM event_members em
  WHERE ((em.event_id = reviews.event_id) AND (em.user_id = (select auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM event_members em2
  WHERE ((em2.event_id = reviews.event_id) AND (em2.user_id = reviews.reviewee_id))))));

alter policy subscription_usage_select_own on public.subscription_usage
  using ((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.id = subscription_usage.subscription_id) AND (s.user_id = (select auth.uid()))))));

alter policy subscriptions_select_own on public.subscriptions
  using ((user_id = (select auth.uid())));

alter policy users_select_public on public.users
  using (((moderation_status <> 'banned'::text) AND (NOT is_blocked_pair((select auth.uid()), id))));

alter policy users_update_self on public.users
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

-- 3. user_interests / user_photos: пока только переводим на (select auth.uid()).
--    Разделение FOR ALL на insert/update/delete — в 0056.
alter policy user_interests_owner_write on public.user_interests
  using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy user_photos_owner_write on public.user_photos
  using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));

-- 4. Индексы для внешних ключей без индекса.
create index if not exists event_rsvps_user_id_idx on public.event_rsvps (user_id);
create index if not exists events_training_type_id_idx on public.events (training_type_id);
create index if not exists gift_claims_user_id_idx on public.gift_claims (user_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists payments_subscription_id_idx on public.payments (subscription_id);
create index if not exists reports_event_id_idx on public.reports (event_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_reviewed_by_idx on public.reports (reviewed_by);
create index if not exists reviews_reviewer_id_idx on public.reviews (reviewer_id);
create index if not exists user_interests_interest_id_idx on public.user_interests (interest_id);
