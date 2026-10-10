// Временная проверка подсказок мест из OpenStreetMap (запускается в CI).
import { searchOsm, WARM_KEYS } from "../lib/places/osm.ts";
// Как ночной cron: все ключи для Тюмени и Сургута, таймаут 25 с.
for (const city of ["Тюмень", "Сургут"]) {
  for (const { category, trainingType } of WARM_KEYS) {
    const t = Date.now();
    const r = await searchOsm(city, category, trainingType, "", 25000);
    console.log(`::notice::${city} ${category}${trainingType ? "/" + trainingType : ""}: ${r.length} за ${Date.now() - t} мс → ${r.slice(0, 4).map((p) => `${p.name} (${p.address || "—"})`).join("; ")}`);
    await new Promise((s) => setTimeout(s, 1500));
  }
}
