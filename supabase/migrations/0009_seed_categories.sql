-- 0009_seed_categories.sql
-- Начальные категории и подкатегории тренировок — ровно по п.6 ТЗ.
-- Дальше можно добавлять новые строки через админку/SQL без деплоя кода.

insert into categories (slug, name, emoji, sort_order) values
  ('training', 'Совместная тренировка', '🏋️', 1),
  ('cinema',   'Кино',                  '🎬', 2),
  ('coffee',   'Попить кофе',           '☕', 3),
  ('breakfast','Совместный завтрак',    '🍳', 4),
  ('dinner',   'Поужинать',             '🍽', 5),
  ('walk',     'Прогулка',              '🚶', 6),
  ('custom',   'Своё предложение',      '✨', 7);

insert into training_types (slug, name, emoji, sort_order) values
  ('running',  'Бег',            '🏃', 1),
  ('padel',    'Падел',          '🎾', 2),
  ('gym',      'Зал',            '🏋️', 3),
  ('hyrox',    'HYROX',          '🔥', 4),
  ('football', 'Футбол',         '⚽', 5),
  ('cycling',  'Велосипед',      '🚴', 6),
  ('yoga',     'Йога',           '🧘', 7),
  ('custom',   'Своя тренировка','✨', 8);
