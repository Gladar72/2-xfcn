// Копирует все файлы (аватары, фото встреч, фото чата, стикеры) из Supabase Cloud
// в свой Supabase на сервере. Повторный запуск безопасен (перезаписывает).
// node copy-storage.mjs <OLD_URL> <NEW_URL> ; ключ — env SERVICE_ROLE_KEY (одинаковый у обоих).
const [OLD, NEW] = process.argv.slice(2);
const KEY = process.env.SERVICE_ROLE_KEY;
if (!OLD || !NEW || !KEY) {
  console.error("usage: SERVICE_ROLE_KEY=... node copy-storage.mjs OLD_URL NEW_URL");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function j(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${url} → ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

async function list(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const items = await j(`${OLD}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...(await list(bucket, p))); // папка
      else out.push({ path: p, type: it.metadata?.mimetype || "application/octet-stream" });
    }
    if (items.length < 1000) break;
  }
  return out;
}

const buckets = await j(`${OLD}/storage/v1/bucket`);
let total = 0;
for (const b of buckets) {
  await fetch(`${NEW}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types }),
  }); // уже есть — не страшно
  const files = await list(b.id);
  console.log(`bucket ${b.id}: ${files.length} files`);
  for (const f of files) {
    const enc = f.path.split("/").map(encodeURIComponent).join("/");
    const src = await fetch(`${OLD}/storage/v1/object/${b.id}/${enc}`, { headers: H });
    if (!src.ok) {
      console.error(`skip ${b.id}/${f.path}: ${src.status}`);
      continue;
    }
    const body = Buffer.from(await src.arrayBuffer());
    const up = await fetch(`${NEW}/storage/v1/object/${b.id}/${enc}`, {
      method: "POST",
      headers: { ...H, "content-type": f.type, "x-upsert": "true", "cache-control": "max-age=31536000" },
      body,
    });
    if (!up.ok) console.error(`fail ${b.id}/${f.path}: ${up.status} ${(await up.text()).slice(0, 150)}`);
    else total++;
  }
}
console.log(`copied ${total} files`);
