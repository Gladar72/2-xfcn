import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteContent } from "@/lib/chat/invite";
import { InlineKeyboard } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { findDirectConversation, haveSharedEvent } from "@/lib/chat/can-direct";
import { sendPushToUsers } from "@/lib/push/expo";
import { shortTitle } from "@/lib/notify/user";
import { eventTiming } from "@/lib/events/timing";
import { invitationBlocked } from "@/lib/invites/access";
import { INVITES_PER_DAY } from "@/lib/invites/respond";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";
import { PLAN_LIMITS, type Plan } from "@/lib/subscriptions/limits";

/**
 * POST /api/conversations/direct
 * Body: { userId: string, eventId?: string }
 *
 * Личный чат один на один (conversation без event_id). Если такой чат
 * между двумя людьми уже есть — возвращаем его, иначе создаём.
 * С eventId — сразу отправляем в чат приглашение на встречу или предложение пойти вместе
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
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!otherId || !uuid.test(otherId) || (eventId && !uuid.test(eventId)) || otherId === currentUser.userId) return NextResponse.json({ error: "invalid_user" }, { status: 400 });

  const admin = createAdminClient({ noStore: true });

  const { data: other } = await admin
    .from("users")
    .select("id, moderation_status, is_profile_hidden")
    .eq("id", otherId)
    .maybeSingle();
  if (!other || other.is_profile_hidden || other.moderation_status !== "active") return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (await invitationBlocked(admin, currentUser.userId, otherId)) return NextResponse.json({ error: "blocked" }, { status: 403 });

  let conversationId = await findDirectConversation(admin, currentUser.userId, otherId);
  if (conversationId) {
    const { data: blockedMember, error } = await admin.from("conversation_members").select("id")
      .eq("conversation_id", conversationId).eq("is_blocked", true).limit(1);
    if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    if (blockedMember?.length) return NextResponse.json({ error: "blocked" }, { status: 403 });
  }
  if (!eventId && !(await haveSharedEvent(admin, currentUser.userId, otherId))) {
    return NextResponse.json({ error: "no_shared_event" }, { status: 403 });
  }

  let inviteId: string | null = null;
  let event: { id: string; title: string; organizer_id: string } | null = null;
  let companion = false;
  if (eventId) {
    const { data: ev } = await admin.from("events")
      .select("id, title, organizer_id, status, seats_total, seats_taken, event_date, event_time, event_end_time, city, longitude")
      .eq("id", eventId).maybeSingle();
    if (!ev || !["published", "closed"].includes(ev.status) || eventTiming(ev).end <= new Date()) {
      return NextResponse.json({ error: "event_unavailable" }, { status: 422 });
    }
    companion = ev.organizer_id !== currentUser.userId;
    if (companion && (await invitationBlocked(admin, currentUser.userId, ev.organizer_id) || await invitationBlocked(admin, otherId, ev.organizer_id))) {
      return NextResponse.json({ error: "event_unavailable" }, { status: 422 });
    }
    if (!companion) {
      if (ev.status === "closed" || ev.seats_taken >= ev.seats_total) return NextResponse.json({ error: "event_full" }, { status: 422 });
      const { data: member } = await admin.from("event_members").select("user_id").eq("event_id", eventId).eq("user_id", otherId).maybeSingle();
      if (member) return NextResponse.json({ error: "already_member" }, { status: 422 });
    }
    // Лимит приглашений в сутки зависит от тарифа (lib/subscriptions/limits.ts):
    // Старт — 5 «пойдём вместе», Медиум — 15, Премиум — без ограничений (0 = безлимит).
    const sub = await getActiveSubscriptionInfo(admin, currentUser.userId).catch(() => null);
    const planLimits = PLAN_LIMITS[(sub?.plan as Plan | undefined) ?? "start"];
    const dayLimit = companion ? planLimits.companionInvitesPerDay : planLimits.hostInvitesPerDay;
    const { data: reservation, error } = await admin.rpc("reserve_event_invite", {
      p_event_id: eventId, p_inviter_id: currentUser.userId, p_invitee_id: otherId, p_message: inviteMessage || null,
      p_limit: dayLimit ?? 0,
    });
    if (error || !reservation?.id) {
      const code = reservation?.error ?? (error?.code === "23505" ? "already_invited" : "create_failed");
      return NextResponse.json({ error: code, ...(code === "invite_limit" ? { limit: dayLimit ?? INVITES_PER_DAY } : {}) }, { status: code === "invite_limit" ? 429 : code === "already_invited" ? 422 : 500 });
    }
    inviteId = reservation.id as string;
    event = ev;
  }
  // A failed chat write must leave the invitation retryable.
  async function failedInvitation() {
    if (inviteId) await admin.from("event_invites").delete().eq("id", inviteId).eq("status", "pending");
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  if (!conversationId) {
    const { data: conv, error } = await admin.from("conversations").insert({ event_id: null }).select("id").single();
    if (error || !conv) return failedInvitation();
    conversationId = conv.id as string;
    const { error: memErr } = await admin.from("conversation_members").insert([
      { conversation_id: conversationId, user_id: currentUser.userId },
      { conversation_id: conversationId, user_id: otherId },
    ]);
    if (memErr) {
      await admin.from("conversations").delete().eq("id", conversationId);
      return failedInvitation();
    }
  } else {
    // Чат мог быть скрыт у меня — возвращаем его в список.
    await admin
      .from("conversation_members")
      .update({ is_hidden: false })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUser.userId);
  }

  if (eventId && event) {
    const { error: messageError } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUser.userId,
      content: inviteContent(eventId),
    });
    if (messageError) return failedInvitation();
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
      const keyboard = new InlineKeyboard().text(companion ? "✅ Пойдём вместе" : "✅ Пойду", `inv:y:${inviteId}`).text("Не смогу", `inv:n:${inviteId}`);
      if (appUrl) keyboard.row().webApp("Открыть встречу", `${appUrl}?goto=event_${eventId}`);
      try {
        await getBot().api.sendMessage(telegramId, `🎉 <b>${name}</b> ${companion ? "предлагает пойти вместе на" : "зовёт тебя на встречу"} «${esc(event.title as string)}»${inviteMessage ? `\n\n«${esc(inviteMessage)}»` : ""}\n\n${companion ? "Это предложение пойти вместе. Запись на событие и билеты оформляются отдельно." : "Примешь — сразу попадёшь в участники и чат встречи, без заявки."}`, {
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
      title: `${senderName} ${companion ? "предлагает пойти вместе" : "зовёт тебя на встречу"}`,
      body: `«${shortTitle(event.title as string)}»${inviteMessage ? ` — ${shortTitle(inviteMessage, 80)}` : ""}`,
      data: { url: `/event/${eventId}`, type: "event_invite", eventId, inviteId, conversationId },
    });
  }

  return NextResponse.json({ conversationId });
}
