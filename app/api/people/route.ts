import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { approxDistanceKm, approxDistanceM, freshPoint } from "@/lib/geo/approx-distance";

/**
 * GET /api/people
 * «Люди рядом» для главной: пользователи из того же города — с общими
 * интересами и те, кто сейчас поблизости (по огрублённой геопозиции).
 * На главной подборка каждый раз немного перемешивается, чтобы лента
 * не была одной и той же; ближе и с общими интересами — чаще наверху.
 * ?deck=1 — колода «Люди рядом» (больше карточек, порядок стабильный).
 * Скрытые профили и заблокированные модерацией не показываются.
 */
const USER_FIELDS =
  "id, name, avatar_url, birth_date, rating_avg, completed_meetings_count, approx_lat, approx_lon, approx_location_at, show_distance";

export async function GET(req: Request) {
  // Колода «Люди рядом» берёт больше карточек, чем лента на главной.
  const deck = new URL(req.url).searchParams.get("deck") === "1";
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const [{ data: me }, { data: myInterestRows }, { data: blockRows }] = await Promise.all([
    admin.from("users").select("id, city, approx_lat, approx_lon, approx_location_at, show_distance").eq("id", currentUser.userId).maybeSingle(),
    admin.from("user_interests").select("interest_id, interests(name)").eq("user_id", currentUser.userId),
    // Безопасность: заблокированные в обе стороны друг друга не видят.
    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${currentUser.userId},blocked_id.eq.${currentUser.userId}`),
  ]);
  const blocked = new Set(
    (blockRows ?? []).map((b) => (b.blocker_id === currentUser.userId ? b.blocked_id : b.blocker_id) as string)
  );
  if (!me) return NextResponse.json({ items: [] });

  const myInterestIds = (myInterestRows ?? []).map((r) => r.interest_id as string);
  const interestName = new Map<string, string>();
  for (const r of myInterestRows ?? []) {
    const name = (r.interests as unknown as { name: string } | null)?.name;
    if (name) interestName.set(r.interest_id as string, name);
  }

  // Кандидаты: кто отметил хотя бы один из моих интересов.
  const shared = new Map<string, string[]>();
  if (myInterestIds.length > 0) {
    const { data: rows } = await admin
      .from("user_interests")
      .select("user_id, interest_id")
      .in("interest_id", myInterestIds)
      .neq("user_id", currentUser.userId)
      .limit(3000);
    for (const r of rows ?? []) {
      const list = shared.get(r.user_id as string) ?? [];
      const n = interestName.get(r.interest_id as string);
      if (n) list.push(n);
      shared.set(r.user_id as string, list);
    }
  }

  const candidateIds = [...shared.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 200)
    .map(([id]) => id);

  let query = admin
    .from("users")
    .select(USER_FIELDS)
    .eq("city", me.city)
    .eq("is_profile_hidden", false)
    .eq("moderation_status", "active")
    .neq("id", currentUser.userId)
    // Без фото в «Люди рядом» не показываем (по просьбе владельца).
    .not("avatar_url", "is", null);
  query = candidateIds.length > 0 ? query.in("id", candidateIds) : query.order("created_at", { ascending: false });

  // Кто поблизости прямо сейчас: свежая огрублённая точка в радиусе ~15 км (грубая рамка,
  // точное расстояние считаем ниже). Только если у меня самого есть свежая точка.
  const myPoint = freshPoint(me);
  const nearQuery = myPoint
    ? admin
        .from("users")
        .select(USER_FIELDS)
        .eq("city", me.city)
        .eq("is_profile_hidden", false)
        .eq("moderation_status", "active")
        .neq("id", currentUser.userId)
        .not("avatar_url", "is", null)
        // Кто скрыл расстояние — в «рядом» по геопозиции не попадает вовсе.
        .or("show_distance.is.null,show_distance.eq.true")
        .gte("approx_location_at", new Date(Date.now() - 14 * 864e5).toISOString())
        .gte("approx_lat", myPoint.lat - 0.14)
        .lte("approx_lat", myPoint.lat + 0.14)
        .gte("approx_lon", myPoint.lon - 0.25)
        .lte("approx_lon", myPoint.lon + 0.25)
        .order("approx_location_at", { ascending: false })
        .limit(60)
    : null;
  const [{ data: users }, near] = await Promise.all([query.limit(60), nearQuery]);

  const seen = new Set<string>();
  const pool = [...(users ?? []), ...(near?.data ?? [])].filter((u) => {
    const id = u.id as string;
    if (seen.has(id) || blocked.has(id) || !(u.avatar_url as string | null)?.trim()) return false;
    seen.add(id);
    return true;
  });

  const all = pool.map((u) => {
    const sharedInterests = shared.get(u.id as string) ?? [];
    const distanceM = approxDistanceM(me, u);
    return {
      id: u.id as string,
      name: u.name as string,
      avatarUrl: (u.avatar_url as string | null) ?? null,
      age: age(u.birth_date as string),
      ratingAvg: Number(u.rating_avg ?? 0),
      completedMeetingsCount: Number(u.completed_meetings_count ?? 0),
      sharedInterests: sharedInterests.slice(0, 3),
      sharedCount: sharedInterests.length,
      distanceKm: approxDistanceKm(me, u),
      distanceM,
    };
  });

  let items: typeof all;
  if (deck) {
    // С фото — выше: в карточке человека фото главное.
    items = all
      .sort((a, b) => b.sharedCount - a.sharedCount || Number(!!b.avatarUrl) - Number(!!a.avatarUrl))
      .slice(0, 40);
  } else {
    // Главная: общие интересы + близость + фото, плюс случайная добавка —
    // при каждом заходе подборка другая, но ближние и «свои» всплывают чаще.
    const score = (p: (typeof all)[number]) =>
      Math.min(p.sharedCount, 4) * 1.5 +
      (p.distanceM == null ? 0 : p.distanceM <= 1000 ? 4 : p.distanceM <= 3000 ? 3 : p.distanceM <= 7000 ? 2 : 1) +
      (p.avatarUrl ? 1.5 : 0) +
      Math.random() * 4;
    items = all
      .map((p) => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(({ p }) => p);
  }

  const meHasLocation = myPoint !== null;
  return NextResponse.json({ items, meHasLocation });
}

function age(birthDateIso: string): number {
  const b = new Date(birthDateIso);
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}
