"use client";

import { useEffect, useState } from "react";
import { useGuide } from "@/lib/mosya/guide";
import { Icon } from "@/components/brand/Icon";
import Image from "next/image";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";

export default function BusinessPage() {
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  useGuide("business");
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
        <Link href="/feed" aria-label="Назад" className="m-glass m-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <Icon name="back" size={22} className="" />
        </Link>
        <h1 className="m-title flex-1">Для бизнеса</h1>
      </div>

      <p className="mb-4 text-sm text-ink-600">
        Посетить либо создать события — концерты, дегустации, мастер-классы и другие форматы для бизнеса.
      </p>

      <Link
        href="/create?business=true"
        className="mb-5 flex items-center justify-center gap-2 rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta active:scale-[0.98] m-btn-v relative overflow-hidden"
      >
        <span className="text-lg">+</span>
        Создать событие
      </Link>

      {loading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="m-sk h-24" />)}</div>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-card m-glass p-6 text-center">
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
