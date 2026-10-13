import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser, shortTitle } from "@/lib/notify/user";

type Admin = ReturnType<typeof createAdminClient>;

export type InviteAnswer = "accept" | "decline";

export type RespondResult =
  | { ok: true; status: "accepted" | "declined"; eventId: string; text: string }
  | { ok: false; error: string; text: string };

/** Сколько приглашений организатор может отправить за сутки. */
export const INVITES_PER_DAY = 5;

/**
 * Ответ на приглашение организатора — общий для кнопок в Telegram
 * («Пойду» / «Не смогу») и для экрана встречи в приложении.
 * «Пойду» = сразу участник встречи и чата, без заявки и одобрения.
 */
export async function respondToInvite(
  admin: Admin,
  params: { inviteId: string; answer: InviteAnswer; userId?: string; telegramId?: number }
): Promise<RespondResult> {
  const { data: invite } = await admin
    .from("event_invites")
    .select("id, status, event_id, inviter_id, invitee_id, invitee:users!event_invites_invitee_id_fkey(id, name, telegram_id)")
    .eq("id", params.inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: "not_found", text: "Приглашение не найдено" };

  const invitee = invite.invitee as unknown as { id: string; name: string; telegram_id: number | null } | null;
  const isMine =
    (params.userId && invite.invitee_id === params.userId) ||
    (params.telegramId && invitee?.telegram_id && Number(invitee.telegram_id) === params.telegramId);
  if (!isMine) return { ok: false, error: "forbidden", text: "Это приглашение не для тебя" };

  if (invite.status !== "pending") {
    return {
      ok: false,
      error: "already_answered",
      text: invite.status === "accepted" ? "Ты уже принял это приглашение" : "Ты уже ответил на это приглашение",
    };
  }

  const { data: event } = await admin
    .from("events")
    .select("id, title, organizer_id, status, has_chat, seats_total, seats_taken")
    .eq("id", invite.event_id)
    .maybeSingle();
  if (!event) return { ok: false, error: "event_not_found", text: "Встреча не найдена" };

  const { data: organizer } = await admin.from("users").select("telegram_id").eq("id", event.organizer_id).maybeSingle();
  const name = invitee?.name?.trim() || "Человек";
  const now = new Date().toISOString();

  if (params.answer === "decline") {
    await admin.from("event_invites").update({ status: "declined", responded_at: now }).eq("id", invite.id);
    await notifyUser(admin, event.organizer_id, {
      title: "Приглашение отклонено",
      body: `${name} не сможет прийти на «${shortTitle(event.title)}». Можно позвать кого-то ещё`,
      url: `/event/${event.id}`,
      data: { type: "invite_declined", eventId: event.id },
      telegramText: `${name} не сможет прийти на «${event.title}». Можно позвать кого-то ещё.`,
      telegramId: organizer?.telegram_id ?? null,
    });
    return { ok: true, status: "declined", eventId: event.id, text: "Понял, передам организатору. Может, в следующий раз!" };
  }

  if (event.status !== "published") {
    return { ok: false, error: "event_unavailable", text: event.status === "closed" ? "Места на встречу уже закончились" : "Встреча уже недоступна" };
  }

  // Уже участник (например, сам подал заявку и его приняли).
  const { data: existing } = await admin
    .from("applications")
    .select("id, status")
    .eq("event_id", event.id)
    .eq("user_id", invite.invitee_id)
    .maybeSingle();
  if (existing?.status === "accepted") {
    await admin.from("event_invites").update({ status: "accepted", responded_at: now }).eq("id", invite.id);
    return { ok: true, status: "accepted", eventId: event.id, text: "Ты уже в участниках этой встречи" };
  }

  // Атомарно занимаем место, чтобы не превысить seats_total.
  const { data: seat } = await admin.rpc("accept_event_seat", { p_event_id: event.id });
  if (!seat) return { ok: false, error: "event_full", text: "Места на встречу уже закончились" };

  if (existing) {
    await admin.from("applications").update({ status: "accepted" }).eq("id", existing.id);
  } else {
    await admin.from("applications").insert({ event_id: event.id, user_id: invite.invitee_id, status: "accepted" });
  }
  await admin.from("event_members").insert({ event_id: event.id, user_id: invite.invitee_id, role: "participant" });

  // Один общий чат на встречу — как при принятии заявки.
  if (event.has_chat ?? true) {
    const { data: conv } = await admin.from("conversations").select("id").eq("event_id", event.id).maybeSingle();
    let conversationId = conv?.id as string | undefined;
    if (!conversationId) {
      const { data: created } = await admin.from("conversations").insert({ event_id: event.id }).select("id").single();
      conversationId = created?.id as string | undefined;
      if (conversationId) await admin.from("conversation_members").insert({ conversation_id: conversationId, user_id: event.organizer_id });
    }
    if (conversationId) await admin.from("conversation_members").insert({ conversation_id: conversationId, user_id: invite.invitee_id });
  }

  await admin.from("event_invites").update({ status: "accepted", responded_at: now }).eq("id", invite.id);
  await admin.from("notifications").insert({
    user_id: invite.invitee_id,
    type: "application_accepted",
    payload: { eventId: event.id },
  });
  await notifyUser(admin, event.organizer_id, {
    title: "Приглашение принято 🎉",
    body: `${name} идёт на «${shortTitle(event.title)}» — уже в участниках и в чате`,
    url: `/event/${event.id}`,
    data: { type: "invite_accepted", eventId: event.id },
    telegramText: `${name} принял(а) твоё приглашение на «${event.title}» — уже в участниках и в чате встречи.`,
    telegramId: organizer?.telegram_id ?? null,
  });

  return { ok: true, status: "accepted", eventId: event.id, text: "Отлично, ты в списке! Организатор уже знает. Чат встречи открыт в приложении." };
}
