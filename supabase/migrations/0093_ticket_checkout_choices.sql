alter table public.ticket_orders
  add column if not exists checkout_method text check (checkout_method in ('bank_card','sbp')),
  add column if not exists guest_refund_note text check (length(guest_refund_note) <= 500);

-- Bind the method to the winning attempt. Retries must send the same body to the bank.
create or replace function public.accept_ticket_checkout(
  p_event uuid, p_user uuid, p_email text, p_terms text, p_full boolean,
  p_start timestamptz, p_event_snapshot jsonb, p_order_terms text, p_method text
) returns public.ticket_orders language plpgsql set search_path=public as $$
declare o ticket_orders%rowtype; initial_state text;
begin
  if p_method is not null and p_method not in ('bank_card','sbp') then
    raise exception 'invalid_checkout_method';
  end if;
  select state into strict initial_state from ticket_orders
    where event_id=p_event and user_id=p_user for update;
  select * into strict o from accept_ticket_contract(p_event,p_user,p_email,p_terms,p_full,
    p_start,p_event_snapshot,p_order_terms);
  if initial_state in ('approved','canceled') and o.state='pending' then
    update ticket_orders set checkout_method=p_method where id=o.id returning * into o;
  end if;
  return o;
end $$;

create or replace function public.submit_ticket_refund(
  p_event uuid, p_user uuid, p_start timestamptz, p_event_snapshot jsonb, p_note text
) returns text language plpgsql set search_path=public as $$
declare initial_state text; result text;
begin
  select state into initial_state from ticket_orders where event_id=p_event and user_id=p_user for update;
  result := request_ticket_refund(p_event,p_user,p_start,p_event_snapshot);
  if initial_state in ('paid','review') and result='refund_pending' and nullif(trim(p_note),'') is not null then
    update ticket_orders set guest_refund_note=trim(p_note) where event_id=p_event and user_id=p_user;
  end if;
  return result;
end $$;
revoke all on function public.accept_ticket_checkout(uuid,uuid,text,text,boolean,timestamptz,jsonb,text,text),
  public.submit_ticket_refund(uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.accept_ticket_checkout(uuid,uuid,text,text,boolean,timestamptz,jsonb,text,text),
  public.submit_ticket_refund(uuid,uuid,timestamptz,jsonb,text) to service_role;
notify pgrst, 'reload schema';
