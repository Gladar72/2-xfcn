mkdir -p "supabase/migrations"
cat > "supabase/migrations/0017_cost_type_and_cancel.sql" << 'ENDOFFILE'
-- 0017_cost_type_and_cancel.sql
--
-- 1. cost_type — как делятся расходы на встрече. Показывается в фильтре
--    поиска и на шаге мастера создания встречи.
-- 2. decrement_subscription_usage_field — симметричная пара к
--    increment_subscription_usage_field (0012): при отмене СВОЕЙ встречи
--    организатором лимит "создано встреч за период" возвращается назад,
--    чтобы отмена не считалась использованием тарифа (см. запрос
--    пользователя: "при отмене встреча не списывается с баланса").
--    GREATEST(...,0) — защита от ухода в минус при повторном/гоночном вызове.

alter table events
  add column cost_type text not null default 'each_pays'
    check (cost_type in ('each_pays', 'organizer_treats', 'free', 'negotiable'));

create or replace function decrement_subscription_usage_field(
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_field text
)
returns void
language plpgsql
security definer
as $$
begin
  if p_field = 'events_created_count' then
    update subscription_usage
    set events_created_count = greatest(events_created_count - 1, 0)
    where subscription_id = p_subscription_id and period_start = p_period_start;
  elsif p_field = 'boosts_used_count' then
    update subscription_usage
    set boosts_used_count = greatest(boosts_used_count - 1, 0)
    where subscription_id = p_subscription_id and period_start = p_period_start;
  else
    raise exception 'Unknown field: %', p_field;
  end if;
end;
$$;
ENDOFFILE

mkdir -p "app/api/events"
cat > "app/api/events/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { isAdminTelegramId } from "@/lib/admin/is-admin";
import { rankEvents, type EventForScoring, type SubscriptionPlan } from "@/lib/scoring/rank-events";
import { getActiveSubscriptionInfo, incrementEventsCreated } from "@/lib/subscriptions/server";
import { canCreateMoreEvents, PLAN_LIMITS } from "@/lib/subscriptions/limits";
import { createEventSchema } from "@/lib/validation/create-event";
import { notifyN8n } from "@/lib/n8n/notify";

const PAGE_SIZE = 20;
// Сколько кандидатов тянем из БД до ranking (больше видимого лимита,
// чтобы скоринг реально на что-то влиял, а не только на 20 случайных строк).
const CANDIDATE_POOL_SIZE = 150;

/**
 * GET /api/events?category=slug&type=slug&city=...&page=0
 *
 * Публичная лента опубликованных встреч. Бизнес-правила:
 * - показываем только status = 'published' и дату/время >= сейчас;
 * - скрываем встречи заблокированных друг для друга людей;
 * - ranking считается на backend (service_role, читает subscriptions
 *   организатора для планового коэффициента — это НЕ видно клиенту напрямую,
 *   используется только для сортировки, см. lib/scoring/rank-events.ts).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category");
  const categorySlugsParam = searchParams.get("categories"); // новое: несколько категорий через запятую (экран поиска)
  const typeSlug = searchParams.get("type");
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);
  // Новые фильтры экрана поиска (п. запроса пользователя) — все опциональны,
  // лента (feed) их не передаёт и продолжает работать как раньше.
  const dateFilter = searchParams.get("date"); // 'today' | 'tomorrow' | 'weekend' | 'any' | 'YYYY-MM-DD'
  const timeOfDay = searchParams.get("timeOfDay"); // 'morning' | 'day' | 'evening' | 'any'
  const costTypeParam = searchParams.get("costType"); // одно значение cost_type или 'any'
  const ageMin = searchParams.get("ageMin") ? Number(searchParams.get("ageMin")) : null;
  const ageMax = searchParams.get("ageMax") ? Number(searchParams.get("ageMax")) : null;

  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  let city = searchParams.get("city");
  let viewerLatitude: number | null = null;
  let viewerLongitude: number | null = null;
  let viewerInterestSlugs: string[] = [];
  let blockedOrganizerIds: string[] = [];

  if (currentUser) {
    const [{ data: profile }, { data: interestRows }, { data: blockRows }] = await Promise.all([
      admin.from("users").select("city").eq("id", currentUser.userId).maybeSingle(),
      admin
        .from("user_interests")
        .select("interests(name)")
        .eq("user_id", currentUser.userId),
      admin
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${currentUser.userId},blocked_id.eq.${currentUser.userId}`),
    ]);

    if (!city && profile?.city) city = profile.city;
    viewerInterestSlugs =
      interestRows?.map((r) => (r.interests as unknown as { name: string } | null)?.name).filter(
        (v): v is string => Boolean(v)
      ) ?? [];
    blockedOrganizerIds =
      blockRows?.map((b) =>
        b.blocker_id === currentUser.userId ? b.blocked_id : b.blocker_id
      ) ?? [];
  }

  if (!city) {
    return NextResponse.json({ error: "city_required" }, { status: 400 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let query = admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, seats_total, seats_taken, boosted_at, created_at, cost_type,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, rating_avg, completed_meetings_count)
      `
    )
    .eq("status", "published")
    .eq("city", city)
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(CANDIDATE_POOL_SIZE);

  if (categorySlugsParam) {
    const slugs = categorySlugsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (slugs.length > 0) {
      const { data: categoryRows } = await admin.from("categories").select("id").in("slug", slugs);
      const ids = (categoryRows ?? []).map((c) => c.id);
      if (ids.length > 0) query = query.in("category_id", ids);
    }
  } else if (categorySlug) {
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .maybeSingle();
    if (category) query = query.eq("category_id", category.id);
  }

  if (typeSlug) {
    const { data: trainingType } = await admin
      .from("training_types")
      .select("id")
      .eq("slug", typeSlug)
      .maybeSingle();
    if (trainingType) query = query.eq("training_type_id", trainingType.id);
  }

  if (costTypeParam && costTypeParam !== "any") {
    query = query.eq("cost_type", costTypeParam);
  }

  // Дата: конкретный день, либо "выходные" (ближайшие сб/вс от сегодня).
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

  // Время суток: утро/день/вечер по времени начала встречи.
  if (timeOfDay === "morning") {
    query = query.gte("event_time", "05:00:00").lt("event_time", "12:00:00");
  } else if (timeOfDay === "day") {
    query = query.gte("event_time", "12:00:00").lt("event_time", "18:00:00");
  } else if (timeOfDay === "evening") {
    query = query.gte("event_time", "18:00:00").lt("event_time", "23:59:59");
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("GET /api/events — ошибка запроса к Supabase:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  let visibleRows = (rows ?? []).filter(
    (row) => !blockedOrganizerIds.includes((row.organizer as unknown as { id: string } | null)?.id ?? "")
  );

  // Возраст организатора — фильтруется на нашей стороне (не в SQL), т.к.
  // считается из birth_date, а кандидатов и так не более CANDIDATE_POOL_SIZE.
  if (ageMin !== null || ageMax !== null) {
    visibleRows = visibleRows.filter((row) => {
      const organizer = row.organizer as unknown as { birth_date: string } | null;
      if (!organizer) return false;
      const age = calculateAge(organizer.birth_date);
      if (ageMin !== null && age < ageMin) return false;
      if (ageMax !== null && age > ageMax) return false;
      return true;
    });
  }

  // Подтягиваем активные подписки организаторов одним запросом — для planCoefficient в ranking.
  const organizerIds = Array.from(
    new Set(visibleRows.map((r) => (r.organizer as unknown as { id: string } | null)?.id).filter(Boolean))
  ) as string[];

  const { data: activeSubs } = organizerIds.length
    ? await admin
        .from("subscriptions")
        .select("user_id, plan")
        .in("user_id", organizerIds)
        .eq("status", "active")
    : { data: [] as { user_id: string; plan: SubscriptionPlan }[] };

  const planByOrganizer = new Map<string, SubscriptionPlan>(
    (activeSubs ?? []).map((s) => [s.user_id, s.plan as SubscriptionPlan])
  );

  const now = new Date();
  const scorable: (EventForScoring & { _row: (typeof visibleRows)[number] })[] = visibleRows.map((row) => {
    const category = row.category as unknown as { slug: string } | null;
    const trainingType = row.training_type as unknown as { slug: string } | null;
    const organizer = row.organizer as unknown as { id: string } | null;
    return {
      id: row.id,
      createdAt: row.created_at,
      eventDate: row.event_date,
      eventTime: row.event_time,
      seatsTotal: row.seats_total,
      seatsTaken: row.seats_taken,
      boostedAt: row.boosted_at,
      organizerPlan: organizer ? planByOrganizer.get(organizer.id) ?? null : null,
      categorySlug: category?.slug ?? "",
      trainingTypeSlug: trainingType?.slug ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      _row: row,
    };
  });

  const ranked = rankEvents(scorable, {
    now,
    viewerLatitude,
    viewerLongitude,
    viewerInterestSlugs,
  });

  const pageStart = page * PAGE_SIZE;
  const pageItems = ranked.slice(pageStart, pageStart + PAGE_SIZE).map(({ _row }) => {
    const organizer = _row.organizer as unknown as {
      id: string;
      name: string;
      avatar_url: string | null;
      birth_date: string;
      rating_avg: number;
      completed_meetings_count: number;
    } | null;
    const category = _row.category as unknown as { slug: string; name: string; emoji: string | null } | null;
    const trainingType = _row.training_type as unknown as { slug: string; name: string; emoji: string | null } | null;

    return {
      id: _row.id,
      title: _row.title,
      description: _row.description,
      category,
      trainingType,
      city: _row.city,
      placeName: _row.place_name,
      address: _row.address,
      eventDate: _row.event_date,
      eventTime: _row.event_time,
      seatsTotal: _row.seats_total,
      seatsTaken: _row.seats_taken,
      costType: _row.cost_type,
      organizer: organizer
        ? {
            id: organizer.id,
            name: organizer.name,
            avatarUrl: organizer.avatar_url,
            age: calculateAge(organizer.birth_date),
            ratingAvg: organizer.rating_avg,
            completedMeetingsCount: organizer.completed_meetings_count,
          }
        : null,
    };
  });

  return NextResponse.json({
    items: pageItems,
    page,
    hasMore: pageStart + PAGE_SIZE < ranked.length,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/** Диапазон ближайших выходных: если сегодня сб/вс — начиная с сегодня, иначе следующие сб-вс. */
