-- «Огонёк» на событии: человек отмечает, что событие классное, даже если не идёт.
-- Один огонёк от человека на событие. Счётчик хранится в events.fire_count. Идемпотентно.
create table if not exists public.event_fires (
  event_id uuid not null references public.events(id) on delete cascade,
  -- Без внешнего ключа на users: иначе API базы видит второй путь events↔users и ломает «organizer:users(...)».
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_fires_user_idx on public.event_fires (user_id);
alter table public.event_fires enable row level security;
alter table public.event_fires drop constraint if exists event_fires_user_id_fkey;

alter table public.events add column if not exists fire_count integer not null default 0;

create or replace function public.event_fires_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.events set fire_count = fire_count + 1 where id = new.event_id;
  elsif tg_op = 'DELETE' then
    update public.events set fire_count = greatest(0, fire_count - 1) where id = old.event_id;
  end if;
  return null;
end $$;

drop trigger if exists event_fires_count_trg on public.event_fires;
create trigger event_fires_count_trg after insert or delete on public.event_fires
  for each row execute function public.event_fires_count();

-- Сверка (на случай ручных правок).
update public.events e set fire_count = coalesce(c.n, 0)
from (select id, (select count(*) from public.event_fires f where f.event_id = ev.id) n from public.events ev) c
where c.id = e.id and e.fire_count is distinct from coalesce(c.n, 0);

notify pgrst, 'reload schema';
