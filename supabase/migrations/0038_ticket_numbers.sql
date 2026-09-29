-- 0038_ticket_numbers.sql
--
-- Удобные номера билетов: «код события + порядковый номер», например
--   «Мастер-класс: собираем букет» → MKS-001, MKS-002, MKS-003 …
--
--   * Код события — первые буквы слов названия латиницей (3 буквы). Если
--     такой код уже занят другим событием — последние буквы подбираются
--     случайно, поэтому номер билета уникален во всём приложении.
--   * Номер — по порядку принятия в событие (001, 002 …). Организатору на
--     входе достаточно услышать «семь» — ищется по номеру 007.
--   * Номер не переиспользуется: если человек отменил участие, следующий
--     получит новый номер, а не его старый.

alter table events
  add column if not exists ticket_prefix text,
  add column if not exists ticket_seq int not null default 0;

create unique index if not exists events_ticket_prefix_key
  on events (ticket_prefix)
  where ticket_prefix is not null;

-- Код события из названия: первые буквы слов (слова короче 3 букв — «на»,
-- «в», «и» — пропускаются), кириллица → латиница.
create or replace function event_ticket_prefix(p_event_id uuid)
returns text
language plpgsql
volatile
as $$
declare
  existing text;
  v_title text;
  word text;
  base text := '';
  candidate text;
  alphabet constant text := 'ABCDEFGHJKLMNPRSTUVWXYZ';
  attempt int := 0;
begin
  select e.ticket_prefix, e.title into existing, v_title from events e where e.id = p_event_id for update;
  if existing is not null then
    return existing;
  end if;

  for word in select w from regexp_split_to_table(upper(coalesce(v_title, '')), '[^A-ZА-ЯЁ]+') as w loop
    exit when length(base) >= 3;
    if length(word) >= 3 then
      base := base || translate(
        left(word, 1),
        'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
        'ABVGDEEZZIIKLMNOPRSTUFHCCSSXYXEUY'
      );
    end if;
  end loop;
  base := regexp_replace(base, '[^A-Z]', '', 'g');

  -- Подходящих слов меньше трёх — добиваем случайными буквами.
  while length(base) < 3 loop
    base := base || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;

  candidate := base;
  while exists (select 1 from events where ticket_prefix = candidate) loop
    attempt := attempt + 1;
    if attempt <= 40 then
      candidate := left(base, 2) || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    else
      candidate := left(base, 1)
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1)
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end if;
  end loop;

  update events set ticket_prefix = candidate where events.id = p_event_id;
  return candidate;
end;
$$;

-- Следующий номер билета события: MKS-001, MKS-002 …
create or replace function generate_ticket_code(p_event_id uuid)
returns text
language plpgsql
volatile
as $$
declare
  prefix text;
  seq int;
begin
  prefix := event_ticket_prefix(p_event_id);
  update events set ticket_seq = ticket_seq + 1 where id = p_event_id returning ticket_seq into seq;
  return prefix || '-' || lpad(seq::text, 3, '0');
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
    new.ticket_code := generate_ticket_code(new.event_id);
  end if;
  return new;
end;
$$;

drop function if exists generate_ticket_code();

-- Перевыпуск уже выданных билетов в новом формате — по порядку принятия.
do $$
declare
  r record;
begin
  update event_members set ticket_code = null where ticket_code is not null;
  for r in
    select m.id, m.event_id
    from event_members m
    join events e on e.id = m.event_id
    where e.is_business and m.role = 'participant'
    order by m.event_id, m.joined_at
  loop
    update event_members set ticket_code = generate_ticket_code(r.event_id) where id = r.id;
  end loop;
end;
$$;

revoke execute on function event_ticket_prefix(uuid) from public, anon, authenticated;
revoke execute on function generate_ticket_code(uuid) from public, anon, authenticated;
revoke execute on function assign_event_ticket() from public, anon, authenticated;
