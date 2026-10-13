import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastToConversation } from "@/lib/supabase/broadcast";
import { chatAccess } from "@/lib/chat/access";

/**
 * POST /api/conversations/[id]/messages/[messageId]/reactions  { emoji }
 * Одна реакция от человека на сообщение: та же — снимается, другая — заменяет.
 * Рассылает "reaction" с полным списком реакций сообщения.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id: conversationId, messageId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || emoji.length > 32) return NextResponse.json({ error: "invalid_emoji" }, { status: 400 });

  const admin = createAdminClient();
  const [access, { data: msg }] = await Promise.all([
    chatAccess(admin, conversationId, currentUser.userId),
    admin.from("messages").select("id, deleted_at").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle(),
  ]);
  if (!access.member) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (access.blocked) return NextResponse.json({ error: "blocked" }, { status: 403 });
  if (access.closed) return NextResponse.json({ error: "event_closed" }, { status: 422 });
  if (!msg || msg.deleted_at) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Переключение атомарно в БД: два быстрых тапа не дают рассинхрона.
  const { error } = await admin.rpc("toggle_message_reaction", { p_message_id: messageId, p_user_id: currentUser.userId, p_emoji: emoji });
  if (error) return NextResponse.json({ error: "reaction_failed" }, { status: 500 });

  const { data: rows } = await admin.from("message_reactions").select("user_id, emoji").eq("message_id", messageId);
  const grouped: { emoji: string; userIds: string[] }[] = [];
  for (const r of rows ?? []) {
    const g = grouped.find((x) => x.emoji === r.emoji);
    if (g) g.userIds.push(r.user_id as string);
    else grouped.push({ emoji: r.emoji as string, userIds: [r.user_id as string] });
  }
  await broadcastToConversation(conversationId, "reaction", { id: messageId, reactions: grouped });
  return NextResponse.json({ reactions: grouped });
}
