"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";

export default function BusinessPage() {
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/events?business=true&page=0")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить события.");
          return;
        }
        setEvents(data.items ?? []);
      })
      .catch(() => setError("Проблема с соединением."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/feed" aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </Link>
        <h1 className="text-display flex-1">Для бизнеса</h1>
      </div>

      <p className="mb-4 text-sm text-ink-600">
        Посетить либо создать события — концерты, дегустации, мастер-классы и другие форматы для бизнеса.
      </p>

      <Link
        href="/create?business=true"
        className="mb-5 flex items-center justify-center gap-2 rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta active:scale-[0.98]"
      >
        <span className="text-lg">+</span>
        Создать событие
      </Link>

      {loading && <p className="text-center text-sm text-ink-600">Загрузка...</p>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-card bg-white p-6 text-center shadow-card">
          <div className="relative mx-auto mb-3 h-14 w-14">
            <Image src="/brand/markers/marker-business.png" alt="" fill className="object-contain" />
          </div>
          <h2 className="text-title mb-2">Никто ещё не создал это событие</h2>
          <p className="text-sm text-ink-600">Ты будешь первым.</p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
