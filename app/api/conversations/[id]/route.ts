import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type Action = "mark_read" | "hide" | "unhide" | "block" | "unblock";

/**
 * PATCH /api/conversations/[id]
 * Body: { action: "mark_read" | "hide" | "unhide" | "block" | "unblock" }
 *
 * "Удаление" чата из ТЗ (п.15) реализовано как скрытие только для текущего
 * пользователя (is_hidden на его собственной строке conversation_members) —
 * собеседник продолжает видеть переписку у себя.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as Action | undefined;
  if (!action) return NextResponse.json({ error: "missing_action" }, { status: 400 });

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("conversation_members")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUser.userId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  switch (action) {
    case "mark_read":
      updates.unread_count = 0;
      updates.last_read_at = new Date().toISOString();
      break;
    case "hide":
      updates.is_hidden = true;
      break;
    case "unhide":
      updates.is_hidden = false;
      break;
    case "block":
      updates.is_blocked = true;
      break;
    case "unblock":
      updates.is_blocked = false;
      break;
    default:
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  await admin.from("conversation_members").update(updates).eq("id", membership.id);

  return NextResponse.json({ status: "ok" });
}
