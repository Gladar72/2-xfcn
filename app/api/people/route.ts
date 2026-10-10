import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/people
 * «Люди с похожими интересами» для главной: пользователи из того же
 * города, у которых больше всего общих интересов с текущим. Если у
 * человека ещё нет интересов — просто новые люди города с фото.
 * Скрытые профили и заблокированные модерацией не показываются.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const [{ data: me }, { data: myInterestRows }] = await Promise.all([
    admin.from("users").select("id, city").eq("id", currentUser.userId).maybeSingle(),
    admin.from("user_interests").select("interest_id, interests(name)").eq("user_id", currentUser.userId),
  ]);
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
    .select("id, name, avatar_url, birth_date, rating_avg, completed_meetings_count")
    .eq("city", me.city)
    .eq("is_profile_hidden", false)
    .eq("moderation_status", "active")
    .neq("id", currentUser.userId);
  query = candidateIds.length > 0 ? query.in("id", candidateIds) : query.not("avatar_url", "is", null).order("created_at", { ascending: false });
  const { data: users } = await query.limit(60);

  const items = (users ?? [])
    .map((u) => {
      const sharedInterests = shared.get(u.id as string) ?? [];
      return {
        id: u.id as string,
        name: u.name as string,
        avatarUrl: (u.avatar_url as string | null) ?? null,
        age: age(u.birth_date as string),
        ratingAvg: Number(u.rating_avg ?? 0),
        completedMeetingsCount: Number(u.completed_meetings_count ?? 0),
        sharedInterests: sharedInterests.slice(0, 3),
        sharedCount: sharedInterests.length,
      };
    })
    // С фото — выше: в карточке человека фото главное.
    .sort((a, b) => b.sharedCount - a.sharedCount || Number(!!b.avatarUrl) - Number(!!a.avatarUrl))
    .slice(0, 12);

  return NextResponse.json({ items });
}

function age(birthDateIso: string): number {
  const b = new Date(birthDateIso);
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}
