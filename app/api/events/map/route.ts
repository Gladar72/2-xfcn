import { cityDates } from "@/lib/events/local-dates";
import { NextRequest, NextResponse } from "next/server";
import { anonGender, anonymousOrganizerName, fuzzCoordinate } from "@/lib/events/anonymity";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { eventTiming, eventUtcOffsetHours } from "@/lib/events/timing";
import { geocodeCityEvents, upcomingCityEvents } from "@/lib/city-events";
import { cachedFeed } from "@/lib/data/feed-cache";

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

  // Автозавершение — теперь на Vercel Cron, см. пояснение в /api/events.

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
      id, title, event_date, event_time, event_end_time, city, latitude, longitude, place_name, address, seats_total, seats_taken, cost_type, is_business,
      is_anonymous, organizer_id,
      category:categories(slug, name, emoji),
      organizer:users(name, avatar_url, birth_date, gender)
      `
    )
    // Заполненные встречи (status = closed) тоже остаются в ленте — с пометкой «Мест нет».
    .in("status", ["published", "closed"])
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

  // «Карта заведений» (из раздела «Для бизнеса») — только бизнес-события.
  const businessOnly = searchParams.get("business") === "only";
  if (businessOnly) query = query.eq("is_business", true);

  if (costTypeParam && costTypeParam !== "any") {
    query = query.eq("cost_type", costTypeParam);
  }

  const cd = cityDates(city);
  if (dateFilter === "today") {
    query = query.eq("event_date", cd.today);
  } else if (dateFilter === "tomorrow") {
    query = query.eq("event_date", cd.tomorrow);
  } else if (dateFilter === "weekend") {
    query = query.gte("event_date", cd.weekend.from).lte("event_date", cd.weekend.to);
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

  // Общий для всех список встреч города — из короткого кэша (как лента),
  // личное (анонимность, возраст/пол) считается ниже для каждого отдельно.
  const mapKey = JSON.stringify(["map", city, businessOnly, todayIso, categorySlugsParam, costTypeParam, dateFilter, timeOfDay]);
  let events: Awaited<typeof query>["data"] = null;
  let error: unknown = null;
  try {
    events = await cachedFeed(mapKey, async () => {
      const result = await query;
      if (result.error) throw result.error;
      return result.data;
    });
  } catch (err) {
    error = err;
  }

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

  // Анонимные встречи: зритель видит организатора и точку только если его
  // заявку одобрили (или это его встреча). Остальным — район, без адреса.
  const anonymousIds = visibleEvents
    .filter((e) => e.is_anonymous && e.organizer_id !== currentUser?.userId)
    .map((e) => e.id);
  const acceptedIds = new Set<string>();
  if (currentUser && anonymousIds.length > 0) {
    const { data: accepted } = await admin
      .from("applications")
      .select("event_id")
      .eq("user_id", currentUser.userId)
      .eq("status", "accepted")
      .in("event_id", anonymousIds);
    for (const a of accepted ?? []) acceptedIds.add(a.event_id);
  }
  const hiddenIds = new Set(anonymousIds.filter((id) => !acceptedIds.has(id)));

  const items = visibleEvents.map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    eventTime: e.event_time,
    latitude: hiddenIds.has(e.id) ? fuzzCoordinate(e.latitude) : e.latitude,
    longitude: hiddenIds.has(e.id) ? fuzzCoordinate(e.longitude) : e.longitude,
    placeName: hiddenIds.has(e.id) ? null : e.place_name,
    address: hiddenIds.has(e.id) ? null : e.address,
    isAnonymous: !!e.is_anonymous,
    organizerHidden: hiddenIds.has(e.id),
    seatsLeft: e.seats_total - e.seats_taken,
    category: e.category as unknown as { slug: string; name: string; emoji: string | null } | null,
    isBusiness: e.is_business,
    // Для меток над булавкой в стиле Invitor («сейчас», «через 1 ч», «20:30», «завтра»):
    // начало/конец в UTC и пояс города — «сегодня/завтра» считаем по времени города.
    ...(() => {
      const t = eventTiming({
        event_date: e.event_date,
        event_time: e.event_time,
        event_end_time: e.event_end_time,
        city: e.city,
        longitude: e.longitude,
      });
      return {
        startsAt: t.start.toISOString(),
        endsAt: t.end.toISOString(),
        utcOffset: eventUtcOffsetHours({ city: e.city, longitude: e.longitude }),
      };
    })(),
    organizer: (() => {
      const o = e.organizer as unknown as { name: string | null; avatar_url: string | null; gender: string | null } | null;
      if (!o) return null;
      if (hiddenIds.has(e.id)) return { name: anonymousOrganizerName(o.gender), avatarUrl: null, gender: anonGender(o.gender) };
      return { name: o.name ?? "", avatarUrl: o.avatar_url };
    })(),
  }));

  // Карта заведений — ещё и одобренные события города («Что ещё в городе»).
  if (businessOnly) {
    // По 5 событий за раз, чтобы не задерживать ответ карты (каждое событие геокодируется один раз).
    await geocodeCityEvents(admin, 5).catch(() => {});
    const cityItems = (await upcomingCityEvents(admin, city, 40))
      .filter((c) => c.latitude != null && c.longitude != null)
      // Те же фильтры по дню, что и у встреч: иначе события города висели на карте при любом «Сегодня/Завтра».
      .filter((c) => {
        if (dateFilter === "today") return c.eventDate === cd.today;
        if (dateFilter === "tomorrow") return c.eventDate === cd.tomorrow;
        if (dateFilter === "weekend") return c.eventDate >= cd.weekend.from && c.eventDate <= cd.weekend.to;
        if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) return c.eventDate === dateFilter;
        return true;
      })
      .map((c) => {
        const t = eventTiming({ event_date: c.eventDate, event_time: c.eventTime ?? "19:00:00", event_end_time: null, city, longitude: c.longitude });
        return {
          id: `city:${c.id}`,
          title: c.title,
          eventDate: c.eventDate,
          eventTime: c.eventTime ?? "19:00:00",
          latitude: c.latitude as number,
          longitude: c.longitude as number,
          placeName: c.placeName,
          address: c.address,
          isAnonymous: false,
          organizerHidden: false,
          seatsLeft: 999,
          category: { slug: c.category, name: "", emoji: null },
          kind: c.kind,
          isBusiness: true,
          isCity: true,
          startsAt: t.start.toISOString(),
          endsAt: t.end.toISOString(),
          utcOffset: eventUtcOffsetHours({ city, longitude: c.longitude }),
          organizer: { name: c.placeName ?? "", avatarUrl: c.photoUrl },
        };
      });
    return NextResponse.json({ items: [...items, ...cityItems], city });
  }

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

