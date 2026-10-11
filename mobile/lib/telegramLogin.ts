import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";
import type { AuthResult } from "./auth";
import { API_URL } from "./config";

export type TelegramLoginResult = AuthResult & { phoneLinked?: string | null; phoneError?: string | null };

/**
 * Вход через Telegram: открываем страницу с виджетом Telegram во встроенном
 * браузере, она возвращает подписанные данные ссылкой mesto://auth, сервер
 * проверяет подпись. null — если человек закрыл окно.
 * phoneTicket — привязать к Telegram-профилю почту (или номер), только что подтверждённые кодом.
 */
export async function loginWithTelegram(phoneTicket?: string | null): Promise<TelegramLoginResult | null> {
  const redirect = Linking.createURL("auth");
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_URL}/auth/telegram-mobile?redirect=${encodeURIComponent(redirect)}`,
    redirect
  );
  if (result.type !== "success") return null;
  const { queryParams } = Linking.parse(result.url);
  return api<TelegramLoginResult>("/api/auth/mobile/telegram", {
    body: { authData: queryParams ?? {}, phoneTicket: phoneTicket ?? undefined },
    auth: false,
  });
}
