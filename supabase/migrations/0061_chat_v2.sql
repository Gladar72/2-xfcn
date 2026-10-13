-- Чат «как в Telegram»: ответы, правка, удаление, реакции; быстрый список чатов.
-- (Применено в проде через Supabase MCP; файл — для истории схемы.)

alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_message_idx on public.message_reactions (message_id);
alter table public.message_reactions enable row level security;

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

-- Последнее сообщение каждого чата (для списка чатов).
create or replace function public.last_messages(p_conversation_ids uuid[])
returns table (conversation_id uuid, content text, created_at timestamptz, sender_id uuid, image_url text, deleted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at, m.sender_id, m.image_url, m.deleted_at
  from public.messages m
  where m.conversation_id = any(p_conversation_ids)
  order by m.conversation_id, m.created_at desc
$$;
revoke all on function public.last_messages(uuid[]) from public, anon, authenticated;
grant execute on function public.last_messages(uuid[]) to service_role;

-- Реакция: та же — снять, другая — заменить. Атомарно.
create or replace function public.toggle_message_reaction(p_message_id uuid, p_user_id uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.message_reactions where message_id = p_message_id and user_id = p_user_id and emoji = p_emoji;
  if not found then
    insert into public.message_reactions (message_id, user_id, emoji, created_at)
    values (p_message_id, p_user_id, p_emoji, now())
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = excluded.created_at;
  end if;
end $$;
revoke all on function public.toggle_message_reaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_message_reaction(uuid, uuid, text) to service_role;
