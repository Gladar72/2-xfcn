import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteContent } from "@/lib/chat/invite";
import { InlineKeyboard } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { findDirectConversation, haveSharedEvent } from "@/lib/chat/can-direct";

/**
 * POST /api/conversations/direct
 * Body: { userId: string, eventId?: string }
 *
 * Личный чат один на один (conversation без event_id). Если такой чат
 * между двумя людьми уже есть — возвращаем его, иначе создаём.
 * С eventId — сразу отправляем в чат приглашение на свою встречу
 * («Позвать на встречу» в профиле человека). Само сообщение и
 * уведомления отправляет обычный POST /messages с клиента не нужно —
 * делаем это здесь, чтобы приглашение пришло одним действием.
 */
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const otherId = typeof body?.userId === "string" ? body.userId : null;
  const eventId = typeof body?.eventId === "string" ? body.eventId : null;
  if (!otherId || otherId === currentUser.userId) return NextResponse.json({ error: "invalid_user" }, { status: 400 });

  const admin = createAdminClient();

  const { data: other } = await admin
    .from("users")
    .select("id, moderation_status, is_profile_hidden")
    .eq("id", otherId)
    .maybeSingle();
  if (!other || other.moderation_status !== "active") return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Ищем существующий личный чат между нами.
  let conversationId: string | null = await findDirectConversation(admin, currentUser.userId, otherId);

  // «Написать» — только после общей встречи (оба одобрены в одной встрече).
  // Исключение — приглашение на свою встречу («Позвать на встречу»).
  let allowed = await haveSharedEvent(admin, currentUser.userId, otherId);
  if (!allowed && eventId) {
    const { data: own } = await admin.from("events").select("organizer_id").eq("id", eventId).maybeSingle();
    allowed = own?.organizer_id === currentUser.userId;
  }
  if (!allowed) return NextResponse.json({ error: "no_shared_event" }, { status: 403 });

  if (!conversationId) {
    const { data: conv, error } = await admin.from("conversations").insert({ event_id: null }).select("id").single();
    if (error || !conv) return NextResponse.json({ error: "create_failed" }, { status: 500 });
    conversationId = conv.id as string;
    const { error: memErr } = await admin.from("conversation_members").insert([
      { conversation_id: conversationId, user_id: currentUser.userId },
      { conversation_id: conversationId, user_id: otherId },
    ]);
    if (memErr) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  } else {
    // Чат мог быть скрыт у меня — возвращаем его в список.
    await admin
      .from("conversation_members")
      .update({ is_hidden: false })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUser.userId);
  }

  if (eventId) {
    const { data: event } = await admin
      .from("events")
      .select("id, title, organizer_id, status")
      .eq("id", eventId)
      .maybeSingle();
    if (!event || event.status === "cancelled" || event.status === "completed") {
      return NextResponse.json({ error: "event_unavailable", conversationId }, { status: 422 });
    }
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUser.userId,
      content: inviteContent(eventId),
    });
    await Promise.all([
      admin.rpc("increment_conversation_unread", {
        p_conversation_id: conversationId,
        p_exclude_user_id: currentUser.userId,
      }),
      admin.from("notifications").insert({ user_id: otherId, type: "new_message", payload: { conversationId } }),
      admin
        .from("conversation_members")
        .update({ is_hidden: false })
        .eq("conversation_id", conversationId)
        .eq("user_id", otherId),
    ]);

    // Приглашение приходит и в Telegram — с кнопкой открыть встречу.
    const [{ data: sender }, { data: invitee }] = await Promise.all([
      admin.from("users").select("name").eq("id", currentUser.userId).maybeSingle(),
      admin.from("users").select("telegram_id").eq("id", otherId).maybeSingle(),
    ]);
    const appUrl = process.env.APP_URL;
    const telegramId = invitee?.telegram_id as number | undefined;
    if (telegramId) {
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const name = esc(((sender?.name as string | undefined) ?? "").trim() || "Кто-то");
      const keyboard = appUrl
        ? new InlineKeyboard()
            .webApp("Открыть встречу", `${appUrl}?goto=event_${eventId}`)
            .row()
            .webApp("💬 Ответить", `${appUrl}?goto=chat_${conversationId}`)
        : undefined;
      try {
        await getBot().api.sendMessage(telegramId, `🎉 <b>${name}</b> зовёт тебя на встречу «${esc(event.title as string)}»`, {
          parse_mode: "HTML",
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        console.error("invite notify failed:", err);
      }
    }
  }

  return NextResponse.json({ conversationId });
}
