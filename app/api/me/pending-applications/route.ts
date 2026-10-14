import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/pending-applications
 * Новые (ожидающие ответа) заявки на встречи, которые я организую:
 * сколько их всего и последняя — для плашки «Новая заявка» на главной
 * и цифры на вкладке «Встречи».
 */
function age(birth: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a -= 1;
  return a > 0 && a < 120 ? a : null;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ count: 0, latest: null });
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("events")
    .select("id, title")
    .eq("organizer_id", me.userId)
    .in("status", ["published", "closed"]);
  const ids = (events ?? []).map((e) => e.id as string);
  if (ids.length === 0) return NextResponse.json({ count: 0, latest: null });

  const { data: apps, count } = await admin
    .from("applications")
    .select("id, event_id, created_at, user:users(name, avatar_url, birth_date)", { count: "exact" })
    .in("event_id", ids)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  const a = apps?.[0];
  if (!a) return NextResponse.json({ count: 0, latest: null });
  const u = a.user as unknown as { name: string | null; avatar_url: string | null; birth_date: string | null } | null;
  const title = (events ?? []).find((e) => e.id === a.event_id)?.title ?? "";
  return NextResponse.json({
    count: count ?? 1,
    latest: {
      applicationId: a.id,
      eventId: a.event_id,
      eventTitle: title,
      name: u?.name ?? "Кто-то",
      age: age(u?.birth_date ?? null),
      avatarUrl: u?.avatar_url ?? null,
      createdAt: a.created_at,
    },
  });
}
