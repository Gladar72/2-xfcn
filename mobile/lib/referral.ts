import * as SecureStore from "expo-secure-store";
import { api, type ApiError } from "./api";

/**
 * Код партнёра из ссылки mesto-go.ru/r/<code> → mesto://r/<code>.
 * Если человек ещё не вошёл — запоминаем код и отправляем при регистрации
 * (или сразу после входа в существующий аккаунт).
 */
const KEY = "mesto_pending_ref";

export async function savePendingRef(code: string): Promise<void> {
  const c = code.trim().toLowerCase();
  if (!/^[a-z0-9]{4,32}$/.test(c)) return;
  try {
    await SecureStore.setItemAsync(KEY, c);
  } catch {}
}

export async function getPendingRef(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function clearPendingRef(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {}
}

/** Применить код к своему аккаунту. Возвращает текст ошибки или null при успехе. */
export async function applyReferralCode(code: string): Promise<string | null> {
  const r = await tryApply(code);
  return r.ok ? null : r.message;
}

async function tryApply(code: string): Promise<{ ok: boolean; final: boolean; message: string }> {
  try {
    await api("/api/me/referral", { body: { code: code.trim().toLowerCase() } });
    return { ok: true, final: true, message: "" };
  } catch (e) {
    const err = e as ApiError;
    // 4xx — ответ окончательный (неверный код, уже применён); сеть/5xx — попробуем позже.
    const final = err.status >= 400 && err.status < 500;
    return { ok: false, final, message: err.message || "Не получилось применить код" };
  }
}

/** После входа: если ждал код из ссылки — тихо применяем; при сбое сети оставляем на потом. */
export async function applyPendingRef(): Promise<void> {
  const code = await getPendingRef();
  if (!code) return;
  const r = await tryApply(code);
  if (r.final) await clearPendingRef();
}
