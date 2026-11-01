import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { approxDistanceKm, approxDistanceM, freshPoint } from "@/lib/geo/approx-distance";

import { readPeopleFilters, UUID_PATTERN } from "@/lib/people/filters";

export const dynamic = "force-dynamic";
const USER_FIELDS = "id, name, city, gender, avatar_url, birth_date, rating_avg, completed_meetings_count, approx_lat, approx_lon, approx_location_at, show_distance";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const deck = params.get("deck") === "1";
  const start = deck ? params.get("start") : null;
  const filters = readPeopleFilters(params);
  const seed = params.get("seed");
  const requestedCity = params.get("city")?.trim();
  const offsetText = params.get("offset") ?? "0";
  if (start && !UUID_PATTERN.test(start))
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!filters || (seed !== null && !UUID_PATTERN.test(seed)) || !/^\d{1,6}$/.test(offsetText)
    || (requestedCity !== undefined && (!requestedCity || requestedCity.length > 120)))
    return NextResponse.json({ error: "invalid_filter" }, { status: 400 });
  const offset = deck ? Number(offsetText) : 0;
  const pageSize = deck ? 40 : 12;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient({ noStore: true });

  const [profile, interests] = await Promise.all([
    admin.from("users").select("id, city, approx_lat, approx_lon, approx_location_at, show_distance").eq("id", currentUser.userId).maybeSingle(),
    admin.from("user_interests").select("interest_id, interests(name)").eq("user_id", currentUser.userId),
  ]);
  if (profile.error)
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const me = profile.data;
  if (!me) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const meHasLocation = freshPoint(me) !== null;
  const city = requestedCity ?? me.city;

  const { data: users, error } = await admin.rpc("filter_people", {
    p_viewer_id: currentUser.userId, p_city: city,
    p_gender: filters.gender === "all" ? null : filters.gender, p_start_id: start,
    p_offset: offset, p_limit: pageSize + 1,
    p_age_min: filters.ageMin, p_age_max: filters.ageMax === 65 ? null : filters.ageMax,
    // New clients retain one seed across all pages. Older clients without a seed
    // also need stable pagination, rather than a fresh random order per request.
    p_interest_ids: filters.interests, p_shuffle_seed: seed ?? (deck ? currentUser.userId : crypto.randomUUID()),
  }).select(USER_FIELDS);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const page = (users ?? []).slice(0, pageSize);
  const hasMore = (users?.length ?? 0) > pageSize;

  const interestNames = new Map<string, string>();
  for (const row of interests.data ?? []) {
    const name = (row.interests as unknown as { name: string } | null)?.name;
    if (name) interestNames.set(row.interest_id as string, name);
  }
  const shared = new Map<string, string[]>();
  if (page.length && interestNames.size) {
    const { data: rows } = await admin.from("user_interests").select("user_id, interest_id")
      .in("user_id", page.map((u) => u.id)).in("interest_id", [...interestNames.keys()]);
    for (const row of rows ?? []) {
      const name = interestNames.get(row.interest_id as string);
      if (name) shared.set(row.user_id as string, [...(shared.get(row.user_id as string) ?? []), name]);
    }
  }
  const items = page.map((u) => {
    const common = shared.get(u.id as string) ?? [];
    return {
      id: u.id, name: u.name, city: u.city, gender: u.gender,
      avatarUrl: u.avatar_url, age: age(u.birth_date as string),
      ratingAvg: Number(u.rating_avg ?? 0), completedMeetingsCount: Number(u.completed_meetings_count ?? 0),
      sharedInterests: common.slice(0, 3), sharedCount: common.length,
      distanceKm: approxDistanceKm(me, u), distanceM: approxDistanceM(me, u),
    };
  });
  return NextResponse.json({
    items, meHasLocation, city, scope: "city", radiusKm: null,
    nextOffset: deck && hasMore ? offset + page.length : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

function age(birthDateIso: string): number {
  const b = new Date(birthDateIso);
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}