function getUpcomingWeekendRange(): { from: string; to: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = вс, 6 = сб

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

/**
 * POST /api/events
 * Создание встречи. Проверка подписки и лимита — ВСЕГДА на сервере
 * (п.26 ТЗ: "нельзя позволять frontend обходить ограничения"), даже если
 * фронтенд уже проверял то же самое для UX.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Админ (ADMIN_TELEGRAM_IDS) тестирует приложение без ограничений подписки —
  // ни одна проверка лимитов ниже к нему не применяется. Обычные пользователи
  // по-прежнему проходят полную проверку на сервере, как и раньше (п.26 ТЗ).
  const isAdmin = isAdminTelegramId(currentUser.telegramId);

  const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
  if (!isAdmin) {
    if (!subscriptionInfo) {
      return NextResponse.json({ error: "subscription_required" }, { status: 402 });
    }

    if (!canCreateMoreEvents(subscriptionInfo.plan, subscriptionInfo.eventsCreatedCount)) {
      return NextResponse.json({ error: "events_limit_reached" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const input = parsed.data;

  const groupMax = subscriptionInfo ? PLAN_LIMITS[subscriptionInfo.plan].groupMax : PLAN_LIMITS.premium.groupMax;
  if (!isAdmin && input.seatsTotal > groupMax) {
    return NextResponse.json(
      { error: "group_size_exceeds_plan", groupMax },
      { status: 422 }
    );
  }

  const { data: category } = await admin
    .from("categories")
    .select("id")
    .eq("slug", input.categorySlug)
    .maybeSingle();
  if (!category) {
    return NextResponse.json({ error: "invalid_category" }, { status: 422 });
  }

  let trainingTypeId: string | null = null;
  if (input.categorySlug === "training") {
    if (!input.trainingTypeSlug) {
      return NextResponse.json({ error: "training_type_required" }, { status: 422 });
    }
    const { data: trainingType } = await admin
      .from("training_types")
      .select("id")
      .eq("slug", input.trainingTypeSlug)
      .maybeSingle();
    if (!trainingType) {
      return NextResponse.json({ error: "invalid_training_type" }, { status: 422 });
    }
    trainingTypeId = trainingType.id;
  }

  const { data: organizerProfile } = await admin
    .from("users")
    .select("city")
    .eq("id", currentUser.userId)
    .maybeSingle();

  const { data: createdEvent, error: insertError } = await admin
    .from("events")
    .insert({
      organizer_id: currentUser.userId,
      category_id: category.id,
      training_type_id: trainingTypeId,
      title: input.title,
      description: input.description,
      city: organizerProfile?.city ?? "",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      place_name: input.placeName,
      address: input.address,
      event_date: input.eventDate,
      event_time: input.eventTime,
      seats_total: input.seatsTotal,
      seats_taken: 0,
      cost_type: input.costType,
      status: "published",
    })
    .select("id")
    .single();

  if (insertError || !createdEvent) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.from("event_members").insert({
    event_id: createdEvent.id,
    user_id: currentUser.userId,
    role: "organizer",
  });

  // Если у админа нет реальной подписки (типичный случай при тестировании),
  // subscriptionInfo будет null — увеличивать счётчик использования нечего.
  if (subscriptionInfo) {
    await incrementEventsCreated(admin, subscriptionInfo.subscriptionId, subscriptionInfo.currentPeriodStart);
  }

  // Workflow 1 (п.27 ТЗ): находим потенциально релевантных пользователей —
  // та же логика интересов, что и в ranking (lib/scoring), но здесь как
  // одноразовый список получателей для n8n, а не как скоринг.
  notifyRelevantUsers(admin, {
    eventId: createdEvent.id,
    organizerId: currentUser.userId,
    city: organizerProfile?.city ?? "",
    categorySlug: input.categorySlug,
    trainingTypeSlug: input.trainingTypeSlug ?? null,
    title: input.title,
  }).catch(() => {});

  return NextResponse.json({ status: "created", eventId: createdEvent.id });
}

async function notifyRelevantUsers(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    eventId: string;
    organizerId: string;
    city: string;
    categorySlug: string;
    trainingTypeSlug: string | null;
    title: string;
  }
) {
  // "Релевантные пользователи" — те, у кого в интересах есть название
  // категории или типа тренировки, живут в том же городе, не заблокированы
  // организатором и не он сам.
  const interestNames = [params.categorySlug, params.trainingTypeSlug].filter(Boolean) as string[];
  if (interestNames.length === 0) return;

  const { data: matchingInterests } = await admin.from("interests").select("id, name");
  const relevantInterestIds = (matchingInterests ?? [])
    .filter((i) => interestNames.some((n) => i.name.toLowerCase().includes(n.toLowerCase())))
    .map((i) => i.id);
  if (relevantInterestIds.length === 0) return;

  const { data: candidateRows } = await admin
    .from("user_interests")
    .select("user_id, users!inner(id, telegram_id, city)")
    .in("interest_id", relevantInterestIds);

  const { data: blocks } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${params.organizerId},blocked_id.eq.${params.organizerId}`);
  const blockedIds = new Set(
    (blocks ?? []).map((b) => (b.blocker_id === params.organizerId ? b.blocked_id : b.blocker_id))
  );

  const recipients = Array.from(
    new Map(
      (candidateRows ?? [])
        .map((r) => r.users as unknown as { id: string; telegram_id: number; city: string } | null)
        .filter(
          (u): u is { id: string; telegram_id: number; city: string } =>
            !!u && u.id !== params.organizerId && u.city === params.city && !blockedIds.has(u.id)
        )
        .map((u) => [u.id, u.telegram_id])
    ).values()
  );

  if (recipients.length === 0) return;

  await notifyN8n("event-created", {
    eventId: params.eventId,
    title: params.title,
    telegramIds: recipients,
  });
}
ENDOFFILE

mkdir -p "app/(app)/search"
cat > "app/(app)/search/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
    return count;
  }, [selectedCategorySlugs, dateFilter, timeFilter, costFilter, ageMin, ageMax]);

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("city", city);
    if (selectedCategorySlugs.length > 0) params.set("categories", selectedCategorySlugs.join(","));
    if (dateFilter !== "any") params.set("date", dateFilter);
    if (timeFilter !== "any") params.set("timeOfDay", timeFilter);
    if (costFilter !== "any") params.set("costType", costFilter);
    if (ageMin) params.set("ageMin", ageMin);
    if (ageMax) params.set("ageMax", ageMax);

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
          className="flex-1 rounded-pill border border-lavender-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-accent"
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
                className="mt-2 w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-accent"
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
                  className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
                <span className="text-ink-400">—</span>
                <input
                  type="number"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="До"
                  className="w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <p className="mt-1 text-xs text-ink-400">По умолчанию без ограничений</p>
            </FilterSection>

            <p className="mb-3 text-xs text-ink-400">
              Пол автора встречи — фильтр появится позже, когда эта информация будет собираться в профиле.
            </p>

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

mkdir -p "components/layout"
cat > "components/layout/BottomNav.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// Финальная навигация МЕСТО: по центру — переход к полному списку встреч
// с фильтрами (раньше здесь были монеты подписки; монеты переехали в
// профиль — см. app/(app)/profile/page.tsx, карточка "Мой пакет").
const TABS = [
  { href: "/feed", label: "Главная", icon: "nav-home" },
  { href: "/map", label: "Карта", icon: "nav-map" },
  { href: "/chats", label: "Чаты", icon: "nav-chat" },
  { href: "/profile", label: "Профиль", icon: "nav-profile" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-sheet border-t border-lavender-100 bg-white/95 shadow-card-lg backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-between px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {left.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}

        <Link
          href="/search"
          aria-label="Поиск встреч"
          className="-mt-5 flex flex-col items-center gap-1 active:scale-95"
        >
          <div
            className={clsx(
              "flex h-12 w-12 items-center justify-center rounded-full shadow-cta",
              pathname === "/search" ? "bg-brand-gradient" : "bg-ink-900"
            )}
          >
            <Image
              src="/brand/icons/location.svg"
              alt=""
              width={22}
              height={22}
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
          <span className={clsx("text-xs", pathname === "/search" ? "text-accent font-medium" : "text-ink-400")}>
            Встречи
          </span>
        </Link>

        {right.map((tab) => (
          <NavTab key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const src = `/brand/navigation/${tab.icon}-${active ? "active" : "default"}.svg`;
  return (
    <Link
      href={tab.href}
      className={clsx(
        "flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs",
        active ? "text-accent font-medium" : "text-ink-400"
      )}
    >
      <Image src={src} alt="" width={24} height={24} />
      {tab.label}
    </Link>
  );
}
ENDOFFILE

mkdir -p "app/(app)/profile"
cat > "app/(app)/profile/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type Plan } from "@/lib/subscriptions/limits";

interface Profile {
  name: string;
  avatarUrl: string | null;
  age: number;
  city: string;
  bio: string | null;
  ratingAvg: number;
  ratingCount: number;
  completedMeetingsCount: number;
  eventsOrganizedCount: number;
  eventsAttendedCount: number;
  memberSince: string;
}

interface SubscriptionStatus {
  active: boolean;
  plan?: Plan;
  periodEnd?: string;
  events?: { used: number; limit: number | null };
  boosts?: { used: number; limit: number };
}

const PLAN_TITLES: Record<Plan, string> = { start: "Старт", medium: "Медиум", premium: "Премьер" };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/me/profile").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
    ])
      .then(([profileData, subData]) => {
        if (!profileData.error) setProfile(profileData);
        setSubscription(subData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6 text-center">
        <p className="text-ink-600">Не удалось загрузить профиль.</p>
      </div>
    );
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы повторный выбор того же файла тоже сработал
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Файл больше 5 МБ — выбери другое фото.");
      setTimeout(() => setUploadError(null), 3000);
      return;
    }

    setUploadingPhoto(true);
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError("Не получилось загрузить фото.");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
    } catch {
      setUploadError("Проблема с соединением.");
    } finally {
      setUploadingPhoto(false);
      setTimeout(() => setUploadError(null), 3000);
    }
  }

  return (
    <div className="px-5 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white text-2xl font-semibold text-ink-600 shadow-card">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-white shadow-card active:scale-95"
            aria-label="Изменить фото"
          >
            {uploadingPhoto ? "…" : "✏️"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelected}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-display truncate">
            {profile.name}, {profile.age}
          </h1>
          <p className="text-sm text-ink-600">{profile.city}</p>
        </div>
        </div>

        <Link href="/settings" aria-label="Настройки" className="mt-1 shrink-0">
          <Image src="/brand/icons/settings.svg" alt="" width={22} height={22} />
        </Link>
      </div>

      {uploadError && <p className="mb-4 text-center text-sm text-red-600">{uploadError}</p>}

      {profile.bio && <p className="mb-6 text-sm text-ink-900">{profile.bio}</p>}

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatCard
          label="Рейтинг"
          value={profile.ratingCount > 0 ? profile.ratingAvg.toFixed(1) : "—"}
          emoji="⭐"
        />
        <StatCard label="Встреч состоялось" value={String(profile.completedMeetingsCount)} emoji="🤝" />
        <StatCard label="Создано встреч" value={String(profile.eventsOrganizedCount)} emoji="📋" />
      </div>

      <h2 className="text-title mb-3">Мой пакет</h2>
      {subscription?.active ? (
        <Link
          href="/subscriptions"
          className="mb-6 flex items-center justify-between rounded-card-lg bg-ink-900 p-5 text-white shadow-card-lg"
        >
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-16 shrink-0">
              <Image src="/brand/3d/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
            </div>
            <div>
              <span className="text-lg font-bold">{PLAN_TITLES[subscription.plan!]}</span>
              <p className="text-sm text-white/70">
                до {new Date(subscription.periodEnd!).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>
          <span className="text-white/70">→</span>
        </Link>
      ) : (
        <Link
          href="/subscriptions"
          className="mb-6 flex items-center gap-3 rounded-card-lg bg-white p-5 shadow-card-lg"
        >
          <div className="relative h-12 w-16 shrink-0">
            <Image src="/brand/3d/subscription-coins.png" alt="" fill className="object-contain" sizes="64px" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">Оформить подписку</p>
            <p className="text-xs text-ink-600">Нужна для создания встреч</p>
          </div>
          <span className="ml-auto text-accent">→</span>
        </Link>
      )}

      <Link
        href="/reviews"
        className="flex items-center justify-between rounded-card bg-white p-4 shadow-card"
      >
        <span className="text-sm font-medium text-ink-900">Отзывы после встреч</span>
        <span className="text-accent">→</span>
      </Link>
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-card bg-white p-3 text-center shadow-card">
      <div className="text-lg">{emoji}</div>
      <div className="text-lg font-bold text-ink-900">{value}</div>
      <div className="text-[11px] leading-tight text-ink-600">{label}</div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
ENDOFFILE

mkdir -p "lib/validation"
cat > "lib/validation/create-event.ts" << 'ENDOFFILE'
import { z } from "zod";

export const createEventSchema = z.object({
  categorySlug: z.string().min(1),
  trainingTypeSlug: z.string().optional(),

  placeName: z.string().trim().min(2, "Укажи место").max(120),
  address: z.string().trim().max(200).optional().default(""),
  latitude: z.number().optional(),
  longitude: z.number().optional(),

  eventDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата"),
  eventTime: z.string().regex(/^\d{2}:\d{2}$/, "Некорректное время"),

  seatsTotal: z.number().int().min(1, "Минимум 1 участник").max(30, "Максимум 30 участников"),

  costType: z.enum(["each_pays", "organizer_treats", "free", "negotiable"]).default("each_pays"),

  title: z.string().trim().min(3, "Слишком коротко").max(100),
  description: z.string().trim().max(500).optional().default(""),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
ENDOFFILE

mkdir -p "components/create-event"
cat > "components/create-event/CreateEventWizard.tsx" << 'ENDOFFILE'
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StepProgress } from "@/components/ui/StepProgress";
import { LocationPicker } from "@/components/map/LocationPicker";
import { getInitData } from "@/lib/telegram/webapp-client";

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

type Step = "category" | "trainingType" | "where" | "when" | "time" | "seats" | "cost" | "details" | "review";

const DATE_PRESETS = [
  { label: "Сегодня", offsetDays: 0 },
  { label: "Завтра", offsetDays: 1 },
];

// 3D-иконки категорий МЕСТО — тот же комплект, что на главном экране и в карточках встреч.
const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};

// Компактный размер полей — весь шаг (включая карту и кнопку "Далее")
// должен помещаться на экране телефона без прокрутки страницы.
// min-w-0 + box-border обязательны: без них нативные <input type="date">
// и <input type="time"> на iOS игнорируют w-full и вылезают за край экрана
// (у flex-элементов по умолчанию min-width:auto, из-за чего браузер не
// сжимает их внутреннюю "родную" ширину до ширины контейнера).
const inputClass =
  "block w-full min-w-0 box-border rounded-card border border-lavender-200 bg-white px-4 py-3 text-base text-ink-900 outline-none focus:border-accent";

export function CreateEventWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCategory = searchParams.get("category");

  const [categories, setCategories] = useState<Category[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categorySlug, setCategorySlug] = useState<string | null>(preselectedCategory);
  const [trainingTypeSlug, setTrainingTypeSlug] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [seatsTotal, setSeatsTotal] = useState(4);
  const [costType, setCostType] = useState<"each_pays" | "organizer_treats" | "free" | "negotiable">("each_pays");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories ?? []);
        setTrainingTypes(data.trainingTypes ?? []);
      });
  }, []);

  const steps: Step[] = categorySlug === "training"
    ? ["category", "trainingType", "where", "when", "time", "seats", "cost", "details", "review"]
    : ["category", "where", "when", "time", "seats", "cost", "details", "review"];

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  function goNext() {
    setError(null);
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  }
  function goBack() {
    setError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  function pickDatePreset(offsetDays: number) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    setEventDate(date.toISOString().slice(0, 10));
  }

  async function handlePublish() {
    setSubmitting(true);
    setError(null);

    const initData = getInitData();
    if (!initData) {
      setError("Открой приложение через Telegram.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorySlug,
          trainingTypeSlug: trainingTypeSlug ?? undefined,
          placeName,
          address,
          latitude,
          longitude,
          eventDate,
          eventTime,
          seatsTotal,
          costType,
          title,
          description,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "subscription_required") {
          setError("Нужна активная подписка.");
        } else if (data.error === "events_limit_reached") {
          setError("Лимит встреч по твоему тарифу исчерпан на этот период.");
        } else if (data.error === "group_size_exceeds_plan") {
          setError(`Твой тариф позволяет группу максимум из ${data.groupMax} человек.`);
        } else {
          setError("Не получилось опубликовать встречу.");
        }
        setSubmitting(false);
        return;
      }

      router.push(`/events/${data.eventId}/applications`);
    } catch {
      setError("Проблема с соединением.");
      setSubmitting(false);
    }
  }

  const canGoNext =
    (step === "category" && categorySlug !== null) ||
    (step === "trainingType" && trainingTypeSlug !== null) ||
    (step === "where" && placeName.trim().length >= 2 && latitude !== undefined && longitude !== undefined) ||
    (step === "when" && eventDate.length > 0) ||
    (step === "time" && eventTime.length > 0) ||
    (step === "seats" && seatsTotal >= 1) ||
    step === "cost" ||
    (step === "details" && title.trim().length >= 3);

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-background px-5 pb-3 pt-4">
      <StepProgress currentStep={stepIndex + 1} totalSteps={steps.length} />

      {/* min-h-0 обязателен, чтобы flex-child мог сжиматься и включать
          свою собственную прокрутку вместо раздувания всей страницы —
          так кнопка "Далее" всегда остаётся на экране без скролла. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-3 overflow-y-auto py-3">
        {step === "category" && (
          <StepBlock title="Что планируем?">
            <div className="grid grid-cols-2 gap-3">
              {categories.map((c) => {
                const icon = CATEGORY_ICON[c.slug];
                const selected = categorySlug === c.slug;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategorySlug(c.slug);
                      setTrainingTypeSlug(null);
                    }}
                    className={`flex flex-col items-start gap-2 rounded-card p-4 text-left text-sm font-medium transition ${
                      selected ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                    }`}
                  >
                    {icon ? (
                      <div className="relative h-11 w-11">
                        <Image src={icon} alt="" fill className="object-contain" sizes="44px" />
                      </div>
                    ) : (
                      <span className="text-2xl">{c.emoji}</span>
                    )}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </StepBlock>
        )}

        {step === "trainingType" && (
          <StepBlock title="Какая тренировка?">
            <div className="grid grid-cols-2 gap-2">
              {trainingTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrainingTypeSlug(t.slug)}
                  className={`flex items-center gap-2 rounded-card p-3 text-left text-sm font-medium transition ${
                    trainingTypeSlug === t.slug ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  {t.name}
                </button>
              ))}
            </div>
          </StepBlock>
        )}

        {step === "where" && (
          <StepBlock title="Где?" subtitle="Впиши название места и отметь его на карте.">
            <input
              autoFocus
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="Название места"
              className={`mb-2 ${inputClass}`}
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Адрес (необязательно)"
              className={`mb-2 text-base ${inputClass}`}
            />
            <LocationPicker onPick={({ latitude, longitude }) => {
              setLatitude(latitude);
              setLongitude(longitude);
            }} />
            {placeName.trim().length >= 2 && latitude === undefined && (
              <p className="mt-2 shrink-0 text-center text-xs font-medium text-accent">
                Отметь точку на карте, чтобы продолжить
              </p>
            )}
          </StepBlock>
        )}

        {step === "when" && (
          <StepBlock title="Когда?">
            <div className="mb-3 flex gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => pickDatePreset(preset.offsetDays)}
                  className="flex-1 rounded-card bg-white p-3 text-sm font-medium text-ink-900 shadow-card"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className={inputClass}
            />
          </StepBlock>
        )}

        {step === "time" && (
          <StepBlock title="Во сколько?">
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className={inputClass}
            />
          </StepBlock>
        )}

        {step === "seats" && (
          <StepBlock title="Сколько человек нужно?">
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setSeatsTotal((n) => Math.max(1, n - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
              >
                −
              </button>
              <span className="text-display w-12 text-center">{seatsTotal}</span>
              <button
                onClick={() => setSeatsTotal((n) => Math.min(30, n + 1))}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-accent shadow-card active:scale-95"
              >
                +
              </button>
            </div>
          </StepBlock>
        )}

        {step === "cost" && (
          <StepBlock title="Как насчёт расходов?">
            <div className="flex flex-col gap-2">
              {(
                [
                  ["each_pays", "Каждый за себя"],
                  ["organizer_treats", "Автор угощает"],
                  ["free", "Без расходов"],
                  ["negotiable", "По договорённости"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setCostType(value)}
                  className={`rounded-card p-4 text-left text-sm font-medium transition ${
                    costType === value ? "bg-brand-gradient text-white shadow-cta" : "bg-white text-ink-900 shadow-card"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </StepBlock>
        )}

        {step === "details" && (
          <StepBlock title="Название и описание">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Утренняя пробежка в парке"
              maxLength={100}
              className={`mb-2 ${inputClass}`}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткое описание (необязательно)"
              maxLength={500}
              rows={3}
              className={`resize-none text-base ${inputClass}`}
            />
          </StepBlock>
        )}

        {step === "review" && (
          <StepBlock title="Всё верно?">
            <div className="space-y-2 rounded-card-lg bg-white p-5 shadow-card-lg">
              <ReviewRow label="Название" value={title} />
              <ReviewRow label="Место" value={placeName} />
              <ReviewRow label="Дата" value={eventDate} />
              <ReviewRow label="Время" value={eventTime} />
              <ReviewRow label="Участников" value={String(seatsTotal)} />
              <ReviewRow
                label="Расходы"
                value={
                  { each_pays: "Каждый за себя", organizer_treats: "Автор угощает", free: "Без расходов", negotiable: "По договорённости" }[
                    costType
                  ]
                }
              />
              {description && <ReviewRow label="Описание" value={description} />}
            </div>
          </StepBlock>
        )}

        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 gap-3 pt-2">
        {stepIndex > 0 && (
          <Button variant="secondary" onClick={goBack} className="w-auto px-6">
            Назад
          </Button>
        )}
        {!isLastStep ? (
          <Button onClick={goNext} disabled={!canGoNext}>
            Далее
          </Button>
        ) : (
          <Button onClick={handlePublish} disabled={submitting}>
            {submitting ? "Публикуем..." : "Опубликовать"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3">
      <div className="shrink-0 text-center">
        <h1 className="text-title">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-ink-600">{subtitle}</p>}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="text-right font-medium text-ink-900">{value}</span>
    </div>
  );
}
ENDOFFILE

mkdir -p "lib/reviews"
cat > "lib/reviews/complete-due-events.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";

const ASSUMED_EVENT_DURATION_HOURS = 2; // считаем встречу завершённой через 2ч после начала, если явно не закрыта раньше

export interface DueReviewItem {
  eventId: string;
  title: string;
  recipients: number[]; // telegram_id получателей — для n8n, чтобы реально отправить сообщение
}

/**
 * Переводит просроченные опубликованные встречи в статус 'completed' и
 * создаёт уведомления review_request участникам. Идемпотентна (safe re-run) —
 * условие status='published' и проверка "уже уведомлён" защищают от дублей.
 * Возвращает список ТОЛЬКО ЧТО обработанных встреч с telegram_id получателей —
 * нужно, чтобы n8n-воркфлоу знал, кому реально отправить сообщение в Telegram
 * (после первого вызова эти события больше не попадут в возврат повторно).
 *
 * Раньше это работало ТОЛЬКО через внешний n8n-опрос (см.
 * app/api/n8n/due-review-requests/route.ts), и если n8n не настроен —
 * встречи никогда не завершались и окно с отзывом не появлялось.
 * Теперь эта же функция вызывается лениво прямо из приложения
 * (GET /api/reviews/reviewable) при каждом заходе — работает без n8n.
 */
export async function completeDueEvents(
  admin: ReturnType<typeof createAdminClient>
): Promise<DueReviewItem[]> {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("events")
    .select("id, title, event_date, event_time")
    .eq("status", "published")
    .lte("event_date", todayIso);

  const finished = (candidates ?? []).filter((e) => {
    const start = new Date(`${e.event_date}T${e.event_time}`);
    const end = new Date(start.getTime() + ASSUMED_EVENT_DURATION_HOURS * 60 * 60 * 1000);
    return end <= now;
  });

  if (finished.length === 0) return [];

  const finishedIds = finished.map((e) => e.id);

  await admin.from("events").update({ status: "completed" }).in("id", finishedIds).eq("status", "published");

  const { data: allFinishedMembers } = await admin
    .from("event_members")
    .select("user_id")
    .in("event_id", finishedIds);
  const uniqueMemberIds = Array.from(new Set((allFinishedMembers ?? []).map((m) => m.user_id)));
  if (uniqueMemberIds.length > 0) {
    await admin.rpc("increment_completed_meetings", { p_user_ids: uniqueMemberIds });
  }

  const { data: alreadyNotified } = await admin
    .from("notifications")
    .select("payload")
    .eq("type", "review_request");
  const alreadyNotifiedEventIds = new Set(
    (alreadyNotified ?? []).map((n) => (n.payload as { eventId?: string } | null)?.eventId).filter(Boolean)
  );

  const toNotify = finished.filter((e) => !alreadyNotifiedEventIds.has(e.id));
  if (toNotify.length === 0) return [];

  const { data: members } = await admin
    .from("event_members")
    .select("event_id, users(id, telegram_id)")
    .in(
      "event_id",
      toNotify.map((e) => e.id)
    );

  await admin.from("notifications").insert(
    toNotify.flatMap((event) =>
      (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => (m.users as unknown as { id: string } | null)?.id)
        .filter((id): id is string => !!id)
        .map((userId) => ({ user_id: userId, type: "review_request", payload: { eventId: event.id } }))
    )
  );

  return toNotify
    .map((event) => {
      const recipients = (members ?? [])
        .filter((m) => m.event_id === event.id)
        .map((m) => (m.users as unknown as { telegram_id: number } | null)?.telegram_id)
        .filter((id): id is number => typeof id === "number");
      return { eventId: event.id, title: event.title, recipients };
    })
    .filter((item) => item.recipients.length > 0);
}
ENDOFFILE

mkdir -p "components/reviews"
cat > "components/reviews/PendingReviewModal.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { ReviewForm } from "@/components/reviews/ReviewForm";

interface ReviewableMember {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface ReviewableEvent {
  eventId: string;
  title: string;
  eventDate: string;
  reviewableMembers: ReviewableMember[];
}

/**
 * Проверяет при каждом заходе в приложение, есть ли завершённые встречи,
 * которые пользователь ещё не оценил — и если да, сразу показывает модалку
 * с формой отзыва поверх текущего экрана (см. запрос: "вылазит окно с
 * отзывом и оценкой"). Один вызов /api/reviews/reviewable по пути заодно
 * лениво переводит просроченные встречи в completed (см. lib/reviews/).
 */
export function PendingReviewModal() {
  const [queue, setQueue] = useState<{ eventId: string; member: ReviewableMember }[]>([]);

  useEffect(() => {
    fetch("/api/reviews/reviewable")
      .then((r) => r.json())
      .then((data) => {
        const events: ReviewableEvent[] = data.events ?? [];
        const flat = events.flatMap((e) => e.reviewableMembers.map((member) => ({ eventId: e.eventId, member })));
        setQueue(flat);
      })
      .catch(() => {});
  }, []);

  if (queue.length === 0) return null;

  const current = queue[0];

  async function handleSubmit(data: {
    rating: number;
    arrivedOnTime: boolean;
    pleasantCommunication: boolean;
    meetingHappened: boolean;
    wouldMeetAgain: boolean;
  }) {
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: current.eventId,
        revieweeId: current.member.id,
        ...data,
      }),
    });
    setQueue((prev) => prev.slice(1));
  }

  function handleSkip() {
    setQueue((prev) => prev.slice(1));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-4">
      <div className="w-full max-w-md">
        <ReviewForm personName={current.member.name} onSubmit={handleSubmit} onCancel={handleSkip} />
      </div>
    </div>
  );
}
ENDOFFILE

