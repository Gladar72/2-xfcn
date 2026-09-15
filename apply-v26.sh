mkdir -p "components/layout"
cat > "components/layout/TopBar.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AvatarViewer } from "@/components/profile/AvatarViewer";

interface TopBarProps {
  city: string;
  avatarUrl?: string | null;
  onCityPress?: () => void;
}

export function TopBar({ city, avatarUrl, onCityPress }: TopBarProps) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setHasUnread((data.items ?? []).some((n: { isRead: boolean }) => !n.isRead)))
      .catch(() => {});
  }, []);

  const avatarCircle = (
    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <Image src="/brand/icons/avatar-placeholder.svg" alt="" width={20} height={20} className="brightness-0 invert" />
      )}
    </div>
  );

  return (
    <div className="flex items-center justify-between px-5 pt-4">
      <button
        onClick={onCityPress}
        className="flex items-center gap-1 rounded-pill bg-white px-4 py-2 text-sm font-medium shadow-card"
      >
        {city} <Image src="/brand/icons/chevron-down.svg" alt="" width={14} height={14} />
      </button>

      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"
          aria-label="Уведомления"
        >
          <Image src="/brand/icons/bell.svg" alt="" width={20} height={20} />
          {hasUnread && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
        </Link>

        {/* Тап по аватару на главной — сразу крупное фото (как в профиле),
            а не переход в профиль: для этого уже есть отдельная вкладка
            внизу. Если фото нет — вести некуда, оставляем ссылкой в профиль. */}
        {avatarUrl ? (
          <AvatarViewer src={avatarUrl} alt="Фото профиля">
            {avatarCircle}
          </AvatarViewer>
        ) : (
          <Link href="/profile" aria-label="Профиль">
            {avatarCircle}
          </Link>
        )}
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)/feed"
cat > "app/(app)/feed/page.tsx" << 'ENDOFFILE'
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
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
  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [city, setCity] = useState("Тюмень");
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [cityInput, setCityInput] = useState("");

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        setAvatarUrl(data.avatarUrl ?? null);
        if (data.city) {
          setCity(data.city);
          setCityInput(data.city);
        }
      })
      .catch(() => {});
  }, []);

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
  }, [categoryFilter, typeFilter, city]);

  async function loadPage(pageToLoad: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageToLoad), city });
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

  async function handleApply(eventId: string) {
    if (appliedEventIds.has(eventId) || applyingEventId) return;
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();

      if (res.ok) {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Отклик отправлен! Организатор скоро ответит.");
      } else if (data.error === "already_applied") {
        setAppliedEventIds((prev) => new Set(prev).add(eventId));
        setToast("Ты уже откликался на эту встречу.");
      } else if (data.error === "event_full") {
        setToast("Мест уже не осталось.");
      } else if (data.error === "cannot_apply_to_own_event") {
        setToast("Это твоя встреча — не нужно откликаться на неё самому.");
      } else {
        setToast("Не получилось отправить отклик.");
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setApplyingEventId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div>
      <TopBar city={city} avatarUrl={avatarUrl} onCityPress={() => setCitySheetOpen(true)} />

      <div className="px-5 pb-2 pt-6">
        <h1 className="text-display">
          Что хочешь сделать <span className="text-accent">сегодня?</span>
        </h1>
      </div>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      <div className="mt-8 space-y-3 px-5">
        <h2 className="text-title">Интересные встречи рядом</h2>

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-card bg-white shadow-card" />
            ))}
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="relative mb-4 h-32 w-32">
              <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="128px" />
            </div>
            <p className="text-sm text-ink-600">Сегодня пока тихо. Создайте первый план в своём городе.</p>
          </div>
        )}

        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            applied={appliedEventIds.has(event.id)}
            applying={applyingEventId === event.id}
            onApplyPress={handleApply}
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

      {toast && (
        <div className="fixed inset-x-5 bottom-24 z-50 rounded-card bg-ink-900 px-4 py-3 text-center text-sm text-white shadow-card">
          {toast}
        </div>
      )}

      {citySheetOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30"
          onClick={() => setCitySheetOpen(false)}
        >
          <div
            className="rounded-t-sheet bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Выбери город</h2>
            <input
              autoFocus
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Например, Тюмень"
              className="mb-4 w-full min-w-0 box-border rounded-card border border-lavender-200 bg-background px-4 py-3 text-base outline-none focus:border-accent"
            />
            <button
              onClick={() => {
                if (cityInput.trim()) {
                  setCity(cityInput.trim());
                  setCitySheetOpen(false);
                }
              }}
              className="w-full rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta"
            >
              Показать встречи здесь
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE

