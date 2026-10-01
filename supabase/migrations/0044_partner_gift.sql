-- 0044_partner_gift.sql
--
-- Кто впервые пришёл по личной ссылке партнёра (t.me/<bot>?start=ref_<code>),
-- получает месяц подписки «Старт» в подарок — блогер/паблик может написать
-- в посте «по моей ссылке — месяц бесплатно». Один раз на человека.

insert into gift_campaigns (code, title, plan, days, open_to_all)
values ('ref', 'Партнёры', 'start', 30, true)
on conflict (code) do nothing;
