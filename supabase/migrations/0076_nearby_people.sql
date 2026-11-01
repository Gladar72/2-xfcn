-- Search by the last shared approximate position, independently of profile city.
-- Sort before limiting, so a dense city cannot hide the closest people.
create index if not exists users_nearby_lat_idx on public.users (approx_lat, approx_location_at)
  where is_profile_hidden = false and moderation_status = 'active' and show_distance = true;

create or replace function public.nearby_people(p_viewer_id uuid, p_start_id uuid default null)
returns setof public.users
language sql stable security invoker set search_path = public
as $$
  with me as (
    select approx_lat::double precision as lat, approx_lon::double precision as lon
    from public.users
    where id = p_viewer_id and show_distance = true
      and approx_lat between -90 and 90 and approx_lon between -180 and 180
      and approx_location_at between now() - interval '24 hours' and now()
  ), distances as (
    select u.id,
      2 * 6371000 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(u.approx_lat::double precision - me.lat) / 2), 2)
        + cos(radians(me.lat)) * cos(radians(u.approx_lat::double precision))
        * power(sin(radians(u.approx_lon::double precision - me.lon) / 2), 2)
      )))) as meters
    from public.users u cross join me
    where u.id <> p_viewer_id
      and u.is_profile_hidden = false and u.moderation_status = 'active'
      and nullif(trim(u.avatar_url), '') is not null and u.show_distance = true
      and u.approx_location_at between now() - interval '24 hours' and now()
      and u.approx_lat between greatest(-90, me.lat - 0.135) and least(90, me.lat + 0.135)
      and u.approx_lon between -180 and 180
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_viewer_id and b.blocked_id = u.id)
           or (b.blocked_id = p_viewer_id and b.blocker_id = u.id)
      )
  )
  select u.* from distances d join public.users u on u.id = d.id
  where d.meters <= 15000
  order by (u.id = p_start_id) desc nulls last, d.meters, u.id
  limit 60;
$$;

-- The authenticated server supplies the viewer. Never allow callers to query
-- another user's position by invoking the function directly.
revoke all on function public.nearby_people(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nearby_people(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
