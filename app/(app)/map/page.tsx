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
