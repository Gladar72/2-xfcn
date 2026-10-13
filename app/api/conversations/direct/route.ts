import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteContent } from "@/lib/chat/invite";
import { InlineKeyboard } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { findDirectConversation, haveSharedEvent } from "@/lib/chat/can-direct";
import { sendPushToUsers } from "@/lib/push/expo";
import { shortTitle } from "@/lib/notify/user";
import { INVITES_PER_DAY } from "@/lib/invites/respond";

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
  const inviteMessage = typeof body?.message === "string" ? body.message.trim().slice(0, 300) : "";
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

  // Приглашение на встречу: только на свою, одного человека — один раз,
  // не больше INVITES_PER_DAY за сутки, и только пока есть места.
  let inviteId: string | null = null;
  if (eventId) {
    const { data: ev } = await admin
      .from("events")
      .select("organizer_id, status, seats_total, seats_taken")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev || ev.organizer_id !== currentUser.userId) return NextResponse.json({ error: "not_your_event" }, { status: 403 });
    if (ev.status === "cancelled" || ev.status === "completed") return NextResponse.json({ error: "event_unavailable" }, { status: 422 });
    if (ev.status === "closed" || ev.seats_taken >= ev.seats_total) return NextResponse.json({ error: "event_full" }, { status: 422 });

    const { data: app } = await admin
      .from("applications")
      .select("status")
      .eq("event_id", eventId)
      .eq("user_id", otherId)
      .maybeSingle();
    if (app?.status === "accepted") return NextResponse.json({ error: "already_member" }, { status: 422 });

    const { data: prevInvite } = await admin
      .from("event_invites")
      .select("id")
      .eq("event_id", eventId)
      .eq("invitee_id", otherId)
      .maybeSingle();
    if (prevInvite) return NextResponse.json({ error: "already_invited" }, { status: 422 });

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin
      .from("event_invites")
      .select("id", { count: "exact", head: true })
      .eq("inviter_id", currentUser.userId)
      .gte("created_at", since);
    if ((count ?? 0) >= INVITES_PER_DAY) return NextResponse.json({ error: "invite_limit", limit: INVITES_PER_DAY }, { status: 429 });

    const { data: inv, error: invErr } = await admin
      .from("event_invites")
      .insert({ event_id: eventId, inviter_id: currentUser.userId, invitee_id: otherId, message: inviteMessage || null })
      .select("id")
      .single();
    if (invErr || !inv) {
      if (invErr?.code === "23505") return NextResponse.json({ error: "already_invited" }, { status: 422 });
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    inviteId = inv.id as string;
  }

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
      const keyboard = new InlineKeyboard().text("✅ Пойду", `inv:y:${inviteId}`).text("Не смогу", `inv:n:${inviteId}`);
      if (appUrl) keyboard.row().webApp("Открыть встречу", `${appUrl}?goto=event_${eventId}`);
      try {
        await getBot().api.sendMessage(telegramId, `🎉 <b>${name}</b> зовёт тебя на встречу «${esc(event.title as string)}»${inviteMessage ? `\n\n«${esc(inviteMessage)}»` : ""}\n\nПримешь — сразу попадёшь в участники и чат встречи, без заявки.`, {
          parse_mode: "HTML",
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        console.error("invite notify failed:", err);
      }
    }

    // Push в мобильное приложение: тап открывает встречу с баннером «Пойду / Не смогу».
    const senderName = ((sender?.name as string | undefined) ?? "").trim() || "Кто-то";
    await sendPushToUsers(admin, [otherId], {
      title: `${senderName} зовёт тебя на встречу`,
      body: `«${shortTitle(event.title as string)}»${inviteMessage ? ` — ${shortTitle(inviteMessage, 80)}` : ""}`,
      data: { url: `/event/${eventId}`, type: "event_invite", eventId, inviteId, conversationId },
    });
  }

  return NextResponse.json({ conversationId });
}
