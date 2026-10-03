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
  const { data: otp } = await admin.from("phone_otps").select("*").eq("phone", phone).maybeSingle();
  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, error: "code_expired", message: "Код устарел — запроси новый" };
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "too_many_attempts", message: "Слишком много попыток — запроси новый код" };
  }
  if (!safeEqualHex(hashOtp(phone, code), otp.code_hash)) {
    await admin.from("phone_otps").update({ attempts: otp.attempts + 1 }).eq("phone", phone);
    return { ok: false, status: 400, error: "wrong_code", message: "Неверный код" };
  }
  await admin.from("phone_otps").update({ expires_at: new Date(0).toISOString() }).eq("phone", phone);
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
