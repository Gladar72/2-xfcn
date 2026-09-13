/**
 * Отправка события в n8n для дальнейшей рассылки через Telegram.
 *
 * Принцип из п.27 ТЗ: n8n НЕ содержит бизнес-логику (кого уведомлять,
 * насколько релевантна встреча и т.д.) — только отправку сообщений.
 * Всю "умную" часть (кого считать релевантным пользователем, кому именно
 * писать) делает Next.js и передаёт в n8n уже готовый список получателей.
 *
 * Вызов НИКОГДА не бросает исключение и не блокирует ответ пользователю —
 * если n8n недоступен, это не должно ломать создание встречи/отклика.
 */
export async function notifyN8n(workflow: string, payload: Record<string, unknown>): Promise<void> {
  const webhookBase = process.env.N8N_WEBHOOK_URL;
  if (!webhookBase) return; // n8n ещё не настроен — молча пропускаем (Этап 12 подключается поверх готового приложения)

  try {
    await fetch(`${webhookBase.replace(/\/$/, "")}/${workflow}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Не ждём долго — это уведомление, не критичная операция.
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Намеренно проглатываем ошибку — см. комментарий выше.
  }
}
