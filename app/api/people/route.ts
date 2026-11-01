import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { approxDistanceKm, approxDistanceM, freshPoint } from "@/lib/geo/approx-distance";

/** Nearby people follow the current shared location; city/interests are the fallback. */
export const dynamic = "force-dynamic";

const USER_FIELDS =
  "id, name, avatar_url, birth_date, rating_avg, completed_meetings_count, approx_lat, approx_lon, approx_location_at, show_distance";

export async function GET(req: Request) {
  // Колода «Люди рядом» берёт больше карточек, чем лента на главной.
  const params = new URL(req.url).searchParams;
  const deck = params.get("deck") === "1";
  const start = deck ? params.get("start") : null;
  if (start && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(start))
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient({ noStore: true });

  const [{ data: me, error: meError }, { data: myInterestRows }, { data: blockRows, error: blockError }] = await Promise.all([
    admin.from("users").select("id, city, approx_lat, approx_lon, approx_location_at, show_distance").eq("id", currentUser.userId).maybeSingle(),
    admin.from("user_interests").select("interest_id, interests(name)").eq("user_id", currentUser.userId),
    // Безопасность: заблокированные в обе стороны друг друга не видят.
    admin
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${currentUser.userId},blocked_id.eq.${currentUser.userId}`),
  ]);
  if (meError || blockError) return NextResponse.json({ error: "unavailable" }, { status: 503 });
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

  const myPoint = freshPoint(me);

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

  // Apply the same visibility rules to the selection and the recommendations.
  const visibleUsers = () => admin
    .from("users")
    .select(USER_FIELDS)
    .eq("city", me.city)
    .eq("is_profile_hidden", false)
    .eq("moderation_status", "active")
    .neq("id", currentUser.userId)
    // Без фото в «Люди рядом» не показываем (по просьбе владельца).
    .not("avatar_url", "is", null);
  let query = visibleUsers();
  query = candidateIds.length > 0 ? query.in("id", candidateIds) : query.order("created_at", { ascending: false });

  // The database ranks all nearby candidates BEFORE limiting. Profile city must
  // not exclude visitors or keep showing the old city after travel.
  const nearbyQuery = myPoint
    ? admin.rpc("nearby_people", { p_viewer_id: currentUser.userId, p_start_id: start }).select(USER_FIELDS)
    : null;
  const selectedQuery = !myPoint && start && !blocked.has(start)
    ? visibleUsers().eq("id", start).maybeSingle()
    : null;
  const [result, selected] = await Promise.all([nearbyQuery ?? query.limit(60), selectedQuery]);
  if (result?.error || selected?.error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const users = result?.data ?? [];

  const seen = new Set<string>();
  const pool = [...users, ...(selected?.data ? [selected.data] : [])].filter((u) => {
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
  if (myPoint) {
    items = all
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || b.sharedCount - a.sharedCount || a.id.localeCompare(b.id))
      .slice(0, deck ? 40 : 12);
    const chosen = start ? all.find((p) => p.id === start) : null;
    if (chosen && !items.some((p) => p.id === start)) items = [chosen, ...items.slice(0, 39)];
  } else if (deck) {
    // С фото — выше: в карточке человека фото главное.
    items = all
      .sort((a, b) => b.sharedCount - a.sharedCount || Number(!!b.avatarUrl) - Number(!!a.avatarUrl))
      .slice(0, 40);
    const chosen = start ? all.find((p) => p.id === start) : null;
    if (chosen && !items.some((p) => p.id === start)) items = [chosen, ...items.slice(0, 39)];
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
  return NextResponse.json({ items, meHasLocation, radiusKm: meHasLocation ? 15 : null }, { headers: { "Cache-Control": "private, no-store" } });
}

function age(birthDateIso: string): number {
  const b = new Date(birthDateIso);
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}
