-- 0011_storage_avatars_bucket.sql
--
-- Загрузка фото идёт ТОЛЬКО через backend (service_role, см. app/api/users/route.ts),
-- а не напрямую с клиента в Storage. Поэтому отдельные RLS-политики на
-- storage.objects для записи не нужны — service_role и так обходит RLS.
-- Единственное, что нужно — публичное чтение (фото показываются в ленте всем).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Публичное чтение объектов бакета avatars (сами файлы всё равно без
-- секретных данных — это аватарки).
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');
