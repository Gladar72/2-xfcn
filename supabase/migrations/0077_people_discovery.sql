-- Discovery stays within the selected city, regardless of registration count.
-- Gender/privacy filters and sorting happen BEFORE pagination.
create or replace function public.discover_people(
  p_viewer_id uuid, p_city text, p_gender text default null,
  p_start_id uuid default null, p_offset integer default 0, p_limit integer default 41
)
returns setof public.users
language sql stable security invoker set search_path = public
as $$
  with me as (
    select city,
      case when show_distance = true
        and approx_lat between -90 and 90 and approx_lon between -180 and 180
        and approx_location_at between now() - interval '24 hours' and now()
        then approx_lat::double precision end as lat,
      approx_lon::double precision as lon
    from public.users where id = p_viewer_id
  ), candidates as (
    select u.id,
      case when me.lat is not null and u.show_distance = true
        and u.approx_lat between -90 and 90 and u.approx_lon between -180 and 180
        and u.approx_location_at between now() - interval '24 hours' and now()
      then 2 * 6371000 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(u.approx_lat::double precision - me.lat) / 2), 2)
        + cos(radians(me.lat)) * cos(radians(u.approx_lat::double precision))
        * power(sin(radians(u.approx_lon::double precision - me.lon) / 2), 2)
      )))) end as meters
    from public.users u cross join me
    where u.id <> p_viewer_id
      and u.is_profile_hidden = false and u.moderation_status = 'active'
      and nullif(trim(u.avatar_url), '') is not null
      and (p_gender is null or u.gender::text = p_gender)
      and u.city = p_city
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_viewer_id and b.blocked_id = u.id)
           or (b.blocked_id = p_viewer_id and b.blocker_id = u.id)
      )
  )
  select u.* from candidates c join public.users u on u.id = c.id
  order by (u.id = p_start_id) desc nulls last, c.meters asc nulls last,
    u.id
  offset greatest(0, p_offset)
  limit greatest(1, least(101, p_limit));
$$;

revoke all on function public.discover_people(uuid, text, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.discover_people(uuid, text, text, uuid, integer, integer) to service_role;
notify pgrst, 'reload schema';
