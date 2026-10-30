-- Подборка встреч раз в день вместо анонса каждой новой встречи.
-- announce_every_days: 1 — каждый день, 3 — «реже». last_digest_at — когда ушла последняя подборка.
alter table public.users add column if not exists announce_every_days smallint not null default 1;
alter table public.users add column if not exists last_digest_at timestamptz;
