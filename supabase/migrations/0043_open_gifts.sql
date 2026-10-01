-- 0043_open_gifts.sql
--
-- Подарок по ссылке из платной рекламы (паблики ВК, чужие каналы): без
-- проверки подписки на канал — подписку «Старт» на месяц получает каждый,
-- кто пришёл по ссылке t.me/<bot>?start=gift_<code>. Отдельный code на
-- каждую площадку — чтобы видеть, сколько людей пришло с каждой.

alter table gift_campaigns add column if not exists open_to_all boolean not null default false;

insert into gift_campaigns (code, title, plan, days, open_to_all) values
  ('afisha_vk', 'Афиша Тюмень · ВК', 'start', 30, true),
  ('afisha_tg', 'Афиша Тюмень · Telegram', 'start', 30, true)
on conflict (code) do nothing;
