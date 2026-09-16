import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { RUSSIAN_CITIES } from "@/lib/data/russian-cities";

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
    .select(
      "id, name, avatar_url, birth_date, city, bio, rating_avg, rating_count, completed_meetings_count, created_at, receipt_contact"
    )
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
    receiptContact: user.receipt_contact,
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

/**
 * PATCH /api/me/profile
 * Body: { name?: string, bio?: string, city?: string }
 * Смена города — только из фиксированного списка городов России
 * (lib/data/russian-cities.ts), как и везде в приложении, где выбирается
 * город (поиск, лента) — иначе рассинхронизация с фильтрами по городу.
 */
export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const update: Record<string, string> = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 50) {
      return NextResponse.json({ error: "invalid_name" }, { status: 422 });
    }
    update.name = name;
  }

  if (typeof body?.bio === "string") {
    const bio = body.bio.trim();
    if (bio.length > 300) return NextResponse.json({ error: "bio_too_long" }, { status: 422 });
    update.bio = bio;
  }

  if (typeof body?.city === "string") {
    if (!RUSSIAN_CITIES.includes(body.city)) {
      return NextResponse.json({ error: "invalid_city" }, { status: 422 });
    }
    update.city = body.city;
  }

  if (typeof body?.receiptContact === "string") {
    const contact = body.receiptContact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^\+?\d{10,15}$/.test(contact.replace(/[\s()-]/g, ""));
    if (!isEmail && !isPhone) {
      return NextResponse.json({ error: "invalid_receipt_contact" }, { status: 422 });
    }
    update.receipt_contact = isPhone ? contact.replace(/[\s()-]/g, "") : contact;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("users").update(update).eq("id", currentUser.userId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ status: "ok" });
}
