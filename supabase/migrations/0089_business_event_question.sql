-- Личный вопрос о бизнес-событии. Сообщение, оба участника и уведомление появляются вместе.
create or replace function public.send_business_event_question(
  p_event uuid, p_sender uuid, p_message uuid, p_text text
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  host uuid;
  event_title text;
  chat uuid;
  question text;
  sent_at timestamptz;
begin
  if p_text is null or length(trim(p_text)) not between 1 and 1500 then
    return jsonb_build_object('error', 'invalid_question');
  end if;
  select e.organizer_id, e.title into host, event_title
  from events e join users u on u.id=e.organizer_id
  where e.id=p_event and e.is_business and not e.has_chat and not coalesce(e.is_anonymous,false)
    and e.status in ('published','closed') and u.moderation_status='active' for share of e;
  if host is null or host=p_sender then return jsonb_build_object('error','event_unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended(least(host,p_sender)::text || greatest(host,p_sender)::text, 0));
  if not exists (select 1 from users where id=p_sender and moderation_status='active')
     or exists (select 1 from blocks where (blocker_id,blocked_id) in ((p_sender,host),(host,p_sender))) then
    return jsonb_build_object('error','blocked');
  end if;
  select c.id into chat from conversations c
    join conversation_members a on a.conversation_id=c.id and a.user_id=p_sender
    join conversation_members b on b.conversation_id=c.id and b.user_id=host
    where c.event_id is null and not exists (select 1 from conversation_members m where m.conversation_id=c.id and m.user_id not in (p_sender,host))
    order by (a.is_blocked or b.is_blocked) desc, c.created_at, c.id limit 1;
  if exists (select 1 from conversation_members where conversation_id=chat and is_blocked) then
    return jsonb_build_object('error','blocked');
  end if;
  question := 'По событию «' || event_title || '»' || chr(10) || trim(p_text);
  if exists (select 1 from messages where id=p_message) then
    if exists (select 1 from messages where id=p_message and conversation_id=chat and sender_id=p_sender) then
      return jsonb_build_object('conversationId',chat,'duplicate',true);
    end if;
    return jsonb_build_object('error','message_id_conflict');
  end if;
  if chat is null then
    insert into conversations(event_id) values (null) returning id into chat;
    insert into conversation_members(conversation_id,user_id) values (chat,p_sender),(chat,host);
  end if;
  insert into messages(id,conversation_id,sender_id,content) values (p_message,chat,p_sender,question)
    returning created_at into sent_at;
  update conversation_members set is_hidden=false, unread_count=unread_count + case when user_id=host then 1 else 0 end
    where conversation_id=chat;
  update notifications set created_at=sent_at where user_id=host and type='new_message' and not is_read
    and payload->>'conversationId'=chat::text;
  if not found then
    insert into notifications(user_id,type,payload) values (host,'new_message',jsonb_build_object('conversationId',chat));
  end if;
  return jsonb_build_object('conversationId',chat,'host',host,'content',question,'createdAt',sent_at);
end;
$$;
revoke all on function public.send_business_event_question(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.send_business_event_question(uuid,uuid,uuid,text) to service_role;

-- Serialize joins and the organizer's switch on the event row. Existing groups keep their history.
create or replace function public.sync_business_chat(p_event uuid, p_member uuid default null)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare host uuid; chat uuid;
begin
  select organizer_id into host from events where id=p_event and is_business and has_chat for no key update;
  if not found then return null; end if;
  select id into chat from conversations where event_id=p_event order by created_at,id limit 1;
  if chat is null then
    insert into conversations(event_id) values(p_event) returning id into chat;
  end if;
  insert into conversation_members(conversation_id,user_id) values(chat,host) on conflict do nothing;
  insert into conversation_members(conversation_id,user_id)
    select chat,user_id from event_members where event_id=p_event and (p_member is null or user_id=p_member)
    on conflict do nothing;
  return chat;
end;
$$;
revoke all on function public.sync_business_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sync_business_chat(uuid,uuid) to service_role;

create or replace function public.business_member_chat_join()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.sync_business_chat(new.event_id,new.user_id);
  return new;
end;
$$;
drop trigger if exists business_chat_join on public.event_members;
create trigger business_chat_join after insert on public.event_members
  for each row when (new.role='participant') execute function public.business_member_chat_join();

create or replace function public.set_business_chat(p_event uuid,p_owner uuid,p_enabled boolean)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare chat uuid;
begin
  update events set has_chat=p_enabled
  where id=p_event and organizer_id=p_owner and is_business and status in ('published','closed');
  if not found then return jsonb_build_object('error','event_unavailable'); end if;
  if p_enabled then chat := sync_business_chat(p_event); end if;
  return jsonb_build_object('hasChat',p_enabled,'conversationId',chat);
end;
$$;
revoke all on function public.set_business_chat(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_business_chat(uuid,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
