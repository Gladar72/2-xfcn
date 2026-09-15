mkdir -p "components/home"
cat > "components/home/CategoryGrid.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

interface CategoryGridProps {
  categories: Category[];
  onTrainingPress: () => void;
}

// 3D-иконки категорий МЕСТО (новый комплект ассетов, см. бриф). emoji остаётся
// как запасной вариант, если у какой-то категории вдруг не найдётся своей иконки.
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
};

export function CategoryGrid({ categories, onTrainingPress }: CategoryGridProps) {
  const router = useRouter();

  const gridCategories = categories.filter((c) => c.slug !== "custom");
  const customCategory = categories.find((c) => c.slug === "custom");

  function handlePress(category: Category) {
    if (category.slug === "training") {
      onTrainingPress();
      return;
    }
    router.push(`/feed?category=${category.slug}`);
  }

  return (
    <div className="px-5">
      <div className="grid grid-cols-2 gap-3">
        {gridCategories.map((category) => {
          const iconSrc = CATEGORY_ICON[category.slug];
          return (
            <button
              key={category.id}
              onClick={() => handlePress(category)}
              className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
            >
              {iconSrc ? (
                <div className="relative h-11 w-11">
                  <Image src={iconSrc} alt="" fill className="object-contain" sizes="44px" />
                </div>
              ) : (
                <span className="text-2xl">{category.emoji}</span>
              )}
              <span className="text-sm font-medium leading-tight text-ink-900">
                {category.name}
              </span>
            </button>
          );
        })}

        {/* "Другое" — не категория из базы, а прямой переход в раздел
            "Встречи" (экран /search, тот же, что открывается по центру
            нижней навигации), без предустановленного фильтра категории —
            там можно выбрать любую встречу и применить любые фильтры. */}
        <button
          onClick={() => router.push("/search")}
          className="flex flex-col items-start gap-2 rounded-card bg-white p-4 text-left shadow-card active:scale-[0.98]"
        >
          <div className="relative h-11 w-11">
            <Image src="/brand/3d/other.png" alt="" fill className="object-contain" sizes="44px" />
          </div>
          <span className="text-sm font-medium leading-tight text-ink-900">Другое</span>
        </button>
      </div>

      {customCategory && (
        <button
          onClick={() => router.push("/create")}
          className="mt-3 flex w-full items-center gap-3 rounded-card bg-brand-gradient p-4 text-left shadow-card"
        >
          <div className="relative h-9 w-9 shrink-0">
            <Image src="/brand/3d/custom-proposal.png" alt="" fill className="object-contain" sizes="36px" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-white">{customCategory.name}</span>
            <span className="block text-xs text-white/80">Создай свою встречу</span>
          </div>
        </button>
      )}
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
          Что ищешь <span className="text-accent">сегодня?</span>
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
 *
 * Поддерживает те же необязательные фильтры, что и /api/events (экран
 * поиска) — чтобы можно было открыть карту с уже выставленным на /search
 * фильтром и увидеть подходящие встречи именно там (см. кнопка "Показать
 * на карте" на экране поиска).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let city = searchParams.get("city");

  const categorySlugsParam = searchParams.get("categories");
  const dateFilter = searchParams.get("date");
  const timeOfDay = searchParams.get("timeOfDay");
  const costTypeParam = searchParams.get("costType");
  const genderParam = searchParams.get("gender");
  const ageMin = searchParams.get("ageMin") ? Number(searchParams.get("ageMin")) : null;
  const ageMax = searchParams.get("ageMax") ? Number(searchParams.get("ageMax")) : null;

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

  let query = admin
    .from("events")
    .select(
      `
      id, title, event_date, event_time, latitude, longitude, place_name, address, seats_total, seats_taken, cost_type,
      category:categories(slug, name, emoji),
      organizer:users(birth_date, gender)
      `
    )
    .eq("status", "published")
    .eq("city", city)
    .gte("event_date", todayIso)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(300);

  if (categorySlugsParam) {
    const slugs = categorySlugsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (slugs.length > 0) {
      const { data: categoryRows } = await admin.from("categories").select("id").in("slug", slugs);
      const ids = (categoryRows ?? []).map((c) => c.id);
      if (ids.length > 0) query = query.in("category_id", ids);
    }
  }

  if (costTypeParam && costTypeParam !== "any") {
    query = query.eq("cost_type", costTypeParam);
  }

  if (dateFilter === "today") {
    query = query.eq("event_date", todayIso);
  } else if (dateFilter === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    query = query.eq("event_date", tomorrow.toISOString().slice(0, 10));
  } else if (dateFilter === "weekend") {
    const { from, to } = getUpcomingWeekendRange();
    query = query.gte("event_date", from).lte("event_date", to);
  } else if (dateFilter && dateFilter !== "any" && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
    query = query.eq("event_date", dateFilter);
  }

  if (timeOfDay === "morning") {
    query = query.gte("event_time", "05:00:00").lt("event_time", "12:00:00");
  } else if (timeOfDay === "day") {
    query = query.gte("event_time", "12:00:00").lt("event_time", "18:00:00");
  } else if (timeOfDay === "evening") {
    query = query.gte("event_time", "18:00:00").lt("event_time", "23:59:59");
  }

  const { data: events, error } = await query;

  if (error) {
    // Логируем настоящую причину — раньше ошибка "проглатывалась" и в
    // Vercel Logs было видно только код 500 без деталей, что мешало
    // диагностировать редкие сбои соединения с Supabase.
    console.error("GET /api/events/map — ошибка запроса к Supabase:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  let visibleEvents = events ?? [];

  if (ageMin !== null || ageMax !== null) {
    visibleEvents = visibleEvents.filter((e) => {
      const organizer = e.organizer as unknown as { birth_date: string } | null;
      if (!organizer) return false;
      const age = calculateAge(organizer.birth_date);
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });
  }

  if (genderParam === "male" || genderParam === "female") {
    visibleEvents = visibleEvents.filter((e) => {
      const organizer = e.organizer as unknown as { gender: string | null } | null;
      return organizer?.gender === genderParam;
    });
  }

  const items = visibleEvents.map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    latitude: e.latitude,
    longitude: e.longitude,
    placeName: e.place_name,
    address: e.address,
    seatsLeft: e.seats_total - e.seats_taken,
    category: e.category as unknown as { slug: string; name: string; emoji: string | null } | null,
  }));

  return NextResponse.json({ items, city });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

function getUpcomingWeekendRange(): { from: string; to: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();

  if (dayOfWeek === 0) {
    const iso = today.toISOString().slice(0, 10);
    return { from: iso, to: iso };
  }

  const daysUntilSaturday = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + daysUntilSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return { from: saturday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
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
  // Все параметры (city/categories/date/timeOfDay/costType/gender/
  // ageMin/ageMax) просто пробрасываем как есть — /api/events/map
  // понимает тот же набор фильтров, что и экран поиска (см. кнопку
  // "Показать на карте" на /search).
  const forwardedParams = searchParams.toString();

  const [events, setEvents] = useState<MapEventItem[]>([]);
  const [selected, setSelected] = useState<MapEventItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load(isRetry = false) {
    setLoading(true);
    setError(null);
    const query = forwardedParams ? `?${forwardedParams}` : "";
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
  }, [forwardedParams]);

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
          <h2 className="text-title mb-3 truncate">
            {selected[0]?.placeName || selected[0]?.address || "Место встречи"}
          </h2>
          <div className="space-y-2">
            {selected.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
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

mkdir -p "app/(app)/search"
cat > "app/(app)/search/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
}

type DateFilter = "any" | "today" | "tomorrow" | "weekend" | string; // строка формата YYYY-MM-DD — конкретный день
type TimeFilter = "any" | "morning" | "day" | "evening";
type CostFilter = "any" | "each_pays" | "organizer_treats" | "free" | "negotiable";

const COST_LABELS: Record<Exclude<CostFilter, "any">, string> = {
  each_pays: "Каждый за себя",
  organizer_treats: "Автор угощает",
  free: "Без расходов",
  negotiable: "По договорённости",
};

export default function SearchPage() {
  const [city, setCity] = useState("Тюмень");
  const [cityInput, setCityInput] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selectedCategorySlugs, setSelectedCategorySlugs] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("any");
  const [costFilter, setCostFilter] = useState<CostFilter>("any");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [genderFilter, setGenderFilter] = useState<"any" | "male" | "female">("any");

  const [appliedEventIds, setAppliedEventIds] = useState<Set<string>>(new Set());
  const [applyingEventId, setApplyingEventId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && data.city) {
          setCity(data.city);
          setCityInput(data.city);
        }
      });
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(data.categories ?? []));
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategorySlugs.length > 0) count++;
    if (dateFilter !== "any") count++;
    if (timeFilter !== "any") count++;
    if (costFilter !== "any") count++;
    if (ageMin || ageMax) count++;
    if (genderFilter !== "any") count++;
    return count;
  }, [selectedCategorySlugs, dateFilter, timeFilter, costFilter, ageMin, ageMax, genderFilter]);

  function buildFilterParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("city", city);
    if (selectedCategorySlugs.length > 0) params.set("categories", selectedCategorySlugs.join(","));
    if (dateFilter !== "any") params.set("date", dateFilter);
    if (timeFilter !== "any") params.set("timeOfDay", timeFilter);
    if (costFilter !== "any") params.set("costType", costFilter);
    if (ageMin) params.set("ageMin", ageMin);
    if (ageMax) params.set("ageMax", ageMax);
    if (genderFilter !== "any") params.set("gender", genderFilter);
    return params;
  }

  function load() {
    setLoading(true);
    setError(null);
    const params = buildFilterParams();

    fetch(`/api/events?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Не удалось загрузить встречи.");
          return;
        }
        setEvents(data.items ?? []);
      })
      .catch(() => setError("Проблема с соединением."))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [city]);

  function toggleCategory(slug: string) {
    setSelectedCategorySlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  function applyFilters() {
    setSheetOpen(false);
    load();
  }

  function resetFilters() {
    setSelectedCategorySlugs([]);
    setDateFilter("any");
    setTimeFilter("any");
    setCostFilter("any");
    setAgeMin("");
    setAgeMax("");
    setGenderFilter("any");
  }

  async function handleApply(eventId: string) {
    setApplyingEventId(eventId);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) setAppliedEventIds((prev) => new Set(prev).add(eventId));
    } finally {
      setApplyingEventId(null);
    }
  }

  return (
    <div className="px-5 py-4">
      <h1 className="text-display mb-4">Поиск встреч</h1>

      <div className="mb-4 flex gap-2">
        <input
          value={cityInput}
          onChange={(e) => setCityInput(e.target.value)}
          onBlur={() => cityInput.trim() && setCity(cityInput.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cityInput.trim()) setCity(cityInput.trim());
          }}
          placeholder="Город"
          className="flex-1 rounded-pill border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
        />
        <button
          onClick={() => setSheetOpen(true)}
          className="relative flex items-center gap-1.5 rounded-pill bg-white px-4 py-2.5 text-sm font-medium shadow-card"
        >
          <Image src="/brand/icons/filter.svg" alt="" width={16} height={16} />
          Фильтры
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <Link
        href={`/map?${buildFilterParams().toString()}`}
        className="mb-4 flex items-center justify-center gap-2 rounded-pill bg-white py-2.5 text-sm font-medium text-accent shadow-card"
      >
        <Image src="/brand/icons/map.svg" alt="" width={16} height={16} />
        Показать на карте
      </Link>

      {loading && <p className="text-center text-sm text-ink-600">Загрузка...</p>}
      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">Ничего не нашлось. Попробуй изменить фильтры.</p>
        </div>
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onApplyPress={handleApply}
            applied={appliedEventIds.has(event.id)}
            applying={applyingEventId === event.id}
          />
        ))}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/30" onClick={() => setSheetOpen(false)}>
          <div
            className="max-h-[85vh] overflow-y-auto rounded-t-sheet bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-ink-400/30" />
            <h2 className="text-title mb-4">Фильтры</h2>

            <FilterSection title="Категория (можно несколько)">
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCategory(c.slug)}
                    className={`rounded-pill px-3.5 py-2 text-sm font-medium ${
                      selectedCategorySlugs.includes(c.slug)
                        ? "bg-brand-gradient text-white"
                        : "bg-lavender-50 text-ink-900"
                    }`}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Дата встречи">
              <ChoiceRow
                options={[
                  ["any", "Любой день"],
                  ["today", "Сегодня"],
                  ["tomorrow", "Завтра"],
                  ["weekend", "В выходные"],
                ]}
                value={["any", "today", "tomorrow", "weekend"].includes(dateFilter) ? dateFilter : "custom"}
                onChange={(v) => v !== "custom" && setDateFilter(v as DateFilter)}
              />
              <input
                type="date"
                value={!["any", "today", "tomorrow", "weekend"].includes(dateFilter) ? dateFilter : ""}
                onChange={(e) => setDateFilter(e.target.value || "any")}
                min={new Date().toISOString().slice(0, 10)}
                className="mt-2 w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
              />
            </FilterSection>

            <FilterSection title="Время встречи">
              <ChoiceRow
                options={[
                  ["any", "Любое"],
                  ["morning", "Утро"],
                  ["day", "День"],
                  ["evening", "Вечер"],
                ]}
                value={timeFilter}
                onChange={(v) => setTimeFilter(v as TimeFilter)}
              />
            </FilterSection>

            <FilterSection title="Расходы на встречу">
              <ChoiceRow
                options={[
                  ["any", "Неважно"],
                  ["each_pays", COST_LABELS.each_pays],
                  ["organizer_treats", COST_LABELS.organizer_treats],
                  ["free", COST_LABELS.free],
                  ["negotiable", COST_LABELS.negotiable],
                ]}
                value={costFilter}
                onChange={(v) => setCostFilter(v as CostFilter)}
              />
            </FilterSection>

            <FilterSection title="Возраст автора встречи">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  placeholder="От"
                  className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
                />
                <span className="text-ink-400">—</span>
                <input
                  type="number"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="До"
                  className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
                />
              </div>
              <p className="mt-1 text-xs text-ink-400">По умолчанию без ограничений</p>
            </FilterSection>

            <FilterSection title="Кто создал встречу">
              <ChoiceRow
                options={[
                  ["any", "Неважно"],
                  ["male", "Мужчина"],
                  ["female", "Женщина"],
                ]}
                value={genderFilter}
                onChange={(v) => setGenderFilter(v as "any" | "male" | "female")}
              />
            </FilterSection>

            <div className="flex gap-3">
              <button
                onClick={resetFilters}
                className="w-auto flex-1 rounded-pill border border-lavender-200 bg-white py-3.5 text-sm font-medium text-ink-600"
              >
                Сбросить
              </button>
              <button
                onClick={applyFilters}
                className="flex-[2] rounded-pill bg-brand-gradient py-3.5 text-sm font-semibold text-white shadow-cta"
              >
                Показать встречи
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-medium text-ink-900">{title}</h3>
      {children}
    </div>
  );
}

function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`rounded-pill px-3.5 py-2 text-sm font-medium ${
            value === val ? "bg-brand-gradient text-white" : "bg-lavender-50 text-ink-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
ENDOFFILE

