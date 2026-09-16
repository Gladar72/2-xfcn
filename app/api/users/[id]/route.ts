import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();

  const [{ data: user }, { data: interestRows }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, avatar_url, birth_date, gender, bio, rating_avg, completed_meetings_count")
      .eq("id", id)
      .maybeSingle(),
    admin.from("user_interests").select("interests(name)").eq("user_id", id),
  ]);

  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const interests = (interestRows ?? [])
    .map((r) => (r.interests as unknown as { name: string } | null)?.name)
    .filter((n): n is string => !!n);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    age: calculateAge(user.birth_date),
    gender: user.gender,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    completedMeetingsCount: user.completed_meetings_count,
    interests,
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
