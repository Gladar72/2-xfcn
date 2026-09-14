import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/me/profile
 * Полный профиль текущего пользователя — для экрана "Профиль" (п.21 ТЗ).
 * Отдельно от /api/me (который отдаёт только userId для чата), чтобы не
 * тащить лишние данные туда, где нужен просто идентификатор.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("id, name, avatar_url, birth_date, city, bio, rating_avg, rating_count, completed_meetings_count, created_at")
    .eq("id", currentUser.userId)
    .maybeSingle();

  if (error || !user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [{ count: eventsOrganizedCount }, { count: eventsAttendedCount }] = await Promise.all([
    admin.from("events").select("*", { count: "exact", head: true }).eq("organizer_id", currentUser.userId),
    admin
      .from("event_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", currentUser.userId)
      .eq("role", "participant"),
  ]);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    age: calculateAge(user.birth_date),
    city: user.city,
    bio: user.bio,
    ratingAvg: user.rating_avg,
    ratingCount: user.rating_count,
    completedMeetingsCount: user.completed_meetings_count,
    eventsOrganizedCount: eventsOrganizedCount ?? 0,
    eventsAttendedCount: eventsAttendedCount ?? 0,
    memberSince: user.created_at,
  });
}

function calculateAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}
