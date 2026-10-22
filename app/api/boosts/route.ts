import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { promoteWithPlan } from "@/lib/promotions/plan";

/**
 * POST /api/boosts { eventId } — старое «Поднять встречу».
 * Теперь это «В популярное сегодня» по тарифу (lib/promotions/plan.ts);
 * маршрут оставлен для старых версий мобильного приложения.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  if (!eventId) return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  const r = await promoteWithPlan(createAdminClient(), user, eventId);
  return NextResponse.json(r.status === 200 ? { status: "boosted", boostedAt: new Date().toISOString(), ...r.body } : r.body, { status: r.status });
}
