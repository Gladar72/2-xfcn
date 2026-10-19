-- Встречи, созданные в старой базе (Supabase Cloud) уже после переезда, — переносим на сервер.
-- Безопасно повторять: on conflict do nothing; вставляем, только если организатор есть в базе сервера.
insert into public.events
select * from jsonb_populate_record(null::public.events, $j${"id":"66c340b7-ec19-4a13-adfb-321f9a3acae6","organizer_id":"e86cf8c0-4d56-45ef-b920-e0268209312c","category_id":"84667c1d-a6b6-4b8a-a1a8-e5c1013dac3f","training_type_id":"ea4a97a3-e8f9-46b8-8fda-a78662d47ed5","title":"Пробежка","description":"","city":"Тюмень","latitude":57.1662116049877,"longitude":65.4293273623767,"place_name":"Стадион Сельхоз","address":"Тюмень, Калининский округ","event_date":"2026-10-19","event_time":"17:00:00","seats_total":3,"seats_taken":0,"status":"published","boosted_at":null,"created_at":"2026-10-18T15:48:06.897322+00:00","updated_at":"2026-10-18T15:48:06.985906+00:00","cost_type":"each_pays","event_end_time":"18:00:00","is_business":false,"business_pricing_type":null,"business_pricing_details":null,"has_chat":true,"photo_url":"https://mesto-go.ru/brand/covers/running.webp","ticket_prefix":null,"ticket_seq":0,"threads_posted_at":null,"results_sent_at":null,"is_anonymous":false}$j$::jsonb)
where exists (select 1 from public.users where id = 'e86cf8c0-4d56-45ef-b920-e0268209312c')
on conflict (id) do nothing;

insert into public.event_members
select * from jsonb_populate_record(null::public.event_members, $j${"id":"de436afa-f2ca-4d9b-a648-d626fc435a39","event_id":"66c340b7-ec19-4a13-adfb-321f9a3acae6","user_id":"e86cf8c0-4d56-45ef-b920-e0268209312c","role":"organizer","joined_at":"2026-10-18T15:48:06.939798+00:00","ticket_code":null,"checked_in_at":null}$j$::jsonb)
where exists (select 1 from public.events where id = '66c340b7-ec19-4a13-adfb-321f9a3acae6')
on conflict do nothing;

select id, title, event_date, event_time, status from public.events where id = '66c340b7-ec19-4a13-adfb-321f9a3acae6';
