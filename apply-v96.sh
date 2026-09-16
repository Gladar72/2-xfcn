mkdir -p "lib/reviews"
cat > "lib/reviews/send-event-results.ts" << 'ENDOFFILE'
import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";

/**
 * Сразу после того, как кто-то оценил встречу, рассылает ВСЕМ участникам
 * личное сообщение от бота (в Telegram, в чат с ботом — не в общий канал)
 * с текущими итогами: средняя оценка, сколько человек уже оценили, что
 * говорят (пришли вовремя / приятное общение / встретились бы снова).
 *
 * Вызывается сразу в POST /api/reviews после сохранения отзыва — без
 * задержки. Если оценки продолжат поступать позже — каждая следующая
 * тоже разошлёт обновлённую сводку, поэтому специальной защиты "уже
 * отправляли" не нужно: это не разовое уведомление о встрече, а
 * актуальная сводка на каждый момент.
 */
export async function sendEventResultsNow(admin: ReturnType<typeof createAdminClient>, eventId: string): Promise<void> {
  const [{ data: event }, { data: reviews }, { data: members }] = await Promise.all([
    admin.from("events").select("title").eq("id", eventId).maybeSingle(),
    admin
      .from("reviews")
      .select("rating, arrived_on_time, pleasant_communication, would_meet_again")
      .eq("event_id", eventId),
    admin.from("event_members").select("users(telegram_id)").eq("event_id", eventId),
  ]);

  if (!event || !reviews || reviews.length === 0) return;

  const recipients = (members ?? [])
    .map((m) => (m.users as unknown as { telegram_id: number } | null)?.telegram_id)
    .filter((id): id is number => typeof id === "number");

  if (recipients.length === 0) return;

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const onTimePct = Math.round((reviews.filter((r) => r.arrived_on_time).length / reviews.length) * 100);
  const pleasantPct = Math.round((reviews.filter((r) => r.pleasant_communication).length / reviews.length) * 100);
  const meetAgainPct = Math.round((reviews.filter((r) => r.would_meet_again).length / reviews.length) * 100);

  const stars = "⭐".repeat(Math.round(avgRating));
  const text =
    `Итоги встречи «${event.title}»\n\n` +
    `${stars} ${avgRating.toFixed(1)} из 5 (${reviews.length} ${pluralizeReviews(reviews.length)})\n\n` +
    `Пришли вовремя: ${onTimePct}%\n` +
    `Приятное общение: ${pleasantPct}%\n` +
    `Хотели бы встретиться снова: ${meetAgainPct}%`;

  for (const telegramId of recipients) {
    await notifyTelegram(telegramId, text);
  }
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "оценка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "оценки";
  return "оценок";
}
ENDOFFILE

mkdir -p "app/api/reviews"
cat > "app/api/reviews/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEventResultsNow } from "@/lib/reviews/send-event-results";
import { z } from "zod";

const reviewSchema = z.object({
  eventId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  arrivedOnTime: z.boolean().optional(),
  pleasantCommunication: z.boolean().optional(),
  meetingHappened: z.boolean().optional(),
  wouldMeetAgain: z.boolean().optional(),
});

