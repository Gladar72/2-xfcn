// Разово: срезать чёрные поля у уже загруженных афиш (предстоящие события).
// Та же логика, что lib/photos/trim-bars.ts. Новый файл — новый адрес, чтобы кэш не держал старую картинку.
// Запуск: node phototrim.mjs <supabase-url>   (SERVICE_ROLE_KEY в окружении)
import sharp from "sharp";

const BASE = process.argv[2];
const KEY = process.env.SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const DARK_MEAN = 24, FLAT_STD = 10;

function edges(px, w, h) {
  const flat = (get, n) => { let s = 0, s2 = 0; for (let i = 0; i < n; i++) { const v = get(i); s += v; s2 += v * v; } const m = s / n; return m < DARK_MEAN && Math.sqrt(Math.max(0, s2 / n - m * m)) < FLAT_STD; };
  const row = (y) => flat((x) => px[y * w + x], w);
  let top = 0; while (top < h && row(top)) top++;
  let bottom = 0; while (bottom < h - top && row(h - 1 - bottom)) bottom++;
  const col = (x) => flat((i) => px[(top + i) * w + x], h - top - bottom);
  let left = 0; while (left < w && col(left)) left++;
  let right = 0; while (right < w - left && col(w - 1 - right)) right++;
  const keepV = top + bottom >= h * 0.03 && h - top - bottom >= h * 0.5;
  const keepH = left + right >= w * 0.03 && w - left - right >= w * 0.5;
  return { top: keepV ? top : 0, bottom: keepV ? bottom : 0, left: keepH ? left : 0, right: keepH ? right : 0 };
}

const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const r = await fetch(`${BASE}/rest/v1/events?select=id,title,photo_url&photo_url=not.is.null&event_date=gte.${today}`, { headers: H });
const events = await r.json();
console.log("событий с фото:", events.length);
let fixed = 0;
for (const ev of events) {
  const m = String(ev.photo_url).match(/\/event-photos\/(.+)$/);
  if (!m) continue;
  try {
    const res = await fetch(`${BASE}/storage/v1/object/public/event-photos/${m[1]}`);
    if (!res.ok) { console.log("нет файла:", ev.title); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const img = sharp(buf).rotate();
    const { data, info } = await img.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
    const e = edges(data, info.width, info.height);
    if (!e.top && !e.bottom && !e.left && !e.right) continue;
    const out = await img.extract({ left: e.left, top: e.top, width: info.width - e.left - e.right, height: info.height - e.top - e.bottom }).jpeg({ quality: 88 }).toBuffer();
    const path = `${ev.id}/${Date.now()}-t.jpg`;
    const up = await fetch(`${BASE}/storage/v1/object/event-photos/${path}`, { method: "POST", headers: { ...H, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: out });
    if (!up.ok) { console.log("ошибка загрузки:", ev.title, up.status); continue; }
    const pub = String(ev.photo_url).replace(/\/event-photos\/.+$/, `/event-photos/${path}`);
    const pt = await fetch(`${BASE}/rest/v1/events?id=eq.${ev.id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ photo_url: pub }) });
    console.log(pt.ok ? "срезаны поля:" : "ошибка записи:", ev.title, `сверху ${e.top}, снизу ${e.bottom}, слева ${e.left}, справа ${e.right}`);
    if (pt.ok) fixed++;
  } catch (err) { console.log("ошибка:", ev.title, err.message); }
}
console.log("готово, исправлено:", fixed);
