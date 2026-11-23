-- Accepted terms and the original ticket number survive changes to the event and membership.
alter table public.ticket_sales add column full_refund_before_start boolean;
alter table public.ticket_orders
  drop constraint ticket_orders_state_check,
  add constraint ticket_orders_state_check check (state in ('approved','pending','canceled','paid','review','refund_pending','refund_review','refunded')),
  add column accepted_terms text,
  add column accepted_at timestamptz,
  add column purchased_start timestamptz,
  add column full_refund_before_start boolean not null default false,
  add column archived_code text,
  add column refund_requested_at timestamptz,
  add column refund_id uuid unique,
  add column refund_key uuid not null default gen_random_uuid(),
  add column refund_first_attempt timestamptz,
  add column refund_check_at timestamptz,
  add column refund_reason text,
  add column refund_receipt_uuid uuid,
  add column refund_receipt_number text;
create index ticket_refund_work on public.ticket_orders(refund_check_at)
  where state in ('refund_pending','refunded') and refund_receipt_number is null;

create function public.accept_ticket_contract(p_event uuid,p_user uuid,p_email text,p_terms text,p_full boolean,
  p_start timestamptz,p_event_snapshot jsonb,p_order_terms text) returns public.ticket_orders
  language plpgsql set search_path=public as $$
declare o ticket_orders%rowtype; e events%rowtype; s ticket_sales%rowtype;
begin
  select * into strict o from ticket_orders where event_id=p_event and user_id=p_user for update;
  if o.state not in ('approved','canceled') then return o; end if;
  select * into strict e from events where id=p_event for share;
  select * into strict s from ticket_sales where event_id=p_event for share;
  if not (to_jsonb(e) @> p_event_snapshot) or o.purchase_terms<>p_order_terms
    or p_full is distinct from coalesce(s.full_refund_before_start,e.biz_category='party',false)
    or p_start <= now() then raise exception 'conditions_changed'; end if;
  select * into strict o from start_ticket_attempt(p_event,p_user,p_email);
  update ticket_orders set accepted_at=now(),accepted_terms=p_terms,purchased_start=p_start,
    full_refund_before_start=p_full where id=o.id returning * into o;
  return o;
end $$;

-- Serialize check-in and withdrawal on the same order row. The timestamp is the server's.
create function public.request_ticket_refund(p_event uuid,p_user uuid,p_start timestamptz,p_event_snapshot jsonb)
returns text language plpgsql set search_path=public as $$
declare o ticket_orders%rowtype; e events%rowtype; m event_members%rowtype;
begin
  select * into o from ticket_orders where event_id=p_event and user_id=p_user for update;
  if not found then return 'missing'; end if;
  if o.state in ('refund_pending','refund_review','refunded') then return o.state; end if;
  if o.state not in ('paid','review') then return 'unpaid'; end if;
  select * into strict e from events where id=p_event for share;
  select * into m from event_members where event_id=p_event and user_id=p_user and role='participant';
  if e.status <> 'cancelled' then
    if not (to_jsonb(e) @> p_event_snapshot) then return 'changed'; end if;
    if o.state <> 'paid' or m.checked_in_at is not null then return 'support'; end if;
    if o.purchased_start is not null and o.purchased_start<>p_start then null; -- changed date, guest can decline
    elsif e.status not in ('published','closed') or not o.full_refund_before_start or now()>=p_start then return 'support';
    end if;
  end if;
  update ticket_orders set state='refund_pending',refund_requested_at=now(),refund_check_at=now(),
    refund_reason=case when e.status='cancelled' then 'event_cancelled' else 'guest' end,archived_code=m.ticket_code
    where id=o.id;
  return 'refund_pending';
end $$;

-- Detect late payment confirmations too. A cancellation is durable even if a worker is offline.
create function public.claim_ticket_refund_work(p_limit integer) returns setof public.ticket_orders
language plpgsql set search_path=public as $$
begin
  with cancelled as (
    select o.id from ticket_orders o join events e on e.id=o.event_id
    where e.status='cancelled' and o.state in ('paid','review') and o.provider_id is not null
    order by o.id limit greatest(1,least(p_limit,50)) for update of o skip locked
  )
  update ticket_orders o set state='refund_pending',refund_requested_at=now(),refund_reason='event_cancelled',refund_check_at=now(),
    archived_code=(select m.ticket_code from event_members m where m.event_id=o.event_id and m.user_id=o.user_id and m.role='participant')
    from cancelled c where o.id=c.id;
  return query with due as (
    select id from ticket_orders where state in ('refund_pending','refunded') and refund_receipt_number is null
      and refund_check_at<=now() order by refund_check_at,id limit greatest(1,least(p_limit,50)) for update skip locked
  ) update ticket_orders o set refund_check_at=now()+interval '2 minutes',
      refund_first_attempt=coalesce(refund_first_attempt,now()) from due where o.id=due.id returning o.*;
end $$;

create function public.apply_ticket_refund(p_order uuid,p_refund uuid,p_payment uuid,p_amount integer,p_status text)
returns text language plpgsql set search_path=public as $$
declare o ticket_orders%rowtype;
begin
  select * into strict o from ticket_orders where id=p_order for update;
  if o.provider_id is distinct from p_payment or o.price_kopecks<>p_amount or p_refund is null
    or (o.refund_id is not null and o.refund_id<>p_refund) then raise exception 'refund_mismatch'; end if;
  if o.state='refunded' then return o.state; end if;
  if o.state not in ('refund_pending','refund_review') or p_status not in ('succeeded','pending','canceled')
    then raise exception 'unexpected_refund'; end if;
  update ticket_orders set refund_id=p_refund,state=case p_status when 'succeeded' then 'refunded'
    when 'canceled' then 'refund_review' else 'refund_pending' end,
    refund_check_at=case when p_status='succeeded' then now() else now()+interval '1 minute' end where id=p_order returning * into o;
  if p_status='succeeded' then
    delete from event_members where event_id=o.event_id and user_id=o.user_id and role='participant';
    if exists(select 1 from applications where id=o.application_id and status='accepted') then
      update applications set status='cancelled' where id=o.application_id;
      update events set seats_taken=greatest(0,seats_taken-1) where id=o.event_id;
    end if;
    delete from conversation_members where user_id=o.user_id and conversation_id in
      (select id from conversations where event_id=o.event_id);
    insert into notifications(user_id,type,payload) values(o.user_id,'ticket_refunded',jsonb_build_object('eventId',o.event_id));
  end if;
  return o.state;
end $$;

revoke all on function public.accept_ticket_contract(uuid,uuid,text,text,boolean,timestamptz,jsonb,text),
 public.request_ticket_refund(uuid,uuid,timestamptz,jsonb),public.claim_ticket_refund_work(integer),
 public.apply_ticket_refund(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.accept_ticket_contract(uuid,uuid,text,text,boolean,timestamptz,jsonb,text),
 public.request_ticket_refund(uuid,uuid,timestamptz,jsonb),public.claim_ticket_refund_work(integer),
 public.apply_ticket_refund(uuid,uuid,uuid,integer,text) to service_role;

create or replace function public.guard_online_ticket_exit()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from ticket_orders where event_id=old.event_id and user_id=old.user_id and state in ('paid','refund_pending','refund_review'))
  then raise exception 'paid_ticket_requires_refund'; end if;
  return old;
end $$;

alter table public.support_tickets add column ticket_order_id uuid references public.ticket_orders(id);
create index support_ticket_order_time on public.support_tickets(ticket_order_id,created_at desc) where ticket_order_id is not null;
