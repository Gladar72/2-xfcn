-- Подарок «Старт» на 30 дней по ссылке из директа Инстаграма (рассылает владелец вручную).
-- Ссылка: https://t.me/Mesto_people_bot?start=gift_direct — один раз на Telegram-аккаунт. Идемпотентно.
insert into gift_campaigns (code, title, plan, days, open_to_all, is_active)
values ('direct', 'Инстаграм · директ', 'start', 30, true, true)
on conflict (code) do update set is_active = true, open_to_all = true;
