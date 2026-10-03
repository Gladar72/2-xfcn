import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Вход в мобильное приложение. Сессия — тот же JWT, что у мини-приложения
 * (lib/telegram/session.ts), только приложение хранит его у себя и шлёт
 * в заголовке Authorization: Bearer. У пользователя без Telegram
 * telegram_id в токене = 0.
 */

/** +7XXXXXXXXXX из «8 (912) 345-67-89», «+7 912…», «912…». null — если номер не российский/не похож на номер. */
export function normalizePhone(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = "7" + d;
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (!/^7\d{10}$/.test(d)) return null;
  return "+" + d;
}

/** Почта в нижнем регистре; null — если не похоже на адрес. */
export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

export function generateOtp(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

export function hashOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}:${process.env.SUPABASE_JWT_SECRET ?? ""}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Отправка SMS через SMS.ru (env SMSRU_API_ID). Без ключа в продакшене — ошибка;
 * в разработке код просто пишется в лог.
 */
export async function sendSmsCode(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const apiId = process.env.SMSRU_API_ID;
  const text = `Место: код для входа ${code}`;
  if (!apiId) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[sms:dev] ${phone}: ${text}`);
      return { ok: true };
    }
    return { ok: false, error: "sms_not_configured" };
  }
  const url = new URL("https://sms.ru/sms/send");
  url.searchParams.set("api_id", apiId);
  url.searchParams.set("to", phone.replace("+", ""));
  url.searchParams.set("msg", text);
  url.searchParams.set("json", "1");
  if (process.env.SMSRU_FROM) url.searchParams.set("from", process.env.SMSRU_FROM);
  try {
    const res = await fetch(url, { method: "POST" });
    const data = (await res.json()) as { status?: string; status_text?: string };
    if (data.status !== "OK") return { ok: false, error: data.status_text ?? "sms_failed" };
    return { ok: true };
  } catch (err) {
    console.error("sendSmsCode:", err);
    return { ok: false, error: "sms_failed" };
  }
}

export interface TelegramLoginData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Проверка данных Telegram Login Widget:
 * secret = SHA256(bot_token), hash = HMAC_SHA256(secret, data_check_string).
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(
  raw: Record<string, unknown>,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60
): TelegramLoginData | null {
  const hash = typeof raw.hash === "string" ? raw.hash : null;
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  const pairs = Object.entries(raw)
    .filter(([k, v]) => k !== "hash" && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort();
  const secret = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  if (!safeEqualHex(computed, hash.toLowerCase())) return null;
  const authDate = Number(raw.auth_date);
  const id = Number(raw.id);
  if (!Number.isFinite(authDate) || !Number.isSafeInteger(id)) return null;
  if (Date.now() / 1000 - authDate > maxAgeSeconds) return null;
  return {
    id,
    first_name: raw.first_name as string | undefined,
    last_name: raw.last_name as string | undefined,
    username: raw.username as string | undefined,
    photo_url: raw.photo_url as string | undefined,
    auth_date: authDate,
    hash,
  };
}

/** Короткоживущий «пропуск на регистрацию»: подтверждённый телефон или Telegram-аккаунт. */
export type RegistrationTicket =
  | { kind: "phone"; phone: string }
  | { kind: "email"; email: string }
  | { kind: "telegram"; telegramId: number; username: string | null };

const TICKET_AUDIENCE = "mesto-mobile-registration";

export function issueRegistrationTicket(t: RegistrationTicket): string {
  return jwt.sign({ t }, secret(), { expiresIn: 60 * 60, audience: TICKET_AUDIENCE });
}

export function verifyRegistrationTicket(token: string): RegistrationTicket | null {
  try {
    const decoded = jwt.verify(token, secret(), { audience: TICKET_AUDIENCE });
    if (typeof decoded === "string") return null;
    const t = (decoded as { t?: RegistrationTicket }).t;
    if (t?.kind === "phone" && typeof t.phone === "string") return t;
    if (t?.kind === "email" && typeof t.email === "string") return t;
    if (t?.kind === "telegram" && typeof t.telegramId === "number") return t;
    return null;
  } catch {
    return null;
  }
}

function secret(): string {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) throw new Error("Отсутствует SUPABASE_JWT_SECRET");
  return s;
}
