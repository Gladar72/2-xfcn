import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchOsm, placeCacheKey, WARM_KEYS } from "@/lib/places/osm";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/places — раз в сутки (vercel.json) обновляет кеш подсказок
 * мест (place_cache) для городов, где есть пользователи: кофейни, кино,
 * парки, бары, фитнес и т.д. из OpenStreetMap. Пустые ответы не затирают
 * старый кеш. Если задан YANDEX_PLACES_API_KEY — подсказки идут из Яндекса,
 * кеш остаётся запасным.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = createAdminClient();

  const { data: rows } = await admin.from("users").select("city").not("city", "is", null).limit(5000);
  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    const c = ((r.city as string | null) ?? "").trim();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const cities = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
  if (!cities.includes("Тюмень")) cities.unshift("Тюмень");

  const report: Record<string, number> = {};
  outer: for (const city of cities) {
    for (const { category, trainingType } of WARM_KEYS) {
      if (Date.now() - started > 270_000) break outer; // не выходим за лимит функции
      const key = placeCacheKey(category, trainingType);
      if (!key) continue;
      const items = await searchOsm(city, category, trainingType, "", 25_000);
      report[`${city}/${key}`] = items.length;
      if (items.length) {
        await admin.from("place_cache").upsert({ city, key, items, updated_at: new Date().toISOString() });
      }
      await new Promise((r) => setTimeout(r, 1500)); // бережно к публичному серверу
    }
  }
  return NextResponse.json({ ok: true, cities, report });
}
