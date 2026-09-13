-- 0007_trust_safety.sql

create table reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  reviewer_id uuid not null references users(id) on delete cascade,
  reviewee_id uuid not null references users(id) on delete cascade,

  rating smallint not null check (rating between 1 and 5),
  arrived_on_time boolean,
  pleasant_communication boolean,
  meeting_happened boolean,
  would_meet_again boolean,

  created_at timestamptz not null default now(),

  constraint reviews_no_self_review check (reviewer_id <> reviewee_id),
  -- защита от повторного отзыва (п.20 ТЗ)
  unique (event_id, reviewer_id, reviewee_id)
);

create index reviews_reviewee_idx on reviews (reviewee_id);


create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id) on delete cascade,
  reported_user_id uuid not null references users(id) on delete cascade,
  event_id uuid references events(id) on delete set null,

  reason text not null,
  details text,

  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),

  reviewed_by uuid references users(id), -- admin, который обработал жалобу
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),

  constraint reports_no_self_report check (reporter_id <> reported_user_id)
);

create index reports_status_idx on reports (status);
create index reports_reported_user_idx on reports (reported_user_id);


create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint blocks_no_self_block check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

create index blocks_blocker_idx on blocks (blocker_id);
create index blocks_blocked_idx on blocks (blocked_id);


create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null, -- 'new_application' | 'application_accepted' | 'event_reminder' | 'review_request' | ...
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on notifications (user_id, is_read);
