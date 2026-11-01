-- People filters and random home samples use the same privacy rules.
-- Keep the previous RPC for existing clients and safe application rollback.
create or replace function public.filter_people(
  p_viewer_id uuid, p_city text, p_gender text default null,
  p_start_id uuid default null, p_offset integer default 0, p_limit integer default 41,
  p_age_min integer default 18, p_age_max integer default null,
  p_interest_ids uuid[] default '{}', p_shuffle_seed text default null
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
      and u.birth_date <= (current_date - make_interval(years => greatest(18, p_age_min)))::date
      and (p_age_max is null or u.birth_date > (current_date - make_interval(years => p_age_max + 1))::date)
      and (coalesce(cardinality(p_interest_ids), 0) = 0 or exists (
        select 1 from public.user_interests ui where ui.user_id = u.id and ui.interest_id = any(p_interest_ids)
      ))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p_viewer_id and b.blocked_id = u.id)
           or (b.blocked_id = p_viewer_id and b.blocker_id = u.id)
      )
  )
  select u.* from candidates c join public.users u on u.id = c.id
  order by (u.id = p_start_id) desc nulls last, case when p_shuffle_seed is not null then md5(u.id::text || p_shuffle_seed) end,
    case when p_shuffle_seed is null then c.meters end asc nulls last,
    u.id
  offset greatest(0, p_offset)
  limit greatest(1, least(101, p_limit));
$$;

revoke all on function public.filter_people(uuid, text, text, uuid, integer, integer, integer, integer, uuid[], text) from public, anon, authenticated;
grant execute on function public.filter_people(uuid, text, text, uuid, integer, integer, integer, integer, uuid[], text) to service_role;
notify pgrst, 'reload schema';
