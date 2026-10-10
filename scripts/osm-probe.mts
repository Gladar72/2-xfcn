// Временная проверка источников подсказок мест (запускается в CI).
const UA = { "User-Agent": "MestoApp/1.0 (t.me/Mesto_people_bot)" };
async function timed(label: string, url: string, pick: (d: any) => string[]) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const list = pick(d);
    console.log(`::notice::${label}: ${r.status} ${list.length} шт за ${Date.now() - t} мс → ${list.slice(0, 5).join("; ")}`);
  } catch (e) {
    console.log(`::notice::${label}: ОШИБКА ${String(e).slice(0, 80)} за ${Date.now() - t} мс`);
  }
  await new Promise((s) => setTimeout(s, 1200));
}
const nom = (d: any[]) => d.map((x) => `${x.name || x.display_name.split(",")[0]} [${x.type}] (${x.address?.road ?? "—"} ${x.address?.house_number ?? ""})`);
const N = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&accept-language=ru";
await timed("nom struct cafe", `${N}&amenity=cafe&city=${encodeURIComponent("Тюмень")}`, nom);
await timed("nom struct cinema", `${N}&amenity=cinema&city=${encodeURIComponent("Тюмень")}`, nom);
await timed("nom text кофейня", `${N}&q=${encodeURIComponent("кофейня Тюмень")}`, nom);
await timed("nom text кинотеатр", `${N}&q=${encodeURIComponent("кинотеатр Тюмень")}`, nom);
await timed("nom text бар", `${N}&q=${encodeURIComponent("бар Тюмень")}`, nom);
await timed("nom text падел", `${N}&q=${encodeURIComponent("падел Тюмень")}`, nom);
const bbox = "57.08,65.45,57.22,65.70";
for (const host of ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"]) {
  const q = `[out:json][timeout:6];nwr["amenity"="cafe"]["name"](${bbox});out center tags 40;`;
  await timed(`overpass bbox cafe ${new URL(host).host}`, `${host}?data=${encodeURIComponent(q)}`, (d) => (d.elements ?? []).map((e: any) => `${e.tags.name} (${e.tags["addr:street"] ?? "—"} ${e.tags["addr:housenumber"] ?? ""})`));
}
