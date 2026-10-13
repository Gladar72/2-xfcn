import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/support/history — переписка с поддержкой (последние 50 обращений):
 * вопрос, ответ Моси (ИИ) и, если был, ответ сотрудника.
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_tickets")
    .select("id, message, bot_reply, admin_reply, admin_replied_at, created_at")
    .eq("user_id", currentUser.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const items = (data ?? []).reverse().map((t) => ({
    id: t.id as string,
    message: t.message as string,
    botReply: (t.bot_reply as string | null) ?? null,
    adminReply: (t.admin_reply as string | null) ?? null,
    adminRepliedAt: (t.admin_replied_at as string | null) ?? null,
    createdAt: t.created_at as string,
  }));
  return NextResponse.json({ items });
}
