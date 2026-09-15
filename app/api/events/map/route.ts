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
