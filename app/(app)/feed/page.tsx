"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { TrainingTypeSheet } from "@/components/home/TrainingTypeSheet";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import { Button } from "@/components/ui/Button";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface TrainingType {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

export default function FeedPage() {
  return (
    // useSearchParams требует Suspense-границу в Next.js App Router
    <Suspense>
      <FeedPageContent />
    </Suspense>
  );
}

function FeedPageContent() {
  const searchParams = useSearchParams();
  const categoryFilter = searchParams.get("category");
  const typeFilter = searchParams.get("type");

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [events, setEvents] = useState<EventCardData[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      })
      .catch(() => {
        setCategories([]);
        setTrainingTypes([]);
      });
  }, []);

  useEffect(() => {
    setEvents([]);
    setPage(0);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, typeFilter]);

  async function loadPage(pageToLoad: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageToLoad) });
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);

      const res = await fetch(`/api/events?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error === "city_required" ? "Сначала заверши регистрацию." : "Не удалось загрузить ленту.");
        return;
      }

      setEvents((prev) => (replace ? data.items : [...prev, ...data.items]));
      setHasMore(Boolean(data.hasMore));
      setPage(pageToLoad);
    } catch {
      setError("Проблема с соединением.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <TopBar city="Тюмень" />

      <div className="px-5 pb-2 pt-6">
        <h1 className="text-display">Что хочешь сделать сегодня?</h1>
      </div>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      <div className="mt-8 space-y-3 px-5">
        <h2 className="text-title">Сегодня рядом</h2>

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-card bg-white shadow-card" />
            ))}
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-card bg-white p-6 text-center text-sm text-ink-600 shadow-card">
            Сегодня пока тихо. Создайте первый план в своём городе.
          </div>
        )}

        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onApplyPress={() => {
              /* Создание отклика — Этап 9 */
            }}
          />
        ))}

        {hasMore && (
          <Button variant="secondary" onClick={() => loadPage(page + 1, false)} disabled={loading}>
            {loading ? "Загружаем..." : "Показать ещё"}
          </Button>
        )}
      </div>

      <TrainingTypeSheet
        open={sheetOpen}
        trainingTypes={trainingTypes}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
