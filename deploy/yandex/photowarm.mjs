// Прогрев сжатых копий фото (кэш /_next/image), чтобы первый зритель не ждал пережатия.
// Аватарки и фото профилей тех, кто заходил за 60 дней, и афиши предстоящих событий.
// Запуск: node photowarm.mjs <supabase-url> <app-url>  (SERVICE_ROLE_KEY в окружении)
const [BASE, APP] = process.argv.slice(2);
const KEY = process.env.SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const AV = [256, 384, 640, 1080], EV = [640, 1200];
const get = async (q) => { const r = await fetch(`${BASE}/rest/v1/${q}`, { headers: H }); return r.ok ? r.json() : []; };
const since = new Date(Date.now() - 60 * 86400000).toISOString();
const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const users = await get(`users?select=id,avatar_url&avatar_url=not.is.null&last_active_at=gte.${since}&limit=5000`);
const ids = new Set(users.map((u) => u.id));
const extra = (await get(`user_photos?select=user_id,url&position=gt.0&limit=10000`)).filter((p) => ids.has(p.user_id));
const events = await get(`events?select=photo_url&photo_url=not.is.null&event_date=gte.${today}&limit=2000`);
const jobs = [];
for (const u of users) for (const w of AV) jobs.push([u.avatar_url, w]);
for (const p of extra) for (const w of AV) jobs.push([p.url, w]);
for (const e of events) for (const w of EV) jobs.push([e.photo_url, w]);
console.log(`людей: ${users.length}, доп. фото: ${extra.length}, афиш: ${events.length}, копий: ${jobs.length}`);
let ok = 0, fail = 0, i = 0;
async function worker() {
  while (i < jobs.length) {
    const [url, w] = jobs[i++];
    try {
      const r = await fetch(`${APP}/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=85`, { headers: { Accept: "image/avif,image/webp,*/*" }, signal: AbortSignal.timeout(30000) });
      await r.arrayBuffer();
      r.ok ? ok++ : fail++;
    } catch { fail++; }
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: 3 }, worker));
console.log(`готово: ${ok} копий, ошибок ${fail}, за ${Math.round((Date.now() - t0) / 1000)} с`);
