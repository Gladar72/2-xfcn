-- Свои обложки для «Что ещё в городе» (рисует Мося в Nano Banana).
-- cover_src — адрес сгенерированной картинки; сервер перекладывает её
-- в наше хранилище (event-photos/city/…) и пишет photo_url.
alter table public.city_events
  add column if not exists cover_src text,
  add column if not exists photo_url text;
