-- Удаление аккаунта самим пользователем (152-ФЗ, требование App Store).
-- Почти все данные пользователя удаляются каскадом вместе со строкой users.
-- Платежи остаются для налогового учёта, но без связи с человеком.
-- Идемпотентно: запускается при каждом деплое.
alter table public.payments alter column user_id drop not null;
alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey
  foreign key (user_id) references public.users(id) on delete set null;

-- Жалобы, которые разбирал удалённый админ, остаются.
alter table public.reports drop constraint if exists reports_reviewed_by_fkey;
alter table public.reports add constraint reports_reviewed_by_fkey
  foreign key (reviewed_by) references public.users(id) on delete set null;
