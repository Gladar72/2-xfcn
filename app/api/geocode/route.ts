import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode?lat=...&lng=...
 *
 * Прокси к Yandex Geocoder API. Ключ (YANDEX_GEOCODER_API_KEY) — БЕЗ
 * префикса NEXT_PUBLIC_, то есть доступен только на сервере и никогда не
 * попадает в код браузера. Это платный тариф (от 20 800 ₽/мес за 1000
 * запросов/сутки) — если бы ключ был публичным, кто угодно мог бы вытащить
 * его из бандла сайта и накрутить лишних запросов за наш счёт.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) return NextResponse.json({ error: "missing_coordinates" }, { status: 400 });

  const apiKey = process.env.YANDEX_GEOCODER_API_KEY;
  if (!apiKey) return NextResponse.json({ address: null });

  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${lng},${lat}&format=json&results=1&lang=ru_RU`;
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ address: null });

    const data = await res.json();
    const text = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty
      ?.GeocoderMetaData?.text;

    return NextResponse.json({ address: typeof text === "string" ? text : null });
  } catch {
    return NextResponse.json({ address: null });
  }
}
