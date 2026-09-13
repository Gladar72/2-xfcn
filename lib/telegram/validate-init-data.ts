/**
 * Проверка подписи Telegram WebApp initData.
 *
 * Алгоритм (официальная документация Telegram, "Validating data received via
 * the Mini App"):
 *   1. Взять все поля initData, кроме "hash".
 *   2. Отсортировать их по ключу и собрать в строку вида "key=value",
 *      объединив через "\n" — это data-check-string.
 *   3. secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
 *   4. computed_hash = HEX(HMAC_SHA256(key = secret_key, data = data-check-string))
 *   5. Сравнить computed_hash с полем "hash". Не через ===, а constant-time
 *      сравнением, чтобы не давать возможность timing-атаки.
 *
 * ВАЖНО: перед реализацией в реальном проекте свериться с актуальной
 * официальной документацией Telegram (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
 * т.к. детали могут измениться. Дата последней сверки этого файла с
 * документацией должна обновляться при ревью.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramInitDataUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedTelegramInitData {
  user: TelegramInitDataUser;
  authDate: Date;
  raw: Record<string, string>;
}

export type ValidateInitDataResult =
  | { ok: true; data: ValidatedTelegramInitData }
  | { ok: false; reason: "missing_hash" | "missing_user" | "invalid_signature" | "expired" | "malformed" };

/** Максимальный возраст initData, после которого считаем её протухшей. */
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60; // 24 часа

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  now: Date = new Date()
): ValidateInitDataResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, reason: "missing_hash" };
  }

  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    raw[key] = value;
  }

  const dataCheckString = Object.keys(raw)
    .sort()
    .map((key) => `${key}=${raw[key]}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const isValidSignature = safeCompareHex(computedHash, hash);
  if (!isValidSignature) {
    return { ok: false, reason: "invalid_signature" };
  }

  const authDateRaw = raw["auth_date"];
  if (!authDateRaw) {
    return { ok: false, reason: "malformed" };
  }
  const authDateSeconds = Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds)) {
    return { ok: false, reason: "malformed" };
  }
  const authDate = new Date(authDateSeconds * 1000);
  const ageSeconds = (now.getTime() - authDate.getTime()) / 1000;
  if (ageSeconds > MAX_INIT_DATA_AGE_SECONDS || ageSeconds < -60) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = raw["user"];
  if (!userRaw) {
    return { ok: false, reason: "missing_user" };
  }

  let user: TelegramInitDataUser;
  try {
    const parsedUser = JSON.parse(userRaw);
    if (typeof parsedUser.id !== "number" || typeof parsedUser.first_name !== "string") {
      return { ok: false, reason: "malformed" };
    }
    user = parsedUser;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, data: { user, authDate, raw } };
}

/** Сравнение двух hex-строк одинаковой ожидаемой длины в constant time. */
function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
