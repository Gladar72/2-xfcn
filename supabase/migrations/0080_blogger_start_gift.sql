-- Отдельный подарок для рекламы блогера от 07.11.2026.
-- https://t.me/Mesto_people_bot?start=gift_blog_071126
-- Один раз на Telegram-аккаунт; новым пользователям — после регистрации.
-- Повторный деплой не сбрасывает активации и не включает отключённую акцию.
insert into gift_campaigns (code, title, plan, days, open_to_all, is_active)
values ('blog_071126', 'Реклама блогера · 07.11.2026', 'start', 30, true, true)
on conflict (code) do nothing;

select code, plan, days, open_to_all, is_active
from gift_campaigns
where code = 'blog_071126';
