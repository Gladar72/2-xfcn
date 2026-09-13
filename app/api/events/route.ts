import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { rankEvents, type EventForScoring, type SubscriptionPlan } from "@/lib/scoring/rank-events";

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
  const typeSlug = searchParams.get("type");
  const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);

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
      event_date, event_time, seats_total, seats_taken, boosted_at, created_at,
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

  if (categorySlug) {
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

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const visibleRows = (rows ?? []).filter(
    (row) => !blockedOrganizerIds.includes((row.organizer as unknown as { id: string } | null)?.id ?? "")
  );

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
