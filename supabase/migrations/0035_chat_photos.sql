-- 0035_chat_photos.sql
--
-- Фото в чате: человек жмёт «+», выбирает картинку из галереи (или делает
-- снимок) — она уходит в сообщение, можно с подписью.
--
--   * messages.image_url — ссылка на фото (или null для обычного текста);
--   * текст теперь необязателен, если есть фото (сообщение «только фото»);
--   * бакет chat-photos: файлы публичны по прямой ссылке (как в Telegram —
--     длинный случайный адрес), но БЕЗ политики на select — список файлов
--     бакета посторонний получить не может. Загрузка — только через сервер
--     (service_role) после проверки, что человек участник чата.

alter table messages add column image_url text;

alter table messages alter column content set default '';
alter table messages drop constraint messages_content_check;
alter table messages add constraint messages_content_or_image_check
  check (char_length(content) > 0 or image_url is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
