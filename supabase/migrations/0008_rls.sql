-- 0008_rls.sql
--
-- Важное допущение (см. docs/ARCHITECTURE.md, раздел 5 "Аутентификация"):
-- мы не используем стандартную Supabase Auth. Backend после проверки Telegram
-- initData выпускает собственный JWT, подписанный SUPABASE_JWT_SECRET, где
-- claim "sub" = users.id. Благодаря этому auth.uid() в политиках ниже работает
-- как обычно и указывает на users.id текущего пользователя.
--
-- RLS здесь — это ПОСЛЕДНИЙ РУБЕЖ ЗАЩИТЫ, а не основной механизм прав доступа.
-- Основная бизнес-логика (лимиты подписки, чей ход, кто кого принял) считается
-- в API routes на service_role ключе, который RLS не проходит вообще —
-- см. docs/ARCHITECTURE.md раздел 4.

-- Небольшой helper: есть ли блокировка в любую сторону между двумя пользователями.
create or replace function is_blocked_pair(user_a uuid, user_b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

--------------------------------------------------------------------------------
-- USERS
--------------------------------------------------------------------------------
alter table users enable row level security;

-- Публичные профили видны всем аутентифицированным пользователям,
-- кроме забаненных и кроме тех, с кем есть взаимная блокировка.
-- Фильтрация "каких именно полей не отдавать" (тариф, платежи, телефон и т.п.)
-- происходит в API-слое через явный список select-колонок, а не здесь.
create policy users_select_public
  on users for select
  using (
    moderation_status <> 'banned'
    and not is_blocked_pair(auth.uid(), id)
  );

-- Каждый видит и может редактировать только свою строку.
create policy users_update_self
  on users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Вставка новых пользователей — только через сервер (service_role), поэтому
-- политики INSERT для обычной роли нет — обычная роль вставить не сможет.

--------------------------------------------------------------------------------
-- USER_PHOTOS / INTERESTS / USER_INTERESTS
--------------------------------------------------------------------------------
alter table user_photos enable row level security;

create policy user_photos_select_public
  on user_photos for select
  using (true);

create policy user_photos_owner_write
  on user_photos for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table interests enable row level security;
create policy interests_select_all on interests for select using (true);

alter table user_interests enable row level security;
create policy user_interests_select_public on user_interests for select using (true);
create policy user_interests_owner_write
  on user_interests for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

--------------------------------------------------------------------------------
-- CATEGORIES / TRAINING_TYPES — справочники, читают все, пишет только backend
--------------------------------------------------------------------------------
alter table categories enable row level security;
create policy categories_select_all on categories for select using (true);

alter table training_types enable row level security;
create policy training_types_select_all on training_types for select using (true);

--------------------------------------------------------------------------------
-- EVENTS
--------------------------------------------------------------------------------
alter table events enable row level security;

-- Видны опубликованные встречи, кроме встреч заблокированных друг для друга людей.
-- Организатор дополнительно видит свои встречи в любом статусе (draft/hidden/closed).
create policy events_select
  on events for select
  using (
    (status = 'published' and not is_blocked_pair(auth.uid(), organizer_id))
    or organizer_id = auth.uid()
  );

-- Создавать встречу может любой аутентифицированный пользователь как организатор,
-- НО реальная проверка "есть ли активная подписка и не исчерпан ли лимит" —
-- в API route перед вставкой (RLS этого не считает).
create policy events_insert_own
  on events for insert
  with check (organizer_id = auth.uid());

create policy events_update_own
  on events for update
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

--------------------------------------------------------------------------------
-- EVENT_MEMBERS
--------------------------------------------------------------------------------
alter table event_members enable row level security;

create policy event_members_select
  on event_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- Запись в event_members делает только backend (service_role) при принятии заявки.

--------------------------------------------------------------------------------
-- APPLICATIONS
--------------------------------------------------------------------------------
alter table applications enable row level security;

-- Заявку видит тот, кто её подал, и организатор встречи.
create policy applications_select
  on applications for select
  using (
    user_id = auth.uid()
    or exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- Откликнуться может любой пользователь (кроме заблокированных) — только от своего имени.
create policy applications_insert_own
  on applications for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from events e
      where e.id = event_id
        and not is_blocked_pair(auth.uid(), e.organizer_id)
    )
  );

