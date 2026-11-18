alter table public.users add column if not exists show_telegram_username boolean not null default false;

-- The original URL selects the saved photo even if its position changed during editing.
create or replace function public.replace_profile_photo(p_user uuid, p_original text, p_new text)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare avatar text;
begin
  select avatar_url into avatar from users where id=p_user for update;
  if not found then return false; end if;
  if avatar=p_original then
    update users set avatar_url=p_new where id=p_user;
    insert into user_photos(user_id,url,position) values(p_user,p_new,0);
    update user_photos set url=p_new where user_id=p_user and url=p_original and position>0;
    return true;
  end if;
  update user_photos set url=p_new where user_id=p_user and url=p_original and position>0;
  return found;
end;
$$;
revoke all on function public.replace_profile_photo(uuid,text,text) from public,anon,authenticated;
grant execute on function public.replace_profile_photo(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
