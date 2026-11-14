import type { createAdminClient } from "@/lib/supabase/admin";
import { issueRegistrationTicket, verifyRegistrationTicket } from "@/lib/mobile/auth";
import { attachAppleId, attachEmail, attachPhone } from "@/lib/mobile/otp";
import { mobileSessionPayload } from "@/lib/mobile/session-response";

type Admin = ReturnType<typeof createAdminClient>;
export interface TelegramIdentity {
  id: number;
  username?: string | null;
  first_name?: string | null;
  photo_url?: string | null;
}

/**
 * Общая часть входа по подтверждённому Telegram-аккаунту (виджет или бот):
 * находим профиль по telegram_id, привязываем подтверждённые почту/номер/Apple ID
 * из «пропуска» (phoneTicket/emailTicket). Возвращает [тело ответа, HTTP-статус].
 */
export async function telegramSignIn(
  admin: Admin,
  tg: TelegramIdentity,
  tickets: { phoneTicket?: unknown; emailTicket?: unknown }
): Promise<[Record<string, unknown>, number]> {
  const { data: user } = await admin
    .from("users")
    .select("id, telegram_id, moderation_status")
    .eq("telegram_id", tg.id)
    .maybeSingle();

  if (!user) {
    return [
      {
        status: "needs_registration",
        ticket: issueRegistrationTicket({ kind: "telegram", telegramId: tg.id, username: tg.username ?? null }),
        telegramProfile: { firstName: tg.first_name ?? null, photoUrl: tg.photo_url ?? null },
      },
      200,
    ];
  }
  if (user.moderation_status === "banned") return [{ error: "user_banned" }, 403];

  let phoneLinked: string | null = null;
  let phoneError: string | null = null;
  const phoneTicket = typeof tickets.phoneTicket === "string" ? verifyRegistrationTicket(tickets.phoneTicket) : null;
  if (phoneTicket?.kind === "phone") {
    const attached = await attachPhone(admin, user.id, phoneTicket.phone);
    if (attached.ok) phoneLinked = phoneTicket.phone;
    else phoneError = attached.message;
  }
  let emailLinked: string | null = null;
  const emailTicketRaw = typeof tickets.emailTicket === "string" ? tickets.emailTicket : tickets.phoneTicket;
  const emailTicket = typeof emailTicketRaw === "string" ? verifyRegistrationTicket(emailTicketRaw) : null;
  if (emailTicket?.kind === "email") {
    const attached = await attachEmail(admin, user.id, emailTicket.email);
    if (attached.ok) emailLinked = emailTicket.email;
    else phoneError = attached.message;
  }
  let appleLinked = false;
  if (emailTicket?.kind === "apple") {
    const attached = await attachAppleId(admin, user.id, emailTicket.sub);
    if (attached.ok) appleLinked = true;
    else phoneError = attached.message;
  }
  return [{ ...(await mobileSessionPayload(admin, user)), phoneLinked, emailLinked, appleLinked, phoneError }, 200];
}
