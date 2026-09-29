-- 0037_event_tickets.sql
--
-- Билеты на бизнес-события.
--
--   * Каждый принятый участник события «Для бизнеса» получает номер билета
--     вида M-7K4P. Его видно в приложении («Мой билет»), в уведомлении
--     «Ты в деле!», в напоминании за 2 часа и в сообщении бота.
--   * На входе человек называет номер, организатор находит его в списке
--     билетов и отмечает «Пришёл» (checked_in_at).
--
-- Номер выдаётся триггером при вставке участника в event_members — не нужно
-- менять каждое место, где участника добавляют. Для уже принятых участников
-- бизнес-событий номера выдаются ниже (backfill).

alter table event_members
  add column if not exists ticket_code text,
  add column if not exists checked_in_at timestamptz;

create unique index if not exists event_members_ticket_code_key
  on event_members (ticket_code)
  where ticket_code is not null;

-- Алфавит без похожих символов (нет 0/O, 1/I/L) — номер легко продиктовать.
create or replace function generate_ticket_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'M-';
    for i in 1..4 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from event_members where ticket_code = code);
  end loop;
  return code;
end;
$$;

create or replace function assign_event_ticket()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'participant'
     and new.ticket_code is null
     and exists (select 1 from events e where e.id = new.event_id and e.is_business)
  then
    new.ticket_code := generate_ticket_code();
  end if;
  return new;
end;
$$;

drop trigger if exists event_members_assign_ticket on event_members;
create trigger event_members_assign_ticket
  before insert on event_members
  for each row execute function assign_event_ticket();

-- Уже принятые участники бизнес-событий — выдаём номера сейчас.
do $$
declare
  r record;
begin
  for r in
    select m.id
    from event_members m
    join events e on e.id = m.event_id
    where e.is_business and m.role = 'participant' and m.ticket_code is null
  loop
    update event_members set ticket_code = generate_ticket_code() where id = r.id;
  end loop;
end;
$$;

-- Функции вызываются только сервером/триггером.
revoke execute on function generate_ticket_code() from public, anon, authenticated;
revoke execute on function assign_event_ticket() from public, anon, authenticated;
