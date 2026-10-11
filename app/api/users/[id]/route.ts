import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPhotos } from "@/lib/photos/user-photos";
import { canDirectMessage } from "@/lib/chat/can-direct";
import { approxDistanceKm } from "@/lib/geo/approx-distance";

/**
 * GET /api/users/:id
 *
 * Краткий публичный профиль другого пользователя — для попапа при тапе на
 * аватар собеседника в чате (фото, возраст, пол, рейтинг, интересы, о себе).
 * Требует авторизации, но не проверяет наличие общего чата/встречи —
 * те же данные и так открыты всем в карточках встреч (организатор).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminClient();

  const [{ data: user }, { data: interestRows }, { data: myInterestRows }, { data: meGeo }, { data: blockRow }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, avatar_url, birth_date, gender, bio, rating_avg, completed_meetings_count, moderation_status, approx_lat, approx_lon, approx_location_at, show_distance")
      .eq("id", id)
      .maybeSingle(),
    admin.from("user_interests").select("interests(name)").eq("user_id", id),
    admin.from("user_interests").select("interests(name)").eq("user_id", currentUser.userId),
    admin.from("users").select("approx_lat, approx_lon, approx_location_at, show_distance").eq("id", currentUser.userId).maybeSingle(),
    // Безопасность: заблокированные (в любую сторону) профили друг друга не открывают.
    admin
      .from("blocks")
      .select("blocker_id")
      .or(`and(blocker_id.eq.${currentUser.userId},blocked_id.eq.${id}),and(blocker_id.eq.${id},blocked_id.eq.${currentUser.userId})`)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!user || blockRow || (user.moderation_status && user.moderation_status !== "active")) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const interests = (interestRows ?? [])
    .map((r) => (r.interests as unknown as { name: string } | null)?.name)
    .filter((n): n is string => !!n);

  const photos = await getUserPhotos(admin, user.id as string, user.avatar_url as string | null);
  const canMessage = user.id === currentUser.userId ? false : await canDirectMessage(admin, currentUser.userId, user.id as string);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    photos,
    canMessage,
    age: calculateAge(user.birth_date),
    gender: user.gender,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    completedMeetingsCount: user.completed_meetings_count,
    // Только примерно (целые км) — точное местоположение не раскрываем.
    distanceKm: user.id === currentUser.userId ? null : approxDistanceKm(meGeo, user),
    interests,
    // Общие с текущим пользователем — для профиля человека («Общие интересы»).
    commonInterests: interests.filter((n) =>
      (myInterestRows ?? []).some((r) => (r.interests as unknown as { name: string } | null)?.name === n)
    ),
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}
