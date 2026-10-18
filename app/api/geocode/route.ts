import { NextRequest, NextResponse } from "next/server";
import { osmReverse, osmSearch } from "@/lib/maps/osm-geocode";

/**
 * GET /api/geocode?lat=...&lng=...  — обратное геокодирование (точка → адрес)
 * GET /api/geocode?query=...&city=...  — прямое геокодирование (текст → варианты адресов с координатами),
 *   используется для автодополнения при ручном вводе адреса (см. AddressAutocomplete.tsx)
 *
 * Работает на OpenStreetMap (Photon + Nominatim) — бесплатно и без ключей.
 * Запросы идут с сервера: так мы соблюдаем правила сервисов (один User-Agent) и не зависим от браузера.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const query = searchParams.get("query");
  const city = searchParams.get("city");

  if (query) {
    if (query.trim().length < 3) return NextResponse.json({ suggestions: [] });
    const suggestions = await osmSearch(query.trim(), city, 5);
    return NextResponse.json({ suggestions });
  }

  const la = Number(lat);
  const lo = Number(lng);
  if (!lat || !lng || !Number.isFinite(la) || !Number.isFinite(lo)) {
    return NextResponse.json({ error: "missing_coordinates" }, { status: 400 });
  }
  return NextResponse.json({ address: await osmReverse(la, lo) });
}
