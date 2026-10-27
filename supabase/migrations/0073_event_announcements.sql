-- Анонсы новых встреч в Telegram: человек может отключить их кнопкой «Не присылать анонсы». Идемпотентно.
alter table public.users add column if not exists event_announcements boolean not null default true;
notify pgrst, 'reload schema';
