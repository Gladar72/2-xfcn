import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { describeValidationError } from "@/lib/validation/describe-error";
import { verifyRegistrationTicket } from "@/lib/mobile/auth";
import { mobileSessionPayload } from "@/lib/mobile/session-response";
import { uploadAvatar } from "@/lib/photos/upload-avatar";
import { applyPendingGifts } from "@/lib/gifts/channel-gift";
import { grantPartnerPremiumIfPartner } from "@/lib/subscriptions/referrals";

/**
 * POST /api/auth/mobile/register  { ticket, profile }
 * Регистрация из мобильного приложения. ticket — из phone/verify или telegram,
 * profile — та же анкета, что в мини-приложении (lib/validation/onboarding.ts).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ticket = typeof body?.ticket === "string" ? verifyRegistrationTicket(body.ticket) : null;
  if (!ticket) {
    return NextResponse.json({ error: "invalid_ticket", message: "Сессия входа устарела — войди заново" }, { status: 401 });
  }

  const parsed = onboardingSchema.safeParse(body?.profile);
  if (!parsed.success) {
    const { field, message } = describeValidationError(parsed.error);
    return NextResponse.json({ error: "validation_failed", field, message }, { status: 422 });
  }
  const profile = parsed.data;
  const admin = createAdminClient();

  const existing =
    ticket.kind === "phone"
      ? await admin.from("users").select("id, telegram_id").eq("phone", ticket.phone).maybeSingle()
      : ticket.kind === "email"
        ? await admin.from("users").select("id, telegram_id").eq("email", ticket.email).maybeSingle()
        : await admin.from("users").select("id, telegram_id").eq("telegram_id", ticket.telegramId).maybeSingle();
  if (existing.data) {
    // Уже зарегистрирован (двойное нажатие) — просто входим.
    return NextResponse.json(await mobileSessionPayload(admin, existing.data));
  }

  const { data: created, error } = await admin
    .from("users")
    .insert({
      telegram_id: ticket.kind === "telegram" ? ticket.telegramId : null,
      telegram_username: ticket.kind === "telegram" ? ticket.username : null,
      phone: ticket.kind === "phone" ? ticket.phone : null,
      email: ticket.kind === "email" ? ticket.email : null,
      name: profile.name,
      birth_date: profile.birthDate,
      gender: profile.gender,
      terms_accepted_at: new Date().toISOString(),
      city: profile.city,
      bio: profile.bio,
    })
    .select("id, telegram_id")
    .single();

  if (error || !created) {
    console.error("mobile/register:", error);
    return NextResponse.json({ error: "create_failed", message: "Не получилось сохранить профиль. Попробуй ещё раз" }, { status: 500 });
  }
  const userId = created.id as string;

  let photoError: string | null = null;
  if (profile.photoBase64) {
    const up = await uploadAvatar(admin, userId, profile.photoBase64);
    if (up.ok) {
      await admin.from("users").update({ avatar_url: up.publicUrl }).eq("id", userId);
      await admin.from("user_photos").insert({ user_id: userId, url: up.publicUrl, position: 0 });
    } else {
      photoError = up.error;
    }
  }
  if (profile.interestIds.length > 0) {
    await admin.from("user_interests").insert(profile.interestIds.map((interest_id) => ({ user_id: userId, interest_id })));
  }
  if (ticket.kind === "telegram") {
    await applyPendingGifts(admin, ticket.telegramId, userId).catch((e) => console.error("mobile/register gifts:", e));
    await grantPartnerPremiumIfPartner(admin, ticket.telegramId).catch((e) => console.error("mobile/register partner:", e));
  }

  return NextResponse.json({ ...(await mobileSessionPayload(admin, created)), photoError });
}
