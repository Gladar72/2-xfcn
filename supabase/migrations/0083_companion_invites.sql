-- A person can invite a companion to somebody else's event. Each pair can
-- send one invitation per event; host invitations retain their old meaning.
begin;
alter table public.event_invites drop constraint if exists event_invites_event_id_invitee_id_key;
create unique index if not exists event_invites_pair_event_idx
  on public.event_invites (event_id, inviter_id, invitee_id);

-- Serialize quota checks so simultaneous taps cannot bypass the daily limit.
create or replace function public.reserve_event_invite(p_event_id uuid, p_inviter_id uuid, p_invitee_id uuid, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare invitation_id uuid;
begin
  if p_inviter_id = p_invitee_id then return jsonb_build_object('error', 'invalid_user'); end if;
  perform pg_advisory_xact_lock(hashtextextended('event-invite:' || p_inviter_id::text, 0));
  if exists (select 1 from event_invites where event_id = p_event_id and inviter_id = p_inviter_id and invitee_id = p_invitee_id) then
    return jsonb_build_object('error', 'already_invited');
  end if;
  if (select count(*) from event_invites where inviter_id = p_inviter_id and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('error', 'invite_limit');
  end if;
  insert into event_invites(event_id, inviter_id, invitee_id, message)
    values (p_event_id, p_inviter_id, p_invitee_id, nullif(left(trim(p_message), 300), '')) returning id into invitation_id;
  return jsonb_build_object('id', invitation_id);
end;
$$;
revoke all on function public.reserve_event_invite(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_event_invite(uuid, uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';
commit;
