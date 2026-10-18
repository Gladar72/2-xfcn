// Копирует все файлы (аватары, фото встреч, фото чата, стикеры) из Supabase Cloud
// в свой Supabase на сервере. Повторный запуск безопасен (перезаписывает).
// Ключ старого проекта не нужен: список файлов берётся из старой базы (remote.sh),
// а сами файлы скачиваются по публичным ссылкам (все бакеты «Места» публичные).
//
// node copy-storage.mjs OLD_URL NEW_URL buckets.json files.tsv
//   env SERVICE_ROLE_KEY — ключ НОВОГО Supabase (создаётся на сервере сам)
import { readFileSync } from "node:fs";

const [OLD, NEW, bucketsFile, filesFile] = process.argv.slice(2);
const KEY = process.env.SERVICE_ROLE_KEY;
if (!OLD || !NEW || !KEY || !bucketsFile || !filesFile) {
  console.error("usage: SERVICE_ROLE_KEY=... node copy-storage.mjs OLD_URL NEW_URL buckets.json files.tsv");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const buckets = JSON.parse(readFileSync(bucketsFile, "utf8") || "[]");
for (const b of buckets) {
  const r = await fetch(`${NEW}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({
      id: b.id,
      name: b.name,
      public: b.public,
      file_size_limit: b.file_size_limit,
      allowed_mime_types: b.allowed_mime_types,
    }),
  });
  console.log(`bucket ${b.id}: ${r.ok ? "created" : "exists/" + r.status}`);
}

const files = readFileSync(filesFile, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [bucket, path, type] = l.split("\t");
    return { bucket, path, type: type || "application/octet-stream" };
  });
console.log(`files: ${files.length}`);

// ONLY_MISSING=1 — докопировать только то, чего ещё нет на сервере; пути файлов в лог не пишем
// (логи GitHub публичные), только корзину и причину.
const ONLY_MISSING = process.env.ONLY_MISSING === "1";
const where = (f) => (ONLY_MISSING ? f.bucket : `${f.bucket}/${f.path}`);
let ok = 0;
let fail = 0;
let present = 0;
async function copy(f) {
  const enc = f.path.split("/").map(encodeURIComponent).join("/");
  if (ONLY_MISSING) {
    const have = await fetch(`${NEW}/storage/v1/object/public/${f.bucket}/${enc}`, { method: "HEAD", headers: H });
    if (have.ok) {
      present++;
      return;
    }
  }
  const src = await fetch(`${OLD}/storage/v1/object/public/${f.bucket}/${enc}`);
  if (!src.ok) {
    fail++;
    console.error(`skip ${where(f)}: в старом хранилище ответ ${src.status}`);
    return;
  }
  const body = Buffer.from(await src.arrayBuffer());
  const up = await fetch(`${NEW}/storage/v1/object/${f.bucket}/${enc}`, {
    method: "POST",
    headers: { ...H, "content-type": f.type, "x-upsert": "true", "cache-control": "max-age=31536000" },
    body,
  });
  if (up.ok) ok++;
  else {
    fail++;
    console.error(`fail ${where(f)}: ${up.status} ${(await up.text()).slice(0, 150)}`);
  }
}

// по 6 файлов параллельно
for (let i = 0; i < files.length; i += 6) {
  await Promise.all(files.slice(i, i + 6).map(copy));
  if (i % 120 === 0) console.log(`… ${i}/${files.length}`);
}
console.log(`copied ${ok}, failed ${fail}` + (ONLY_MISSING ? `, already there ${present}` : ""));
