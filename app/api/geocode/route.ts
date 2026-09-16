import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geocode?lat=...&lng=...  — обратное геокодирование (точка → адрес)
 * GET /api/geocode?query=...&city=...  — прямое геокодирование (текст → варианты адресов с координатами),
 *   используется для автодополнения при ручном вводе адреса (см. AddressAutocomplete.tsx)
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
  const query = searchParams.get("query");
  const city = searchParams.get("city");

  const apiKey = process.env.YANDEX_GEOCODER_API_KEY;
  if (!apiKey) return NextResponse.json(query ? { suggestions: [] } : { address: null });

  if (query) {
    if (query.trim().length < 3) return NextResponse.json({ suggestions: [] });

    try {
      // Город добавляем в сам текст запроса — так надёжнее ограничивает
      // выдачу нужным городом, чем параметр rspn/bbox (без известных
      // границ города их пришлось бы высчитывать отдельно).
      const geocodeText = city ? `${city}, ${query}` : query;
      const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${encodeURIComponent(geocodeText)}&format=json&results=5&lang=ru_RU`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`GET /api/geocode?query — Yandex Geocoder ответил ${res.status}:`, body.slice(0, 300));
        return NextResponse.json({ suggestions: [] });
      }

      const data = await res.json();
      const members = data?.response?.GeoObjectCollection?.featureMember ?? [];
      const suggestions = members
        .map((m: unknown) => {
          const obj = (m as { GeoObject?: Record<string, unknown> })?.GeoObject;
          const text = (
            obj?.metaDataProperty as { GeocoderMetaData?: { text?: string } } | undefined
          )?.GeocoderMetaData?.text;
          const pos = (obj?.Point as { pos?: string } | undefined)?.pos; // "lng lat"
          if (!text || !pos) return null;
          const parts = pos.split(" ");
          const lngStr = parts[0];
          const latStr = parts[1];
          if (!lngStr || !latStr) return null;
          return { address: text, longitude: parseFloat(lngStr), latitude: parseFloat(latStr) };
        })
        .filter((s: unknown): s is { address: string; longitude: number; latitude: number } => !!s);

      return NextResponse.json({ suggestions });
    } catch {
      return NextResponse.json({ suggestions: [] });
    }
  }

  if (!lat || !lng) return NextResponse.json({ error: "missing_coordinates" }, { status: 400 });

  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${lng},${lat}&format=json&results=1&lang=ru_RU`;
    const res = await fetch(url);
    if (!res.ok) {
      // Логируем реальную причину — важно, пока ключ Геокодера свежий и
      // может быть ещё не активирован (обычно требуется до часа после
      // оплаты) или временно превышен лимит.
      const body = await res.text().catch(() => "");
      console.error(`GET /api/geocode — Yandex Geocoder ответил ${res.status}:`, body.slice(0, 300));
      return NextResponse.json({ address: null });
    }

    const data = await res.json();
    const text = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty
      ?.GeocoderMetaData?.text;

    return NextResponse.json({ address: typeof text === "string" ? text : null });
  } catch {
    return NextResponse.json({ address: null });
  }
}
