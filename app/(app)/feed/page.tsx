"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mosya } from "@/components/brand/Mosya";
import { Icon } from "@/components/brand/Icon";
import { useGuide } from "@/lib/mosya/guide";
import { say } from "@/lib/mosya/peek";
import { JoinFlow } from "@/components/events/JoinFlow";
import { PeopleRail } from "@/components/people/PeopleRail";
import { AfishaRail } from "@/components/home/AfishaRail";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { TrainingTypeSheet } from "@/components/home/TrainingTypeSheet";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import type { ApplicationStatus } from "@/components/applications/ApplicationStatus";
import { Button } from "@/components/ui/Button";
import { apiErrorText } from "@/lib/validation/api-error-text";
import { CityPicker } from "@/components/ui/CityPicker";

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

const POPULAR = 5;

function FeedPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  // Статусы заявок, изменившиеся прямо сейчас на этом экране (после
  // нажатия «Я иду») — поверх того, что пришло с сервера в myApplicationStatus.
  const [localStatuses, setLocalStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // null, а не сразу "Тюмень" — раньше лента грузилась ДВАЖДЫ на каждом
  // открытии: сначала с этим захардкоженным городом по умолчанию (пока
  // профиль ещё не пришёл), потом ещё раз с настоящим городом из
  // профиля. Теперь ждём реальный город и грузим ленту только один раз.
  const [city, setCity] = useState<string | null>(null);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [cityInput, setCityInput] = useState("");
  useGuide("feed", { when: !loading });

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        setAvatarUrl(data.avatarUrl ?? null);
        setCity(data.city || "Тюмень");
        setCityInput(data.city || "Тюмень");
      })
      .catch(() => setCity("Тюмень"));
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
    if (city === null) return; // город ещё не пришёл из профиля — не грузим ленту вхолостую
    setEvents([]);
    setPage(0);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, typeFilter, city]);

  async function loadPage(pageToLoad: number, replace: boolean) {
    if (city === null) return;
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

  // «Я иду» → шторка подтверждения → экран «Заявка отправлена».
  const [joinEvent, setJoinEvent] = useState<EventCardData | null>(null);
  const [joinPhase, setJoinPhase] = useState<"confirm" | "sending" | "done" | null>(null);

  function handleApply(eventId: string) {
    const knownStatus = localStatuses[eventId] ?? events.find((e) => e.id === eventId)?.myApplicationStatus;
    if (knownStatus || applyingEventId) return;
    const ev = events.find((e) => e.id === eventId) ?? null;
    setJoinEvent(ev);
    setJoinPhase("confirm");
  }

  async function confirmJoin() {
    if (!joinEvent) return;
    setJoinPhase("sending");
    const ok = await sendApplication(joinEvent.id);
    if (ok) setJoinPhase("done");
    else {
      setJoinPhase(null);
      setJoinEvent(null);
    }
  }

  async function sendApplication(eventId: string): Promise<boolean> {
    let ok = false;
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        ok = true;
        setLocalStatuses((prev) => ({ ...prev, [eventId]: "pending" }));
      } else if (data.error === "already_applied") {
        setLocalStatuses((prev) => ({ ...prev, [eventId]: "pending" }));
        setToast("Ты уже откликался на эту встречу.");
      } else if (data.error === "event_full") {
        setToast("Мест уже не осталось.");
        say("Упс, мест уже нет. Посмотри другие встречи — их много 👇");
      } else if (data.error === "cannot_apply_to_own_event") {
        setToast("Это твоя встреча — не нужно откликаться на неё самому.");
      } else {
        setToast(apiErrorText(data, "Не получилось отправить отклик.", res.status));
      }
    } catch {
      setToast("Проблема с соединением.");
    } finally {
      setApplyingEventId(null);
      setTimeout(() => setToast(null), 3000);
    }
    return ok;
  }

  return (
    <div>
      <TopBar city={city ?? "..."} avatarUrl={avatarUrl} onCityPress={() => setCitySheetOpen(true)} />

      <div className="flex items-end justify-between gap-3 px-5 pb-1 pt-5">
        <h1 className="m-title">
          Что ищешь <span className="m-em">сегодня?</span>
        </h1>
        <Mosya pose="wave" size={64} className="-mb-1 shrink-0" />
      </div>

      <Link href="/search" className="m-glass m-press mx-5 mb-4 mt-3 flex h-[50px] items-center gap-2.5 rounded-pill px-4 text-[15px] text-ink-400">
        <Icon name="search" size={20} />
        Кофе, пробежка, кино…
      </Link>

      <CategoryGrid categories={categories} onTrainingPress={() => setSheetOpen(true)} />

      {/* Популярное сегодня — первые встречи ленты (она уже отсортирована
          по рейтингу) крупными карточками в горизонтальной ленте. */}
      {events.length > 0 && (
        <div className="mt-7">
          <div className="mb-3 flex items-baseline justify-between px-5">
            <h2 className="m-h2">Популярное сегодня</h2>
            <Link href="/search" className="text-[13.5px] text-ink-400">
              Все
            </Link>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {events.slice(0, POPULAR).map((event) => (
              <div key={event.id} className="w-[86%] max-w-[340px] shrink-0 snap-start">
                <EventCard
                  event={event}
                  applicationStatus={localStatuses[event.id]}
                  applying={applyingEventId === event.id}
                  onApplyPress={handleApply}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!categoryFilter && <PeopleRail />}
      {!categoryFilter && <AfishaRail onApplyPress={(id) => router.push(`/events/${id}`)} />}

      <div className="mt-6 space-y-3 px-5">
        <h2 className="m-h2">Интересные встречи рядом</h2>

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="m-sk h-[300px]" />
            ))}
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <div className="m-glass flex flex-col items-center rounded-card px-6 py-8 text-center">
            <Mosya pose="think" size={110} className="mb-3" />
            <p className="text-sm text-ink-600">Сегодня пока тихо. Создай первый план в своём городе.</p>
            <Link href="/create" className="m-btn m-btn-v mt-4 h-12 text-[15px]">
              Создать встречу
            </Link>
          </div>
        )}

        {events.length > 0 && events.length <= POPULAR && !loading && (
          <p className="text-sm text-ink-600">Это все встречи на сегодня — смотри выше или создай свою.</p>
        )}

        <div className="m-stagger space-y-3">
          {events.slice(POPULAR).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              applicationStatus={localStatuses[event.id]}
              applying={applyingEventId === event.id}
              onApplyPress={handleApply}
            />
          ))}
        </div>

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

      {toast && <div className="m-toast">{toast}</div>}

      <JoinFlow
        event={joinEvent}
        phase={joinPhase}
        onConfirm={confirmJoin}
        onClose={() => {
          setJoinPhase(null);
          setJoinEvent(null);
        }}
      />

      {citySheetOpen && (
        <div
          className="m-fade-in fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(22,18,31,0.35)]"
          onClick={() => setCitySheetOpen(false)}
        >
          <div
            className="m-sheet-in rounded-t-sheet bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Выбери город</h2>
            <CityPicker
              autoFocus
              value={cityInput}
              onChange={(selected) => {
                setCityInput(selected);
                setCity(selected);
                setCitySheetOpen(false);
                // Раньше смена города здесь оставалась только в памяти
                // этой страницы — при переходе в другой раздел (например,
                // "Карта") сервер снова видел старый город из профиля.
                fetch("/api/me/profile", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ city: selected }),
                }).catch(() => {});
              }}
              placeholder="Начни вводить город"
              dropdownDirection="up"
              className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-background px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
