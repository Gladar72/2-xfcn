-- 0052_redesign_categories.sql
-- Редизайн 2026: две новые категории встреч — «Активный отдых» и
-- «Вечеринка» (как в согласованном прототипе). «Своё предложение» —
-- по-прежнему последней.

insert into categories (slug, name, emoji, sort_order) values
  ('active', 'Активный отдых', '🏕', 7),
  ('party',  'Вечеринка',      '🎉', 8)
on conflict (slug) do nothing;

update categories set sort_order = 9 where slug = 'custom';
