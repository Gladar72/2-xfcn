import { AppState, Linking } from "react-native";
import { api } from "./api";
import type { AuthResult } from "./auth";

export type TelegramLoginResult = AuthResult & { phoneLinked?: string | null; phoneError?: string | null };

/**
 * Вход через Telegram — через нашего бота, без окна браузера:
 * 1) сервер выдаёт одноразовый токен и ссылку t.me/<бот>?start=login_<токен>;
 * 2) открываем Telegram, человек жмёт «Старт» — бот подтверждает аккаунт и даёт кнопку
 *    «Вернуться в «Место»» (или назад кнопкой «◀ Место» вверху экрана);
 * 3) приложение опрашивает сервер и входит, как только вход подтверждён.
 * Ожидание хранится на уровне модуля: если экран входа пересоздастся при возврате
 * по ссылке, он подхватит то же ожидание (resumeTelegramLogin).
 * phoneTicket — привязать к Telegram-профилю почту (или номер), только что подтверждённые кодом.
 */
let pending: Promise<TelegramLoginResult | null> | null = null;
let cancelFlag = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function resumeTelegramLogin(): Promise<TelegramLoginResult | null> | null {
  return pending;
}
export function cancelTelegramLogin() {
  cancelFlag = true;
}

export function loginWithTelegram(phoneTicket?: string | null): Promise<TelegramLoginResult | null> {
  if (pending) return pending;
  cancelFlag = false;
  pending = (async () => {
    try {
      const start = await api<{ token: string; botUrl: string }>("/api/auth/mobile/telegram/start", { body: {}, auth: false });
      await Linking.openURL(start.botUrl);
      const deadline = Date.now() + 10 * 60 * 1000;
      let wake: (() => void) | null = null;
      // Вернулись в приложение — проверяем сразу, не дожидаясь паузы.
      const sub = AppState.addEventListener("change", (st) => st === "active" && wake?.());
      try {
        while (Date.now() < deadline && !cancelFlag) {
          const r = await api<TelegramLoginResult & { status?: string }>("/api/auth/mobile/telegram/poll", {
            body: { token: start.token, phoneTicket: phoneTicket ?? undefined },
            auth: false,
          });
          if (r.status !== "pending") return r;
          await Promise.race([sleep(2000), new Promise<void>((res) => (wake = res))]);
          wake = null;
        }
        return null;
      } finally {
        sub.remove();
      }
    } finally {
      pending = null;
    }
  })();
  return pending;
}
