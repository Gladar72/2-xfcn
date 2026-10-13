-- Вход через Apple в iOS-приложении: постоянный идентификатор пользователя у Apple (sub из identityToken).
alter table public.users add column if not exists apple_sub text;
create unique index if not exists users_apple_sub_key on public.users (apple_sub) where apple_sub is not null;
