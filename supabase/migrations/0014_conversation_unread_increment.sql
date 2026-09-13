-- 0014_conversation_unread_increment.sql

create or replace function increment_conversation_unread(
  p_conversation_id uuid,
  p_exclude_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update conversation_members
  set unread_count = unread_count + 1
  where conversation_id = p_conversation_id
    and user_id <> p_exclude_user_id;
end;
$$;
