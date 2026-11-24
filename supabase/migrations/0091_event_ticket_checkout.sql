-- Only explicitly configured events use online checkout. Existing events keep admission on approval.
create table public.ticket_sales (
  event_id uuid primary key references public.events(id) on delete restrict,
  price_kopecks integer not null check (price_kopecks > 0),
  supplier_name text not null check (btrim(supplier_name) <> ''),
  purchase_terms text not null check (btrim(purchase_terms) <> ''),
  sales_end timestamptz not null
);
create table public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete restrict,
  event_id uuid not null references public.ticket_sales(event_id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  price_kopecks integer not null check (price_kopecks > 0),
  supplier_name text not null,
  purchase_terms text not null,
  event_title text not null,
  state text not null default 'approved' check (state in ('approved','pending','canceled','paid','review')),
  qr_token uuid not null default gen_random_uuid() unique,
  attempt_id uuid not null default gen_random_uuid(),
  attempted_at timestamptz,
  buyer_email text,
  receipt_uuid uuid,
  receipt_number text,
  provider_id uuid unique,
  confirmation_url text,
  unique (event_id, user_id)
);
alter table public.ticket_sales enable row level security;
alter table public.ticket_orders enable row level security;
revoke all on public.ticket_sales, public.ticket_orders from public, anon, authenticated;
grant select, insert, update on public.ticket_sales, public.ticket_orders to service_role;

create function public.approve_online_ticket(p_application uuid, p_organizer uuid)
returns text language plpgsql set search_path = public as $$
declare
  a applications%rowtype;
  e events%rowtype;
  s ticket_sales%rowtype;
begin
  select * into a from applications where id = p_application for update;
  select * into s from ticket_sales where event_id = a.event_id;
  if not found then return 'offline'; end if;
  select * into e from events where id = a.event_id for update;
  if e.organizer_id <> p_organizer then return 'forbidden'; end if;
  if a.status <> 'pending' then return 'already_processed'; end if;
  if not e.is_business or e.status <> 'published' or now() >= s.sales_end then return 'sales_closed'; end if;
  if not accept_event_seat(e.id) then return 'event_full'; end if;
  update applications set status = 'accepted' where id = a.id;
  insert into ticket_orders(application_id, event_id, user_id, price_kopecks, supplier_name, purchase_terms, event_title)
    values(a.id, e.id, a.user_id, s.price_kopecks, s.supplier_name, s.purchase_terms, e.title);
  insert into notifications(user_id, type, payload) values(a.user_id, 'ticket_approved', jsonb_build_object('eventId', e.id));
  return 'approved';
end $$;

-- Start once, keeping the same request and email on a retry after a lost network response.
create function public.start_ticket_attempt(p_event uuid, p_user uuid, p_email text)
returns public.ticket_orders language plpgsql set search_path = public as $$
declare
  o ticket_orders%rowtype;
begin
  select * into strict o from ticket_orders where event_id = p_event and user_id = p_user for update;
  if o.state in ('approved','canceled') then
    if not exists (select 1 from ticket_sales s join events e on e.id=s.event_id
      join applications a on a.id=o.application_id where s.event_id=p_event and s.sales_end>now()
      and e.status='published' and a.status='accepted') then raise exception 'sales_closed'; end if;
    update ticket_orders set state='pending', attempt_id=gen_random_uuid(), attempted_at=now(),
      buyer_email=p_email, provider_id=null, confirmation_url=null where id=o.id returning * into o;
  end if;
  return o;
end $$;

-- Other membership paths (invitations included) cannot issue an unpaid online ticket.
create function public.require_online_ticket_payment()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role='participant' and exists(select 1 from ticket_sales where event_id=new.event_id)
    and not exists(select 1 from ticket_orders where event_id=new.event_id and user_id=new.user_id and state='paid')
  then raise exception 'online_ticket_payment_required'; end if;
  return new;
end $$;
create trigger require_online_ticket_payment before insert or update of event_id,user_id,role on public.event_members
  for each row execute function public.require_online_ticket_payment();

create function public.apply_ticket_payment(p_order uuid, p_attempt uuid, p_payment uuid, p_amount integer, p_state text, p_url text)
returns text language plpgsql set search_path = public as $$
declare
  o ticket_orders%rowtype;
  e events%rowtype;
begin
  select * into strict o from ticket_orders where id=p_order for update;
  if o.attempt_id <> p_attempt or o.price_kopecks <> p_amount or (o.provider_id is not null and o.provider_id <> p_payment)
    then raise exception 'payment_mismatch'; end if;
  if o.state in ('paid','review','canceled') then return o.state; end if;
  if o.state <> 'pending' or p_state not in ('pending','canceled','paid') then raise exception 'invalid_payment_state'; end if;
  if p_state='paid' then
    select * into strict e from events where id=o.event_id for update;
    if e.status in ('cancelled','completed','hidden') or not exists(
      select 1 from applications where id=o.application_id and status='accepted')
    then p_state := 'review'; end if;
  end if;
  update ticket_orders set state=p_state, provider_id=p_payment,
    confirmation_url=case when p_state='pending' then coalesce(p_url,confirmation_url) end where id=o.id;
  if p_state='paid' then
    insert into event_members(event_id,user_id,role) values(o.event_id,o.user_id,'participant');
    insert into notifications(user_id,type,payload) values(o.user_id,'ticket_paid',jsonb_build_object('eventId',o.event_id));
  end if;
  return p_state;
end $$;
revoke all on function public.approve_online_ticket(uuid,uuid), public.start_ticket_attempt(uuid,uuid,text),
  public.apply_ticket_payment(uuid,uuid,uuid,integer,text,text), public.require_online_ticket_payment() from public, anon, authenticated;
grant execute on function public.approve_online_ticket(uuid,uuid), public.start_ticket_attempt(uuid,uuid,text),
  public.apply_ticket_payment(uuid,uuid,uuid,integer,text,text) to service_role;

-- Reserve a seat exactly once. Paid ticket history survives a legacy invitation, exit or RSVP.
create function public.guard_online_ticket_exit()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from ticket_orders where event_id=old.event_id and user_id=old.user_id and state='paid')
  then raise exception 'paid_ticket_requires_refund'; end if;
  return old;
end $$;
create trigger guard_online_ticket_exit before delete on public.event_members for each row execute function public.guard_online_ticket_exit();
revoke all on function public.guard_online_ticket_exit() from public,anon,authenticated;

create function public.check_online_ticket(p_event uuid, p_host uuid, p_user uuid, p_qr uuid)
returns jsonb language plpgsql set search_path=public as $$
declare
  buyer uuid;
  checked timestamptz;
begin
  if not exists(select 1 from events where id=p_event and organizer_id=p_host and status not in ('cancelled','hidden'))
    then return jsonb_build_object('state','invalid'); end if;
  select user_id into buyer from ticket_orders where event_id=p_event and state='paid'
    and ((p_qr is not null and qr_token=p_qr) or (p_qr is null and user_id=p_user)) for update;
  if buyer is null then return jsonb_build_object('state','invalid'); end if;
  update event_members set checked_in_at=now() where event_id=p_event and user_id=buyer and role='participant'
    and checked_in_at is null returning checked_in_at into checked;
  if checked is not null then return jsonb_build_object('state','checked','checkedInAt',checked); end if;
  select checked_in_at into checked from event_members where event_id=p_event and user_id=buyer and role='participant';
  return jsonb_build_object('state',case when checked is null then 'invalid' else 'already_checked' end,'checkedInAt',checked);
end $$;
revoke all on function public.check_online_ticket(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.check_online_ticket(uuid,uuid,uuid,uuid) to service_role;
