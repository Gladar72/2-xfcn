insert into users(id,name,birth_date,gender,city) values
  ('5717f10a-0000-4000-8000-000000000001','Организатор TestFlight','1990-01-01','male','Тюмень');
insert into events(id,organizer_id,category_id,title,description,city,place_name,event_date,event_time,seats_total,
  is_business,biz_category,business_pricing_type,business_pricing_details,has_chat)
select e.id,'5717f10a-0000-4000-8000-000000000001',c.id,e.title,'Проверка билетов в TestFlight. Оплата тестовой картой.','Тюмень',
  'Тестовая площадка',current_date+30,'21:00',300,true,'party','ticket','1 500 ₽',false
from categories c cross join (values
 ('5717f10a-0000-4000-8000-000000000011'::uuid,'TestFlight · Возврат билета'),
 ('5717f10a-0000-4000-8000-000000000012'::uuid,'TestFlight · Билет и QR-код')
) as e(id,title) where c.slug='party';
insert into ticket_sales(event_id,price_kopecks,supplier_name,purchase_terms,sales_end,full_refund_before_start)
select id,150000,'Тестовый организатор','Тестовый билет. Полный возврат до начала события.',now()+interval '29 days',true
from events where organizer_id='5717f10a-0000-4000-8000-000000000001';
create function public.ticket_test_guest(p_sub text) returns uuid language plpgsql set search_path=public as $$
declare guest uuid; entry record; application uuid; approval text; hosted uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_sub, 0));
  select id into guest from users where apple_sub=p_sub;
  if guest is not null then return guest; end if;
  insert into users(name,birth_date,gender,city,apple_sub) values
    ('Гость TestFlight','1990-01-01','male','Тюмень',p_sub) returning id into guest;
  for entry in select id,organizer_id from events where organizer_id='5717f10a-0000-4000-8000-000000000001' loop
    insert into applications(event_id,user_id) values(entry.id,guest) returning id into application;
    approval := approve_online_ticket(application,entry.organizer_id);
    if approval <> 'approved' then raise exception 'Sandbox reservation failed'; end if;
  end loop;
  insert into events(id,organizer_id,category_id,title,description,city,place_name,event_date,event_time,seats_total,
    is_business,biz_category,business_pricing_type,business_pricing_details,has_chat)
  select hosted,guest,id,'TestFlight · Я организатор','Второй тестировщик может подать заявку и купить билет.',
    'Тюмень','Тестовая площадка',current_date+30,'20:00',20,true,'party','ticket','1 500 ₽',false
  from categories where slug='party';
  insert into event_members(event_id,user_id,role) values(hosted,guest,'organizer');
  insert into ticket_sales(event_id,price_kopecks,supplier_name,purchase_terms,sales_end,full_refund_before_start)
  values(hosted,150000,'Тестовый организатор','Проверка отметки на входе в TestFlight.',now()+interval '29 days',true);
  return guest;
end $$;
revoke all on function public.ticket_test_guest(text) from public,anon,authenticated;
grant execute on function public.ticket_test_guest(text) to service_role;