/**
 * POST /api/reviews
 * Отзыв о другом участнике завершённой встречи (п.20 ТЗ).
 * Защита от повторного отзыва — unique constraint (event_id, reviewer_id,
 * reviewee_id) в БД, здесь просто аккуратно превращаем 23505 в понятную ошибку.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  if (input.revieweeId === currentUser.userId) {
    return NextResponse.json({ error: "cannot_review_self" }, { status: 422 });
  }

  const admin = createAdminClient();

  const { data: event } = await admin.from("events").select("status").eq("id", input.eventId).maybeSingle();
  if (!event || event.status !== "completed") {
    return NextResponse.json({ error: "event_not_completed" }, { status: 422 });
  }

  const { data: members } = await admin
    .from("event_members")
    .select("user_id")
    .eq("event_id", input.eventId)
    .in("user_id", [currentUser.userId, input.revieweeId]);

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  if (!memberIds.has(currentUser.userId) || !memberIds.has(input.revieweeId)) {
    return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
  }

  const { error: insertError } = await admin.from("reviews").insert({
    event_id: input.eventId,
    reviewer_id: currentUser.userId,
    reviewee_id: input.revieweeId,
    rating: input.rating,
    arrived_on_time: input.arrivedOnTime ?? null,
    pleasant_communication: input.pleasantCommunication ?? null,
    meeting_happened: input.meetingHappened ?? null,
    would_meet_again: input.wouldMeetAgain ?? null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  await admin.rpc("apply_review_to_rating", { p_user_id: input.revieweeId, p_rating: input.rating });

  // Сразу же (без задержки) шлём всем участникам обновлённую сводку итогов
  // в личный чат с ботом — по явному запросу пользователя, не в канал и
  // не по таймеру, а прямо в момент, когда кто-то оценил встречу.
  await sendEventResultsNow(admin, input.eventId).catch((err) =>
    console.error("sendEventResultsNow:", err)
  );

  return NextResponse.json({ status: "created" });
}
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
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

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
  const genderParam = searchParams.get("gender"); // 'male' | 'female' | null (нет фильтра)

  const currentUser = await getCurrentUser();
  const admin = createAdminClient();

  // Переводит просроченные встречи в 'completed' ПЕРЕД тем, как отдать
  // ленту — иначе встреча, время которой уже прошло сегодня, продолжает
  // висеть в "Интересные встречи рядом" до первого захода кого-то в
  // раздел отзывов (единственное место, где это раньше запускалось).
  await completeDueEvents(admin);

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
      event_date, event_time, event_end_time, seats_total, seats_taken, boosted_at, created_at, cost_type,
      category:categories(slug, name, emoji),
      training_type:training_types(slug, name, emoji),
      organizer:users(id, name, avatar_url, birth_date, gender, rating_avg, completed_meetings_count, telegram_id)
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

  if (genderParam === "male" || genderParam === "female") {
    visibleRows = visibleRows.filter((row) => {
      const organizer = row.organizer as unknown as { gender: string | null } | null;
      return organizer?.gender === genderParam;
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
    const organizer = row.organizer as unknown as { id: string; telegram_id: number } | null;
    // Админ тестирует приложение без реальной подписки (см. app/api/events/route.ts
    // POST, app/api/subscriptions/route.ts) — чтобы можно было увидеть, как
    // выглядит выделение встречи Медиум/Премьер, для него тоже считаем
    // organizerPlan как "premium", как и везде, где обходятся лимиты тарифа.
    const organizerPlan: SubscriptionPlan = organizer
      ? isAdminTelegramId(organizer.telegram_id)
        ? "premium"
        : planByOrganizer.get(organizer.id) ?? null
      : null;
    return {
      id: row.id,
      createdAt: row.created_at,
      eventDate: row.event_date,
      eventTime: row.event_time,
      seatsTotal: row.seats_total,
      seatsTaken: row.seats_taken,
      boostedAt: row.boosted_at,
      organizerPlan,
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
  const pageItems = ranked.slice(pageStart, pageStart + PAGE_SIZE).map(({ _row, organizerPlan }) => {
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
      eventEndTime: _row.event_end_time,
      seatsTotal: _row.seats_total,
      seatsTaken: _row.seats_taken,
      costType: _row.cost_type,
      // Лёгкое визуальное выделение карточки — привилегия тарифов
      // Медиум и Премьер (см. FEATURES в components/paywall/Paywall.tsx).
      isHighlighted: organizerPlan === "medium" || organizerPlan === "premium",
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
      event_end_time: input.eventEndTime ?? null,
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

mkdir -p "app/api/events/map"
cat > "app/api/events/map/route.ts" << 'ENDOFFILE'
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

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

  // См. пояснение в /api/events — та же проблема была бы и на карте.
  await completeDueEvents(admin);

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

