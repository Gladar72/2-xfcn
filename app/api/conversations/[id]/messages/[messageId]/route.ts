import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastToConversation } from "@/lib/supabase/broadcast";
import { chatAccess } from "@/lib/chat/access";

/** Править своё сообщение можно в течение 48 часов (как в Телеграме — без ограничения, но так надёжнее). */
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

async function loadOwn(conversationId: string, messageId: string, userId: string) {
  const admin = createAdminClient();
  const [{ data: msg }, access] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, conversation_id, created_at, deleted_at, image_url")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
    chatAccess(admin, conversationId, userId),
  ]);
  // Вышедший из чата участник своими сообщениями больше не управляет.
  return { admin, msg, access, own: !!msg && msg.sender_id === userId && access.member };
}

/**
 * PATCH /api/conversations/[id]/messages/[messageId]  { content }
 * Правка своего сообщения. Рассылает событие "edit".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id: conversationId, messageId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (content.length > 2000) return NextResponse.json({ error: "message_too_long" }, { status: 422 });

  const { admin, msg, own, access } = await loadOwn(conversationId, messageId, currentUser.userId);
  if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!own) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (access.blocked) return NextResponse.json({ error: "blocked" }, { status: 403 });
  if (access.closed) return NextResponse.json({ error: "event_closed" }, { status: 422 });
  if (msg.deleted_at) return NextResponse.json({ error: "deleted" }, { status: 422 });
  if (!content && !msg.image_url) return NextResponse.json({ error: "empty_message" }, { status: 400 });
  if (Date.now() - new Date(msg.created_at as string).getTime() > EDIT_WINDOW_MS) {
    return NextResponse.json({ error: "edit_expired", message: "Изменить можно в течение 48 часов" }, { status: 422 });
  }

  const editedAt = new Date().toISOString();
  const { error } = await admin.from("messages").update({ content, edited_at: editedAt }).eq("id", messageId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await broadcastToConversation(conversationId, "edit", { id: messageId, content, editedAt });
  return NextResponse.json({ status: "ok", editedAt });
}

/**
 * DELETE /api/conversations/[id]/messages/[messageId]
 * Удаление своего сообщения у всех: текст и фото стираются, остаётся отметка «удалено».
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id: conversationId, messageId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { admin, msg, own } = await loadOwn(conversationId, messageId, currentUser.userId);
  if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!own) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (msg.deleted_at) return NextResponse.json({ status: "ok" });

  const deletedAt = new Date().toISOString();
  const { error } = await admin.from("messages").update({ content: "", image_url: null, deleted_at: deletedAt }).eq("id", messageId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  await admin.from("message_reactions").delete().eq("message_id", messageId);

  await broadcastToConversation(conversationId, "delete", { id: messageId, deletedAt });
  return NextResponse.json({ status: "ok" });
}
