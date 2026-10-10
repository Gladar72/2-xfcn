import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const REASONS = ["no_show", "bad_behavior", "fake_profile", "block"] as const;

/**
 * POST /api/reports  Body: { userId, reason, eventId? }
 * «Что случилось?» в профиле человека: жалоба уходит в админку (reports),
 * «Заблокировать» — ещё и в blocks (больше не увидите друг друга в чатах).
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const reason = REASONS.find((r) => r === body?.reason);
  if (!userId || !reason || userId === currentUser.userId) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("reports").insert({
    reporter_id: currentUser.userId,
    reported_user_id: userId,
    event_id: typeof body?.eventId === "string" ? body.eventId : null,
    reason,
    status: "pending",
  });
  if (reason === "block") {
    await admin.from("blocks").upsert({ blocker_id: currentUser.userId, blocked_id: userId }, { onConflict: "blocker_id,blocked_id" });
  }
  return NextResponse.json({ status: "ok" });
}