mkdir -p "app/(app)"
cat > "app/(app)/layout.tsx" << 'ENDOFFILE'
import { BottomNav } from "@/components/layout/BottomNav";
import { PendingReviewModal } from "@/components/reviews/PendingReviewModal";

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomNav />
      <PendingReviewModal />
    </div>
  );
}
ENDOFFILE

mkdir -p "app/api/n8n/due-review-requests"
cat > "app/api/n8n/due-review-requests/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidN8nRequest } from "@/lib/n8n/auth";
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

/**
 * GET /api/n8n/due-review-requests
 *
 * Workflow 5 (п.27 ТЗ): "После встречи → запросить отзыв". Основная логика
 * (перевод статуса, создание уведомлений в БД) вынесена в
 * lib/reviews/complete-due-events.ts — та же функция вызывается прямо из
 * приложения (GET /api/reviews/reviewable), так что этот n8n-опрос — не
 * единственный триггер, а регулярная подстраховка: именно он даёт n8n
 * список telegram_id, чтобы реально отправить push в Telegram, даже если
 * пользователь не открывал приложение после встречи.
 */
export async function GET(req: NextRequest) {
  if (!isValidN8nRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const items = await completeDueEvents(admin);

  return NextResponse.json({ items });
}
ENDOFFILE

mkdir -p "app/api/reviews/reviewable"
cat > "app/api/reviews/reviewable/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

/**
 * GET /api/reviews/reviewable
 *
 * Все завершённые встречи, где текущий пользователь был участником, вместе
 * со списком остальных участников, которых ещё МОЖНО оценить (п.20 ТЗ:
 * "только реальные участники завершённой встречи могут оценивать друг друга").
 *
 * Сначала лениво запускаем перевод просроченных встреч в 'completed' —
 * раньше это происходило ТОЛЬКО через внешний n8n-таймер, и если он не
 * настроен, встречи никогда не завершались и отзыв нельзя было оставить.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await completeDueEvents(admin);

  const { data: myMemberships } = await admin
    .from("event_members")
    .select("event_id, events!inner(id, title, event_date, status)")
    .eq("user_id", currentUser.userId);

  const completedEventIds = (myMemberships ?? [])
    .filter((m) => (m.events as unknown as { status: string }).status === "completed")
    .map((m) => m.event_id);

  if (completedEventIds.length === 0) return NextResponse.json({ events: [] });

  const [{ data: allMembers }, { data: myReviews }] = await Promise.all([
    admin
      .from("event_members")
      .select("event_id, users(id, name, avatar_url)")
      .in("event_id", completedEventIds),
    admin
      .from("reviews")
      .select("event_id, reviewee_id")
      .eq("reviewer_id", currentUser.userId)
      .in("event_id", completedEventIds),
  ]);

  const alreadyReviewedKeys = new Set((myReviews ?? []).map((r) => `${r.event_id}:${r.reviewee_id}`));

  const events = completedEventIds
    .map((eventId) => {
      const meta = myMemberships!.find((m) => m.event_id === eventId)!.events as unknown as {
        id: string;
        title: string;
        event_date: string;
      };
      const otherMembers = (allMembers ?? [])
        .filter((m) => m.event_id === eventId)
        .map((m) => m.users as unknown as { id: string; name: string; avatar_url: string | null } | null)
        .filter(
          (u): u is { id: string; name: string; avatar_url: string | null } =>
            !!u && u.id !== currentUser.userId && !alreadyReviewedKeys.has(`${eventId}:${u.id}`)
        );
      return {
        eventId,
        title: meta.title,
        eventDate: meta.event_date,
        reviewableMembers: otherMembers,
      };
    })
    .filter((e) => e.reviewableMembers.length > 0);

  return NextResponse.json({ events });
}
ENDOFFILE

mkdir -p "app/api/events/[id]"
cat > "app/api/events/[id]/route.ts" << 'ENDOFFILE'
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";

/**
 * GET /api/events/[id]
 * Полная информация о встрече для экрана "Детали встречи" — открывается
 * по клику на карточку в ленте или на маркер на карте.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  const { data: event, error } = await admin
    .from("events")
    .select(
      `
      id, title, description, city, latitude, longitude, place_name, address,
      event_date, event_time, seats_total, seats_taken, status, organizer_id,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, rating_avg, completed_meetings_count)
      `
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const organizerRow = event.organizer as unknown as {
    id: string;
    name: string;
    avatar_url: string | null;
    birth_date: string;
    rating_avg: number;
    completed_meetings_count: number;
  } | null;

  const { data: memberRows } = await admin
    .from("event_members")
    .select("role, user:users(id, name, avatar_url)")
    .eq("event_id", eventId)
    .eq("role", "participant");

  const participants = (memberRows ?? []).map((m) => {
    const user = m.user as unknown as { id: string; name: string; avatar_url: string | null };
    return { id: user.id, name: user.name, avatarUrl: user.avatar_url };
  });

  let viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none" = "none";
  if (currentUser) {
    if (event.organizer_id === currentUser.userId) {
      viewerStatus = "organizer";
    } else {
      const { data: application } = await admin
        .from("applications")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", currentUser.userId)
        .maybeSingle();
      if (application?.status === "accepted") viewerStatus = "accepted";
      else if (application?.status === "pending") viewerStatus = "pending";
      else if (application?.status === "rejected") viewerStatus = "rejected";
    }
  }

  return NextResponse.json({
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.category,
    trainingType: event.training_type,
    city: event.city,
    placeName: event.place_name,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    eventDate: event.event_date,
    eventTime: event.event_time,
    seatsTotal: event.seats_total,
    seatsTaken: event.seats_taken,
    status: event.status,
    organizer: organizerRow
      ? {
          id: organizerRow.id,
          name: organizerRow.name,
          avatarUrl: organizerRow.avatar_url,
          age: calculateAge(organizerRow.birth_date),
          ratingAvg: organizerRow.rating_avg,
          completedMeetingsCount: organizerRow.completed_meetings_count,
        }
      : null,
    participants,
    viewerStatus,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * PATCH /api/events/[id]
 * Body: { action: "cancel" }
 *
 * Отмена своей встречи организатором. По запросу пользователя: "при отмене
 * встреча не списывается с баланса" — возвращаем счётчик "создано встреч за
 * период" назад (best-effort: против ТЕКУЩЕЙ активной подписки организатора,
 * а не обязательно той же, что была на момент создания — в подавляющем
 * большинстве случаев это один и тот же период).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id: eventId } = params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.action !== "cancel") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.organizer_id !== currentUser.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (event.status !== "published") {
    return NextResponse.json({ error: "cannot_cancel" }, { status: 422 });
  }

  await admin.from("events").update({ status: "cancelled" }).eq("id", eventId);

  const subscriptionInfo = await getActiveSubscriptionInfo(admin, currentUser.userId);
  if (subscriptionInfo) {
    await admin.rpc("decrement_subscription_usage_field", {
      p_subscription_id: subscriptionInfo.subscriptionId,
      p_period_start: subscriptionInfo.currentPeriodStart,
      p_field: "events_created_count",
    });
  }

  return NextResponse.json({ status: "cancelled" });
}
ENDOFFILE

mkdir -p "app/(app)/events/[id]"
cat > "app/(app)/events/[id]/page.tsx" << 'ENDOFFILE'
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface EventDetails {
  id: string;
  title: string;
  description: string | null;
  category: { slug: string; name: string; emoji: string | null } | null;
  trainingType: { slug: string; name: string; emoji: string | null } | null;
  placeName: string | null;
  address: string | null;
  eventDate: string;
  eventTime: string;
  seatsTotal: number;
  seatsTaken: number;
  status: string;
  organizer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
  participants: { id: string; name: string; avatarUrl: string | null }[];
  viewerStatus: "organizer" | "accepted" | "pending" | "rejected" | "none";
}

interface EventDetailsPageProps {
  // Next.js 14 (в этом проекте) — params плоский объект, НЕ Promise.
  // См. пояснение в app/chats/[id]/page.tsx про баг с use(params).
  params: { id: string };
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

export default function EventDetailsPage({ params }: EventDetailsPageProps) {
  const { id: eventId } = params;
  const router = useRouter();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Встреча не найдена.");
          return;
        }
        setEvent(data);
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleApply() {
    setApplying(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "event_full"
            ? "Мест больше нет."
            : data.error === "cannot_apply_to_own_event"
              ? "Это твоя собственная встреча."
              : "Не получилось отправить отклик."
        );
        return;
      }
      setEvent((prev) => (prev ? { ...prev, viewerStatus: "pending" } : prev));
    } finally {
      setApplying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        setEvent((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setConfirmingCancel(false);
      } else {
        setError("Не получилось отменить встречу.");
      }
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-ink-600">Загрузка...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/feed" className="text-sm font-medium text-accent">
          Вернуться на главную
        </Link>
      </div>
    );
  }
  if (!event) return null;

  const categoryLabel = event.trainingType?.name ?? event.category?.name;
  const categoryIcon = event.category ? CATEGORY_ICON[event.category.slug] : undefined;
  const seatsLeft = event.seatsTotal - event.seatsTaken;
  const isFull = seatsLeft <= 0;

  return (
    <div className="pb-28">
      <div className="flex items-center gap-3 px-5 pt-4">
        <button onClick={() => router.back()} aria-label="Назад">
          <Image src="/brand/icons/back.svg" alt="" width={22} height={22} />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-accent">
          {categoryIcon ? (
            <div className="relative h-5 w-5 shrink-0">
              <Image src={categoryIcon} alt="" fill className="object-contain" sizes="20px" />
            </div>
          ) : (
            <span>{event.category?.emoji}</span>
          )}
          <span>{categoryLabel}</span>
        </div>

        <h1 className="text-display mb-3">{event.title}</h1>

        <div className="mb-4 space-y-1.5 text-sm text-ink-600">
          <p>
            {formatDate(event.eventDate)} · {event.eventTime.slice(0, 5)}
          </p>
          {event.placeName && (
            <p>
              {event.placeName}
              {event.address ? `, ${event.address}` : ""}
            </p>
          )}
          <p>{isFull ? "Мест нет" : `Свободно мест: ${seatsLeft} из ${event.seatsTotal}`}</p>
        </div>

        {event.participants.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {event.participants.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-lavender-100 text-xs font-semibold text-ink-600"
                >
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </div>
              ))}
            </div>
            <span className="text-xs text-ink-600">
              {event.participants.length} {pluralizeParticipants(event.participants.length)}
            </span>
          </div>
        )}

        {event.description && <p className="mb-5 text-sm text-ink-900">{event.description}</p>}

        {event.organizer && (
          <div className="mb-5 flex items-center gap-3 rounded-card bg-white p-4 shadow-card">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-background text-sm font-semibold text-ink-600">
              {event.organizer.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.organizer.avatarUrl} alt={event.organizer.name} className="h-full w-full object-cover" />
              ) : (
                event.organizer.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-900">
                {event.organizer.name}, {event.organizer.age}
              </p>
              <p className="text-xs text-ink-600">
                {event.organizer.ratingAvg > 0 ? `⭐ ${event.organizer.ratingAvg.toFixed(1)} · ` : ""}
                {event.organizer.completedMeetingsCount} встреч проведено
              </p>
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        {event.status === "cancelled" && (
          <div className="mb-3 rounded-card bg-red-50 p-4 text-center text-sm text-red-600">
            Эта встреча отменена организатором.
          </div>
        )}

        {event.viewerStatus === "organizer" && event.status === "published" && (
          <div className="mb-3">
            {!confirmingCancel ? (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="w-full text-center text-sm font-medium text-red-600"
              >
                Отменить встречу
              </button>
            ) : (
              <div className="rounded-card bg-red-50 p-4 text-center">
                <p className="mb-3 text-sm text-ink-900">Точно отменить встречу? Лимит тарифа вернётся.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 rounded-pill bg-white py-2.5 text-sm font-medium text-ink-600 shadow-card"
                  >
                    Не отменять
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 rounded-pill bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Отменяем..." : "Да, отменить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {event.status === "published" && (
        <div className="fixed inset-x-0 bottom-24 z-40 px-5">
          <BottomAction
            viewerStatus={event.viewerStatus}
            isFull={isFull}
            applying={applying}
            onApply={handleApply}
            eventId={event.id}
          />
        </div>
      )}
    </div>
  );
}

function BottomAction({
  viewerStatus,
  isFull,
  applying,
  onApply,
  eventId,
}: {
  viewerStatus: EventDetails["viewerStatus"];
  isFull: boolean;
  applying: boolean;
  onApply: () => void;
  eventId: string;
}) {
  if (viewerStatus === "organizer") {
    return (
      <Link
        href={`/events/${eventId}/applications`}
        className="block w-full rounded-pill bg-brand-gradient py-4 text-center text-base font-semibold text-white shadow-cta"
      >
        Управлять заявками
      </Link>
    );
  }
  if (viewerStatus === "accepted") {
    return (
      <div className="w-full rounded-pill bg-ink-900 py-4 text-center text-base font-semibold text-white">
        Ты идёшь ✓
      </div>
    );
  }
  if (viewerStatus === "pending") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-600">
        Отклик отправлен
      </div>
    );
  }
  if (viewerStatus === "rejected") {
    return (
      <div className="w-full rounded-pill bg-ink-400/10 py-4 text-center text-base font-semibold text-ink-400">
        Отклонено
      </div>
    );
  }

  return (
    <button
      onClick={onApply}
      disabled={isFull || applying}
      className="w-full rounded-pill bg-brand-gradient py-4 text-base font-semibold text-white shadow-cta disabled:opacity-40"
    >
      {isFull ? "Мест нет" : applying ? "Отправляем..." : "Я иду"}
    </button>
  );
}

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pluralizeParticipants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек идёт";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "человека идут";
  return "человек идут";
}
ENDOFFILE

