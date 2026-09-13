-- 0013_accept_application_seat.sql
--
-- Атомарно занимает место во встрече: увеличивает seats_taken ТОЛЬКО если
-- есть свободные места. Возвращает true, если место занято, false — если
-- мест уже не было (organizer не должен был видеть кнопку "принять" в этом
-- случае, но гонка при параллельных запросах всё равно возможна — отсюда
-- атомарность в одном UPDATE, а не read-then-write из JS).

create or replace function accept_event_seat(p_event_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_updated boolean;
begin
  update events
  set seats_taken = seats_taken + 1
  where id = p_event_id and seats_taken < seats_total
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;