-- Обновлять статус (accepted/rejected) может только организатор встречи,
-- отменить свою заявку (cancelled) может сам заявитель.
create policy applications_update
  on applications for update
  using (
    user_id = auth.uid()
    or exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid())
  );

--------------------------------------------------------------------------------
-- CONVERSATIONS / CONVERSATION_MEMBERS / MESSAGES
-- Ключевое правило из ТЗ: "сообщения чата могут читать только conversation members".
--------------------------------------------------------------------------------
alter table conversations enable row level security;

create policy conversations_select_members_only
  on conversations for select
  using (
    exists (
      select 1 from conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );

alter table conversation_members enable row level security;

create policy conversation_members_select_self_scope
  on conversation_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from conversation_members cm2
      where cm2.conversation_id = conversation_id and cm2.user_id = auth.uid()
    )
  );

create policy conversation_members_update_self
  on conversation_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table messages enable row level security;

create policy messages_select_members_only
  on messages for select
  using (
    exists (
      select 1 from conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
  );

create policy messages_insert_members_only
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_members cm
      where cm.conversation_id = conversation_id
        and cm.user_id = auth.uid()
        and cm.is_blocked = false
    )
  );

--------------------------------------------------------------------------------
-- SUBSCRIPTIONS / SUBSCRIPTION_USAGE — "видит только владелец и backend/admin" (п.24 ТЗ)
--------------------------------------------------------------------------------
alter table subscriptions enable row level security;

create policy subscriptions_select_own
  on subscriptions for select
  using (user_id = auth.uid());

-- INSERT/UPDATE подписок — только backend (service_role). Обычной роли политик нет.

alter table subscription_usage enable row level security;

create policy subscription_usage_select_own
  on subscription_usage for select
  using (
    exists (
      select 1 from subscriptions s
      where s.id = subscription_id and s.user_id = auth.uid()
    )
  );

--------------------------------------------------------------------------------
-- BOOSTS
--------------------------------------------------------------------------------
alter table boosts enable row level security;

create policy boosts_select
  on boosts for select
  using (
    user_id = auth.uid()
    or exists (select 1 from events e where e.id = event_id and e.organizer_id = auth.uid())
  );

--------------------------------------------------------------------------------
-- PAYMENTS — видит только владелец (п.24 ТЗ), пишет только backend через webhook
--------------------------------------------------------------------------------
alter table payments enable row level security;

create policy payments_select_own
  on payments for select
  using (user_id = auth.uid());

--------------------------------------------------------------------------------
-- REVIEWS
--------------------------------------------------------------------------------
alter table reviews enable row level security;

-- Отзывы о пользователе видны всем (влияют на публичный рейтинг),
-- но кто именно оставил отзыв — не критично скрывать на уровне select,
-- т.к. на публичном профиле показывается агрегированный рейтинг, не сырые отзывы.
create policy reviews_select_all
  on reviews for select
  using (true);

-- Вставка отзыва — только реальным участником завершённой встречи о другом
-- реальном участнике той же встречи (п.20 ТЗ). Полная проверка "встреча
-- завершена и оба были участниками" — в API перед вставкой; здесь — минимальный
-- барьер по ролям.
create policy reviews_insert_participant_only
  on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from event_members em
      where em.event_id = event_id and em.user_id = auth.uid()
    )
    and exists (
      select 1 from event_members em2
      where em2.event_id = event_id and em2.user_id = reviewee_id
    )
  );

--------------------------------------------------------------------------------
-- REPORTS
--------------------------------------------------------------------------------
alter table reports enable row level security;

-- Жалобу видит только тот, кто её подал (плюс admin/backend через service_role).
create policy reports_select_own
  on reports for select
  using (reporter_id = auth.uid());

create policy reports_insert_own
  on reports for insert
  with check (reporter_id = auth.uid());

--------------------------------------------------------------------------------
-- BLOCKS
--------------------------------------------------------------------------------
alter table blocks enable row level security;

create policy blocks_select_own
  on blocks for select
  using (blocker_id = auth.uid());

create policy blocks_insert_own
  on blocks for insert
  with check (blocker_id = auth.uid());

create policy blocks_delete_own
  on blocks for delete
  using (blocker_id = auth.uid());

--------------------------------------------------------------------------------
-- NOTIFICATIONS
--------------------------------------------------------------------------------
alter table notifications enable row level security;

create policy notifications_select_own
  on notifications for select
  using (user_id = auth.uid());

create policy notifications_update_own
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
