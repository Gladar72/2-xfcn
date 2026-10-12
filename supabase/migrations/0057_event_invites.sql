-- Приглашения на встречу от организатора («Позвать на встречу»).
-- Одного человека на одну встречу можно позвать один раз (unique),
-- не больше 5 приглашений в сутки (проверяет сервер).
create table if not exists event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  inviter_id uuid not null references users(id) on delete cascade,
  invitee_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (event_id, invitee_id)
);
create index if not exists event_invites_inviter_created_idx on event_invites (inviter_id, created_at desc);
create index if not exists event_invites_invitee_idx on event_invites (invitee_id);
alter table event_invites enable row level security; -- доступ только у сервера (service role)
