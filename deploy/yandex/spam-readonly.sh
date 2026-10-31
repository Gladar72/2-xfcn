#!/usr/bin/env bash
set -euo pipefail
sudo docker exec -i mesto-app-1 node <<'JS'
(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(url + '/rest/v1/users?select=id,city,announce_every_days,last_digest_at&event_announcements=eq.true&city=not.is.null', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }, cache: 'no-store'
  });
  const rows = await r.json();
  if (!r.ok || !Array.isArray(rows)) { console.log('REST status',r.status); process.exit(1); }
  const dates = rows.map(x=>x.last_digest_at).filter(Boolean).sort();
  console.log(JSON.stringify({restStatus:r.status, rows:rows.length, withLastDigest:dates.length,
    first:dates[0],last:dates[dates.length-1],missing:rows.filter(x=>!x.last_digest_at).length,
    invalid:dates.filter(x=>!Number.isFinite(Date.parse(x))).length,
    recentlySent:dates.filter(x=>Date.now()-Date.parse(x)<22*3600000).length,
    cacheControl:r.headers.get('cache-control'),age:r.headers.get('age') }));
})();
JS
sudo docker exec -i supabase-db psql -U postgres -d postgres -P pager=off -v ON_ERROR_STOP=1 <<'SQL'
begin read only;
set local statement_timeout='15s';
select count(*) recipients, announce_every_days, min(last_digest_at), max(last_digest_at)
from users where last_digest_at >= '2026-10-30 19:00:00+00' group by 2;
select status, date_trunc('hour', at) local_hour, count(*) total,
count(*) filter(where last_preview like '%Что интересного%') after_digest
from bot_blocks where at >= '2026-10-30 19:00:00+00' group by 1,2 order by 2;
select tgname, pg_get_triggerdef(oid) definition from pg_trigger where tgrelid='public.users'::regclass and not tgisinternal;
commit;
SQL
echo 'cron entries:'
crontab -l | grep -E 'event-reminders|due-reminders' || true
echo 'app image created:'
sudo docker inspect --format '{{.Created}}' mesto-app-1

sudo docker exec -i mesto-app-1 node <<'JS'
const fs = require('fs');
const path = require('path');
let cached = 0;
const dir = '/app/.next/cache/fetch-cache';
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
  try {
    const x = JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
    if (!decodeURIComponent(x.data?.url || '').includes('announce_every_days,last_digest_at')) continue;
    const rows = JSON.parse(Buffer.from(x.data.body,'base64').toString());
    const dates = Array.isArray(rows) ? rows.map(r=>r.last_digest_at).filter(Boolean).sort() : [];
    console.log('DIGEST_READ_CACHE',JSON.stringify({rows:rows.length,withLast:dates.length,last:dates.at(-1),mtime:fs.statSync(path.join(dir,f)).mtime}));
    cached++;
  } catch {}
}
console.log('digest cache entries',cached);
function scan(dir) {
 for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
   const p=path.join(dir,e.name);
   if(e.isDirectory()) scan(p);
   else if(e.name.endsWith('.js')) {
    const s=fs.readFileSync(p,'utf8');
    if(!s.includes('announce_every_days,last_digest_at')) continue;
    const pos=s.indexOf('announce_every_days,last_digest_at');
    console.log('DIGEST_RUNTIME',s.slice(Math.max(0,pos-180),pos+950));
   }
 }
}
scan('/app/.next/server');
JS
