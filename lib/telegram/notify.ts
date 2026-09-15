import { InlineKeyboard } from "grammy";
import { getBot } from "@/lib/telegram/bot";

/**
 * Отправляет пользователю уведомление напрямую в Telegram-чат с ботом —
 * чтобы не приходилось заходить в приложение "на всякий случай" и
 * проверять, не ответили ли на встречу. Кнопка сразу открывает Mini App.
 *
 * Намеренно НЕ используем n8n (lib/n8n/notify.ts) для этого — n8n может
 * быть не настроен/не запущен, и тогда уведомление просто пропадёт молча.
 * Отправка напрямую через Bot API — то же самое, что уже работает для
 * команд /start и поддержки, и её можно проверить и логировать здесь же.
 *
 * Если пользователь заблокировал бота или ещё ни разу не открывал его —
 * Telegram вернёт ошибку; она перехватывается и логируется, не роняя
 * основной запрос (создание отклика, отправку сообщения и т.д.).
 */
export async function notifyTelegram(telegramId: number, text: string): Promise<void> {
  const appUrl = process.env.APP_URL;

  try {
    await getBot().api.sendMessage(telegramId, text, {
      reply_markup: appUrl ? new InlineKeyboard().webApp("Открыть приложение", appUrl) : undefined,
    });
  } catch (err) {
    console.error(`notifyTelegram — не удалось отправить сообщение ${telegramId}:`, err);
  }
}
