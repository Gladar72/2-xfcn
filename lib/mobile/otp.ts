import { createAdminClient } from "@/lib/supabase/admin";
import { hashOtp, safeEqualHex } from "./auth";

const MAX_ATTEMPTS = 5;

export type OtpCheck = { ok: true } | { ok: false; status: number; error: string; message: string };

/** Проверяет SMS-код (из /api/auth/mobile/phone/send) и гасит его после успешной проверки. */
export async function checkAndConsumeOtp(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
  code: string
): Promise<OtpCheck> {
  return checkAndConsumeCode(admin, "phone_otps", "phone", phone, code);
}

/** То же для кодов, отправленных на почту (таблица email_otps). */
export async function checkAndConsumeEmailOtp(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  code: string
): Promise<OtpCheck> {
  return checkAndConsumeCode(admin, "email_otps", "email", email, code);
}

async function checkAndConsumeCode(
  admin: ReturnType<typeof createAdminClient>,
  table: "phone_otps" | "email_otps",
  column: "phone" | "email",
  phone: string,
  code: string
): Promise<OtpCheck> {
  const { data: otp } = await admin.from(table).select("*").eq(column, phone).maybeSingle();
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, error: "code_expired", message: "Код устарел — запроси новый" };
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "too_many_attempts", message: "Слишком много попыток — запроси новый код" };
  }
  if (!safeEqualHex(hashOtp(phone, code), otp.code_hash)) {
    await admin.from(table).update({ attempts: otp.attempts + 1 }).eq(column, phone);
    return { ok: false, status: 400, error: "wrong_code", message: "Неверный код" };
  }
  await admin.from(table).update({ expires_at: new Date(0).toISOString() }).eq(column, phone);
  return { ok: true };
}

/** Привязывает подтверждённую почту к профилю (почта не должна принадлежать другому). */
export async function attachEmail(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string
): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const { data: owner } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (owner && owner.id !== userId) {
    return { ok: false, status: 409, error: "email_taken", message: "Эта почта уже привязана к другому профилю «Место»" };
  }
  const { error } = await admin.from("users").update({ email }).eq("id", userId);
  if (error) return { ok: false, status: 500, error: "update_failed", message: "Не получилось сохранить почту" };
  return { ok: true };
}

/**
 * Привязывает подтверждённый номер к профилю. Номер не должен принадлежать
 * другому пользователю; если у профиля уже есть другой номер — заменяем.
 */
export async function attachPhone(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  phone: string
): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const { data: owner } = await admin.from("users").select("id").eq("phone", phone).maybeSingle();
  if (owner && owner.id !== userId) {
    return {
      ok: false,
      status: 409,
      error: "phone_taken",
      message: "Этот номер уже привязан к другому профилю «Место»",
    };
  }
  const { error } = await admin.from("users").update({ phone }).eq("id", userId);
  if (error) return { ok: false, status: 500, error: "update_failed", message: "Не получилось сохранить номер" };
  return { ok: true };
}
