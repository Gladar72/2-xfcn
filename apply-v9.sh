mkdir -p "lib/maps"
cat > "lib/maps/load-yandex-maps.ts" << 'ENDOFFILE'
"use client";

/**
 * Загружает Yandex Maps JS API 3.0 один раз (даже при повторном монтировании
 * компонента карты — например, при переходах между вкладками).
 *
 * ВАЖНО: свериться с актуальной документацией перед изменением —
 * https://yandex.ru/maps-api/docs/js-api/common/quickstart.html
 * В частности, для JS API 3.0 у ключа обязательно должно быть заполнено
 * поле "Ограничение по HTTP Referer" в кабинете разработчика, иначе карта
 * не загрузится.
 */

declare global {
  interface Window {
    ymaps3?: YMaps3Namespace;
  }
}

// Минимальный набор типов — JS API 3.0 не поставляет собственные типы,
// а сторонние @types часто отстают от версии. Расширяем по мере необходимости.
export interface YMaps3Namespace {
  ready: Promise<void>;
  import: {
    (moduleName: string): Promise<Record<string, unknown>>;
    loaders: Array<(pkg: string) => Promise<unknown>>;
    script: (url: string) => Promise<void>;
  };
  [key: string]: unknown;
}

let loadPromise: Promise<YMaps3Namespace> | null = null;

/**
 * Сторонние пакеты Yandex Maps JS API 3.0 (кластеризатор и т.п.) НЕ входят
 * в основной скрипт api-maps.yandex.ru — для них нужно явно зарегистрировать
 * "загрузчик", который подтянет код пакета с CDN (unpkg). Без этого
 * ymaps3.import("@yandex/ymaps3-...") падает с ошибкой
 * "no loader for pkg ...". См. https://www.npmjs.com/package/@yandex/ymaps3-clusterer
 */
function registerThirdPartyPackageLoader(ymaps3: YMaps3Namespace) {
  ymaps3.import.loaders.unshift(async (pkg: string) => {
    if (!pkg.startsWith("@yandex/")) return undefined;
    await ymaps3.import.script(`https://unpkg.com/${pkg}/dist/index.js`);
    return (window as unknown as Record<string, unknown>)[pkg];
  });
}

export function loadYandexMaps(): Promise<YMaps3Namespace> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.ymaps3) {
      window.ymaps3.ready.then(() => {
        registerThirdPartyPackageLoader(window.ymaps3!);
        resolve(window.ymaps3!);
      });
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error("Отсутствует NEXT_PUBLIC_YANDEX_MAPS_API_KEY"));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps3) {
        reject(new Error("ymaps3 не появился после загрузки скрипта"));
        return;
      }
      window.ymaps3.ready.then(() => {
        registerThirdPartyPackageLoader(window.ymaps3!);
        resolve(window.ymaps3!);
      });
    };
    script.onerror = () => reject(new Error("Не удалось загрузить Yandex Maps JS API"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
ENDOFFILE

mkdir -p "app/api/events/map"
cat > "app/api/events/map/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";

/**
 * GET /api/events/map?city=...
 *
 * Отдаёт только то, что нужно карте (п.17 ТЗ):
 * — координаты ВСТРЕЧ, а не пользователей;
 * — никакой точной геопозиции людей, только place_name/address встречи.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let city = searchParams.get("city");

  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  if (!city && currentUser) {
    const { data: profile } = await admin
      .from("users")
      .select("city")
      .eq("id", currentUser.userId)
      .maybeSingle();
    city = profile?.city ?? null;
  }

  if (!city) return NextResponse.json({ error: "city_required" }, { status: 400 });

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: events, error } = await admin
    .from("events")
    .select(
      `
      id, title, event_date, event_time, latitude, longitude, place_name, seats_total, seats_taken,
      category:categories(slug, name, emoji)
      `
    )
    .eq("status", "published")
    .eq("city", city)
    .gte("event_date", todayIso)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(300);

  if (error) {
    // Логируем настоящую причину — раньше ошибка "проглатывалась" и в
    // Vercel Logs было видно только код 500 без деталей, что мешало
    // диагностировать редкие сбои соединения с Supabase.
    console.error("GET /api/events/map — ошибка запроса к Supabase:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const items = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    latitude: e.latitude,
    longitude: e.longitude,
    placeName: e.place_name,
    seatsLeft: e.seats_total - e.seats_taken,
    category: e.category as unknown as { slug: string; name: string; emoji: string | null } | null,
  }));

  return NextResponse.json({ items, city });
}
ENDOFFILE

mkdir -p "app/(app)/map"
cat > "app/(app)/map/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EventsMap, type MapEventItem } from "@/components/map/EventsMap";

export default function MapPage() {
  return (
    <Suspense>
      <MapPageContent />
    </Suspense>
  );
}

function MapPageContent() {
  const searchParams = useSearchParams();
  const cityOverride = searchParams.get("city"); // позволяет посмотреть карту другого города по ссылке — заодно удобно для отладки

  const [events, setEvents] = useState<MapEventItem[]>([]);
  const [selected, setSelected] = useState<MapEventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load(isRetry = false) {
    setLoading(true);
    setError(null);
    const query = cityOverride ? `?city=${encodeURIComponent(cityOverride)}` : "";
    fetch(`/api/events/map${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          // "Не удалось загрузить карту" бывает из-за редких кратковременных
          // сбоев соединения с базой — один автоматический повтор решает
          // подавляющее большинство таких случаев без участия пользователя.
          if (data.error !== "city_required" && !isRetry) {
            setTimeout(() => load(true), 800);
            return;
          }
          setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить карту.");
          return;
        }
        setEvents(data.items ?? []);
      })
      .catch(() => {
        if (!isRetry) {
          setTimeout(() => load(true), 800);
          return;
        }
        setError("Проблема с соединением.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityOverride]);

  return (
    <div className="relative h-[calc(100vh-5rem)]">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          {error !== "Сначала заверши регистрацию." && (
            <button
              onClick={() => load()}
              className="rounded-pill bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-cta active:scale-95"
            >
              Попробовать снова
            </button>
          )}
        </div>
      ) : loading && events.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-ink-600">Загрузка карты...</div>
      ) : (
        <EventsMap events={events} onSelect={setSelected} />
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-20 z-50 max-h-[50vh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-card">
          <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" onClick={() => setSelected(null)} />
          <h2 className="text-title mb-3">Встречи здесь</h2>
          <div className="space-y-2">
            {selected.map((event) => (
              <Link
                key={event.id}
                href={`/feed?category=${event.category?.slug ?? ""}`}
                className="flex items-center gap-3 rounded-card bg-background p-3"
              >
                <span className="text-xl">{event.category?.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
                  <p className="truncate text-xs text-ink-600">
                    {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
                    {event.placeName ? ` · ${event.placeName}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
ENDOFFILE

