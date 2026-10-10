// Временная проверка подсказок мест из OpenStreetMap (запускается в CI).
import { searchOsm } from "../lib/places/osm.ts";
const cases: [string, string, string, string][] = [
  ["Тюмень", "coffee", "", ""], ["Тюмень", "cinema", "", ""], ["Тюмень", "walk", "", ""],
  ["Тюмень", "training", "padel", ""], ["Тюмень", "training", "gym", ""], ["Тюмень", "party", "", ""],
  ["Тюмень", "dinner", "", ""], ["Тюмень", "active", "", ""], ["Тюмень", "", "", "Кофе"], ["Сургут", "coffee", "", ""],
];
for (const [city, cat, tt, q] of cases) {
  const t = Date.now();
  const r = await searchOsm(city, cat, tt, q);
  console.log(`::notice::${city} ${cat || "q=" + q}${tt ? "/" + tt : ""}: ${r.length} за ${Date.now() - t} мс → ${r.slice(0, 5).map((p) => `${p.name} (${p.address || "—"})`).join("; ")}`);
  await new Promise((s) => setTimeout(s, 1500));
}
