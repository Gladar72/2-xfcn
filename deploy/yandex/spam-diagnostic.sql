-- Read-only incident diagnostics. Aggregate counts only: no recipient IDs or message bodies.
begin read only;
set local statement_timeout = '15s';
select now() at time zone 'Asia/Yekaterinburg' as local_time;
select indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('notifications','event_rsvps');
select type, jsonb_typeof(payload) payload_kind, count(*) total,
       count(distinct user_id) recipients, min(created_at) first_at, max(created_at) last_at
from notifications where created_at >= '2026-10-30 19:00:00+00' group by 1,2 order by total desc;
with target as (
 select id from events where event_date between '2026-10-30' and '2026-11-02'
 and translate(title, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя') like '%я и бал%'
), per_user as (
 select type, user_id, count(*) n, min(created_at) first_at, max(created_at) last_at
 from notifications where payload->>'eventId' in (select id::text from target)
 and created_at >= '2026-10-30 19:00:00+00' group by 1,2
)
select type, sum(n) rows, count(*) recipients, max(n) max_per_recipient,
       count(*) filter(where n>1) repeated_recipients, min(first_at) first_at, max(last_at) last_at
from per_user group by 1;
with target as (
 select id from events where event_date between '2026-10-30' and '2026-11-02'
 and translate(title, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя') like '%я и бал%'
)
select e.title, e.event_date, e.event_time, e.status, e.seats_taken, e.is_business,
 (select count(*) from event_members m where m.event_id=e.id) members,
 (select count(*) from event_rsvps r where r.event_id=e.id) rsvps
from events e where e.id in (select id from target);
select type, count(*) duplicate_groups, max(n) max_per_group from (
 select type, user_id, payload, count(*) n from notifications
 where created_at >= '2026-10-30 19:00:00+00' and type <> 'new_message'
 group by 1,2,3 having count(*)>1
) t group by 1;
select count(*) users, min(last_digest_at) first_at, max(last_digest_at) last_at
from users where last_digest_at >= '2026-10-30 19:00:00+00';
select status, count(*) total, count(*) filter(where translate(coalesce(last_preview,''),
 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ','абвгдеёжзийклмнопрстуфхцчшщъыьэюя') like '%я и бал%') after_target
from bot_blocks where at >= '2026-10-30 19:00:00+00' group by 1;
select case when preview like '%Поделись событием%' then 'share_nudge'
 when preview like '%Что интересного%' then 'digest'
 when preview like '%твоя встреча%' then 'organizer_reminder'
 when preview like '%встреча%' then 'other_event'
 else 'other' end category, count(*) total, min(sent_at) first_at, max(sent_at) last_at
from bot_last_messages where sent_at >= '2026-10-30 19:00:00+00' group by 1;
commit;
