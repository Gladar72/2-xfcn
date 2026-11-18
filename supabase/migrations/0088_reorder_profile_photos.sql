-- Перестановка одной галереи и смена обложки выполняются в одной транзакции.
create or replace function public.reorder_profile_photos(p_user_id uuid, p_before text[], p_after text[])
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  avatar text;
  gallery text[] := '{}';
  slots uuid[] := '{}';
  photo record;
  i integer;
begin
  select avatar_url into avatar from public.users where id = p_user_id for update;
  if not found then return false; end if;
  if nullif(avatar, '') is not null then gallery := array[avatar]; end if;
  for photo in select id, url from public.user_photos where user_id = p_user_id and position > 0
               order by position, id limit 2 for update loop
    slots := array_append(slots, photo.id);
    if photo.url <> '' and not (photo.url = any(gallery)) then gallery := array_append(gallery, photo.url); end if;
  end loop;
  if p_after is null or cardinality(p_after) <> cardinality(gallery)
     or cardinality(gallery) < 2 or not (p_after @> gallery and gallery @> p_after) then return false; end if;
  if gallery = p_after and avatar = p_after[1] then return true; end if;
  if gallery is distinct from p_before then return false; end if;

  for i in 1..cardinality(slots) loop
    if i < cardinality(p_after) then
      update public.user_photos set url = p_after[i + 1] where id = slots[i];
    else
      -- У старых профилей аватар иногда продублирован в дополнительном слоте.
      update public.user_photos set position = 0 where id = slots[i];
    end if;
  end loop;
  update public.users set avatar_url = p_after[1] where id = p_user_id;
  return true;
end;
$$;
revoke all on function public.reorder_profile_photos(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.reorder_profile_photos(uuid, text[], text[]) to service_role;
notify pgrst, 'reload schema';
