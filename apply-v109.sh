mkdir -p "app/api/me/events"
cat > "app/api/me/events/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/me/events
 * Все встречи, где текущий пользователь организатор или участник —
 * для экрана "Мои встречи" в профиле.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: memberRows } = await admin
    .from("event_members")
    .select("event_id, role")
    .eq("user_id", currentUser.userId);

  const eventIds = (memberRows ?? []).map((m) => m.event_id);
  if (eventIds.length === 0) return NextResponse.json({ items: [] });

  const roleByEventId = new Map((memberRows ?? []).map((m) => [m.event_id, m.role]));

  const { data: events, error } = await admin
    .from("events")
    .select(
      `
      id, title, event_date, event_time, place_name, status,
      category:categories(slug, name, emoji)
      `
    )
    .in("id", eventIds)
    // Только активные — по запросу: завершённая или отменённая встреча
    // должна пропадать из "Моих встреч", а не просто помечаться статусом.
    .eq("status", "published")
    .order("event_date", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  // Сколько новых (ещё не рассмотренных) заявок ждёт организатора на
  // каждую его встречу — чтобы показать значок прямо на карточке встречи,
  // не только общим уведомлением. Плюс аватарка ОДНОГО (самого свежего)
  // заявителя — чтобы сразу было видно, КТО откликнулся, не только сколько.
  const organizerEventIds = eventIds.filter((id) => roleByEventId.get(id) === "organizer");
  const pendingCountByEventId = new Map<string, number>();
  const pendingPreviewByEventId = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
  if (organizerEventIds.length > 0) {
    const { data: pendingApplications } = await admin
      .from("applications")
      .select("event_id, created_at, applicant:users(id, name, avatar_url)")
      .in("event_id", organizerEventIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    for (const a of pendingApplications ?? []) {
      pendingCountByEventId.set(a.event_id, (pendingCountByEventId.get(a.event_id) ?? 0) + 1);
      if (!pendingPreviewByEventId.has(a.event_id)) {
        const applicant = a.applicant as unknown as { id: string; name: string; avatar_url: string | null } | null;
        if (applicant) {
          pendingPreviewByEventId.set(a.event_id, {
            id: applicant.id,
            name: applicant.name,
            avatarUrl: applicant.avatar_url,
          });
        }
      }
    }
  }

  const items = (events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    placeName: e.place_name,
    status: e.status,
    category: e.category,
    role: roleByEventId.get(e.id) === "organizer" ? "organizer" : "participant",
    pendingApplicationsCount: pendingCountByEventId.get(e.id) ?? 0,
    pendingApplicantPreview: pendingPreviewByEventId.get(e.id) ?? null,
  }));

  return NextResponse.json({ items });
}
ENDOFFILE

mkdir -p "app/(app)/search"
cat > "app/(app)/search/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/feed/EventCard";
import { CityPicker } from "@/components/ui/CityPicker";
import { useLockBodyScroll } from "@/lib/hooks/use-lock-body-scroll";

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
  // Блокируем прокрутку body, только пока открыта шторка фильтров — в ней
  // есть текстовые поля (возраст, дата), фокус на них без этой блокировки
  // заставляет WebView Telegram сдвигать экран, чтобы подвести поле под
  // клавиатуру (та же причина, что чинили в чате и мастере создания).
  useLockBodyScroll(sheetOpen);

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
        <span className="flex-1 rounded-pill bg-accent px-4 py-2 text-center text-sm font-medium text-white shadow-card">
          Все встречи
        </span>
        <Link
          href="/my-events"
          className="flex-1 rounded-pill bg-white px-4 py-2 text-center text-sm font-medium text-ink-900 shadow-card"
        >
          Мои встречи
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <CityPicker
            value={cityInput}
            onChange={(selected) => {
              setCityInput(selected);
              setCity(selected);
            }}
            placeholder="Город"
            className="w-full min-w-0 box-border rounded-pill border border-lavender-200 bg-white px-4 py-2.5 text-base outline-none focus:border-accent"
          />
        </div>
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
            className="max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-sheet bg-white p-5"
            style={{ touchAction: "pan-y" }}
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

mkdir -p "app/(app)/my-events"
cat > "app/(app)/my-events/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  category: { slug: string; name: string; emoji: string | null } | null;
  role: "organizer" | "participant";
  pendingApplicationsCount: number;
  pendingApplicantPreview: { id: string; name: string; avatarUrl: string | null } | null;
}

const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

const STATUS_LABEL: Record<string, string> = {
  published: "Активна",
  completed: "Завершена",
  cancelled: "Отменена",
};

export default function MyEventsPage() {
  const [items, setItems] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/events")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-5 py-4">
      <h1 className="text-display mb-4">Мои встречи</h1>

      <div className="mb-4 flex gap-2">
        <Link
          href="/search"
          className="flex-1 rounded-pill bg-white px-4 py-2 text-center text-sm font-medium text-ink-900 shadow-card"
        >
          Все встречи
        </Link>
        <span className="flex-1 rounded-pill bg-accent px-4 py-2 text-center text-sm font-medium text-white shadow-card">
          Мои встречи
        </span>
      </div>

      {loading && <p className="text-center text-sm text-ink-600">Загрузка...</p>}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-4 h-28 w-28">
            <Image src="/brand/3d/empty-quiet.png" alt="" fill className="object-contain" sizes="112px" />
          </div>
          <p className="text-sm text-ink-600">Ты пока нигде не участвуешь и ничего не создавал.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((event) => {
          const icon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;
          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card"
            >
              {icon ? (
                <div className="relative h-10 w-10 shrink-0">
                  <Image src={icon} alt="" fill className="object-contain" sizes="40px" />
                  {event.pendingApplicationsCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {event.pendingApplicationsCount}
                    </span>
                  )}
                  <ApplicantPreviewBadge preview={event.pendingApplicantPreview} />
                </div>
              ) : (
                <div className="relative shrink-0">
                  <span className="text-2xl">{event.category?.emoji}</span>
                  {event.pendingApplicationsCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {event.pendingApplicationsCount}
                    </span>
                  )}
                  <ApplicantPreviewBadge preview={event.pendingApplicantPreview} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{event.title}</p>
                <p className="truncate text-xs text-ink-600">
                  {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
                  {event.placeName ? ` · ${event.placeName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-[11px] font-medium text-accent">
                  {event.role === "organizer" ? "Организатор" : "Участник"}
                </span>
                <span className="block text-[11px] text-ink-400">{STATUS_LABEL[event.status] ?? event.status}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/**
 * Аватарка самого свежего заявителя (или плюсик, если фото нет) — снизу
 * от иконки категории на карточке встречи, чтобы сразу видеть, КТО
 * откликнулся, не только сколько (число уже показано сверху).
 */
function ApplicantPreviewBadge({
  preview,
}: {
  preview: { id: string; name: string; avatarUrl: string | null } | null;
}) {
  if (!preview) return null;

  return (
    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-[9px] font-semibold text-ink-600">
      {preview.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.avatarUrl} alt={preview.name} className="h-full w-full object-cover" />
      ) : (
        <span>+</span>
      )}
    </div>
  );
}
ENDOFFILE

